#!/usr/bin/env python3
"""
Avian Intrusion Detection System — CLI
Real-time bird detection + ByteTrack tracking + RTDTER event response.

Usage:
    python avian_intrusion.py                        # webcam (default)
    python avian_intrusion.py --source video.mp4     # video file
    python avian_intrusion.py --source rtsp://...    # RTSP stream
    python avian_intrusion.py --source 0             # camera index
"""

import argparse
import time
import logging
import os
import sys
import cv2
import numpy as np
from pathlib import Path
from ultralytics import YOLO

import config as cfg
from rtdter import RTDTEREngine

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(cfg.LOG_FILE, mode="a"),
    ],
)
logger = logging.getLogger("avian_intrusion")


# ── Drawing helpers ──────────────────────────────────────────────────────────

RISK_COLORS = {
    0: (0, 255, 0),    # green — normal
    1: (0, 165, 255),  # orange — intrusion
    2: (0, 0, 255),    # red — high risk
    3: (0, 0, 200),    # dark red — critical
}

ALERT_COLORS = {
    "INTRUSION": (0, 165, 255),
    "HIGH_RISK": (0, 0, 255),
    "CRITICAL": (0, 0, 200),
    "APPROACH": (255, 165, 0),
}


def draw_overlay(frame: np.ndarray, engine: RTDTEREngine, alerts: list, fps: float) -> np.ndarray:
    """Draw zone polygon, track annotations, and alert banner onto frame."""
    h, w = frame.shape[:2]

    # Draw runway zone polygon
    zone_px = engine.get_zone_polygon_px(w, h)
    overlay = frame.copy()
    cv2.fillPoly(overlay, [zone_px], (0, 100, 255))
    cv2.addWeighted(overlay, 0.2, frame, 0.8, 0, frame)
    cv2.polylines(frame, [zone_px], isClosed=True, color=(0, 100, 255), thickness=2)
    cv2.putText(frame, "RUNWAY ZONE", tuple(zone_px[0] + [5, -10]),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 100, 255), 2)

    # Draw tracked birds
    for track in engine.get_active_tracks():
        pos = track.current_pos
        if pos is None:
            continue
        color = RISK_COLORS.get(track.risk_level, (255, 255, 255))
        cx, cy = int(pos[0]), int(pos[1])

        # Trail
        pts = list(track.positions)
        for i in range(1, len(pts)):
            alpha = i / len(pts)
            c = tuple(int(v * alpha) for v in color)
            cv2.line(frame, (int(pts[i - 1][0]), int(pts[i - 1][1])),
                     (int(pts[i][0]), int(pts[i][1])), c, 2)

        # ID label
        label = f"ID:{track.track_id}"
        if track.speed > 5:
            label += f" {track.speed:.0f}px/s"
        if track.in_zone:
            label += f" [{track.time_in_zone:.1f}s]"
        cv2.putText(frame, label, (cx + 10, cy - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        cv2.circle(frame, (cx, cy), 5, color, -1)

    # Stats bar
    stats = engine.get_stats()
    bar_h = 40
    cv2.rectangle(frame, (0, 0), (w, bar_h), (30, 30, 30), -1)
    info = (f"FPS: {fps:.0f} | Birds: {stats['active_birds']} | "
            f"In Zone: {stats['birds_in_zone']} | High Risk: {stats['high_risk']} | "
            f"Alerts: {stats['total_alerts']}")
    cv2.putText(frame, info, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)

    # Risk indicator
    risk = stats["max_risk"]
    risk_labels = {0: "CLEAR", 1: "INTRUSION", 2: "HIGH RISK", 3: "CRITICAL"}
    risk_color = RISK_COLORS.get(risk, (255, 255, 255))
    cv2.rectangle(frame, (w - 200, 0), (w, bar_h), risk_color, -1)
    cv2.putText(frame, risk_labels.get(risk, ""), (w - 190, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

    # Alert banners (last 3)
    for i, alert in enumerate(alerts[-3:]):
        y = bar_h + 10 + i * 30
        ac = ALERT_COLORS.get(alert.level, (255, 255, 255))
        cv2.rectangle(frame, (0, y), (w, y + 25), ac, -1)
        cv2.putText(frame, f"[{alert.level}] {alert.message}", (10, y + 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

    return frame


# ── Main loop ────────────────────────────────────────────────────────────────

def run(
    source,
    model_path: str = None,
    conf: float = None,
    iou: float = None,
    track_buffer: int = None,
    persistence_sec: float = None,
    density_threshold: int = None,
    imgsz: int = None,
    save_output: str = None,
    show: bool = True,
):
    model_path = model_path or cfg.MODEL_PATH
    conf = conf if conf is not None else cfg.CONFIDENCE_THRESHOLD
    iou = iou if iou is not None else cfg.IOU_THRESHOLD
    imgsz = imgsz or cfg.IMGSZ

    # Resolve model
    if not os.path.exists(model_path):
        logger.warning("Model %s not found, falling back to %s", model_path, cfg.FALLBACK_MODEL)
        model_path = cfg.FALLBACK_MODEL

    logger.info("Loading model: %s", model_path)
    model = YOLO(model_path)

    # ByteTrack config
    tracker_cfg = str(Path(__file__).parent / "tracker_config.yaml")
    if not os.path.exists(tracker_cfg):
        tracker_cfg = "bytetrack.yaml"

    # RTDTER engine
    engine = RTDTEREngine(
        persistence_sec=persistence_sec,
        density_threshold=density_threshold,
    )

    # Video source
    if isinstance(source, str) and source.isdigit():
        source = int(source)
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        logger.error("Cannot open video source: %s", source)
        sys.exit(1)

    fps_video = cap.get(cv2.CAP_PROP_FPS) or 25
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    logger.info("Source: %s | %dx%d @ %.1f fps | %d frames",
                source, frame_w, frame_h, fps_video, total_frames)

    # Output writer
    writer = None
    if save_output:
        os.makedirs(os.path.dirname(save_output) or ".", exist_ok=True)
        writer = cv2.VideoWriter(
            save_output,
            cv2.VideoWriter_fourcc(*"mp4v"),
            fps_video,
            (frame_w, frame_h),
        )
        logger.info("Saving output to: %s", save_output)

    frame_count = 0
    t_start = time.time()

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            t0 = time.time()

            # Run YOLO + ByteTrack
            results = model.track(
                frame,
                conf=conf,
                iou=iou,
                imgsz=imgsz,
                tracker=tracker_cfg,
                persist=True,
                verbose=False,
            )

            result = results[0]
            track_ids = []
            centers = []

            if result.boxes is not None and result.boxes.id is not None:
                boxes = result.boxes
                ids = boxes.id.int().tolist()
                xyxy = boxes.xyxy.cpu().numpy()

                for tid, box in zip(ids, xyxy):
                    cx = (box[0] + box[2]) / 2
                    cy = (box[1] + box[3]) / 2
                    track_ids.append(tid)
                    centers.append(np.array([cx, cy]))

                    # Draw bounding box
                    x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
                    risk = engine.tracks[tid].risk_level if tid in engine.tracks else 0
                    color = RISK_COLORS.get(risk, (0, 255, 0))
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

            # Update RTDTER
            frame_alerts = engine.update(track_ids, centers, frame_w, frame_h)

            # Compute FPS
            frame_count += 1
            elapsed = time.time() - t_start
            current_fps = frame_count / elapsed if elapsed > 0 else 0

            # Draw overlay
            frame = draw_overlay(frame, engine, frame_alerts, current_fps)

            if writer:
                writer.write(frame)

            if show:
                cv2.imshow("Avian Intrusion Detection", frame)
                key = cv2.waitKey(1) & 0xFF
                if key == ord("q") or key == 27:
                    logger.info("User quit.")
                    break

            # Log progress for video files
            if total_frames > 0 and frame_count % 100 == 0:
                pct = frame_count / total_frames * 100
                logger.info("Progress: %d/%d (%.1f%%) | FPS: %.1f",
                            frame_count, total_frames, pct, current_fps)

    except KeyboardInterrupt:
        logger.info("Interrupted.")
    finally:
        cap.release()
        if writer:
            writer.release()
        if show:
            cv2.destroyAllWindows()

    total_time = time.time() - t_start
    logger.info("Finished: %d frames in %.1fs (avg %.1f FPS)", frame_count, total_time,
                frame_count / total_time if total_time > 0 else 0)
    logger.info("Total alerts generated: %d", len(engine.alerts))

    return engine


# ── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Avian Intrusion Detection — YOLOv8 + ByteTrack + RTDTER",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--source", default="0",
                        help="Video source: file path, camera index, or RTSP URL")
    parser.add_argument("--model", default=cfg.MODEL_PATH,
                        help="Path to YOLO model weights")
    parser.add_argument("--conf", type=float, default=cfg.CONFIDENCE_THRESHOLD,
                        help="Detection confidence threshold")
    parser.add_argument("--iou", type=float, default=cfg.IOU_THRESHOLD,
                        help="IOU threshold for NMS")
    parser.add_argument("--imgsz", type=int, default=cfg.IMGSZ,
                        help="Inference image size")
    parser.add_argument("--track-buffer", type=int, default=cfg.TRACK_BUFFER,
                        help="Tracking buffer (frames to keep lost tracks)")
    parser.add_argument("--persistence", type=float, default=cfg.PERSISTENCE_TIME_SEC,
                        help="Seconds in zone before HIGH RISK alert")
    parser.add_argument("--density", type=int, default=cfg.DENSITY_THRESHOLD,
                        help="Bird count threshold for CRITICAL alert")
    parser.add_argument("--save", default=None,
                        help="Path to save annotated output video")
    parser.add_argument("--no-show", action="store_true",
                        help="Disable display window (headless mode)")
    args = parser.parse_args()

    run(
        source=args.source,
        model_path=args.model,
        conf=args.conf,
        iou=args.iou,
        track_buffer=args.track_buffer,
        persistence_sec=args.persistence,
        density_threshold=args.density,
        imgsz=args.imgsz,
        save_output=args.save,
        show=not args.no_show,
    )


if __name__ == "__main__":
    main()
