#!/usr/bin/env bash
# Fetch the pretrained + fine-tuned model weights from the latest GitHub Release.
# Usage: bash scripts/download_weights.sh
set -euo pipefail

REPO="${SKYGUARD_REPO:-tanishqmodi/Automated-Bird-Monitoring-using-YOLO-and-Tracking}"
TAG="${SKYGUARD_WEIGHTS_TAG:-v1.0}"
BASE="https://github.com/${REPO}/releases/download/${TAG}"

cd "$(dirname "$0")/.."

mkdir -p runs/bird_detector3/weights runs/yolov8s_bird_detection/weights

download() {
    local url="$1" dest="$2"
    if [[ -f "$dest" ]]; then
        echo "  exists  $dest"
        return
    fi
    echo "  get     $dest"
    curl -fL --progress-bar "$url" -o "$dest.part"
    mv "$dest.part" "$dest"
}

echo "Downloading SkyGuard model weights from ${REPO}@${TAG}"
download "${BASE}/rtdetr-l.pt"                                 "rtdetr-l.pt"
download "${BASE}/yolov8m.pt"                                  "yolov8m.pt"
download "${BASE}/bird_detector3-best.pt"                      "runs/bird_detector3/weights/best.pt"
download "${BASE}/yolov8s_bird_detection-best.pt"              "runs/yolov8s_bird_detection/weights/best.pt"

echo "Done. Weights ready."
