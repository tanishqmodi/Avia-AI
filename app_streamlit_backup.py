import streamlit as st

st.set_page_config(
    page_title="AIDS — Avian Intrusion Detection System",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Custom CSS for industry-grade UI ─────────────────────────────────────────
st.markdown("""
<style>
    /* Global */
    .block-container { padding-top: 1.5rem; }

    /* Header banner */
    .header-banner {
        background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%);
        border-radius: 12px;
        padding: 1.5rem 2rem;
        margin-bottom: 1.5rem;
        border: 1px solid #1e3a5f;
    }
    .header-banner h1 {
        color: #f8fafc;
        font-size: 1.8rem;
        margin: 0;
        font-weight: 700;
        letter-spacing: -0.5px;
    }
    .header-banner p {
        color: #94a3b8;
        margin: 0.3rem 0 0 0;
        font-size: 0.95rem;
    }

    /* Status badges */
    .status-badge {
        display: inline-block;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.5px;
        text-transform: uppercase;
    }
    .badge-clear { background: #065f46; color: #6ee7b7; }
    .badge-intrusion { background: #78350f; color: #fbbf24; }
    .badge-high-risk { background: #7c2d12; color: #fb923c; }
    .badge-critical { background: #7f1d1d; color: #fca5a5; animation: pulse 1.5s infinite; }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
    }

    /* Metric cards */
    div[data-testid="stMetric"] {
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 10px;
        padding: 0.8rem 1rem;
    }
    div[data-testid="stMetric"] label {
        color: #94a3b8 !important;
        font-size: 0.8rem !important;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    div[data-testid="stMetric"] div[data-testid="stMetricValue"] {
        color: #f1f5f9 !important;
        font-size: 1.6rem !important;
    }

    /* Alert cards */
    .alert-card {
        border-radius: 8px;
        padding: 0.6rem 1rem;
        margin-bottom: 0.5rem;
        font-size: 0.85rem;
        border-left: 4px solid;
    }
    .alert-critical {
        background: rgba(127, 29, 29, 0.3);
        border-left-color: #ef4444;
        color: #fca5a5;
    }
    .alert-high-risk {
        background: rgba(124, 45, 18, 0.3);
        border-left-color: #f97316;
        color: #fdba74;
    }
    .alert-intrusion {
        background: rgba(120, 53, 15, 0.3);
        border-left-color: #eab308;
        color: #fde047;
    }
    .alert-approach {
        background: rgba(30, 58, 95, 0.3);
        border-left-color: #3b82f6;
        color: #93c5fd;
    }

    /* Sidebar */
    section[data-testid="stSidebar"] {
        background: #0f172a;
        border-right: 1px solid #1e293b;
    }
    section[data-testid="stSidebar"] .stMarkdown h1,
    section[data-testid="stSidebar"] .stMarkdown h2,
    section[data-testid="stSidebar"] .stMarkdown h3 {
        color: #e2e8f0;
    }

    /* Tabs */
    .stTabs [data-baseweb="tab-list"] {
        gap: 0;
        background: #0f172a;
        border-radius: 10px;
        padding: 4px;
        border: 1px solid #1e293b;
    }
    .stTabs [data-baseweb="tab"] {
        border-radius: 8px;
        padding: 0.5rem 1.2rem;
        color: #94a3b8;
        font-weight: 500;
    }
    .stTabs [aria-selected="true"] {
        background: #1e3a5f !important;
        color: #f1f5f9 !important;
    }

    /* File uploader */
    div[data-testid="stFileUploader"] {
        border: 2px dashed #1e3a5f;
        border-radius: 12px;
        padding: 1rem;
    }

    /* Progress bar */
    .stProgress > div > div {
        background: linear-gradient(90deg, #3b82f6, #06b6d4);
    }

    /* Dataframe */
    .stDataFrame { border-radius: 10px; overflow: hidden; }

    /* Section dividers */
    .section-header {
        color: #e2e8f0;
        font-size: 1.1rem;
        font-weight: 600;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid #1e3a5f;
        margin-bottom: 1rem;
    }

    /* Live indicator */
    .live-indicator {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 0.3rem 0.8rem;
        border-radius: 9999px;
        background: #7f1d1d;
        font-size: 0.75rem;
        font-weight: 600;
        color: #fca5a5;
    }
    .live-dot {
        width: 8px; height: 8px;
        border-radius: 50%;
        background: #ef4444;
        animation: pulse 1s infinite;
    }
</style>
""", unsafe_allow_html=True)

import cv2
import time
import threading
import numpy as np
import tempfile
import os
from pathlib import Path
from collections import deque
from ultralytics import YOLO
from streamlit_webrtc import webrtc_streamer, VideoProcessorBase, WebRtcMode
import av

import config as cfg
from rtdter import RTDTEREngine

# ── Load model ────────────────────────────────────────────────────────────────
@st.cache_resource
def load_model(model_path: str):
    path = model_path if os.path.exists(model_path) else cfg.FALLBACK_MODEL
    return YOLO(path), path

model, model_path = load_model(cfg.MODEL_PATH)

# ── Drawing Utilities ─────────────────────────────────────────────────────────

RISK_COLORS_BGR = {
    0: (0, 255, 0),
    1: (0, 200, 255),
    2: (0, 80, 255),
    3: (0, 0, 220),
}

ALERT_COLORS_BGR = {
    "INTRUSION": (0, 200, 255),
    "HIGH_RISK": (0, 80, 255),
    "CRITICAL": (0, 0, 220),
    "APPROACH": (255, 180, 0),
}

ALERT_CSS_MAP = {
    "CRITICAL": "alert-critical",
    "HIGH_RISK": "alert-high-risk",
    "INTRUSION": "alert-intrusion",
    "APPROACH": "alert-approach",
}

RISK_BADGE_MAP = {
    0: ("CLEAR", "badge-clear"),
    1: ("INTRUSION", "badge-intrusion"),
    2: ("HIGH RISK", "badge-high-risk"),
    3: ("CRITICAL", "badge-critical"),
}


def draw_frame_overlay(frame, engine, frame_alerts, fps_val):
    """Annotate frame with zone, trails, stats, alerts."""
    h, w = frame.shape[:2]

    # Runway zone
    zone_px = engine.get_zone_polygon_px(w, h)
    overlay = frame.copy()
    cv2.fillPoly(overlay, [zone_px], (0, 80, 220))
    cv2.addWeighted(overlay, 0.15, frame, 0.85, 0, frame)
    cv2.polylines(frame, [zone_px], isClosed=True, color=(0, 100, 255), thickness=2)

    # Zone label with background
    label_pos = tuple(zone_px[0] + [5, -10])
    (tw, th), _ = cv2.getTextSize("RUNWAY ZONE", cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
    cv2.rectangle(frame, (label_pos[0] - 4, label_pos[1] - th - 4),
                  (label_pos[0] + tw + 4, label_pos[1] + 4), (0, 80, 220), -1)
    cv2.putText(frame, "RUNWAY ZONE", label_pos,
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

    # Bird trails and labels
    for track in engine.get_active_tracks():
        pos = track.current_pos
        if pos is None:
            continue
        color = RISK_COLORS_BGR.get(track.risk_level, (255, 255, 255))
        cx, cy = int(pos[0]), int(pos[1])

        pts = list(track.positions)
        for i in range(1, len(pts)):
            alpha = i / len(pts)
            c = tuple(int(v * alpha) for v in color)
            cv2.line(frame, (int(pts[i - 1][0]), int(pts[i - 1][1])),
                     (int(pts[i][0]), int(pts[i][1])), c, 2)

        label = f"ID:{track.track_id}"
        if track.speed > 5:
            label += f" {track.speed:.0f}px/s"
        if track.in_zone:
            label += f" [{track.time_in_zone:.1f}s]"

        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
        cv2.rectangle(frame, (cx + 8, cy - th - 14), (cx + tw + 14, cy - 4), (0, 0, 0), -1)
        cv2.putText(frame, label, (cx + 10, cy - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)
        cv2.circle(frame, (cx, cy), 5, color, -1)
        cv2.circle(frame, (cx, cy), 7, color, 1)

    # Top stats bar
    stats = engine.get_stats()
    bar_h = 36
    bar_overlay = frame.copy()
    cv2.rectangle(bar_overlay, (0, 0), (w, bar_h), (15, 23, 42), -1)
    cv2.addWeighted(bar_overlay, 0.85, frame, 0.15, 0, frame)

    info = (f"FPS: {fps_val:.0f}  |  Birds: {stats['active_birds']}  |  "
            f"In Zone: {stats['birds_in_zone']}  |  High Risk: {stats['high_risk']}  |  "
            f"Alerts: {stats['total_alerts']}")
    cv2.putText(frame, info, (12, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (148, 163, 184), 1, cv2.LINE_AA)

    # Risk indicator pill
    risk = stats["max_risk"]
    risk_label = {0: "CLEAR", 1: "INTRUSION", 2: "HIGH RISK", 3: "CRITICAL"}.get(risk, "")
    risk_color = RISK_COLORS_BGR.get(risk, (255, 255, 255))
    (tw, th), _ = cv2.getTextSize(risk_label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
    rx = w - tw - 24
    cv2.rectangle(frame, (rx - 8, 6), (w - 8, bar_h - 6), risk_color, -1)
    cv2.rectangle(frame, (rx - 8, 6), (w - 8, bar_h - 6), risk_color, 1)
    cv2.putText(frame, risk_label, (rx, 26),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2, cv2.LINE_AA)

    # Alert banners (last 3)
    for i, alert in enumerate(frame_alerts[-3:]):
        y = bar_h + 8 + i * 28
        ac = ALERT_COLORS_BGR.get(alert.level, (255, 255, 255))
        bar_ov = frame.copy()
        cv2.rectangle(bar_ov, (0, y), (w, y + 24), (0, 0, 0), -1)
        cv2.addWeighted(bar_ov, 0.6, frame, 0.4, 0, frame)
        cv2.rectangle(frame, (0, y), (4, y + 24), ac, -1)
        cv2.putText(frame, f"  [{alert.level}]  {alert.message}", (8, y + 17),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, ac, 1, cv2.LINE_AA)

    return frame


def render_alert_html(alert):
    css_class = ALERT_CSS_MAP.get(alert.level, "alert-approach")
    tid = f"Track #{alert.track_id}" if alert.track_id else "System"
    return f'<div class="alert-card {css_class}"><strong>[{alert.level}]</strong> {tid} — {alert.message}</div>'


# ══════════════════════════════════════════════════════════════════════════════
#  SIDEBAR
# ══════════════════════════════════════════════════════════════════════════════

with st.sidebar:
    st.markdown("### 🛡️ AIDS Control Panel")
    st.caption("Avian Intrusion Detection System")
    st.markdown("---")

    # Model info
    with st.expander("🧠 Model", expanded=True):
        if os.path.exists(cfg.MODEL_PATH):
            st.success("Trained model active", icon="✅")
        else:
            st.warning("Fallback model active", icon="⚠️")
        st.code(Path(model_path).name, language=None)

    # Detection
    with st.expander("🎯 Detection", expanded=True):
        conf_thresh = st.slider("Confidence", 0.05, 0.95, cfg.CONFIDENCE_THRESHOLD, 0.05,
                                help="Minimum detection confidence score")
        iou_thresh = st.slider("IOU (NMS)", 0.1, 0.95, cfg.IOU_THRESHOLD, 0.05,
                               help="Intersection-over-Union threshold for non-max suppression")
        show_labels = st.toggle("Show labels", value=True)
        show_conf = st.toggle("Show confidence", value=True)

    # Tracking
    with st.expander("🔗 Tracking", expanded=False):
        track_buffer = st.slider("Track buffer (frames)", 10, 120, cfg.TRACK_BUFFER, 5,
                                 help="Frames to keep lost tracks alive before removing")

    # Alert thresholds
    with st.expander("🚨 Alert Thresholds", expanded=True):
        persistence_sec = st.slider("Persistence (sec)", 1.0, 15.0, cfg.PERSISTENCE_TIME_SEC, 0.5,
                                    help="Seconds in zone before HIGH RISK alert")
        density_threshold = st.slider("Density (count)", 1, 20, cfg.DENSITY_THRESHOLD, 1,
                                      help="Active bird count for CRITICAL alert")

    st.markdown("---")
    st.markdown(
        "<div style='text-align:center; color:#475569; font-size:0.75rem;'>"
        "YOLOv8 + ByteTrack + RTDTER<br>v2.0</div>",
        unsafe_allow_html=True,
    )

# ══════════════════════════════════════════════════════════════════════════════
#  HEADER
# ══════════════════════════════════════════════════════════════════════════════

st.markdown("""
<div class="header-banner">
    <h1>🛡️ Avian Intrusion Detection System</h1>
    <p>Real-time bird detection, multi-object tracking, and runway intrusion alerting</p>
</div>
""", unsafe_allow_html=True)

# ══════════════════════════════════════════════════════════════════════════════
#  TABS
# ══════════════════════════════════════════════════════════════════════════════

tab_img, tab_vid, tab_live, tab_info = st.tabs([
    "📷  Image Detection",
    "🎬  Video Tracking",
    "📡  Live Camera",
    "⚙️  System Info",
])


# ══════════════════════════════════════════════════════════════════════════════
#  TAB 1 — IMAGE DETECTION
# ══════════════════════════════════════════════════════════════════════════════

with tab_img:
    st.markdown('<div class="section-header">Upload an image for bird detection</div>',
                unsafe_allow_html=True)

    uploaded = st.file_uploader(
        "Drag & drop or browse",
        type=["jpg", "jpeg", "png", "bmp", "webp"],
        key="img_uploader",
        label_visibility="collapsed",
    )

    if uploaded:
        file_bytes = np.frombuffer(uploaded.read(), np.uint8)
        img_bgr = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

        with st.spinner("Running YOLOv8 detection..."):
            results = model.predict(img_bgr, conf=conf_thresh, iou=iou_thresh, verbose=False)[0]

        annotated = results.plot(labels=show_labels, conf=show_conf)
        annotated_rgb = cv2.cvtColor(annotated, cv2.COLOR_BGR2RGB)

        col1, col2 = st.columns(2, gap="medium")
        with col1:
            st.markdown("**Original**")
            st.image(img_rgb, use_container_width=True)
        with col2:
            st.markdown("**Detected**")
            st.image(annotated_rgb, use_container_width=True)

        n = len(results.boxes)
        st.markdown("---")

        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Birds Detected", n)
        if n > 0:
            confs = results.boxes.conf.tolist()
            m2.metric("Avg Confidence", f"{sum(confs)/len(confs):.2f}")
            m3.metric("Max Confidence", f"{max(confs):.2f}")
            m4.metric("Min Confidence", f"{min(confs):.2f}")

        if n > 0:
            with st.expander("📋 Detection Details", expanded=True):
                rows = []
                for i, box in enumerate(results.boxes):
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    rows.append({
                        "#": i + 1,
                        "X1": int(x1), "Y1": int(y1),
                        "X2": int(x2), "Y2": int(y2),
                        "Width": int(x2 - x1),
                        "Height": int(y2 - y1),
                        "Confidence": f"{box.conf[0].item():.3f}",
                    })
                st.dataframe(rows, use_container_width=True, hide_index=True)

        _, buf = cv2.imencode(".jpg", annotated)
        st.download_button(
            "⬇️  Download Result",
            data=buf.tobytes(),
            file_name=f"detected_{uploaded.name}",
            mime="image/jpeg",
            use_container_width=True,
        )
    else:
        st.info("Upload an image to begin detection. Supported formats: JPG, PNG, BMP, WebP", icon="📷")


# ══════════════════════════════════════════════════════════════════════════════
#  TAB 2 — VIDEO TRACKING + RTDTER
# ══════════════════════════════════════════════════════════════════════════════

with tab_vid:
    st.markdown('<div class="section-header">Upload a video for detection, tracking & intrusion analysis</div>',
                unsafe_allow_html=True)

    uploaded_vid = st.file_uploader(
        "Drag & drop or browse",
        type=["mp4", "avi", "mov", "mkv"],
        key="vid_uploader",
        label_visibility="collapsed",
    )

    if uploaded_vid:
        tfile = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
        tfile.write(uploaded_vid.read())
        tfile.flush()
        input_path = tfile.name

        cap = cv2.VideoCapture(input_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total / fps if fps > 0 else 0
        cap.release()

        # Video info card
        vi1, vi2, vi3, vi4 = st.columns(4)
        vi1.metric("Resolution", f"{width}x{height}")
        vi2.metric("Frame Rate", f"{fps:.1f} fps")
        vi3.metric("Total Frames", f"{total:,}")
        vi4.metric("Duration", f"{duration:.1f}s")

        if st.button("▶️  Run Detection + Tracking + RTDTER", type="primary", use_container_width=True):
            tracker_cfg = str(Path(__file__).parent / "tracker_config.yaml")
            if not os.path.exists(tracker_cfg):
                tracker_cfg = "bytetrack.yaml"

            engine = RTDTEREngine(
                persistence_sec=persistence_sec,
                density_threshold=density_threshold,
            )

            out_path = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4").name
            writer = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))

            progress = st.progress(0, text="Initializing pipeline...")
            col_metrics, col_status = st.columns([3, 1])
            metrics_ph = col_metrics.empty()
            status_ph = col_status.empty()
            preview_ph = st.empty()
            alert_ph = st.empty()

            cap = cv2.VideoCapture(input_path)
            frame_idx = 0
            total_detections = 0
            all_alerts = []
            t_start = time.time()

            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                results = model.track(
                    frame, conf=conf_thresh, iou=iou_thresh, imgsz=cfg.IMGSZ,
                    tracker=tracker_cfg, persist=True, verbose=False,
                )
                result = results[0]
                track_ids = []
                centers = []

                if result.boxes is not None and result.boxes.id is not None:
                    boxes = result.boxes
                    ids = boxes.id.int().tolist()
                    xyxy = boxes.xyxy.cpu().numpy()
                    total_detections += len(ids)

                    for tid, box in zip(ids, xyxy):
                        cx = (box[0] + box[2]) / 2
                        cy = (box[1] + box[3]) / 2
                        track_ids.append(tid)
                        centers.append(np.array([cx, cy]))
                        x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
                        risk = engine.tracks[tid].risk_level if tid in engine.tracks else 0
                        cv2.rectangle(frame, (x1, y1), (x2, y2), RISK_COLORS_BGR.get(risk, (0, 255, 0)), 2)

                frame_alerts = engine.update(track_ids, centers, width, height)
                all_alerts.extend(frame_alerts)

                elapsed = time.time() - t_start
                current_fps = (frame_idx + 1) / elapsed if elapsed > 0 else 0
                frame = draw_frame_overlay(frame, engine, frame_alerts, current_fps)
                writer.write(frame)
                frame_idx += 1

                pct = frame_idx / total if total > 0 else 1
                progress.progress(min(pct, 1.0),
                                  text=f"Processing frame {frame_idx:,}/{total:,}  ({pct*100:.0f}%)")

                if frame_idx % 20 == 0 or frame_idx == 1:
                    stats = engine.get_stats()
                    risk_label, risk_css = RISK_BADGE_MAP.get(stats["max_risk"], ("CLEAR", "badge-clear"))
                    with metrics_ph.container():
                        mc1, mc2, mc3, mc4 = st.columns(4)
                        mc1.metric("Active Birds", stats["active_birds"])
                        mc2.metric("In Zone", stats["birds_in_zone"])
                        mc3.metric("High Risk", stats["high_risk"])
                        mc4.metric("Alerts", stats["total_alerts"])
                    status_ph.markdown(
                        f'<div style="text-align:center;padding-top:0.5rem;">'
                        f'<span class="status-badge {risk_css}">{risk_label}</span></div>',
                        unsafe_allow_html=True,
                    )

                    # Live preview
                    preview_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    preview_ph.image(preview_frame, use_container_width=True, caption=f"Frame {frame_idx}")

                    if all_alerts:
                        with alert_ph.container():
                            st.markdown("**Recent Alerts**")
                            alerts_html = "".join(render_alert_html(a) for a in all_alerts[-8:])
                            st.markdown(alerts_html, unsafe_allow_html=True)

            cap.release()
            writer.release()
            progress.progress(1.0, text="Processing complete!")

            # ── Final Summary ─────────────────────────────────────────────
            st.markdown("---")
            st.markdown('<div class="section-header">Processing Summary</div>', unsafe_allow_html=True)
            total_time = time.time() - t_start

            s1, s2, s3, s4, s5 = st.columns(5)
            s1.metric("Frames", f"{frame_idx:,}")
            s2.metric("Detections", f"{total_detections:,}")
            s3.metric("Avg FPS", f"{frame_idx / total_time:.1f}" if total_time > 0 else "—")
            s4.metric("Unique Tracks", len(engine.tracks))
            s5.metric("Total Alerts", len(all_alerts))

            # Alert breakdown
            if all_alerts:
                with st.expander("🚨 Full Alert Log", expanded=False):
                    alert_rows = []
                    for a in all_alerts:
                        alert_rows.append({
                            "Level": a.level,
                            "Track ID": a.track_id if a.track_id else "—",
                            "Message": a.message,
                        })
                    st.dataframe(alert_rows, use_container_width=True, hide_index=True)

            # Track table
            if engine.tracks:
                with st.expander("🔗 Track History", expanded=False):
                    track_rows = []
                    for t in engine.get_active_tracks():
                        pos = t.current_pos
                        track_rows.append({
                            "Track ID": t.track_id,
                            "Position": f"({pos[0]:.0f}, {pos[1]:.0f})" if pos is not None else "—",
                            "Speed (px/s)": f"{t.speed:.1f}",
                            "Direction": f"{t.direction_deg:.0f} deg" if t.direction_deg is not None else "—",
                            "In Zone": "Yes" if t.in_zone else "No",
                            "Zone Time": f"{t.time_in_zone:.1f}s" if t.in_zone else "—",
                            "Risk": t.risk_level,
                        })
                    st.dataframe(track_rows, use_container_width=True, hide_index=True)

            with open(out_path, "rb") as f:
                st.download_button(
                    "⬇️  Download Annotated Video",
                    data=f,
                    file_name=f"tracked_{uploaded_vid.name}",
                    mime="video/mp4",
                    use_container_width=True,
                )
            os.unlink(input_path)
    else:
        st.info("Upload a video to begin tracking and intrusion analysis. Supported: MP4, AVI, MOV, MKV", icon="🎬")


# ══════════════════════════════════════════════════════════════════════════════
#  TAB 3 — LIVE CAMERA (WebRTC)
# ══════════════════════════════════════════════════════════════════════════════

with tab_live:
    st.markdown('<div class="section-header">Live Camera — Real-Time Detection & Tracking</div>',
                unsafe_allow_html=True)

    st.markdown(
        '<div class="live-indicator"><div class="live-dot"></div> LIVE FEED</div>',
        unsafe_allow_html=True,
    )
    st.markdown("")

    # Shared state for live metrics
    if "live_stats" not in st.session_state:
        st.session_state.live_stats = {
            "active_birds": 0, "birds_in_zone": 0,
            "high_risk": 0, "total_alerts": 0, "max_risk": 0,
            "fps": 0, "frame_count": 0,
        }
    if "live_alerts" not in st.session_state:
        st.session_state.live_alerts = deque(maxlen=20)

    class BirdDetectionProcessor(VideoProcessorBase):
        def __init__(self):
            self.model = model
            self.engine = RTDTEREngine(
                persistence_sec=persistence_sec,
                density_threshold=density_threshold,
            )
            self.tracker_cfg = str(Path(__file__).parent / "tracker_config.yaml")
            if not os.path.exists(self.tracker_cfg):
                self.tracker_cfg = "bytetrack.yaml"
            self.frame_count = 0
            self.t_start = time.time()
            self.lock = threading.Lock()
            self.latest_stats = {}
            self.latest_alerts = []

        def recv(self, frame: av.VideoFrame) -> av.VideoFrame:
            img = frame.to_ndarray(format="bgr24")
            h, w = img.shape[:2]

            results = self.model.track(
                img, conf=conf_thresh, iou=iou_thresh, imgsz=cfg.IMGSZ,
                tracker=self.tracker_cfg, persist=True, verbose=False,
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
                    x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
                    risk = self.engine.tracks[tid].risk_level if tid in self.engine.tracks else 0
                    cv2.rectangle(img, (x1, y1), (x2, y2), RISK_COLORS_BGR.get(risk, (0, 255, 0)), 2)

            frame_alerts = self.engine.update(track_ids, centers, w, h)

            self.frame_count += 1
            elapsed = time.time() - self.t_start
            current_fps = self.frame_count / elapsed if elapsed > 0 else 0

            img = draw_frame_overlay(img, self.engine, frame_alerts, current_fps)

            with self.lock:
                stats = self.engine.get_stats()
                stats["fps"] = current_fps
                stats["frame_count"] = self.frame_count
                self.latest_stats = stats
                self.latest_alerts = [
                    {"level": a.level, "track_id": a.track_id, "message": a.message}
                    for a in frame_alerts
                ]

            return av.VideoFrame.from_ndarray(img, format="bgr24")

    col_feed, col_panel = st.columns([3, 1], gap="medium")

    with col_feed:
        ctx = webrtc_streamer(
            key="bird-detection-live",
            mode=WebRtcMode.SENDRECV,
            video_processor_factory=BirdDetectionProcessor,
            media_stream_constraints={"video": True, "audio": False},
            async_processing=True,
            rtc_configuration={"iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]},
        )

    with col_panel:
        st.markdown("**Status**")
        if ctx.state.playing:
            live_stats = st.session_state.live_stats
            st.metric("Active Birds", live_stats.get("active_birds", 0))
            st.metric("In Zone", live_stats.get("birds_in_zone", 0))
            st.metric("High Risk", live_stats.get("high_risk", 0))
            st.metric("Alerts", live_stats.get("total_alerts", 0))

            risk = live_stats.get("max_risk", 0)
            risk_label, risk_css = RISK_BADGE_MAP.get(risk, ("CLEAR", "badge-clear"))
            st.markdown(
                f'<span class="status-badge {risk_css}">{risk_label}</span>',
                unsafe_allow_html=True,
            )
        else:
            st.markdown(
                '<p style="color:#64748b;">Click <strong>START</strong> to begin '
                'live detection. Grant camera access when prompted.</p>',
                unsafe_allow_html=True,
            )

    st.markdown("")
    st.markdown("**Live Alert Feed**")
    live_alert_ph = st.empty()
    if st.session_state.live_alerts:
        alerts_html = ""
        for a in list(st.session_state.live_alerts)[-10:]:
            css_class = ALERT_CSS_MAP.get(a.get("level", ""), "alert-approach")
            tid = f"Track #{a['track_id']}" if a.get("track_id") else "System"
            alerts_html += f'<div class="alert-card {css_class}"><strong>[{a["level"]}]</strong> {tid} — {a["message"]}</div>'
        live_alert_ph.markdown(alerts_html, unsafe_allow_html=True)
    else:
        live_alert_ph.markdown(
            '<p style="color:#64748b;">No alerts yet. Alerts will appear here during live monitoring.</p>',
            unsafe_allow_html=True,
        )


# ══════════════════════════════════════════════════════════════════════════════
#  TAB 4 — SYSTEM INFO
# ══════════════════════════════════════════════════════════════════════════════

with tab_info:
    st.markdown('<div class="section-header">System Architecture & Configuration</div>',
                unsafe_allow_html=True)

    col_arch, col_cfg = st.columns(2, gap="medium")

    with col_arch:
        st.markdown("#### Pipeline")
        st.markdown("""
        ```
        Video Frame
            │
            ▼
        ┌──────────────────┐
        │   YOLOv8 Detect  │  ← Confidence + NMS filtering
        └────────┬─────────┘
                 │
                 ▼
        ┌──────────────────┐
        │  ByteTrack Track │  ← Multi-object association
        └────────┬─────────┘
                 │
                 ▼
        ┌──────────────────┐
        │   RTDTER Engine  │  ← Zone check, persistence,
        │                  │    density, trajectory
        └────────┬─────────┘
                 │
                 ▼
        Annotated Frame + Alerts
        ```
        """)

        st.markdown("#### RTDTER Alert Tiers")
        st.markdown("""
        | Tier | Trigger | Level |
        |------|---------|-------|
        | **Intrusion** | Bird enters runway polygon | 1 |
        | **Persistence** | Bird in zone > threshold | 2 |
        | **Density** | Active birds > threshold | 3 |
        | **Approach** | Trajectory toward runway | 1+ |
        """)

    with col_cfg:
        st.markdown("#### Active Configuration")
        st.json({
            "model": Path(model_path).name,
            "confidence_threshold": conf_thresh,
            "iou_threshold": iou_thresh,
            "track_buffer_frames": track_buffer,
            "persistence_alert_sec": persistence_sec,
            "density_threshold": density_threshold,
            "target_fps": cfg.TARGET_FPS,
            "inference_size": cfg.IMGSZ,
            "tracker": cfg.TRACKER_TYPE,
        })

        st.markdown("#### CLI Quick Start")
        st.code("""# Webcam
python avian_intrusion.py

# Video file
python avian_intrusion.py --source video.mp4

# RTSP stream + save
python avian_intrusion.py \\
    --source rtsp://camera/stream \\
    --conf 0.3 \\
    --persistence 5.0 \\
    --density 3 \\
    --save output.mp4""", language="bash")

        st.markdown("#### Key Bindings (CLI)")
        st.markdown("""
        | Key | Action |
        |-----|--------|
        | `q` / `ESC` | Quit |
        """)
