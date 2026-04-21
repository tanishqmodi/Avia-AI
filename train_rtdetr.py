"""
RT-DETR bird-detection trainer.

Portable wrapper around ultralytics.RTDETR so the same script runs on
a local MPS Mac and on the college GPU server. Every knob is a CLI
flag with sensible defaults that match the prior run
(runs/rtdetr_bird_detection/args.yaml).

Usage:
  python train_rtdetr.py \
      --data configs/rtdetr_config.yaml \
      --weights rtdetr-l.pt \
      --epochs 80 --batch 16 --imgsz 640 \
      --device 0 --project runs --name rtdetr_bird_detection2
"""
from __future__ import annotations

import argparse
from pathlib import Path

from ultralytics import RTDETR


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train RT-DETR on the bird dataset")
    p.add_argument("--data", default="configs/rtdetr_config.yaml", help="Path to dataset YAML")
    p.add_argument("--weights", default="rtdetr-l.pt", help="Pretrained weights (.pt)")
    p.add_argument("--epochs", type=int, default=80)
    p.add_argument("--batch", type=int, default=16)
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--device", default="0", help="'0', '0,1', 'cpu', or 'mps'")
    p.add_argument("--workers", type=int, default=8)
    p.add_argument("--project", default="runs", help="Parent folder for run output")
    p.add_argument("--name", default="rtdetr_bird_detection2", help="Run folder name")
    p.add_argument("--patience", type=int, default=20)
    p.add_argument("--save-period", type=int, default=10, help="Checkpoint every N epochs")
    p.add_argument("--lr0", type=float, default=1e-4)
    p.add_argument("--lrf", type=float, default=1e-4)
    p.add_argument("--optimizer", default="AdamW")
    p.add_argument("--resume", action="store_true", help="Resume from last.pt in project/name")
    p.add_argument("--amp", action="store_true", default=True)
    p.add_argument("--no-amp", dest="amp", action="store_false")
    return p.parse_args()


def main() -> None:
    args = parse_args()

    data_path = Path(args.data).resolve()
    if not data_path.exists():
        raise SystemExit(f"Dataset YAML not found: {data_path}")

    weights_path = Path(args.weights)
    if not weights_path.exists():
        raise SystemExit(
            f"Pretrained weights not found: {weights_path}. "
            "Download rtdetr-l.pt or pass --weights to an existing file."
        )

    model = RTDETR(str(weights_path))

    model.train(
        data=str(data_path),
        epochs=args.epochs,
        batch=args.batch,
        imgsz=args.imgsz,
        device=args.device,
        workers=args.workers,
        project=args.project,
        name=args.name,
        patience=args.patience,
        save=True,
        save_period=args.save_period,
        optimizer=args.optimizer,
        lr0=args.lr0,
        lrf=args.lrf,
        cos_lr=True,
        amp=args.amp,
        resume=args.resume,
        plots=True,
        exist_ok=True,
        verbose=True,
    )


if __name__ == "__main__":
    main()
