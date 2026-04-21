# Avia AI — Intelligent Aviation Systems

Bird strikes are one of the biggest safety hazards in aviation. Avia AI is a real-time
bird-detection and monitoring system designed to run at airports. It combines modern
object detectors (YOLOv8 and RT-DETR), per-object tracking (ByteTrack), a custom
event-response engine (RTDTER) that reasons about airport zones, and a full web
dashboard with authentication, user management and upload-based offline analysis.

---

## Table of contents
1. [What Avia AI does](#what-avia-ai-does)
2. [Architecture](#architecture)
3. [The alert engine (RTDTER)](#the-alert-engine-rtdter)
4. [Zone system](#zone-system)
5. [Tech stack](#tech-stack)
6. [Project layout](#project-layout)
7. [Prerequisites](#prerequisites)
8. [Installation](#installation)
9. [Running the server and the app](#running-the-server-and-the-app)
10. [First-login and admin bootstrap](#first-login-and-admin-bootstrap)
11. [Environment variables](#environment-variables)
12. [CLI detection mode](#cli-detection-mode)
13. [Training your own model](#training-your-own-model)
14. [REST + WebSocket API reference](#rest--websocket-api-reference)
15. [Database schema](#database-schema)
16. [Troubleshooting](#troubleshooting)

---

## What Avia AI does

- **Real-time detection** with a choice of models: YOLOv8 (fast) or RT-DETR (transformer,
  more accurate). Each camera can use a different model, or `auto` for an ensemble.
- **Per-bird tracking** with ByteTrack so the same animal keeps its ID across frames —
  required for persistence and approach reasoning.
- **Six airport zones** with different alert priorities: Runway, Taxiway, Apron,
  Perimeter, Terminal, General.
- **Runway-specific logic**: polygon-based intrusion detection, persistence alerts when
  a bird lingers past a threshold, and approach alerts when a bird outside the zone is
  heading toward the runway (velocity-vector check).
- **Multi-camera support** — webcams, RTSP streams, video files — streamed to the
  dashboard over WebSockets with live overlays.
- **Upload & Infer**: drop an image or video into the dashboard and get annotated
  results, per-run history and downloadable output (images use 1600 px imgsz for
  small-object recall; video stays at 1280 px to keep latency sane).
- **Per-user test history** with blobs keyed per user in IndexedDB, so accounts never
  see each other's runs.
- **Auth**: username/password, Google SSO, JWT-based session, `admin` vs `user` roles.
- **Admin Dashboard**: create/edit/delete users, assign an airport to each user
  (autocomplete over the 4.5k OurAirports dataset), review username-change requests
  and see the full history of past decisions.
- **Self-service profile**: users can edit their email, change their password, or
  submit a username-change request that an admin must approve.
- **Settings**: confidence / IoU thresholds, default model, alert sensitivity, log
  retention and inference mode are all configurable at runtime from the dashboard.
- **Log export**: CSV export of detection logs.

## Architecture

```
┌───────────────────────┐       WebSocket       ┌────────────────────────┐
│ Cameras / Uploads     │ ────────────────────► │ RTDTER engine          │
│ (webcam, RTSP, file)  │       frames          │  • tracker state       │
└───────────────────────┘                       │  • zone polygon check  │
                                                │  • alert decision      │
┌───────────────────────┐                       └─────────┬──────────────┘
│ React dashboard       │                                 │ detections +
│ (Vite + Tailwind)     │ ◄──── REST / WS ─────────────── │ alerts
└───────────────────────┘                                 ▼
         ▲                                   ┌────────────────────────┐
         │ JWT                                │ FastAPI server.py      │
         └──────────── login / admin ────────►│  + admin.py auth.py    │
                                              │  + airports.py          │
                                              └────────┬───────────────┘
                                                       ▼
                                              ┌────────────────────────┐
                                              │ SQLAlchemy (Postgres   │
                                              │ or SQLite fallback)    │
                                              └────────────────────────┘
```

## The alert engine (RTDTER)

RTDTER = Real-Time Detection, Tracking, and Event Response (`rtdter.py`). It takes raw
detections from the model, holds tracker state, and emits alerts:

| Alert            | Trigger                                                                   |
|------------------|---------------------------------------------------------------------------|
| **Intrusion**    | A tracked bird enters the runway-zone polygon                             |
| **High Risk**    | A bird has been inside the zone for longer than `PERSISTENCE_TIME_SEC`    |
| **Approach**     | A bird outside the zone is moving toward it (velocity angle check)        |
| **Critical / Density** | Too many concurrent birds in frame (runway → Critical, else → High Density) |

Every alert carries the camera's zone, priority (1–4), severity label, model used and
confidence. Thresholds live in `config.py` and can be overridden per-deployment from
the Settings page.

## Zone system

When you add a camera you pick its zone. The zone drives:

| Zone      | Priority | Label               | Runway logic? |
|-----------|----------|---------------------|---------------|
| Runway    | 4        | `RUNWAY ALERT`      | ✅             |
| Taxiway   | 3        | `TAXIWAY ALERT`     | ❌             |
| Apron     | 2        | `OPERATIONAL ALERT` | ❌             |
| Perimeter | 2        | `SECURITY ALERT`    | ❌             |
| Terminal  | 1        | `TERMINAL ALERT`    | ❌             |
| General   | 1        | `DETECTION`         | ❌             |

Picking `Runway` auto-sets the `is_runway` flag; you can also toggle it manually.
Non-runway cameras still detect, track and fire density alerts — they just skip the
polygon / approach logic.

## Tech stack

- **Detection**: YOLOv8 (`ultralytics`), RT-DETR (`rtdetr-l.pt`).
- **Tracker**: ByteTrack via ultralytics, config in `tracker_config.yaml`.
- **Backend**: FastAPI + Uvicorn, SQLAlchemy, Pydantic, JOSE (JWT), bcrypt.
- **DB**: PostgreSQL with automatic fallback to SQLite (`skyguard.db`).
- **Frontend**: React 19 + Vite 8, TypeScript, Tailwind 4, Framer Motion,
  React Router 7, Zustand, `react-three/fiber` + `three` for 3-D airspace.
- **Streaming**: WebSockets for frames and alerts.

## Project layout

```
Automated-Bird-Monitoring-using-YOLO-and-Tracking/
├── server.py                 # FastAPI app: cameras, uploads, WebSocket, settings
├── rtdter.py                 # RTDTER engine (tracking + alert logic)
├── auth.py                   # Login, signup, Google, JWT, self-profile, username-requests
├── admin.py                  # Admin-only user + username-request endpoints
├── airports.py               # OurAirports autocomplete (cached)
├── models.py                 # SQLAlchemy models
├── database.py               # Engine factory (Postgres → SQLite fallback)
├── config.py                 # Tunable constants (thresholds, zones, colors)
├── avian_intrusion.py        # Standalone CLI detector
├── tracker_config.yaml       # ByteTrack settings
├── bird_data.yaml            # YOLO training dataset config
├── configs/
│   ├── rtdetr_config.yaml    # RT-DETR dataset config (local)
│   └── rtdetr_config.server.yaml  # RT-DETR dataset config for the college server
├── train.py                  # YOLOv8 training script (FBD-SV-2024)
├── train_rtdetr.py           # Portable RT-DETR trainer with CLI flags
├── frontend/                 # React app (the actual dashboard — run from here)
│   ├── src/pages/            # CommandCenter, Airspace, Cameras, Upload, Runway,
│   │                          #   Alerts, Logs, Settings, Admin, EditProfile, Login
│   ├── src/components/       # Layout, ProtectedRoute, AdminRoute, ui/, 3d/
│   ├── src/store/            # Zustand stores (auth, cameras, upload)
│   ├── src/hooks/            # WebSocket + global-alert hooks
│   └── src/services/api.ts   # API client (typed)
├── dashboard/                # Legacy dashboard (keep for reference, not used)
├── runs/                     # Training outputs + pretrained weights
├── data/                     # airports.csv cache
├── rtdetr-l.pt, yolov8{n,m,x}.pt, yolo26n.pt  # Pretrained weights
└── skyguard.db               # SQLite DB (only if Postgres unavailable)
```

## Prerequisites

- Python **3.10+** (3.12/3.13 tested)
- Node.js **18+** and npm
- Optional: PostgreSQL 14+ (SQLite works out of the box otherwise)
- Optional: NVIDIA GPU + CUDA for fast inference / training. CPU and Apple MPS work
  for small demos.

## Installation

Clone the repo and install both halves:

```bash
git clone https://github.com/tanishqmodi/Automated-Bird-Monitoring-using-YOLO-and-Tracking.git
cd Automated-Bird-Monitoring-using-YOLO-and-Tracking

# Backend
python3 -m venv .venv && source .venv/bin/activate
pip install --upgrade pip
pip install \
  ultralytics opencv-python numpy pyyaml \
  fastapi "uvicorn[standard]" python-multipart \
  sqlalchemy psycopg2-binary \
  "python-jose[cryptography]" bcrypt pydantic

# Frontend
cd frontend
npm install
cd ..
```

> If you don't need Postgres, skip `psycopg2-binary` — the server will fall back to
> SQLite automatically.

### Download the model weights

Weights aren't checked into git (they're large). Pull them from the latest
GitHub Release in one command:

```bash
bash scripts/download_weights.sh
```

That fetches:

| File                                             | Purpose                                          |
|--------------------------------------------------|--------------------------------------------------|
| `rtdetr-l.pt`                                    | Ultralytics RT-DETR-L (transformer backbone)     |
| `yolov8m.pt`                                     | COCO-pretrained YOLOv8m (used by live dashboard) |
| `runs/bird_detector3/weights/best.pt`            | Fine-tuned YOLOv8 on FBD-SV-2024                 |
| `runs/yolov8s_bird_detection/weights/best.pt`    | Single-class bird specialist (upload path)       |

Override the release tag with `SKYGUARD_WEIGHTS_TAG=<tag>` if you need a
specific version. Each file also appears on
[the releases page](https://github.com/tanishqmodi/Automated-Bird-Monitoring-using-YOLO-and-Tracking/releases)
if you'd rather download by hand.

### Configure your JWT secret

The server refuses to start without `JWT_SECRET_KEY`. Copy the template and
drop a random secret into it:

```bash
cp .env.example .env
python -c "import secrets; print('JWT_SECRET_KEY=' + secrets.token_hex(32))" >> .env
# (delete the placeholder JWT_SECRET_KEY line in .env after pasting)
# then load it into your shell:
set -a && source .env && set +a
```

## Running the server and the app

You need the backend on **:8000** and the frontend dev server on **:5173**.

### Option A — two terminals (recommended while developing)

```bash
# Terminal 1 — backend
source .venv/bin/activate
python server.py
# or, equivalently:
# uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

```bash
# Terminal 2 — frontend
cd frontend
npm run dev
```

Then open **http://localhost:5173**.

### Option B — background both

```bash
mkdir -p logs

# backend
nohup python server.py > logs/backend.log 2>&1 &
echo $! > logs/backend.pid

# frontend
(cd frontend && nohup npm run dev > ../logs/frontend.log 2>&1 &)

# watch the logs
tail -f logs/backend.log logs/frontend.log
```

To stop:

```bash
kill $(cat logs/backend.pid)
lsof -ti:5173 | xargs kill          # frontend
```

### Option C — production-ish build

```bash
# build the frontend bundle
cd frontend && npm run build && cd ..

# serve the backend behind a real ASGI worker
uvicorn server:app --host 0.0.0.0 --port 8000 --workers 2
```

Serve `frontend/dist/` from any static host (nginx, Caddy) and point it at the
backend on :8000.

## First-login and admin bootstrap

- On first boot with an empty DB, use the Login page's **Sign up** flow — the very
  first user is created with `role=user`.
- To promote yourself to admin, open the DB and flip the role. With SQLite that's:
  ```bash
  sqlite3 skyguard.db "UPDATE users SET role='admin' WHERE username='<your-username>';"
  ```
  With Postgres, the same UPDATE via `psql`.
- Once logged in as admin you can create further users and assign airports from the
  **Admin Dashboard**.
- `GET /api/auth/me` returns the current user. The frontend stores the JWT in
  Zustand + localStorage and sends it as `Authorization: Bearer …` on every request.

## Environment variables

| Var                 | Default                                          | Purpose                                                   |
|---------------------|--------------------------------------------------|-----------------------------------------------------------|
| `DATABASE_URL`      | `postgresql://localhost/skyguard`                | SQLAlchemy URL. Falls back to SQLite if unreachable.       |
| `JWT_SECRET_KEY`    | hard-coded dev value in `auth.py`                | **Change this before deploying.**                          |

Model, threshold and zone settings are in `config.py` (code-level defaults) and
editable at runtime from the **Settings** page, which persists to the
`system_settings` table.

## CLI detection mode

For headless detection without the dashboard:

```bash
# Webcam 0
python avian_intrusion.py

# Video file
python avian_intrusion.py --source path/to/clip.mp4

# RTSP
python avian_intrusion.py --source rtsp://camera-ip/stream

# Tune + save output
python avian_intrusion.py --source clip.mp4 --conf 0.3 --persistence 5.0 --density 3 --save out.mp4
```

| Flag              | Default                                 | What it does                                             |
|-------------------|-----------------------------------------|----------------------------------------------------------|
| `--source`        | `0`                                     | Video path, camera index, or RTSP URL                    |
| `--model`         | `runs/bird_detector3/weights/best.pt`   | Path to YOLO weights                                     |
| `--conf`          | `0.25`                                  | Detection confidence floor                               |
| `--iou`           | `0.45`                                  | NMS IoU threshold                                        |
| `--imgsz`         | `640`                                   | Inference image size                                     |
| `--track-buffer`  | `30`                                    | Frames to keep a lost track alive                        |
| `--persistence`   | `3.0`                                   | Seconds in zone before a high-risk alert                 |
| `--density`       | `5`                                     | Concurrent birds that trip the density alert             |
| `--save`          | —                                       | Path to save the annotated output                        |
| `--no-show`       | `false`                                 | Don't open a display window                              |

## Training your own model

### YOLOv8 (FBD-SV-2024)

`train.py` extracts frames from the FBD-SV-2024 video dataset, converts Pascal VOC
labels to YOLO format, writes `bird_data.yaml`, then trains. Edit the Windows paths
at the top of the file to point at your local dataset before running:

```bash
python train.py
```

### RT-DETR (portable)

`train_rtdetr.py` wraps `ultralytics.RTDETR.train()` with CLI flags so it runs
identically on a local Mac (MPS), a Linux GPU box, or a remote cluster.

```bash
python train_rtdetr.py \
  --data configs/rtdetr_config.yaml \
  --weights rtdetr-l.pt \
  --epochs 80 --batch 16 --imgsz 640 \
  --device 0 --workers 8 \
  --project runs --name rtdetr_bird_detection2
```

Key flags: `--epochs`, `--batch`, `--imgsz`, `--device` (`0`, `0,1`, `cpu`, `mps`),
`--lr0`, `--lrf`, `--patience`, `--save-period`, `--resume`, `--no-amp`.

### Training on a remote GPU box

`configs/rtdetr_config.server.yaml` is a template — edit `path:` to wherever the
dataset lives on the server. Detached training with `nohup`:

```bash
nohup python train_rtdetr.py \
  --data configs/rtdetr_config.server.yaml \
  --weights rtdetr-l.pt \
  --epochs 80 --batch 16 --imgsz 640 \
  --device 0 --workers 8 \
  --project runs --name rtdetr_bird_detection2 \
  > logs/rtdetr.log 2>&1 &
```

Checkpoints land in `runs/<name>/weights/` every `--save-period` epochs plus
`best.pt` / `last.pt`.

## REST + WebSocket API reference

All endpoints live under `/api`. Anything that touches user data expects a
`Authorization: Bearer <jwt>` header obtained from `/api/auth/login`.

### Auth (`auth.py`)

| Method | Path                                     | Purpose                                              |
|--------|------------------------------------------|------------------------------------------------------|
| POST   | `/api/auth/login`                        | Form login → JWT                                     |
| POST   | `/api/auth/signup`                       | Create account                                       |
| POST   | `/api/auth/google`                       | Google SSO (demo; verify server-side in production)  |
| GET    | `/api/auth/me`                           | Current user profile                                 |
| PUT    | `/api/auth/me`                           | Self-update (email, password)                        |
| GET    | `/api/auth/username-requests`            | Own rename requests                                  |
| POST   | `/api/auth/username-requests`            | Submit a rename request                              |
| DELETE | `/api/auth/username-requests/{id}`       | Cancel a pending request                             |

### Admin (`admin.py`) — `role=admin` only

| Method | Path                                           | Purpose                              |
|--------|------------------------------------------------|--------------------------------------|
| GET    | `/api/admin/users`                             | List users                           |
| POST   | `/api/admin/users`                             | Create user                          |
| PATCH  | `/api/admin/users/{id}`                        | Edit (incl. username / role / airport) |
| DELETE | `/api/admin/users/{id}`                        | Delete (self-delete blocked)         |
| GET    | `/api/admin/username-requests?status=pending\|approved\|rejected\|all` | List requests |
| POST   | `/api/admin/username-requests/{id}/approve`    | Approve + apply the rename           |
| POST   | `/api/admin/username-requests/{id}/reject`     | Reject with optional note            |

### Cameras, stats, logs, settings (`server.py`)

| Method | Path                         | Purpose                                       |
|--------|------------------------------|-----------------------------------------------|
| GET    | `/api/health`                | Liveness                                      |
| GET    | `/api/stats`                 | Global stats (active cameras, alerts, …)      |
| GET    | `/api/detection/legend`      | Zone colors / priorities for the UI           |
| GET    | `/api/cameras`               | List cameras                                  |
| POST   | `/api/cameras`               | Add camera                                    |
| PUT    | `/api/cameras/{id}`          | Update camera                                 |
| DELETE | `/api/cameras/{id}`          | Remove camera                                 |
| GET    | `/api/alerts`                | Recent alerts                                 |
| GET    | `/api/logs?limit=N`          | Recent detection log                          |
| GET    | `/api/logs/download`         | CSV export                                    |
| GET    | `/api/settings`              | Runtime settings                              |
| PUT    | `/api/settings`              | Update runtime settings                       |
| GET    | `/api/zones`                 | Available zones                               |
| POST   | `/api/upload/image`          | Analyze an image                              |
| POST   | `/api/upload/video`          | Analyze a video                               |

### Airports

| Method | Path                                         | Purpose                            |
|--------|----------------------------------------------|------------------------------------|
| GET    | `/api/airports/search?q=&limit=10`           | Autocomplete (IATA/ICAO/name)      |

### WebSockets

| Path                    | Purpose                                                             |
|-------------------------|---------------------------------------------------------------------|
| `/ws/camera/{cam_id}`   | Live annotated frames for one camera, streamed as base64 JPEGs      |
| `/ws/alerts`            | Push channel for new alerts (fan-out to all logged-in dashboards)   |

## Database schema

Tables (see `models.py`):

- **users** — id, username, email, password_hash, google_id, auth_provider, role,
  airport_{iata,icao,name,city,country}, created_at, updated_at.
- **cameras** — id, name, source, zone, is_runway, model_type, status, created_by,
  created_at, updated_at.
- **alerts** — id, camera_id, zone, severity, class_name, confidence, model_used,
  timestamp, status.
- **detection_logs** — id, camera_id, zone, class_name, confidence, bbox, model_used,
  media_type, created_at.
- **system_settings** — confidence_threshold, iou_threshold, default_model,
  alert_sensitivity, log_retention_days, inference_mode, updated_by, updated_at.
- **username_change_requests** — id, user_id, current_username, requested_username,
  reason, status, admin_note, reviewed_by, created_at, resolved_at.

Tables are created automatically on startup via SQLAlchemy `create_all`.

## Troubleshooting

- **`Failed to connect to PostgreSQL…`** — harmless; the server falls back to
  `skyguard.db` (SQLite) for dev use. Set `DATABASE_URL` if you want Postgres.
- **Camera permission on macOS** — Terminal/iTerm needs camera access in System
  Settings → Privacy & Security → Camera.
- **`objc[*] … libavdevice duplicate`** warnings — a known ultralytics + opencv + av
  dylib clash on macOS; cosmetic, safe to ignore.
- **Port already in use** — `lsof -ti:8000 | xargs kill` (or 5173 for the frontend).
- **Frontend can't reach the API** — the client hits `http://localhost:8000/api` by
  default (`frontend/src/services/api.ts`). Change that constant if you front the
  backend elsewhere.
- **`rtdetr-l.pt` not found while training** — pass `--weights` to an existing path,
  or let ultralytics fetch the default weights on first import.
- **JWT still valid after logout** — tokens are stateless and expire after 7 days
  (`ACCESS_TOKEN_EXPIRE_MINUTES` in `auth.py`). Shorten it for production.

---

Built by Tanishq Modi as part of an avian-intrusion-detection capstone under the
Avia AI — Intelligent Aviation Systems banner. PRs and issues welcome.
