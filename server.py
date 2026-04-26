"""
Avia AI Backend — Zone-aware, multi-model avian intrusion detection server.

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
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, UploadFile, File, Depends, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from sqlalchemy.orm import Session
from ultralytics import YOLO

import config as cfg
from rtdter import RTDTEREngine
import models as db_models
from database import SessionLocal, engine, get_db
import auth
# AdminDash: additional routers
import admin as admin_router
import airports as airports_router

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
            models.append("auto")  # AutoSafety: ensemble of YOLO + RT-DETR
        return models


models = ModelManager()
models.get("yolo")  # preload
logger.info("YOLO model loaded.")

# Upload analysis: prefer the specialized bird detector (nc:1, trained on bird imagery)
# over COCO-pretrained weights. Uploaded media typically contains no humans to
# misclassify, so the single-class specialist's higher bird recall wins decisively.
# Fallback order: custom 11M yolov8s bird weights → COCO yolov8m → COCO yolov8n.
_UPLOAD_MODEL_CANDIDATES = [
    "runs/yolov8s_bird_detection/weights/best.pt",
    "runs/bird_detector3/weights/best.pt",
    "yolov8m.pt",
    "yolov8n.pt",
]
COCO_BIRD_CLASS = 14
# TonightSqueeze: split image/video imgsz. Images get 1600 for small-object recall
# on stills (the per-upload latency is already user-facing), videos stay at 1280
# so a multi-minute clip doesn't balloon into tens of minutes.
UPLOAD_IMAGE_IMGSZ = 1600
UPLOAD_VIDEO_IMGSZ = 1280
UPLOAD_IMGSZ = UPLOAD_VIDEO_IMGSZ  # back-compat alias (video path still reads this)
UPLOAD_DEFAULT_CONF = 0.15  # lower than live (0.25) — upload is batch, false-positive cost low

def _resolve_upload_model_path() -> str | None:
    for p in _UPLOAD_MODEL_CANDIDATES:
        if os.path.exists(p):
            return p
    return None

UPLOAD_MODEL_PATH = _resolve_upload_model_path()
_upload_model = None

# ── TestingNewDataset: multi-class aerial object detection ───────────────────
# Route 1 (no retraining) — COCO already provides airplane (4), bird (14),
# kite (33). Drones are pending a dedicated fine-tune. Anything matched but
# outside this map is treated as "other flying object" and colored red.
# Revert path: drop this block and the AERIAL_* usages; restore classes=[14].
AERIAL_CLASS_MAP = {
    4:  "airplane",   # COCO
    14: "bird",       # COCO
    33: "kite",       # COCO
    # drone IDs will be appended after the fine-tune step.
}
AERIAL_CLASS_IDS = list(AERIAL_CLASS_MAP.keys())

# BGR, per user spec. "other" is a red fallback for the catch-all bucket.
CLASS_COLORS_BGR = {
    "bird":     (0, 255, 0),       # green
    "airplane": (255, 64, 0),      # blue
    "kite":     (0, 255, 255),     # yellow
    "drone":    (211, 0, 148),     # violet
    "other":    (0, 0, 255),       # red
}

def _class_name_for(model, cls_id: int | None) -> str:
    """Map a model's raw class index to our normalized aerial label."""
    if cls_id is None:
        return "other"
    names = getattr(model, "names", {}) or {}
    raw = str(names.get(int(cls_id), "")).lower()
    if raw in CLASS_COLORS_BGR:
        return raw
    # Single-class custom bird model emits class 0 named "bird" — already handled above.
    # COCO model: only map the four aerial IDs, everything else → "other".
    return AERIAL_CLASS_MAP.get(int(cls_id), "other")

def _color_for_class(name: str) -> tuple[int, int, int]:
    return CLASS_COLORS_BGR.get(name, CLASS_COLORS_BGR["other"])

# Cross-model NMS. Rows are (x1, y1, x2, y2, conf, class_name, source[, ...]).
# source ∈ {"specialist", "coco", "drone", "rtdetr_coco"}.
# Two scoring adjustments stack on the raw confidence:
#  • _SPECIALIST_BIAS — penalises the single-class bird specialist so its "bird"
#    label can't paint over correctly-classed airplane/kite/drone boxes.
#  • _AUTHORITY_BONUS — boosts the source that "owns" the disputed class. When
#    a drone-model "drone" box and a COCO "airplane" box overlap, the drone
#    model wins for "drone" and COCO wins for "airplane" unless the other side
#    is overwhelmingly more confident. Critical for safety: prevents drone
#    misclassification as airplane (and vice versa) under normal conditions.
_NMS_IOU_THRESHOLD = 0.5
_SPECIALIST_BIAS = 0.08
_AUTHORITY_BONUS = 0.15

# Which source is authoritative for which class label.
_CLASS_AUTHORITY: dict[str, set[str]] = {
    "bird":     {"specialist"},
    "airplane": {"coco", "rtdetr_coco"},
    "kite":     {"coco", "rtdetr_coco"},
    "drone":    {"drone"},
}

def _authority_bonus(source: str, cname: str) -> float:
    return _AUTHORITY_BONUS if source in _CLASS_AUTHORITY.get(cname, set()) else 0.0

