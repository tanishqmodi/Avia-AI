import streamlit as st
st.set_page_config(
    page_title="Bird Detector",
    page_icon="🐦",
    layout="wide",
)

import cv2
import numpy as np
import tempfile
import os
from pathlib import Path
from ultralytics import YOLO

# ── Config ───────────────────────────────────────────────────────────────────
MODEL_PATH = r"C:\BirdHunting\runs\bird_detector3\weights\best.pt"
FALLBACK   = "yolov26n.pt"  # used if trained model not ready yet


# ── Load model (cached) ───────────────────────────────────────────────────────
@st.cache_resource
def load_model():
    print("Checking path:", MODEL_PATH)
    print("Exists:", os.path.exists(MODEL_PATH))

    path = MODEL_PATH if os.path.exists(MODEL_PATH) else FALLBACK

    print("Loading model from:", path)

    return YOLO(path), path

model, model_path = load_model()

# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.title("🐦 Bird Detector")
    st.caption("Powered by YOLOv8 · FBD-SV-2024")
    st.divider()

    st.subheader("Model")
    if os.path.exists(MODEL_PATH):
        st.success(f"Trained model loaded")
    else:
        st.warning("Trained model not found — using base YOLOv8n")
    st.code(Path(model_path).name, language=None)

    st.divider()
    st.subheader("Settings")
    conf_thresh = st.slider("Confidence threshold", 0.1, 0.9, 0.25, 0.05)
    show_labels = st.toggle("Show labels", value=True)
    show_conf   = st.toggle("Show confidence", value=True)

# ── Main ──────────────────────────────────────────────────────────────────────
st.title("Bird Detection")
st.write("Upload an **image** or **video** to detect birds.")

tab_img, tab_vid = st.tabs(["📷 Image", "🎬 Video"])

# ════════════════════════════════════════════════════════════════════════
#  IMAGE TAB
# ════════════════════════════════════════════════════════════════════════
with tab_img:
    uploaded = st.file_uploader(
        "Upload image",
        type=["jpg", "jpeg", "png", "bmp", "webp"],
        key="img_uploader",
    )

    if uploaded:
        col1, col2 = st.columns(2)

        # Read image
        file_bytes = np.frombuffer(uploaded.read(), np.uint8)
        img_bgr    = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        img_rgb    = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

        with col1:
            st.subheader("Original")
            st.image(img_rgb, use_container_width=True)

        # Run detection
        with st.spinner("Detecting birds…"):
            results = model.predict(
                img_bgr,
                conf=conf_thresh,
                verbose=False,
            )[0]

        annotated = results.plot(labels=show_labels, conf=show_conf)
        annotated_rgb = cv2.cvtColor(annotated, cv2.COLOR_BGR2RGB)

        with col2:
            st.subheader("Detected")
            st.image(annotated_rgb, use_container_width=True)

        # Stats
        n = len(results.boxes)
        st.divider()
        m1, m2, m3 = st.columns(3)
        m1.metric("Birds detected", n)
        if n > 0:
            confs = results.boxes.conf.tolist()
            m2.metric("Avg confidence", f"{sum(confs)/len(confs):.2f}")
            m3.metric("Max confidence", f"{max(confs):.2f}")

        if n > 0:
            st.subheader("Detections")
            rows = []
            for i, box in enumerate(results.boxes):
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                rows.append({
                    "Bird #": i + 1,
                    "X1": int(x1), "Y1": int(y1),
                    "X2": int(x2), "Y2": int(y2),
                    "Width": int(x2 - x1), "Height": int(y2 - y1),
                    "Confidence": f"{box.conf[0].item():.3f}",
                })
            st.dataframe(rows, use_container_width=True)

        # Download button
        _, buf = cv2.imencode(".jpg", annotated)
        st.download_button(
            "⬇️ Download result",
            data=buf.tobytes(),
            file_name=f"detected_{uploaded.name}",
            mime="image/jpeg",
        )

# ════════════════════════════════════════════════════════════════════════
#  VIDEO TAB
# ════════════════════════════════════════════════════════════════════════
with tab_vid:
    uploaded_vid = st.file_uploader(
        "Upload video",
        type=["mp4", "avi", "mov", "mkv"],
        key="vid_uploader",
    )

    if uploaded_vid:
        # Save to temp file
        tfile = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
        tfile.write(uploaded_vid.read())
        tfile.flush()
        input_path = tfile.name

        cap = cv2.VideoCapture(input_path)
        fps     = cap.get(cv2.CAP_PROP_FPS) or 25
        width   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height  = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total   = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()

        st.info(f"Video: {width}×{height} · {fps:.1f} fps · {total} frames")

        if st.button("▶️ Run Detection", type="primary"):
            out_path = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4").name

            progress = st.progress(0, text="Processing frames…")
            status   = st.empty()
            col_det  = st.empty()

            writer = cv2.VideoWriter(
                out_path,
                cv2.VideoWriter_fourcc(*"mp4v"),
                fps,
                (width, height),
            )

            total_birds = 0
            frame_idx   = 0
            stream = model.predict(
                input_path,
                conf=conf_thresh,
                stream=True,
                verbose=False,
            )

            for result in stream:
                frame      = result.plot(labels=show_labels, conf=show_conf)
                n_birds    = len(result.boxes)
                total_birds += n_birds
                writer.write(frame)
                frame_idx  += 1

                pct = frame_idx / total if total > 0 else 1
                progress.progress(min(pct, 1.0), text=f"Frame {frame_idx}/{total}")
                if frame_idx % 10 == 0:
                    col_det.metric("Birds detected so far", total_birds)

            writer.release()
            progress.progress(1.0, text="Done!")

            st.divider()
            c1, c2, c3 = st.columns(3)
            c1.metric("Total frames",     frame_idx)
            c2.metric("Total detections", total_birds)
            c3.metric("Avg birds/frame",  f"{total_birds/max(frame_idx,1):.2f}")

            # Offer download
            with open(out_path, "rb") as f:
                st.download_button(
                    "⬇️ Download annotated video",
                    data=f,
                    file_name=f"detected_{uploaded_vid.name}",
                    mime="video/mp4",
                )

            # Clean up
            os.unlink(input_path)