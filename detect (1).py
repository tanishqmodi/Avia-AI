import argparse
import os
import sys
import cv2
from pathlib import Path
from ultralytics import YOLO

# ── Model path — points to best weights after training ───────────────────────
DEFAULT_MODEL = "D:/BirdHunting/runs/bird_detector/weights/best.pt"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}
VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".wmv", ".flv", ".m4v"}


def detect(input_path: str, model_path: str, conf: float, save_dir: str):
    if not os.path.exists(model_path):
        print(f"[ERROR] Model not found: {model_path}")
        print("  Train first with:  python train.py")
        sys.exit(1)

    if not os.path.exists(input_path):
        print(f"[ERROR] Input file not found: {input_path}")
        sys.exit(1)

    model = YOLO(model_path)
    ext = Path(input_path).suffix.lower()
    os.makedirs(save_dir, exist_ok=True)

    # ── IMAGE ────────────────────────────────────────────────────────────────
    if ext in IMAGE_EXTS:
        print(f"[IMAGE] Running detection on: {input_path}")
        results = model.predict(
            source=input_path,
            conf=conf,
            save=True,
            project=save_dir,
            name="output",
            exist_ok=True,
        )
        result = results[0]
        boxes = result.boxes
        bird_count = len(boxes)
        print(f"  Birds detected: {bird_count}")
        for i, box in enumerate(boxes):
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            confidence = box.conf[0].item()
            print(f"  Bird {i+1}: bbox=({x1:.0f},{y1:.0f},{x2:.0f},{y2:.0f})  conf={confidence:.2f}")
        out_file = os.path.join(save_dir, "output", Path(input_path).name)
        print(f"  Saved: {out_file}")

    # ── VIDEO ────────────────────────────────────────────────────────────────
    elif ext in VIDEO_EXTS:
        print(f"[VIDEO] Running detection on: {input_path}")
        cap = cv2.VideoCapture(input_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()

        out_file = os.path.join(save_dir, Path(input_path).stem + "_detected.mp4")
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(out_file, fourcc, fps, (w, h))

        results = model.predict(
            source=input_path,
            conf=conf,
            stream=True,   # memory-efficient for long videos
        )

        frame_idx = 0
        total_detections = 0
        for result in results:
            frame = result.plot()  # draws bounding boxes on frame
            writer.write(frame)
            count = len(result.boxes)
            total_detections += count
            frame_idx += 1
            if frame_idx % 30 == 0 or frame_idx == 1:
                pct = (frame_idx / total_frames * 100) if total_frames > 0 else 0
                print(f"  Frame {frame_idx}/{total_frames} ({pct:.1f}%)  birds this frame: {count}")

        writer.release()
        print(f"\n  Total frames processed : {frame_idx}")
        print(f"  Total bird detections  : {total_detections}")
        print(f"  Saved output video     : {out_file}")

    else:
        print(f"[ERROR] Unsupported file type: {ext}")
        print(f"  Supported images : {IMAGE_EXTS}")
        print(f"  Supported videos : {VIDEO_EXTS}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bird Detection — image or video")
    parser.add_argument("input", help="Path to image or video file")
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Path to trained weights (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=0.25,
        help="Confidence threshold (default: 0.25)",
    )
    parser.add_argument(
        "--out",
        default="D:/BirdHunting/detections",
        help="Output directory (default: D:/BirdHunting/detections)",
    )
    args = parser.parse_args()
    detect(args.input, args.model, args.conf, args.out)