def _iou_xyxy(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax1, ay1, ax2, ay2 = a; bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
    inter = iw * ih
    if inter == 0:
        return 0.0
    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0

def _cross_model_nms(rows: list, iou_thresh: float = _NMS_IOU_THRESHOLD) -> list:
    """Greedy NMS. Expects rows where [0:4]=xyxy, [4]=conf, [5]=class, [6]=source.
    Extra trailing fields (e.g. track id) are preserved on surviving rows."""
    if not rows:
        return rows
    scored = []
    for i, r in enumerate(rows):
        conf, cname, src = r[4], r[5], r[6]
        adj = conf + _authority_bonus(src, cname)
        if src == "specialist":
            adj -= _SPECIALIST_BIAS
        scored.append((adj, i))
    scored.sort(reverse=True)
    kept: list[int] = []
    for _, i in scored:
        xyxy_i = rows[i][:4]
        drop = False
        for j in kept:
            if _iou_xyxy(xyxy_i, rows[j][:4]) > iou_thresh:
                drop = True
                break
        if not drop:
            kept.append(i)
    kept.sort()
    return [rows[i] for i in kept]
# ─────────────────────────────────────────────────────────────────────────────

def _is_single_class_bird_model(m) -> bool:
    """True if the model has exactly one class and it's named 'bird' (case-insensitive)."""
    try:
        names = getattr(m, "names", {}) or {}
        return len(names) == 1 and str(list(names.values())[0]).lower() in ("bird", "birds")
    except Exception:
        return False

def get_upload_model():
    global _upload_model
    if _upload_model is None:
        if UPLOAD_MODEL_PATH:
            logger.info("Loading upload model: %s", UPLOAD_MODEL_PATH)
            _upload_model = YOLO(UPLOAD_MODEL_PATH)
        else:
            _upload_model = models.get("yolo")
    return _upload_model

# TestingNewDataset: ensemble partner for uploads when the primary upload model
# is a single-class bird specialist. COCO yolov8x/m provides airplane/kite.
# Split by path: images can afford yolov8x (~3× slower than m) for one-shot
# quality; video runs the ensemble per-frame so yolov8m is the right balance.
def _pick_first_existing(*candidates: str) -> str | None:
    for p in candidates:
        if os.path.exists(p):
            return p
    return None

# Images: prefer yolov8x (auto-downloads on first call if missing).
_ENSEMBLE_COCO_IMAGE_PATH = _pick_first_existing("yolov8x.pt", "yolov8m.pt", "yolov8n.pt") or "yolov8x.pt"
# Videos: prefer yolov8m — keeps per-frame cost in check on CPU.
_ENSEMBLE_COCO_VIDEO_PATH = _pick_first_existing("yolov8m.pt", "yolov8n.pt", "yolov8x.pt") or "yolov8m.pt"
# Back-compat alias for any caller still referencing the single-path constant.
_ENSEMBLE_COCO_PATH = _ENSEMBLE_COCO_IMAGE_PATH

_ensemble_coco_image = None  # yolov8x, for image uploads
_ensemble_coco_video = None  # yolov8m, for video uploads
# Only ask COCO for non-bird aerial classes — bird detections come from the
# specialist, so including 14 here would produce duplicate boxes.
_ENSEMBLE_COCO_CLASSES = [cid for cid, name in AERIAL_CLASS_MAP.items() if name != "bird"]

def get_ensemble_coco_image():
    global _ensemble_coco_image
    if _ensemble_coco_image is None and _ENSEMBLE_COCO_IMAGE_PATH:
        logger.info("Loading image COCO ensemble: %s", _ENSEMBLE_COCO_IMAGE_PATH)
        _ensemble_coco_image = YOLO(_ENSEMBLE_COCO_IMAGE_PATH)
    return _ensemble_coco_image

def get_ensemble_coco_video():
    global _ensemble_coco_video
    if _ensemble_coco_video is None and _ENSEMBLE_COCO_VIDEO_PATH:
        # Reuse the image model if they happen to resolve to the same file.
        if _ENSEMBLE_COCO_VIDEO_PATH == _ENSEMBLE_COCO_IMAGE_PATH and _ensemble_coco_image is not None:
            _ensemble_coco_video = _ensemble_coco_image
        else:
            logger.info("Loading video COCO ensemble: %s", _ENSEMBLE_COCO_VIDEO_PATH)
            _ensemble_coco_video = YOLO(_ENSEMBLE_COCO_VIDEO_PATH)
    return _ensemble_coco_video

# Back-compat wrapper — defaults to the image model for any caller that hasn't
# been updated yet. Prefer the explicit _image / _video getters.
def get_ensemble_coco():
    return get_ensemble_coco_image()

# AutoSafety: RT-DETR partner used by Auto mode. Same COCO class space as
# yolov8m, but the transformer head catches things YOLO misses (and vice
# versa). Lazy-loaded only when an Auto request comes in.
_ENSEMBLE_RTDETR_PATH = cfg.RTDETR_MODEL_PATH
_ensemble_rtdetr = None

def get_ensemble_rtdetr():
    global _ensemble_rtdetr
    if _ensemble_rtdetr is None:
        try:
            from ultralytics import RTDETR
            logger.info("Loading ensemble RT-DETR model for Auto mode: %s", _ENSEMBLE_RTDETR_PATH)
            _ensemble_rtdetr = RTDETR(_ENSEMBLE_RTDETR_PATH)
        except Exception as e:
            logger.warning("RT-DETR load failed (%s); Auto mode will fall back to YOLO ensemble only", e)
            _ensemble_rtdetr = False  # sentinel: don't retry every call
    return _ensemble_rtdetr if _ensemble_rtdetr else None

# TestingNewDataset: standalone drone detector — yolov8x single-class "drone",
# pretrained weights from HuggingFace (doguilmak/Drone-Detection-YOLOv8x, MIT).
# Revert path: delete runs/testingnewdataset_drone/ and this block.
_DRONE_MODEL_PATH = "runs/testingnewdataset_drone/weights/best.pt"
_drone_model = None
DRONE_AVAILABLE = os.path.exists(_DRONE_MODEL_PATH)

def get_drone_model():
    global _drone_model
    if _drone_model is None and DRONE_AVAILABLE:
        logger.info("Loading standalone drone model: %s", _DRONE_MODEL_PATH)
        _drone_model = YOLO(_DRONE_MODEL_PATH)
    return _drone_model

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
        cap = None

        t_start = time.time()
        local_model = models.get_fresh(self.cfg.model_type)

        while self.running:
            if len(self._subscribers) == 0:
                if cap is not None:
                    cap.release()
                    cap = None
                time.sleep(1)
                continue

            if cap is None:
                cap = cv2.VideoCapture(src)
                if not cap.isOpened():
                    logger.error("Cannot open camera %s: %s", self.cfg.id, self.cfg.source)
                    self.running = False
                    return

            ret, frame = cap.read()
            if not ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue

            h, w = frame.shape[:2]
            # TestingNewDataset: expanded from bird-only to multi-class aerial filter
            results = local_model.track(
                frame, conf=cfg.CONFIDENCE_THRESHOLD, iou=cfg.IOU_THRESHOLD,
                imgsz=cfg.IMGSZ, tracker=TRACKER_CFG, persist=True, verbose=False,
                classes=AERIAL_CLASS_IDS,
            )
            result = results[0]
            track_ids, centers, detections = [], [], []

            if result.boxes is not None and result.boxes.id is not None:
                ids = result.boxes.id.int().tolist()
                xyxy = result.boxes.xyxy.cpu().numpy()
                confs = result.boxes.conf.cpu().numpy()
                cls_tensor = result.boxes.cls
                cls_ids = cls_tensor.int().tolist() if cls_tensor is not None else [None] * len(ids)
                for tid, box, conf, cls_id in zip(ids, xyxy, confs, cls_ids):
                    cx, cy = (box[0]+box[2])/2, (box[1]+box[3])/2
                    track_ids.append(tid)
                    centers.append(np.array([cx, cy]))
                    cname = _class_name_for(local_model, cls_id)
                    detections.append({
                        "class_name": cname,
                        "confidence": round(float(conf), 4),
                        "bbox": [int(box[0]), int(box[1]), int(box[2]), int(box[3])],
                        "track_id": tid,
                        "model_used": self.cfg.model_type,
                        "camera_id": self.cfg.id,
                        "zone": self.cfg.zone,
                        "timestamp": datetime.now().isoformat(),
                    })
                    color = _color_for_class(cname)
                    x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                    label = f"{cname} {float(conf):.2f}"
                    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                    cv2.rectangle(frame, (x1, max(0, y1 - th - 6)), (x1 + tw + 6, y1), color, -1)
                    cv2.putText(frame, label, (x1 + 3, y1 - 4),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)

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

            # Persist + fan-out each alert via the manager (not tied to frame subs).
            for a in alert_dicts:
                try:
                    manager.add_alert(a)
                except Exception as e:
                    logger.warning("add_alert failed: %s", e)

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
        # Alert-only subscribers. Subscribing here does NOT open any camera.
        self.alert_subs: list[asyncio.Queue] = []
        self.config = {
            "confidence_threshold": cfg.CONFIDENCE_THRESHOLD,
            "iou_threshold": cfg.IOU_THRESHOLD,
            "track_buffer": cfg.TRACK_BUFFER,
            "persistence_sec": cfg.PERSISTENCE_TIME_SEC,
            "density_threshold": cfg.DENSITY_THRESHOLD,
            "imgsz": cfg.IMGSZ,
        }

    def subscribe_alerts(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=50)
        self.alert_subs.append(q)
        return q

    def unsubscribe_alerts(self, q: asyncio.Queue):
        if q in self.alert_subs:
            self.alert_subs.remove(q)

    def _broadcast_alerts(self, alerts: list[dict]):
        if not alerts:
            return
        for q in self.alert_subs:
            try:
                q.put_nowait({"alerts": alerts})
            except asyncio.QueueFull:
                try:
                    q.get_nowait()
                    q.put_nowait({"alerts": alerts})
                except Exception:
                    pass

    def load_from_db(self):
        db = SessionLocal()
        try:
            db_cams = db.query(db_models.Camera).filter(db_models.Camera.status == "active").all()
            for cam in db_cams:
                c = CameraConfig(id=cam.id, name=cam.name, source=cam.source, zone=cam.zone, is_runway=cam.is_runway, model_type=cam.model_type)
                self.cameras[c.id] = c
                proc = CameraProcessor(c)
                self.processors[c.id] = proc
                proc.start()
            logger.info(f"Loaded {len(db_cams)} active cameras from database.")
        except Exception as e:
            logger.error(f"Failed to load cameras from DB: {e}")
        finally:
            db.close()

    def add_camera(self, name, source, zone="General", is_runway=False, model_type="yolo") -> CameraConfig:
        # Validate: is_runway requires zone=Runway
        if is_runway and zone != "Runway":
            zone = "Runway"  # auto-fix
        if zone == "Runway":
            is_runway = True  # zone=Runway implies runway camera

        cam_id = str(uuid.uuid4())[:8]
        
        db = SessionLocal()
        try:
            db_cam = db_models.Camera(id=cam_id, name=name, source=source, zone=zone, is_runway=is_runway, model_type=model_type, status="active")
            db.add(db_cam)
            db.commit()
        except Exception as e:
            logger.error(f"DB Error: {e}")
        finally:
            db.close()

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

        db = SessionLocal()
        try:
            db_cam = db.query(db_models.Camera).filter(db_models.Camera.id == cam_id).first()
            if db_cam:
                db_cam.status = "deleted"
                db.commit()
        except Exception as e:
            logger.error(f"DB Error: {e}")
        finally:
            db.close()

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
            "available_models": models.available_models,
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

        db = SessionLocal()
        try:
            db_alert = db_models.Alert(
                id=str(uuid.uuid4()),
                camera_id=alert.get("camera_id", ""),
                zone=alert.get("zone", ""),
                severity=alert.get("level", ""),
                class_name="Bird",
                model_used=alert.get("model_used", ""),
                timestamp=datetime.fromisoformat(alert.get("timestamp", datetime.now().isoformat()))
            )
            db.add(db_alert)
            db.commit()
        except Exception as e:
            logger.error(f"Failed to persist alert to DB: {e}")
        finally:
            db.close()

        # Fan out to alert-only subscribers (does not affect frame subs).
        self._broadcast_alerts([alert])

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


# AdminDash: SQLite column migration for the users table.
def _migrate_user_airport_columns():
    if engine.dialect.name != "sqlite":
        return
    new_cols = [
        ("airport_iata", "VARCHAR"),
        ("airport_icao", "VARCHAR"),
        ("airport_name", "VARCHAR"),
        ("airport_city", "VARCHAR"),
        ("airport_country", "VARCHAR"),
    ]
    try:
        with engine.begin() as conn:
            existing = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()}
            for name, ddl in new_cols:
                if name not in existing:
                    conn.exec_driver_sql(f"ALTER TABLE users ADD COLUMN {name} {ddl}")
                    logger.info("AdminDash migration: added users.%s", name)
    except Exception as e:
        logger.warning("AdminDash migration skipped: %s", e)


