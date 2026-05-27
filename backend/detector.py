"""Lazy-loading YOLO detector with a graceful pretrained fallback.

The webapp is built before the PCB-specific weights exist. To keep the whole
pipeline runnable end-to-end during development, we look for the trained
weights at ``backend/weights/best.pt`` and fall back to an off-the-shelf
Ultralytics model if they are missing. The frontend reads ``model_kind`` to
warn the user when the fallback is active.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger("pcb.detector")

# PCB-defect classes, fixed colour palette (BGR for OpenCV / RGB-hex for the UI).
PCB_CLASSES = [
    "missing_hole",
    "mouse_bite",
    "open_circuit",
    "short",
    "spur",
    "spurious_copper",
]

# Stable, distinct colours per class index.
CLASS_COLORS_HEX = [
    "#ef4444",  # red
    "#f97316",  # orange
    "#eab308",  # yellow
    "#22c55e",  # green
    "#3b82f6",  # blue
    "#a855f7",  # purple
]

WEIGHTS_DIR = Path(__file__).resolve().parent / "weights"
PREFERRED_WEIGHTS = WEIGHTS_DIR / "best.pt"

# Fallback chain — tried in order if best.pt is missing. yolo26 is preferred to
# match the trained model's architecture, yolo11n is the safe net.
FALLBACK_WEIGHTS = ["yolo26n.pt", "yolo11n.pt"]


@dataclass
class Detection:
    cls_id: int
    cls_name: str
    conf: float
    bbox: list[float]  # [x1, y1, x2, y2] in pixel coords of the input image

    def to_dict(self) -> dict[str, Any]:
        return {
            "cls_id": self.cls_id,
            "cls": self.cls_name,
            "conf": round(self.conf, 3),
            "bbox": [round(v, 1) for v in self.bbox],
        }


@dataclass
class InferenceStats:
    total_calls: int = 0
    total_ms: float = 0.0
    last_ms: float = 0.0
    rolling: list[float] = field(default_factory=list)

    def record(self, ms: float) -> None:
        self.total_calls += 1
        self.total_ms += ms
        self.last_ms = ms
        self.rolling.append(ms)
        if len(self.rolling) > 60:
            self.rolling.pop(0)

    def snapshot(self) -> dict[str, Any]:
        avg = self.total_ms / self.total_calls if self.total_calls else 0.0
        rolling_avg = sum(self.rolling) / len(self.rolling) if self.rolling else 0.0
        fps = 1000.0 / rolling_avg if rolling_avg > 0 else 0.0
        return {
            "total_calls": self.total_calls,
            "last_ms": round(self.last_ms, 1),
            "avg_ms": round(avg, 1),
            "rolling_avg_ms": round(rolling_avg, 1),
            "fps_rolling": round(fps, 1),
        }


class Detector:
    """Singleton-ish wrapper around an Ultralytics YOLO model."""

    def __init__(self) -> None:
        self._model = None
        self._lock = threading.Lock()
        self._weights_path: str = ""
        self._model_kind: str = "uninitialized"
        self._load_error: str | None = None
        self.stats = InferenceStats()

    # ---------- loading --------------------------------------------------

    def _try_load(self, source: str) -> bool:
        try:
            from ultralytics import YOLO  # local import — heavy dependency
        except Exception as exc:  # pragma: no cover - import error surfaced to UI
            self._load_error = f"ultralytics import failed: {exc}"
            return False

        try:
            self._model = YOLO(source)
            return True
        except Exception as exc:
            logger.warning("Failed to load %s: %s", source, exc)
            return False

    def ensure_loaded(self) -> None:
        if self._model is not None:
            return
        with self._lock:
            if self._model is not None:
                return

            if PREFERRED_WEIGHTS.exists():
                if self._try_load(str(PREFERRED_WEIGHTS)):
                    self._weights_path = str(PREFERRED_WEIGHTS)
                    self._model_kind = "trained_pcb"
                    logger.info("Loaded PCB weights from %s", PREFERRED_WEIGHTS)
                    return

            for candidate in FALLBACK_WEIGHTS:
                if self._try_load(candidate):
                    self._weights_path = candidate
                    self._model_kind = "pretrained_fallback"
                    logger.warning(
                        "best.pt missing — running with pretrained %s "
                        "(detections will NOT be PCB defects)",
                        candidate,
                    )
                    return

            self._model = None
            self._load_error = (
                self._load_error
                or "No weights available. Place trained weights at "
                f"{PREFERRED_WEIGHTS} or ensure network access for the "
                "Ultralytics fallback download."
            )

    # ---------- public API -----------------------------------------------

    @property
    def ready(self) -> bool:
        return self._model is not None

    def info(self) -> dict[str, Any]:
        self.ensure_loaded()
        if not self.ready:
            return {
                "ready": False,
                "model_kind": "unavailable",
                "weights": "",
                "error": self._load_error,
                "classes": [],
                "class_colors": CLASS_COLORS_HEX,
            }

        names: dict[int, str] = self._model.names or {}
        classes = [
            {"id": idx, "name": names[idx], "color": _color_for(idx, names[idx])}
            for idx in sorted(names)
        ]
        return {
            "ready": True,
            "model_kind": self._model_kind,
            "weights": Path(self._weights_path).name,
            "classes": classes,
            "class_colors": CLASS_COLORS_HEX,
        }

    def detect(
        self,
        frame: np.ndarray,
        conf: float = 0.35,
        imgsz: int = 1024,
    ) -> list[Detection]:
        self.ensure_loaded()
        if not self.ready:
            raise RuntimeError(self._load_error or "model not loaded")

        t0 = time.perf_counter()
        result = self._model(frame, imgsz=imgsz, conf=conf, verbose=False)[0]
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        self.stats.record(elapsed_ms)

        names = result.names or {}
        out: list[Detection] = []
        if result.boxes is None:
            return out

        for box in result.boxes:
            cls_id = int(box.cls.item())
            cls_name = str(names.get(cls_id, str(cls_id)))
            xyxy = box.xyxy[0].tolist()
            out.append(
                Detection(
                    cls_id=cls_id,
                    cls_name=cls_name,
                    conf=float(box.conf.item()),
                    bbox=[float(v) for v in xyxy],
                )
            )
        return out


def _color_for(idx: int, name: str) -> str:
    """Stable colour: use the PCB palette when the class matches, else hash."""
    if name in PCB_CLASSES:
        return CLASS_COLORS_HEX[PCB_CLASSES.index(name)]
    return CLASS_COLORS_HEX[idx % len(CLASS_COLORS_HEX)]


def summarize(detections: list[Detection]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    max_conf: dict[str, float] = {}
    for d in detections:
        counts[d.cls_name] = counts.get(d.cls_name, 0) + 1
        if d.conf > max_conf.get(d.cls_name, 0.0):
            max_conf[d.cls_name] = d.conf
    return {
        "total": len(detections),
        "by_class": counts,
        "max_conf_by_class": {k: round(v, 3) for k, v in max_conf.items()},
        "verdict": "FAIL" if detections else "PASS",
    }


detector = Detector()
