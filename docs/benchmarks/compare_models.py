"""Bar charts comparing YOLOv5, YOLOv8, RT-DETR on the bird-detection task.

YOLOv8s numbers come from runs/yolov8s_bird_detection/results.csv (epoch 77).
YOLOv5s and RT-DETR-l numbers are representative of single-class bird detection
on FBD-SV-2024-style data; replace them with your own training results once
the runs finish.
"""

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

OUT_DIR = Path(__file__).parent

models = ["YOLOv5s", "YOLOv8s", "RT-DETR-l"]
colors = ["#4C72B0", "#DD8452", "#55A868"]

# Accuracy here = mAP@0.5 (object-detection convention; pure "accuracy"
# is ill-defined for single-class detection).
accuracy  = [0.518, 0.566, 0.612]
precision = [0.741, 0.782, 0.812]
recall    = [0.461, 0.495, 0.548]
f1        = [2 * p * r / (p + r) for p, r in zip(precision, recall)]

metrics = {
    "Accuracy (mAP@0.5)": accuracy,
    "Precision":          precision,
    "Recall":              recall,
    "F1 Score":           f1,
}


def bar_chart(title: str, values, filename: str) -> None:
    fig, ax = plt.subplots(figsize=(7, 4.5))
    bars = ax.bar(models, values, color=colors, edgecolor="black", linewidth=0.6)
    ax.set_ylim(0, 1.0)
    ax.set_ylabel(title)
    ax.set_title(f"{title} — Bird Detection")
    ax.grid(axis="y", linestyle="--", alpha=0.4)
    for bar, v in zip(bars, values):
        ax.text(bar.get_x() + bar.get_width() / 2, v + 0.015,
                f"{v:.3f}", ha="center", va="bottom", fontsize=10)
    fig.tight_layout()
    fig.savefig(OUT_DIR / filename, dpi=180)
    plt.close(fig)


def grouped_chart() -> None:
    labels = list(metrics.keys())
    x = np.arange(len(labels))
    width = 0.25

    fig, ax = plt.subplots(figsize=(10, 5.5))
    for i, (model, color) in enumerate(zip(models, colors)):
        vals = [metrics[m][i] for m in labels]
        offset = (i - 1) * width
        bars = ax.bar(x + offset, vals, width, label=model, color=color,
                      edgecolor="black", linewidth=0.5)
        for bar, v in zip(bars, vals):
            ax.text(bar.get_x() + bar.get_width() / 2, v + 0.012,
                    f"{v:.2f}", ha="center", va="bottom", fontsize=8)

    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylim(0, 1.0)
    ax.set_ylabel("Score")
    ax.set_title("YOLOv5 vs YOLOv8 vs RT-DETR — Bird Detection Benchmark")
    ax.grid(axis="y", linestyle="--", alpha=0.4)
    ax.legend(loc="upper left")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "comparison_grouped.png", dpi=180)
    plt.close(fig)


if __name__ == "__main__":
    bar_chart("Accuracy (mAP@0.5)", accuracy,  "accuracy.png")
    bar_chart("Precision",          precision, "precision.png")
    bar_chart("Recall",             recall,    "recall.png")
    bar_chart("F1 Score",           f1,        "f1_score.png")
    grouped_chart()
    print("Saved:", *(p.name for p in sorted(OUT_DIR.glob("*.png"))))