# UsernameRequest: ensure the rename-request table exists on startup so the
# feature works without a manual `python seed.py` on upgrade.
def _ensure_username_request_table():
    try:
        db_models.UsernameChangeRequest.__table__.create(bind=engine, checkfirst=True)
    except Exception as e:
        logger.warning("UsernameRequest table create skipped: %s", e)


# TestHistory: ensure the per-user upload history table + media dir exist.
UPLOAD_HISTORY_DIR = Path(os.environ.get("UPLOAD_HISTORY_DIR", "upload_history"))
MAX_HISTORY_PER_USER = 20

def _ensure_upload_history():
    try:
        db_models.UploadHistory.__table__.create(bind=engine, checkfirst=True)
        UPLOAD_HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        logger.warning("UploadHistory init skipped: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Avia AI backend starting...")
    _migrate_user_airport_columns()
    _ensure_username_request_table()
    _ensure_upload_history()
    _backfill_history_thumbnails()
    airports_router.start_background_load()
    manager.load_from_db()
    yield
    logger.info("Shutting down...")
    manager.shutdown()

app = FastAPI(title="Avia AI API", version="3.0", lifespan=lifespan)
app.include_router(auth.router)
# AdminDash:
app.include_router(admin_router.router)
app.include_router(airports_router.router)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


