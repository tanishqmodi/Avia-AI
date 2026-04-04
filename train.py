"""
YOLOv8 Bird Detection — FBD-SV-2024
Steps:
  1. Extract frames from MP4 videos → images/train/ and images/val/
  2. Convert Pascal VOC XML labels  → YOLO txt labels
  3. Write data.yaml
  4. Train YOLOv8
  5. Validate
"""

import os
import cv2
import xml.etree.ElementTree as ET
import yaml
from pathlib import Path
from ultralytics import YOLO

# ── Paths ────────────────────────────────────────────────────────────────────
DATASET_ROOT = Path(r"C:\Users\PRATYUSH RAJ\.cache\kagglehub\datasets\swjtuziwei\fbd-sv-2024\versions\1\FBD-SV-2024")
PROJECT_DIR  = Path(r"D:\BirdHunting")
DATA_YAML    = PROJECT_DIR / "bird_data.yaml"

# ── Step 1: Extract video frames ─────────────────────────────────────────────
def extract_frames(split: str):
    video_dir = DATASET_ROOT / "videos" / split
    image_dir = DATASET_ROOT / "images" / split
    image_dir.mkdir(parents=True, exist_ok=True)

    videos = sorted(video_dir.glob("*.mp4")) + sorted(video_dir.glob("*.avi"))
    if not videos:
        print(f"  No videos found in {video_dir}")
        return

    existing = set(p.stem for p in image_dir.glob("*.jpg"))
    print(f"  [{split}] {len(videos)} videos | {len(existing)} frames already extracted")

    for video_path in videos:
        cap = cv2.VideoCapture(str(video_path))
        frame_num = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            stem = f"{video_path.stem}_{str(frame_num).zfill(6)}"
            if stem not in existing:
                out = image_dir / f"{stem}.jpg"
                cv2.imwrite(str(out), frame)
            frame_num += 1
        cap.release()
        print(f"    {video_path.name} → {frame_num} frames")

# ── Step 2: Convert Pascal VOC XML → YOLO txt ────────────────────────────────
def convert_xml_to_yolo(split: str):
    xml_dir   = DATASET_ROOT / "labels" / split
    image_dir = DATASET_ROOT / "images" / split
    yolo_dir  = DATASET_ROOT / "yolo_labels" / split
    yolo_dir.mkdir(parents=True, exist_ok=True)

    xml_files = list(xml_dir.glob("*.xml"))
    converted = 0
    skipped   = 0

    for xml_path in xml_files:
        txt_path = yolo_dir / xml_path.with_suffix(".txt").name
        if txt_path.exists():
            skipped += 1
            continue

        try:
            tree = ET.parse(xml_path)
            root = tree.getroot()
            size = root.find("size")
            w = int(size.find("width").text)
            h = int(size.find("height").text)

            lines = []
            for obj in root.findall("object"):
                bb = obj.find("bndbox")
                xmin = float(bb.find("xmin").text)
                ymin = float(bb.find("ymin").text)
                xmax = float(bb.find("xmax").text)
                ymax = float(bb.find("ymax").text)
                # YOLO: class cx cy nw nh (all normalised)
                cx = (xmin + xmax) / 2 / w
                cy = (ymin + ymax) / 2 / h
                nw = (xmax - xmin) / w
                nh = (ymax - ymin) / h
                lines.append(f"0 {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}")

            if lines:
                txt_path.write_text("\n".join(lines))
                converted += 1
        except Exception as e:
            print(f"  [WARN] Skipping {xml_path.name}: {e}")

    print(f"  [{split}] converted={converted}  already_done={skipped}  total={len(xml_files)}")

# ── Step 3: Write data.yaml ───────────────────────────────────────────────────
def write_yaml():
    cfg = {
        "path":  str(DATASET_ROOT),
        "train": "images/train",
        "val":   "images/val",
        "nc":    1,
        "names": {0: "Bird"},
    }
    DATA_YAML.write_text(yaml.dump(cfg, default_flow_style=False, sort_keys=False))
    print(f"Wrote: {DATA_YAML}")

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":

    # 1. Extract frames
    print("\n=== Step 1: Extracting video frames ===")
    for split in ("train", "val"):
        extract_frames(split)

    # 2. Convert labels
    print("\n=== Step 2: Converting XML → YOLO labels ===")
    for split in ("train", "val"):
        convert_xml_to_yolo(split)

    # Symlink/copy yolo_labels → labels so ultralytics finds them automatically
    # Ultralytics expects labels at the same relative path as images but under "labels/"
    # We wrote them to yolo_labels/ so we need to patch the yaml OR rename.
    # Easiest: just point yaml to yolo_labels for label_dir override.
    # Actually ultralytics auto-replaces "images" with "labels" in the path,
    # so we just need to put txt files in  <root>/labels/train/  <root>/labels/val/
    # We already write there — but they'd clash with xml files.
    # Solution: write yolo txt alongside xml files (they have different extensions, no clash).

    # Re-convert to labels/ directly (txt alongside xml, no conflict)
    print("\n=== Step 2b: Writing YOLO txt into labels/ (alongside xml) ===")
    for split in ("train", "val"):
        xml_dir  = DATASET_ROOT / "labels" / split
        yolo_dir = DATASET_ROOT / "labels" / split   # same folder, .txt extension
        xml_files = list(xml_dir.glob("*.xml"))
        done = 0
        for xml_path in xml_files:
            txt_path = yolo_dir / xml_path.with_suffix(".txt").name
            if txt_path.exists():
                continue
            try:
                tree = ET.parse(xml_path)
                root = tree.getroot()
                size = root.find("size")
                w = int(size.find("width").text)
                h = int(size.find("height").text)
                lines = []
                for obj in root.findall("object"):
                    bb = obj.find("bndbox")
                    xmin = float(bb.find("xmin").text)
                    ymin = float(bb.find("ymin").text)
                    xmax = float(bb.find("xmax").text)
                    ymax = float(bb.find("ymax").text)
                    cx = (xmin + xmax) / 2 / w
                    cy = (ymin + ymax) / 2 / h
                    nw = (xmax - xmin) / w
                    nh = (ymax - ymin) / h
                    lines.append(f"0 {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}")
                if lines:
                    txt_path.write_text("\n".join(lines))
                    done += 1
            except Exception as e:
                print(f"  [WARN] {xml_path.name}: {e}")
        print(f"  [{split}] wrote {done} YOLO txt files into labels/{split}/")

    # 3. Write yaml
    print("\n=== Step 3: Writing data.yaml ===")
    write_yaml()

    # 4. Train
    print("\n=== Step 4: Training YOLOv8 ===")
    model = YOLO("yolov8n.pt")
    results = model.train(
        data=str(DATA_YAML),
        epochs=50,
        imgsz=640,
        batch=16,
        name="bird_detector",
        project=str(PROJECT_DIR / "runs"),
        device=0,        # set device='cpu' if no GPU
        workers=4,
        patience=10,
        save=True,
        plots=True,
    )
    print(f"\nTraining complete! Best model: {results.save_dir}/weights/best.pt")

    # 5. Validate
    print("\n=== Step 5: Validation ===")
    metrics = model.val()
    print(f"mAP50    : {metrics.box.map50:.4f}")
    print(f"mAP50-95 : {metrics.box.map:.4f}")
