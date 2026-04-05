"""
SkyGuard Backend — Zone-aware, multi-model avian intrusion detection server.

Key fixes over v1:
  - Runway zone polygon ONLY drawn on is_runway cameras
  - Zone drives alert priority and UI behavior
  - YOLO + RT-DETR model selection per camera
  - Unified detection format with model_used field
  - Upload endpoints for image/video analysis
"""

import asyncio
import base64
import csv
import io
import json
import logging
import os
import sys
import tempfile
import threading
import time
import uuid
from collections import deque
from contextlib import asynccontextmanager
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from ultralytics import YOLO

import config as cfg
from rtdter import RTDTEREngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("skyguard")

# ── Model Manager ────────────────────────────────────────────────────────────

class ModelManager:
    """Loads and caches YOLO and RT-DETR models."""

    def __init__(self):
        self._models: dict[str, YOLO] = {}

    def get(self, model_type: str = "yolo") -> YOLO:
        if model_type in self._models:
            return self._models[model_type]

        if model_type == "rtdetr":
            path = cfg.RTDETR_MODEL_PATH
            logger.info("Loading RT-DETR model: %s", path)
        else:
            path = cfg.YOLO_MODEL_PATH if os.path.exists(cfg.YOLO_MODEL_PATH) else cfg.YOLO_FALLBACK
            logger.info("Loading YOLO model: %s", path)

        model = YOLO(path)
        self._models[model_type] = model
        return model

    def get_fresh(self, model_type: str = "yolo") -> YOLO:
        """Get a NEW instance for thread-safe tracking."""
        if model_type == "rtdetr":
            path = cfg.RTDETR_MODEL_PATH
        else:
            path = cfg.YOLO_MODEL_PATH if os.path.exists(cfg.YOLO_MODEL_PATH) else cfg.YOLO_FALLBACK
        return YOLO(path)

    @property
    def available_models(self) -> list[str]:
        models = ["yolo"]
        if os.path.exists(cfg.RTDETR_MODEL_PATH):
            models.append("rtdetr")
        return models


models = ModelManager()
models.get("yolo")  # preload
logger.info("YOLO model loaded.")

TRACKER_CFG = str(Path(__file__).parent / "tracker_config.yaml")
if not os.path.exists(TRACKER_CFG):
    TRACKER_CFG = "bytetrack.yaml"


# ── Zone-aware overlay drawing ───────────────────────────────────────────────

RISK_COLORS = {0: (0, 255, 0), 1: (0, 200, 255), 2: (0, 80, 255), 3: (0, 0, 220)}