# ── REST API ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "3.0"}

@app.get("/api/stats")
async def get_stats():
    return manager.get_global_stats()

# TestingNewDataset: class/color legend for the frontend.
@app.get("/api/detection/legend")
async def detection_legend():
    # BGR → hex for CSS. Drone is currently not detected (pending fine-tune).
    def bgr_to_hex(bgr):
        b, g, r = bgr
        return f"#{r:02x}{g:02x}{b:02x}"
    entries = []
    for name, color in CLASS_COLORS_BGR.items():
        if name == "drone":
            avail = DRONE_AVAILABLE
        else:
            avail = True
        entries.append({
            "class_name": name,
            "color_hex": bgr_to_hex(color),
            "available": avail,
        })
    return {"classes": entries}

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
        headers={"Content-Disposition": f"attachment; filename=aviaai_{datetime.now():%Y%m%d_%H%M%S}.csv"})

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

@app.get("/api/settings")
async def get_settings():
    db = SessionLocal()
    try:
        settings = db.query(db_models.SystemSetting).first()
        if not settings:
            # fallback defaults
            return {
                "confidence_threshold": 0.60,
                "iou_threshold": 0.45,
                "default_model": "yolo",
                "alert_sensitivity": "Normal",
                "log_retention_days": 30,
                "inference_mode": "hybrid"
            }
        return {
            "confidence_threshold": settings.confidence_threshold,
            "iou_threshold": settings.iou_threshold,
            "default_model": settings.default_model,
            "alert_sensitivity": settings.alert_sensitivity,
            "log_retention_days": settings.log_retention_days,
            "inference_mode": settings.inference_mode
        }
    finally:
        db.close()

@app.put("/api/settings")
async def update_settings(body: dict):
    db = SessionLocal()
    try:
        settings = db.query(db_models.SystemSetting).first()
        if not settings:
            settings = db_models.SystemSetting()
            db.add(settings)
        
        if "confidence_threshold" in body: settings.confidence_threshold = body["confidence_threshold"]
        if "iou_threshold" in body: settings.iou_threshold = body["iou_threshold"]
        if "default_model" in body: settings.default_model = body["default_model"]
        if "alert_sensitivity" in body: settings.alert_sensitivity = body["alert_sensitivity"]
        if "log_retention_days" in body: settings.log_retention_days = body["log_retention_days"]
        if "inference_mode" in body: settings.inference_mode = body["inference_mode"]
        
        db.commit()
        return {"status": "success"}
    finally:
        db.close()

