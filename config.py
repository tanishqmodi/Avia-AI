"""
SkyGuard — Configurable parameters for Avian Intrusion Detection.
"""

import numpy as np

# ── Model Settings ────────────────────────────────────────────────────────────
YOLO_MODEL_PATH = "runs/bird_detector3/weights/best.pt"
YOLO_FALLBACK = "yolov8n.pt"
RTDETR_MODEL_PATH = "rtdetr-l.pt"  # downloaded on first use by ultralytics
DEFAULT_MODEL_TYPE = "yolo"        # "yolo", "rtdetr", "auto"

# ── Detection Settings ────────────────────────────────────────────────────────
CONFIDENCE_THRESHOLD = 0.25
IOU_THRESHOLD = 0.45

# ── Tracker Settings (ByteTrack) ─────────────────────────────────────────────
TRACKER_TYPE = "bytetrack"
TRACK_BUFFER = 30
MATCH_THRESH = 0.8

# ── Zone Definitions ─────────────────────────────────────────────────────────
ZONES = ["Runway", "Taxiway", "Apron", "Perimeter", "Terminal", "General"]

# Zone → alert priority (higher = more severe)
ZONE_PRIORITY = {
    "Runway":    4,  # CRITICAL
    "Taxiway":   3,  # HIGH
    "Apron":     2,  # MEDIUM
    "Perimeter": 2,  # MEDIUM (security)
    "Terminal":  1,  # LOW
    "General":   1,  # STANDARD
}

# Zone → alert label
ZONE_ALERT_LABEL = {
    "Runway":    "RUNWAY ALERT",
    "Taxiway":   "TAXIWAY ALERT",
    "Apron":     "OPERATIONAL ALERT",
    "Perimeter": "SECURITY ALERT",
    "Terminal":  "TERMINAL ALERT",
    "General":   "DETECTION",
}

# Zone → color scheme (BGR for OpenCV)
ZONE_COLORS_BGR = {
    "Runway":    (0, 80, 255),    # red-orange
    "Taxiway":   (0, 180, 255),   # amber
    "Apron":     (0, 200, 200),   # yellow-green
    "Perimeter": (200, 100, 0),   # blue
    "Terminal":  (180, 130, 0),   # teal
    "General":   (180, 180, 180), # gray
}

# Runway monitoring zone (polygon as fraction of frame)
# ONLY used for cameras with is_runway=True
RUNWAY_ZONE_NORMALIZED = np.array([
    [0.15, 0.55],
    [0.85, 0.55],
    [0.90, 0.85],
    [0.10, 0.85],
], dtype=np.float32)

# ── Alert Thresholds ─────────────────────────────────────────────────────────
PERSISTENCE_TIME_SEC = 3.0
DENSITY_THRESHOLD = 5
APPROACH_ANGLE_THRESH = 30.0
VELOCITY_RISK_THRESH = 50.0

# ── Performance ──────────────────────────────────────────────────────────────
TARGET_FPS = 20
IMGSZ = 640

# ── Logging ──────────────────────────────────────────────────────────────────
LOG_FILE = "alerts.log"