def draw_overlay(frame, engine, alerts, fps_val, camera_zone="General", model_type="yolo"):
    """Draw zone-appropriate overlay. Runway polygon ONLY for runway cameras."""
    h, w = frame.shape[:2]
    zone_color = cfg.ZONE_COLORS_BGR.get(camera_zone, (180, 180, 180))

    # ── Runway polygon: ONLY for runway cameras ──
    zone_px = engine.get_zone_polygon_px(w, h)  # returns None for non-runway
    if zone_px is not None:
        overlay = frame.copy()
        cv2.fillPoly(overlay, [zone_px], zone_color)
        cv2.addWeighted(overlay, 0.15, frame, 0.85, 0, frame)
        cv2.polylines(frame, [zone_px], True, zone_color, 2)
        lp = tuple(zone_px[0] + [5, -10])
        (tw, th2), _ = cv2.getTextSize("RUNWAY ZONE", cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
        cv2.rectangle(frame, (lp[0]-4, lp[1]-th2-4), (lp[0]+tw+4, lp[1]+4), zone_color, -1)
        cv2.putText(frame, "RUNWAY ZONE", lp, cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

    # ── Bird tracks + trails ──
    for track in engine.get_active_tracks():
        pos = track.current_pos
        if pos is None:
            continue
        color = RISK_COLORS.get(track.risk_level, (255, 255, 255))
        cx, cy = int(pos[0]), int(pos[1])
        pts = list(track.positions)
        for i in range(1, len(pts)):
            a = i / len(pts)
            c = tuple(int(v * a) for v in color)
            cv2.line(frame, (int(pts[i-1][0]), int(pts[i-1][1])),
                     (int(pts[i][0]), int(pts[i][1])), c, 2)
        label = f"ID:{track.track_id}"
        if track.speed > 5:
            label += f" {track.speed:.0f}px/s"
        if track.in_zone:
            label += f" [{track.time_in_zone:.1f}s]"
        (tw2, th3), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
        cv2.rectangle(frame, (cx+8, cy-th3-14), (cx+tw2+14, cy-4), (0, 0, 0), -1)
        cv2.putText(frame, label, (cx+10, cy-10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)
        cv2.circle(frame, (cx, cy), 5, color, -1)

    # ── Stats bar ──
    stats = engine.get_stats()
    bar_h = 36
    bo = frame.copy()
    cv2.rectangle(bo, (0, 0), (w, bar_h), (15, 23, 42), -1)
    cv2.addWeighted(bo, 0.85, frame, 0.15, 0, frame)

    info = f"FPS:{fps_val:.0f} | {camera_zone} | {model_type.upper()} | Birds:{stats['active_birds']}"
    if engine.is_runway:
        info += f" | Zone:{stats['birds_in_zone']} | Risk:{stats['high_risk']}"
    cv2.putText(frame, info, (12, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (148, 163, 184), 1, cv2.LINE_AA)

    # Risk indicator (only meaningful for runway)
    risk = stats["max_risk"]
    if engine.is_runway and risk > 0:
        rl = {0: "CLEAR", 1: "INTRUSION", 2: "HIGH RISK", 3: "CRITICAL"}.get(risk, "")
        rc = RISK_COLORS.get(risk, (255, 255, 255))
        (tw4, _), _ = cv2.getTextSize(rl, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
        rx = w - tw4 - 24
        cv2.rectangle(frame, (rx-8, 6), (w-8, bar_h-6), rc, -1)
        cv2.putText(frame, rl, (rx, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2, cv2.LINE_AA)

    # Zone badge (non-runway)
    if not engine.is_runway:
        badge = camera_zone.upper()
        (tw5, _), _ = cv2.getTextSize(badge, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 2)
        rx = w - tw5 - 20
        cv2.rectangle(frame, (rx-6, 8), (w-8, bar_h-8), zone_color, -1)
        cv2.putText(frame, badge, (rx, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 2, cv2.LINE_AA)

    # Alert banners
    for i, alert in enumerate(alerts[-3:]):
        y = bar_h + 8 + i * 28
        ac = RISK_COLORS.get(min(alert.priority, 3), (180, 180, 180))
        abo = frame.copy()
        cv2.rectangle(abo, (0, y), (w, y+24), (0, 0, 0), -1)
        cv2.addWeighted(abo, 0.6, frame, 0.4, 0, frame)
        cv2.rectangle(frame, (0, y), (4, y+24), ac, -1)
        cv2.putText(frame, f"  [{alert.level}] {alert.message}", (8, y+17),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, ac, 1, cv2.LINE_AA)

    return frame


# ── Camera + Processing ──────────────────────────────────────────────────────

@dataclass
class CameraConfig:
    id: str
    name: str
    source: str
    zone: str = "General"
    is_runway: bool = False
    model_type: str = "yolo"   # "yolo", "rtdetr"
    enabled: bool = True
    status: str = "active"


@dataclass
class LogEntry:
    timestamp: str
    camera_id: str
    camera_name: str
    zone: str
    event_type: str
    track_id: Optional[int]
    confidence: Optional[float]
    message: str
    model_used: str = ""


class CameraProcessor:
    def __init__(self, cam_cfg: CameraConfig):
        self.cfg = cam_cfg
        # Zone-aware engine: runway logic ONLY if is_runway
        self.engine = RTDTEREngine(zone=cam_cfg.zone, is_runway=cam_cfg.is_runway)
        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.latest_frame: Optional[str] = None
        self.latest_stats: dict = {}
        self.latest_alerts: list = []
        self.frame_count = 0
        self.fps = 0.0
        self.lock = threading.Lock()
        self._subscribers: list[asyncio.Queue] = []

    def start(self):
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=5)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        if q in self._subscribers:
            self._subscribers.remove(q)

    def _broadcast(self, data: dict):
        for q in self._subscribers:
            try:
                q.put_nowait(data)
            except asyncio.QueueFull:
                try:
                    q.get_nowait()
                    q.put_nowait(data)
                except Exception:
                    pass

    def _loop(self):
        src = int(self.cfg.source) if self.cfg.source.isdigit() else self.cfg.source
        cap = cv2.VideoCapture(src)
        if not cap.isOpened():
            logger.error("Cannot open camera %s: %s", self.cfg.id, self.cfg.source)
            self.running = False
            return

        t_start = time.time()
        local_model = models.get_fresh(self.cfg.model_type)

        while self.running:
            ret, frame = cap.read()
            if not ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue

            h, w = frame.shape[:2]
            results = local_model.track(
                frame, conf=cfg.CONFIDENCE_THRESHOLD, iou=cfg.IOU_THRESHOLD,
                imgsz=cfg.IMGSZ, tracker=TRACKER_CFG, persist=True, verbose=False,
            )
            result = results[0]
            track_ids, centers, detections = [], [], []

            if result.boxes is not None and result.boxes.id is not None:
                ids = result.boxes.id.int().tolist()
                xyxy = result.boxes.xyxy.cpu().numpy()
                confs = result.boxes.conf.cpu().numpy()
                for tid, box, conf in zip(ids, xyxy, confs):
                    cx, cy = (box[0]+box[2])/2, (box[1]+box[3])/2
                    track_ids.append(tid)
                    centers.append(np.array([cx, cy]))
                    detections.append({
                        "class_name": "Bird",
                        "confidence": round(float(conf), 4),
                        "bbox": [int(box[0]), int(box[1]), int(box[2]), int(box[3])],
                        "track_id": tid,
                        "model_used": self.cfg.model_type,
                        "camera_id": self.cfg.id,
                        "zone": self.cfg.zone,
                        "timestamp": datetime.now().isoformat(),
                    })
                    risk = self.engine.tracks[tid].risk_level if tid in self.engine.tracks else 0
                    cv2.rectangle(frame, (int(box[0]), int(box[1])), (int(box[2]), int(box[3])),
                                  RISK_COLORS.get(risk, (0, 255, 0)), 2)

            frame_alerts = self.engine.update(track_ids, centers, w, h)
            self.frame_count += 1
            elapsed = time.time() - t_start
            self.fps = self.frame_count / elapsed if elapsed > 0 else 0

            frame = draw_overlay(frame, self.engine, frame_alerts, self.fps,
                                 self.cfg.zone, self.cfg.model_type)

            _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            frame_b64 = base64.b64encode(buf.tobytes()).decode("utf-8")

            stats = self.engine.get_stats()
            stats["fps"] = round(self.fps, 1)
            stats["frame_count"] = self.frame_count
            stats["model_type"] = self.cfg.model_type

            alert_dicts = [{
                "level": a.level,
                "track_id": a.track_id,
                "message": a.message,
                "priority": a.priority,
                "timestamp": datetime.now().isoformat(),
                "camera_id": self.cfg.id,
                "camera_name": self.cfg.name,
                "zone": self.cfg.zone,
                "model_used": self.cfg.model_type,
            } for a in frame_alerts]

            with self.lock:
                self.latest_frame = frame_b64
                self.latest_stats = stats
                self.latest_alerts = alert_dicts

            self._broadcast({
                "type": "frame",
                "camera_id": self.cfg.id,
                "frame": frame_b64,
                "stats": stats,
                "alerts": alert_dicts,
                "detections": detections,
            })

            time.sleep(max(0, 1/30 - (time.time() - t_start - (self.frame_count - 1) / 30)))

        cap.release()


# ── Manager ──────────────────────────────────────────────────────────────────

class SkyGuardManager:
    def __init__(self):
        self.cameras: dict[str, CameraConfig] = {}
        self.processors: dict[str, CameraProcessor] = {}
        self.logs: deque[LogEntry] = deque(maxlen=10000)
        self.alerts: deque[dict] = deque(maxlen=1000)
        self.config = {
            "confidence_threshold": cfg.CONFIDENCE_THRESHOLD,
            "iou_threshold": cfg.IOU_THRESHOLD,
            "track_buffer": cfg.TRACK_BUFFER,
            "persistence_sec": cfg.PERSISTENCE_TIME_SEC,
            "density_threshold": cfg.DENSITY_THRESHOLD,
            "imgsz": cfg.IMGSZ,
        }

    def add_camera(self, name, source, zone="General", is_runway=False, model_type="yolo") -> CameraConfig:
        # Validate: is_runway requires zone=Runway
        if is_runway and zone != "Runway":
            zone = "Runway"  # auto-fix
        if zone == "Runway":
            is_runway = True  # zone=Runway implies runway camera

        cam_id = str(uuid.uuid4())[:8]
        cam = CameraConfig(id=cam_id, name=name, source=source, zone=zone,
                           is_runway=is_runway, model_type=model_type)
        self.cameras[cam_id] = cam
        proc = CameraProcessor(cam)
        self.processors[cam_id] = proc
        proc.start()
        logger.info("Camera added: %s (%s) zone=%s runway=%s model=%s",
                     cam_id, name, zone, is_runway, model_type)
        return cam

    def remove_camera(self, cam_id):
        if cam_id in self.processors:
            self.processors[cam_id].stop()
            del self.processors[cam_id]
        self.cameras.pop(cam_id, None)

    def get_camera_list(self):
        result = []
        for cid, cam in self.cameras.items():
            proc = self.processors.get(cid)
            stats = proc.latest_stats if proc else {}
            result.append({
                **asdict(cam),
                "fps": stats.get("fps", 0),
                "active_birds": stats.get("active_birds", 0),
                "birds_in_zone": stats.get("birds_in_zone", 0),
                "total_alerts": stats.get("total_alerts", 0),
                "max_risk": stats.get("max_risk", 0),
            })
        return result

    def get_global_stats(self):
        total_birds = total_zone = total_risk = total_alerts = max_risk = active = 0
        for proc in self.processors.values():
            if proc.running:
                active += 1
                s = proc.latest_stats
                total_birds += s.get("active_birds", 0)
                total_zone += s.get("birds_in_zone", 0)
                total_risk += s.get("high_risk", 0)
                total_alerts += s.get("total_alerts", 0)
                max_risk = max(max_risk, s.get("max_risk", 0))
        runway_cams = sum(1 for c in self.cameras.values() if c.is_runway)
        return {
            "active_cameras": active,
            "total_cameras": len(self.cameras),
            "runway_cameras": runway_cams,
            "total_birds": total_birds,
            "birds_in_zone": total_zone,
            "high_risk": total_risk,
            "total_alerts": total_alerts + len(self.alerts),
            "max_risk": max_risk,
            "model_status": "active",
            "available_models": ["yolo", "rtdetr"],
        }

    def add_alert(self, alert):
        self.alerts.append(alert)
        self.logs.append(LogEntry(
            timestamp=alert.get("timestamp", datetime.now().isoformat()),
            camera_id=alert.get("camera_id", ""),
            camera_name=alert.get("camera_name", ""),
            zone=alert.get("zone", ""),
            event_type=alert.get("level", ""),
            track_id=alert.get("track_id"),
            confidence=None,
            message=alert.get("message", ""),
            model_used=alert.get("model_used", ""),
        ))

    def get_logs_csv(self):
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(["Timestamp", "Camera ID", "Camera", "Zone", "Event",
                     "Track ID", "Confidence", "Model", "Message"])
        for l in self.logs:
            w.writerow([l.timestamp, l.camera_id, l.camera_name, l.zone,
                        l.event_type, l.track_id, l.confidence, l.model_used, l.message])
        return out.getvalue()

    def shutdown(self):
        for p in self.processors.values():
            p.stop()


manager = SkyGuardManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("SkyGuard backend starting...")
    yield
    logger.info("Shutting down...")
    manager.shutdown()

app = FastAPI(title="SkyGuard API", version="3.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


# ── REST API ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "3.0"}

@app.get("/api/stats")
async def get_stats():
    return manager.get_global_stats()

@app.get("/api/cameras")
async def list_cameras():
    return manager.get_camera_list()

@app.post("/api/cameras")
async def add_camera(body: dict):
    cam = manager.add_camera(
        name=body.get("name", "Camera"),
        source=body.get("source", "0"),
        zone=body.get("zone", "General"),
        is_runway=body.get("is_runway", False),
        model_type=body.get("model_type", "yolo"),
    )
    return asdict(cam)

@app.delete("/api/cameras/{cam_id}")
async def remove_camera(cam_id: str):
    manager.remove_camera(cam_id)
    return {"status": "removed"}

@app.put("/api/cameras/{cam_id}")
async def update_camera(cam_id: str, body: dict):
    if cam_id not in manager.cameras:
        return JSONResponse(status_code=404, content={"error": "Not found"})
    cam = manager.cameras[cam_id]
    if "name" in body:
        cam.name = body["name"]
    if "zone" in body:
        cam.zone = body["zone"]
        if body["zone"] == "Runway":
            cam.is_runway = True
        elif not body.get("is_runway", cam.is_runway):
            cam.is_runway = False
    if "is_runway" in body:
        cam.is_runway = body["is_runway"]
        if body["is_runway"]:
            cam.zone = "Runway"
    if "model_type" in body:
        cam.model_type = body["model_type"]
    return asdict(cam)

@app.get("/api/alerts")
async def get_alerts(limit: int = Query(default=50)):
    return list(manager.alerts)[-limit:]

@app.get("/api/logs")
async def get_logs(limit: int = Query(default=200)):
    logs = list(manager.logs)[-limit:]
    return [{"timestamp": l.timestamp, "camera_id": l.camera_id, "camera_name": l.camera_name,
             "zone": l.zone, "event_type": l.event_type, "track_id": l.track_id,
             "confidence": l.confidence, "model_used": l.model_used, "message": l.message} for l in logs]

@app.get("/api/logs/download")
async def download_logs():
    return StreamingResponse(
        io.BytesIO(manager.get_logs_csv().encode()), media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=skyguard_{datetime.now():%Y%m%d_%H%M%S}.csv"})

@app.get("/api/config")
async def get_config():
    return manager.config

@app.put("/api/config")
async def update_config(body: dict):
    for k in body:
        if k in manager.config:
            manager.config[k] = body[k]
    return manager.config

@app.get("/api/zones")
async def get_zones():
    return {"zones": cfg.ZONES, "priorities": cfg.ZONE_PRIORITY, "labels": cfg.ZONE_ALERT_LABEL}


# ── Upload Endpoints ─────────────────────────────────────────────────────────

@app.post("/api/upload/image")
async def upload_image(file: UploadFile = File(...), conf: float = Query(0.25),
                       iou: float = Query(0.45), model_type: str = Query("yolo")):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return JSONResponse(status_code=400, content={"error": "Invalid image"})

    m = models.get(model_type)
    results = m.predict(img, conf=conf, iou=iou, verbose=False)[0]

    detections = []
    if results.boxes is not None:
        for i, box in enumerate(results.boxes):
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            detections.append({
                "id": i + 1, "class_name": "Bird",
                "bbox": [int(x1), int(y1), int(x2), int(y2)],
                "width": int(x2-x1), "height": int(y2-y1),
                "confidence": round(float(box.conf[0].item()), 4),
                "model_used": model_type,
            })

    annotated = results.plot()
    _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 90])
    _, obuf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    confs = [d["confidence"] for d in detections]

    return {
        "original": base64.b64encode(obuf.tobytes()).decode(),
        "annotated": base64.b64encode(buf.tobytes()).decode(),
        "detections": detections,
        "count": len(detections),
        "model_used": model_type,
        "avg_confidence": round(sum(confs)/len(confs), 4) if confs else 0,
        "max_confidence": round(max(confs), 4) if confs else 0,
        "min_confidence": round(min(confs), 4) if confs else 0,
    }


@app.post("/api/upload/video")
async def upload_video(file: UploadFile = File(...), conf: float = Query(0.25),
                       iou: float = Query(0.45), model_type: str = Query("yolo")):
    tmp_in = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
    tmp_in.write(await file.read()); tmp_in.close()

    cap = cv2.VideoCapture(tmp_in.name)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()

    tmp_out = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4"); tmp_out.close()
    local_model = models.get_fresh(model_type)
    engine = RTDTEREngine(zone="Upload", is_runway=False)
    writer = cv2.VideoWriter(tmp_out.name, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    cap = cv2.VideoCapture(tmp_in.name)

    frame_idx = total_det = 0
    all_alerts = []
    t0 = time.time()

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        results = local_model.track(frame, conf=conf, iou=iou, imgsz=cfg.IMGSZ,
                                     tracker=TRACKER_CFG, persist=True, verbose=False)
        result = results[0]
        tids, ctrs = [], []
        if result.boxes is not None and result.boxes.id is not None:
            ids = result.boxes.id.int().tolist()
            xyxy = result.boxes.xyxy.cpu().numpy()
            total_det += len(ids)
            for tid, box in zip(ids, xyxy):
                tids.append(tid)
                ctrs.append(np.array([(box[0]+box[2])/2, (box[1]+box[3])/2]))
                risk = engine.tracks[tid].risk_level if tid in engine.tracks else 0
                cv2.rectangle(frame, (int(box[0]), int(box[1])), (int(box[2]), int(box[3])),
                              RISK_COLORS.get(risk, (0, 255, 0)), 2)

        fa = engine.update(tids, ctrs, w, h)
        for a in fa:
            all_alerts.append({"level": a.level, "track_id": a.track_id, "message": a.message, "model_used": model_type})
        frame_idx += 1
        cur_fps = frame_idx / (time.time()-t0) if (time.time()-t0) > 0 else 0
        frame = draw_overlay(frame, engine, fa, cur_fps, "Upload", model_type)
        writer.write(frame)

    cap.release(); writer.release()
    total_time = time.time() - t0

    with open(tmp_out.name, "rb") as f:
        vid_b64 = base64.b64encode(f.read()).decode()
    os.unlink(tmp_in.name); os.unlink(tmp_out.name)

    return {
        "video": vid_b64, "total_frames": frame_idx, "total_detections": total_det,
        "avg_fps": round(frame_idx/total_time, 1) if total_time > 0 else 0,
        "unique_tracks": len(engine.tracks), "total_alerts": len(all_alerts),
        "alerts": all_alerts[-50:], "duration": round(total_time, 1), "model_used": model_type,
    }


# ── WebSocket ────────────────────────────────────────────────────────────────

@app.websocket("/ws/camera/{cam_id}")
async def ws_camera(websocket: WebSocket, cam_id: str):
    await websocket.accept()
    if cam_id not in manager.processors:
        await websocket.send_json({"error": "Camera not found"})
        await websocket.close()
        return
    proc = manager.processors[cam_id]
    queue = proc.subscribe()
    try:
        while True:
            try:
                data = await asyncio.wait_for(asyncio.ensure_future(queue.get()), timeout=5.0)
                for a in data.get("alerts", []):
                    manager.add_alert(a)
                await websocket.send_json(data)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass
    finally:
        proc.unsubscribe(queue)

@app.websocket("/ws/alerts")
async def ws_alerts(websocket: WebSocket):
    await websocket.accept()
    queues = [(p, p.subscribe()) for p in manager.processors.values()]
    try:
        while True:
            for proc, q in queues:
                try:
                    data = q.get_nowait()
                    alerts = data.get("alerts", [])
                    if alerts:
                        for a in alerts:
                            manager.add_alert(a)
                        await websocket.send_json({"alerts": alerts})
                except asyncio.QueueEmpty:
                    pass
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass
    finally:
        for proc, q in queues:
            proc.unsubscribe(q)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