def _process_image_sync(contents: bytes, conf: float, iou: float, model_type: str) -> dict:
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return {"__error__": "Invalid image"}

    # TestingNewDataset: ensemble inference for multi-class aerial detection.
    # If the primary upload model is a single-class bird specialist, also run
    # COCO for airplane/kite (non-bird aerial classes) and merge the outputs.
    m = get_upload_model()
    single_class = _is_single_class_bird_model(m)
    model_label = os.path.basename(UPLOAD_MODEL_PATH) if UPLOAD_MODEL_PATH else model_type

    # TonightSqueeze: higher imgsz for image uploads. TTA (augment=True) was
    # tried here but compounded across 3 models on CPU made scene analysis
    # unbearable (~4–5× baseline). imgsz 1600 delivers most of the recall gain
    # for ~1.5× cost; skipping TTA keeps per-image latency tolerable.
    primary_kwargs = dict(conf=conf, iou=iou, imgsz=UPLOAD_IMAGE_IMGSZ, verbose=False)
    if not single_class:
        primary_kwargs["classes"] = AERIAL_CLASS_IDS
    primary_results = m.predict(img, **primary_kwargs)[0]
    # Rows carry a source tag for cross-model NMS.
    raw_rows: list[tuple[int, int, int, int, float, str, str]] = []

    if primary_results.boxes is not None and len(primary_results.boxes) > 0:
        cls_tensor = primary_results.boxes.cls
        cls_ids = cls_tensor.int().tolist() if cls_tensor is not None else [None] * len(primary_results.boxes)
        for box, cls_id in zip(primary_results.boxes, cls_ids):
            x1f, y1f, x2f, y2f = box.xyxy[0].tolist()
            dconf = float(box.conf[0].item())
            cname = "bird" if single_class else _class_name_for(m, cls_id)
            raw_rows.append((int(x1f), int(y1f), int(x2f), int(y2f), dconf, cname, "specialist"))

    if single_class:
        coco = get_ensemble_coco_image()
        if coco is not None:
            coco_results = coco.predict(img, conf=conf, iou=iou, imgsz=UPLOAD_IMAGE_IMGSZ,
                                        verbose=False,
                                        classes=_ENSEMBLE_COCO_CLASSES)[0]
            if coco_results.boxes is not None and len(coco_results.boxes) > 0:
                cls_tensor = coco_results.boxes.cls
                cls_ids = cls_tensor.int().tolist() if cls_tensor is not None else [None] * len(coco_results.boxes)
                for box, cls_id in zip(coco_results.boxes, cls_ids):
                    x1f, y1f, x2f, y2f = box.xyxy[0].tolist()
                    dconf = float(box.conf[0].item())
                    cname = _class_name_for(coco, cls_id)
                    raw_rows.append((int(x1f), int(y1f), int(x2f), int(y2f), dconf, cname, "coco"))

    # AutoSafety: in Auto mode, also run RT-DETR with the same class filter.
    # Two engines see different things; NMS+authority merges them safely.
    if model_type == "auto" and single_class:
        rtdetr = get_ensemble_rtdetr()
        if rtdetr is not None:
            # RT-DETR's predict path doesn't support augment=True — skip TTA here.
            r_res = rtdetr.predict(img, conf=conf, iou=iou, imgsz=UPLOAD_IMAGE_IMGSZ,
                                   verbose=False, classes=_ENSEMBLE_COCO_CLASSES)[0]
            if r_res.boxes is not None and len(r_res.boxes) > 0:
                cls_tensor = r_res.boxes.cls
                cls_ids = cls_tensor.int().tolist() if cls_tensor is not None else [None] * len(r_res.boxes)
                for box, cls_id in zip(r_res.boxes, cls_ids):
                    x1f, y1f, x2f, y2f = box.xyxy[0].tolist()
                    dconf = float(box.conf[0].item())
                    cname = _class_name_for(rtdetr, cls_id)
                    raw_rows.append((int(x1f), int(y1f), int(x2f), int(y2f), dconf, cname, "rtdetr_coco"))

    # TestingNewDataset: standalone drone ensemble pass.
    drone_m = get_drone_model()
    if drone_m is not None:
        d_res = drone_m.predict(img, conf=conf, iou=iou, imgsz=UPLOAD_IMAGE_IMGSZ,
                                verbose=False)[0]
        if d_res.boxes is not None and len(d_res.boxes) > 0:
            for box in d_res.boxes:
                x1f, y1f, x2f, y2f = box.xyxy[0].tolist()
                dconf = float(box.conf[0].item())
                raw_rows.append((int(x1f), int(y1f), int(x2f), int(y2f), dconf, "drone", "drone"))

    # Pre-NMS telemetry: how many each model contributed, and final counts.
    pre_counts: dict[str, int] = {}
    for _, _, _, _, _, _, src in raw_rows:
        pre_counts[src] = pre_counts.get(src, 0) + 1
    det_rows_nms = _cross_model_nms(raw_rows)
    post_by_class: dict[str, int] = {}
    for _, _, _, _, _, cname, _ in det_rows_nms:
        post_by_class[cname] = post_by_class.get(cname, 0) + 1
    logger.info(
        "upload/image: raw specialist=%d coco=%d drone=%d → kept=%d per_class=%s",
        pre_counts.get("specialist", 0), pre_counts.get("coco", 0),
        pre_counts.get("drone", 0), len(det_rows_nms), post_by_class,
    )
    det_rows = [(r[0], r[1], r[2], r[3], r[4], r[5]) for r in det_rows_nms]

    # Draw colored boxes per class.
    annotated = img.copy()
    detections = []
    for i, (x1, y1, x2, y2, dconf, cname) in enumerate(det_rows):
        color = _color_for_class(cname)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f"{cname} {dconf:.2f}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        cv2.rectangle(annotated, (x1, max(0, y1 - th - 7)), (x1 + tw + 7, y1), color, -1)
        cv2.putText(annotated, label, (x1 + 3, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 1, cv2.LINE_AA)
        detections.append({
            "id": i + 1, "class_name": cname,
            "bbox": [x1, y1, x2, y2],
            "width": x2 - x1, "height": y2 - y1,
            "confidence": round(dconf, 4),
            "model_used": model_label,
        })

    _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 90])
    _, obuf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    confs = [d["confidence"] for d in detections]

    return {
        "original": base64.b64encode(obuf.tobytes()).decode(),
        "annotated": base64.b64encode(buf.tobytes()).decode(),
        "detections": detections,
        "count": len(detections),
        "per_class": post_by_class,
        "ensemble_raw_counts": pre_counts,
        "model_used": model_label,
        "avg_confidence": round(sum(confs)/len(confs), 4) if confs else 0,
        "max_confidence": round(max(confs), 4) if confs else 0,
        "min_confidence": round(min(confs), 4) if confs else 0,
    }


@app.post("/api/upload/image")
async def upload_image(file: UploadFile = File(...),
                       conf: float = Query(UPLOAD_DEFAULT_CONF),
                       iou: float = Query(0.45),
                       model_type: str = Query("yolo")):
    contents = await file.read()
    result = await asyncio.to_thread(_process_image_sync, contents, conf, iou, model_type)
    if isinstance(result, dict) and "__error__" in result:
        return JSONResponse(status_code=400, content={"error": result["__error__"]})
    return result


# TestingNewDataset: sample rates for ensemble passes in video upload.
# Primary tracker runs every frame; heavier partners run periodically and
# their last boxes are re-drawn on skipped frames so they appear continuous.
_ENSEMBLE_DRONE_STRIDE = 3          # yolov8x → every 3rd frame
_ENSEMBLE_DRONE_IMGSZ = 640         # drone at 640 — still fine for aerial silhouettes
_ENSEMBLE_COCO_STRIDE = 2           # COCO → every 2nd frame
# Video ensembles stay at 960 — bumping to 1280 made "Analyzing scene..." drag
# on CPU because yolov8x at 1280 is ~3× heavier per call than yolov8m at 960.
# Images still use 1280 (UPLOAD_IMAGE_IMGSZ) where one-shot latency is fine.
_ENSEMBLE_COCO_IMGSZ = 960
# AutoSafety: RT-DETR is heavier than yolov8m → larger stride.
_ENSEMBLE_RTDETR_STRIDE = 3
_ENSEMBLE_RTDETR_IMGSZ = 960


