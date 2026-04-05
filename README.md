# SkyGuard — Automated Bird Monitoring using YOLO and Tracking

Bird strikes are one of the biggest safety hazards in aviation. This project tackles that problem by building a real-time bird detection and monitoring system that can be deployed at airports. It uses deep learning (YOLOv8 and RT-DETR) for detection, ByteTrack for tracking individual birds across frames, and a custom alert engine called RTDTER that watches for dangerous patterns like birds lingering on the runway.

I built this as part of my work on avian intrusion detection — the goal was to go beyond just "detecting birds in an image" and create something that actually understands context: which zone a bird is in, how long it's been there, whether it's heading toward the runway, and how many birds are in the area at once.

## What it does

- Detects birds in real-time using either **YOLOv8** (fast, good for real-time) or **RT-DETR** (transformer-based, more accurate)
- Tracks each bird with a unique ID using **ByteTrack** so you can follow individual birds across frames
- Monitors **six airport zones** (Runway, Taxiway, Apron, Perimeter, Terminal, General) with different alert priorities
- Runway cameras get special treatment — polygon-based zone intrusion detection, persistence alerts if a bird stays too long, and approach detection using velocity vectors
- Non-runway cameras still track birds and fire density alerts, they just don't have the runway-specific logic
- Supports **multiple cameras** simultaneously — webcams, RTSP streams, video files
- Comes with a full **React dashboard** (replaced an older Streamlit version) for managing cameras, viewing live feeds, and monitoring alerts
- You can also just upload an image or video through the dashboard and get detection results back

## The alert system (RTDTER)

RTDTER stands for Real-Time Detection, Tracking, and Event Response. It's the brain of the system — it takes raw detections from the model, maintains tracking state, and decides when to raise alerts.

There are four types of alerts:

| Alert | What triggers it |
|-------|-----------------|
| **Intrusion** | A bird enters the runway zone polygon |
| **High Risk** | A bird has been sitting in the runway zone longer than the threshold (default 3s) |
| **Approach** | A bird outside the zone is moving toward the runway (based on velocity direction) |
| **Critical / High Density** | Too many birds in one area (runway gets "Critical", other zones get "High Density") |

Each zone has a priority level — Runway is 4 (highest), Taxiway is 3, and so on. This affects how alerts are ranked in the dashboard.

## Getting started

### Prerequisites

- Python 3.10+
- Node.js 18+ (for the dashboard)

### Installation

```bash
git clone https://github.com/tanishqmodi/Automated-Bird-Monitoring-using-YOLO-and-Tracking.git
cd Automated-Bird-Monitoring-using-YOLO-and-Tracking
pip install ultralytics opencv-python numpy fastapi uvicorn python-multipart pyyaml
```

For the React dashboard:
```bash
cd dashboard
npm install
```

### Running the dashboard

You need two terminals (or just background one of them):

```bash
# Terminal 1 — start the backend
python -m uvicorn server:app --host 0.0.0.0 --port 8000

# Terminal 2 — start the frontend
cd dashboard
npm run dev
```

Then open `http://localhost:3000` in your browser. From there you can add cameras, pick zones, choose between YOLO and RT-DETR per camera, and watch everything in real-time.

### CLI mode

If you just want to run detection from the command line without the dashboard:

```bash
# Webcam
python avian_intrusion.py

# Video file
python avian_intrusion.py --source video.mp4

# RTSP stream
python avian_intrusion.py --source rtsp://camera-ip/stream

# Tweak thresholds and save output
python avian_intrusion.py --source video.mp4 --conf 0.3 --persistence 5.0 --density 3 --save output.mp4
```

### CLI flags

| Flag | Default | What it does |
|------|---------|-------------|
| `--source` | `0` (webcam) | Video file, camera index, or RTSP URL |
| `--model` | `runs/bird_detector3/weights/best.pt` | Path to YOLO model weights |
| `--conf` | `0.25` | Confidence threshold — lower means more sensitive |
| `--iou` | `0.45` | NMS overlap threshold |
| `--imgsz` | `640` | Input image size for inference |
| `--track-buffer` | `30` | How many frames to keep a lost track alive |
| `--persistence` | `3.0` | Seconds a bird must stay in the zone before a high-risk alert |
| `--density` | `5` | Number of birds that triggers a density alert |
| `--save` | None | Save annotated output to this path |
| `--no-show` | False | Run without opening a display window |

## Project structure

```
├── server.py               # FastAPI backend — camera management, WebSocket streaming, uploads
├── rtdter.py               # RTDTER engine — tracking state, zone logic, alert generation
├── config.py               # All configurable parameters in one place
├── avian_intrusion.py       # CLI tool for real-time detection
├── tracker_config.yaml      # ByteTrack settings
├── train.py                 # YOLOv8 training script
├── app_streamlit_backup.py  # Old Streamlit app (kept as backup)
├── dashboard/               # React + Tailwind frontend
│   ├── src/
│   │   ├── pages/           # Dashboard, Cameras, Upload, Alerts, Logs, Settings
│   │   ├── components/      # CameraFeed, AlertCard, MetricCard, etc.
│   │   ├── hooks/           # WebSocket and browser camera hooks
│   │   └── services/        # API client
│   └── package.json
├── runs/                    # Trained model weights
├── bird_data.yaml           # Dataset config
└── dataset (1).py           # Dataset download script
```

## How the zone system works

Not every camera at an airport needs the same level of monitoring. A runway camera needs polygon-based intrusion detection and approach analysis. A camera pointed at the terminal parking area? Not so much.

So when you add a camera, you pick its zone. The zone determines:

- **Alert priority** (Runway=4, Taxiway=3, Apron/Perimeter=2, Terminal/General=1)
- **Alert label** ("RUNWAY ALERT" vs "TAXIWAY ALERT" vs "DETECTION")
- **Whether runway logic is active** (zone polygon, intrusion, persistence, approach — only for runway cameras)

If you set a camera to the Runway zone, it automatically gets flagged as a runway camera. You can also manually toggle the runway flag.

## Tech stack

- **Detection**: YOLOv8 (ultralytics) + RT-DETR
- **Tracking**: ByteTrack via ultralytics
- **Backend**: FastAPI + WebSocket streaming
- **Frontend**: React + Vite + Tailwind CSS + Framer Motion
- **Visualization**: OpenCV overlays + Recharts
- **Language**: Python 3.12, JavaScript/JSX

## Notes

- The YOLO model was trained on the FBD-SV-2024 bird dataset. If you want to retrain, check `train.py`.
- RT-DETR weights (`rtdetr-l.pt`) get downloaded automatically by ultralytics the first time you use them.
- The old Streamlit dashboard is still in the repo as `app_streamlit_backup.py` if you prefer that.
- Camera permission on macOS: your terminal app needs camera access in System Settings > Privacy & Security > Camera.