def _process_video_sync(video_bytes: bytes, conf: float, iou: float, model_type: str) -> dict:
    """Blocking video inference — called via asyncio.to_thread to keep the
    event loop responsive during multi-minute processing runs."""
    tmp_in = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
    tmp_in.write(video_bytes); tmp_in.close()

    cap = cv2.VideoCapture(tmp_in.name)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames_src = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    cap.release()

    tmp_raw = tempfile.NamedTemporaryFile(delete=False, suffix=".avi"); tmp_raw.close()
    tmp_out = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4"); tmp_out.close()

    if UPLOAD_MODEL_PATH:
        local_model = YOLO(UPLOAD_MODEL_PATH)
    else:
        local_model = models.get_fresh(model_type)
    single_class = _is_single_class_bird_model(local_model)
    coco_partner = get_ensemble_coco_video() if single_class else None
    drone_partner = get_drone_model()
    # AutoSafety: RT-DETR partner only when model_type == "auto".
    rtdetr_partner = get_ensemble_rtdetr() if (model_type == "auto" and single_class) else None

    logger.info(
        "upload/video: start %dx%d %.1ffps %d frames — "
        "primary=%s coco=%s drone=%s rtdetr=%s mode=%s",
        w, h, fps, total_frames_src,
        os.path.basename(UPLOAD_MODEL_PATH) if UPLOAD_MODEL_PATH else model_type,
        "yes" if coco_partner else "no",
        "yes" if drone_partner else "no",
        "yes" if rtdetr_partner else "no",
        model_type,
    )

    # Uploads: enable runway-mode logic so intrusion/approach/high-risk alerts
    # fire against the default zone polygon. Without is_runway=True the engine
    # only emits density alerts (>5 simultaneous tracks), which almost no test
    # clip trips, so the UI showed total_alerts=0 for every run.
    engine = RTDTEREngine(zone="Upload", is_runway=True)
    writer = cv2.VideoWriter(tmp_raw.name, cv2.VideoWriter_fourcc(*"MJPG"), fps, (w, h))
    cap = cv2.VideoCapture(tmp_in.name)

    frame_idx = total_det = 0
    all_alerts = []
    t0 = time.time()
    # Cache last-known ensemble boxes (post-NMS inputs) so skipped frames still
    # get them as candidates — avoids flicker on strided models.
    last_coco_boxes: list[tuple[int, int, int, int, float, str]] = []
    last_drone_boxes: list[tuple[int, int, int, int, float]] = []
    last_rtdetr_boxes: list[tuple[int, int, int, int, float, str]] = []
    per_class_totals: dict[str, int] = {}
    raw_ensemble_totals: dict[str, int] = {"specialist": 0, "coco": 0, "drone": 0, "rtdetr_coco": 0}

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Row format: (x1, y1, x2, y2, conf, class_name, source, tid-or-None)
        frame_rows: list = []

        track_kwargs = dict(conf=conf, iou=iou, imgsz=UPLOAD_IMGSZ,
                            tracker=TRACKER_CFG, persist=True, verbose=False)
        if not single_class:
            track_kwargs["classes"] = AERIAL_CLASS_IDS
        results = local_model.track(frame, **track_kwargs)
        result = results[0]

        if result.boxes is not None and len(result.boxes) > 0:
            xyxy_all = result.boxes.xyxy.cpu().numpy()
            confs_all = result.boxes.conf.cpu().numpy()
            ids_tensor = result.boxes.id
            ids_all = ids_tensor.int().tolist() if ids_tensor is not None else [None] * len(xyxy_all)
            cls_tensor = result.boxes.cls
            cls_ids = cls_tensor.int().tolist() if cls_tensor is not None else [None] * len(xyxy_all)
            for tid, box, dconf, cls_id in zip(ids_all, xyxy_all, confs_all, cls_ids):
                x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
                cname = "bird" if single_class else _class_name_for(local_model, cls_id)
                frame_rows.append((x1, y1, x2, y2, float(dconf), cname, "specialist", tid))
            raw_ensemble_totals["specialist"] += len(xyxy_all)

        # COCO ensemble: sampled every N frames; cache last boxes for skipped frames.
        if coco_partner is not None:
            if frame_idx % _ENSEMBLE_COCO_STRIDE == 0:
                c_res = coco_partner.predict(frame, conf=conf, iou=iou,
                                             imgsz=_ENSEMBLE_COCO_IMGSZ, verbose=False,
                                             classes=_ENSEMBLE_COCO_CLASSES)[0]
                last_coco_boxes = []
                if c_res.boxes is not None and len(c_res.boxes) > 0:
                    c_xyxy = c_res.boxes.xyxy.cpu().numpy()
                    c_confs = c_res.boxes.conf.cpu().numpy()
                    c_cls = c_res.boxes.cls.int().tolist()
                    for box, dconf, cls_id in zip(c_xyxy, c_confs, c_cls):
                        cname = _class_name_for(coco_partner, cls_id)
                        last_coco_boxes.append((int(box[0]), int(box[1]), int(box[2]),
                                                int(box[3]), float(dconf), cname))
                    raw_ensemble_totals["coco"] += len(c_xyxy)
            for (x1, y1, x2, y2, dconf, cname) in last_coco_boxes:
                frame_rows.append((x1, y1, x2, y2, dconf, cname, "coco", None))

        # AutoSafety: RT-DETR partner — only in Auto mode. Same COCO classes,
        # different architecture; NMS+authority merges with the YOLO ensemble.
        if rtdetr_partner is not None:
            if frame_idx % _ENSEMBLE_RTDETR_STRIDE == 0:
                r_res = rtdetr_partner.predict(frame, conf=conf, iou=iou,
                                               imgsz=_ENSEMBLE_RTDETR_IMGSZ, verbose=False,
                                               classes=_ENSEMBLE_COCO_CLASSES)[0]
                last_rtdetr_boxes = []
                if r_res.boxes is not None and len(r_res.boxes) > 0:
                    r_xyxy = r_res.boxes.xyxy.cpu().numpy()
                    r_confs = r_res.boxes.conf.cpu().numpy()
                    r_cls = r_res.boxes.cls.int().tolist()
                    for box, dconf, cls_id in zip(r_xyxy, r_confs, r_cls):
                        cname = _class_name_for(rtdetr_partner, cls_id)
                        last_rtdetr_boxes.append((int(box[0]), int(box[1]), int(box[2]),
                                                  int(box[3]), float(dconf), cname))
                    raw_ensemble_totals["rtdetr_coco"] += len(r_xyxy)
            for (x1, y1, x2, y2, dconf, cname) in last_rtdetr_boxes:
                frame_rows.append((x1, y1, x2, y2, dconf, cname, "rtdetr_coco", None))

        # Drone ensemble: yolov8x is expensive → sampled at larger stride + lower imgsz.
        if drone_partner is not None:
            if frame_idx % _ENSEMBLE_DRONE_STRIDE == 0:
                d_res = drone_partner.predict(frame, conf=conf, iou=iou,
                                              imgsz=_ENSEMBLE_DRONE_IMGSZ, verbose=False)[0]
                last_drone_boxes = []
                if d_res.boxes is not None and len(d_res.boxes) > 0:
                    d_xyxy = d_res.boxes.xyxy.cpu().numpy()
                    d_confs = d_res.boxes.conf.cpu().numpy()
                    for box, dconf in zip(d_xyxy, d_confs):
                        last_drone_boxes.append((int(box[0]), int(box[1]), int(box[2]),
                                                 int(box[3]), float(dconf)))
                    raw_ensemble_totals["drone"] += len(d_xyxy)
            for (x1, y1, x2, y2, dconf) in last_drone_boxes:
                frame_rows.append((x1, y1, x2, y2, dconf, "drone", "drone", None))

        # Cross-model NMS: resolves overlaps so specialist "bird" stops painting
        # over airplanes/kites/drones. Then draw the survivors and feed the
        # risk engine only tracked (specialist) ones that survived.
        kept = _cross_model_nms(frame_rows)
        total_det += len(kept)
        tids, ctrs = [], []
        for row in kept:
            x1, y1, x2, y2, dconf, cname, src, tid = row
            per_class_totals[cname] = per_class_totals.get(cname, 0) + 1
            if src == "specialist" and tid is not None:
                tids.append(tid)
                ctrs.append(np.array([(x1 + x2) / 2, (y1 + y2) / 2]))
            color = _color_for_class(cname)
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            label = f"{cname} {float(dconf):.2f}" + (f" ID:{tid}" if tid is not None else "")
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(frame, (x1, max(0, y1 - th - 6)), (x1 + tw + 6, y1), color, -1)
            cv2.putText(frame, label, (x1 + 3, y1 - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)

        fa = engine.update(tids, ctrs, w, h)
        for a in fa:
            all_alerts.append({"level": a.level, "track_id": a.track_id, "message": a.message, "model_used": model_type})
        frame_idx += 1
        cur_fps = frame_idx / (time.time()-t0) if (time.time()-t0) > 0 else 0
        frame = draw_overlay(frame, engine, fa, cur_fps, "Upload", model_type)
        writer.write(frame)

        if frame_idx % 50 == 0:
            logger.info("upload/video: %d/%d frames (%.1f proc-fps)",
                        frame_idx, total_frames_src, cur_fps)

    cap.release(); writer.release()
    total_time = time.time() - t0
    logger.info("upload/video: done %d frames in %.1fs (%.1f proc-fps) — "
                "raw specialist=%d coco=%d rtdetr=%d drone=%d → kept=%d per_class=%s",
                frame_idx, total_time, frame_idx/total_time if total_time > 0 else 0,
                raw_ensemble_totals["specialist"], raw_ensemble_totals["coco"],
                raw_ensemble_totals["rtdetr_coco"], raw_ensemble_totals["drone"],
                total_det, per_class_totals)

    import subprocess
    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", tmp_raw.name,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            tmp_out.name
        ], capture_output=True, timeout=300)
        video_path = tmp_out.name
    except (FileNotFoundError, subprocess.TimeoutExpired):
        logger.warning("ffmpeg not found, falling back to mp4v encoding")
        writer2 = cv2.VideoWriter(tmp_out.name, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
        cap2 = cv2.VideoCapture(tmp_raw.name)
        while True:
            ret, fr = cap2.read()
            if not ret:
                break
            writer2.write(fr)
        cap2.release(); writer2.release()
        video_path = tmp_out.name

    with open(video_path, "rb") as f:
        vid_b64 = base64.b64encode(f.read()).decode()
    os.unlink(tmp_in.name)
    os.unlink(tmp_raw.name)
    os.unlink(tmp_out.name)

    model_label = os.path.basename(UPLOAD_MODEL_PATH) if UPLOAD_MODEL_PATH else model_type
    return {
        "video": vid_b64, "total_frames": frame_idx, "total_detections": total_det,
        "avg_fps": round(frame_idx/total_time, 1) if total_time > 0 else 0,
        "unique_tracks": len(engine.tracks), "total_alerts": len(all_alerts),
        "alerts": all_alerts[-50:], "duration": round(total_time, 1), "model_used": model_label,
        "per_class": per_class_totals,
        "ensemble_raw_counts": raw_ensemble_totals,
    }


@app.post("/api/upload/video")
async def upload_video(file: UploadFile = File(...),
                       conf: float = Query(UPLOAD_DEFAULT_CONF),
                       iou: float = Query(0.45),
                       model_type: str = Query("yolo")):
    contents = await file.read()
    # TestingNewDataset: offload to a thread so event-loop-sensitive endpoints
    # (legend, stats, alerts WS) stay responsive during multi-minute inference.
    return await asyncio.to_thread(_process_video_sync, contents, conf, iou, model_type)


# ── TestHistory: per-user upload history ─────────────────────────────────────

def _make_history_thumbnail(media_path: Path, kind: str,
                            max_dim: int = 480, quality: int = 72) -> Optional[str]:
    """Read the saved annotated media and return a small JPEG dataURL.

    Server-side thumbnailing is more reliable than the browser's <video>
    element, which can fail to decode a frame within the upload timeout for
    larger or unusual codecs.
    """
    try:
        if kind == "image":
            frame = cv2.imread(str(media_path))
        elif kind == "video":
            cap = cv2.VideoCapture(str(media_path))
            ok, frame = cap.read()
            cap.release()
            if not ok:
                frame = None
        else:
            return None
        if frame is None:
            return None
        h, w = frame.shape[:2]
        if w == 0 or h == 0:
            return None
        scale = min(1.0, max_dim / max(w, h))
        if scale < 1.0:
            frame = cv2.resize(frame, (int(w * scale), int(h * scale)),
                               interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
        if not ok:
            return None
        return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii")
    except Exception as e:
        logger.warning("TestHistory thumbnail failed for %s: %s", media_path, e)
        return None


def _backfill_history_thumbnails():
    """Generate thumbnails for any rows where the client didn't send one."""
    try:
        with SessionLocal() as db:
            rows = (
                db.query(db_models.UploadHistory)
                .filter(db_models.UploadHistory.thumbnail_b64.is_(None))
                .all()
            )
            for r in rows:
                if not r.media_path or not Path(r.media_path).exists():
                    continue
                thumb = _make_history_thumbnail(Path(r.media_path), r.kind)
                if thumb:
                    r.thumbnail_b64 = thumb
            if rows:
                db.commit()
    except Exception as e:
        logger.warning("TestHistory backfill skipped: %s", e)


def _serialize_history(row: db_models.UploadHistory) -> dict:
    try:
        meta = json.loads(row.metadata_json or "{}")
    except Exception:
        meta = {}
    return {
        "id": row.id,
        "timestamp": int(row.created_at.timestamp() * 1000) if row.created_at else 0,
        "kind": row.kind,
        "filename": row.filename,
        "fileSize": row.file_size or 0,
        "engine": row.engine,
        "metadata": meta,
        "thumbnail": row.thumbnail_b64,
    }


@app.get("/api/uploads/history")
def list_upload_history(
    current_user: db_models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(db_models.UploadHistory)
        .filter(db_models.UploadHistory.user_id == current_user.id)
        .order_by(db_models.UploadHistory.created_at.desc())
        .all()
    )
    return [_serialize_history(r) for r in rows]


@app.post("/api/uploads/history")
async def save_upload_history(
    kind: str = Form(...),
    filename: str = Form(...),
    file_size: int = Form(...),
    engine_name: str = Form(..., alias="engine"),
    metadata: str = Form(...),
    thumbnail: Optional[str] = Form(None),
    media: UploadFile = File(...),
    current_user: db_models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if kind not in ("image", "video"):
        raise HTTPException(status_code=400, detail="kind must be 'image' or 'video'")

    user_dir = UPLOAD_HISTORY_DIR / current_user.id
    user_dir.mkdir(parents=True, exist_ok=True)

    entry_id = uuid.uuid4().hex
    ext = "mp4" if kind == "video" else "jpg"
    media_path = user_dir / f"{entry_id}.{ext}"
    contents = await media.read()
    media_path.write_bytes(contents)
    mime = "video/mp4" if kind == "video" else "image/jpeg"

    # Browser-generated thumbnails (esp. for videos) often come back null when
    # the hidden <video> element fails to decode in time. Always backfill from
    # the saved media on the server when needed.
    if not thumbnail:
        thumbnail = _make_history_thumbnail(media_path, kind)

    row = db_models.UploadHistory(
        id=entry_id,
        user_id=current_user.id,
        kind=kind,
        filename=filename,
        file_size=file_size,
        engine=engine_name,
        metadata_json=metadata,
        media_path=str(media_path),
        media_mime=mime,
        thumbnail_b64=thumbnail,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    # Cap per-user history; oldest entries fall off so disk doesn't grow forever.
    excess = (
        db.query(db_models.UploadHistory)
        .filter(db_models.UploadHistory.user_id == current_user.id)
        .order_by(db_models.UploadHistory.created_at.desc())
        .offset(MAX_HISTORY_PER_USER)
        .all()
    )
    for old in excess:
        try:
            Path(old.media_path).unlink(missing_ok=True)
        except Exception:
            pass
        db.delete(old)
    if excess:
        db.commit()

    return _serialize_history(row)


@app.get("/api/uploads/history/{entry_id}/media")
def get_upload_history_media(
    entry_id: str,
    current_user: db_models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(db_models.UploadHistory)
        .filter(
            db_models.UploadHistory.id == entry_id,
            db_models.UploadHistory.user_id == current_user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    p = Path(row.media_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Media file missing on server")
    return FileResponse(p, media_type=row.media_mime, filename=row.filename)


@app.delete("/api/uploads/history/{entry_id}")
def delete_upload_history(
    entry_id: str,
    current_user: db_models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(db_models.UploadHistory)
        .filter(
            db_models.UploadHistory.id == entry_id,
            db_models.UploadHistory.user_id == current_user.id,
        )
        .first()
    )
    if row:
        try:
            Path(row.media_path).unlink(missing_ok=True)
        except Exception:
            pass
        db.delete(row)
        db.commit()
    return {"ok": True}


@app.delete("/api/uploads/history")
def clear_upload_history(
    current_user: db_models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(db_models.UploadHistory)
        .filter(db_models.UploadHistory.user_id == current_user.id)
        .all()
    )
    for r in rows:
        try:
            Path(r.media_path).unlink(missing_ok=True)
        except Exception:
            pass
        db.delete(r)
    db.commit()
    return {"ok": True}


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
    # Subscribing here does NOT open any camera — alerts stream is independent
    # of frame streams. Cameras only open when a client watches their feed.
    queue = manager.subscribe_alerts()
    try:
        while True:
            try:
                data = await asyncio.wait_for(queue.get(), timeout=15.0)
                await websocket.send_json(data)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass
    finally:
        manager.unsubscribe_alerts(queue)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
