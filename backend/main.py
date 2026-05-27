"""FastAPI server for PCB defect detection.

Endpoints
---------
GET  /api/health     - liveness + model info
GET  /api/metrics    - inference stats + training runs found on disk
POST /api/detect     - single-image defect detection (file upload)
WS   /api/ws         - live webcam loop (client streams base64 JPEG frames)

Both /api/detect and the WebSocket return the same response shape so the
frontend can use one renderer:

    {
      "detections": [
        {"cls_id": 0, "cls": "missing_hole", "conf": 0.93,
         "bbox": [x1, y1, x2, y2]}, ...
      ],
      "report":  {"total": 1, "by_class": {...}, "verdict": "FAIL"|"PASS"},
      "image":   {"width": 1280, "height": 720},
      "latency_ms": 18.3
    }
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import logging
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from fastapi import (
    Body,
    FastAPI,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from detector import detector, summarize

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pcb.api")

app = FastAPI(title="PCB Defect Detection API", version="0.1.0")

# CORS is wide-open for dev; tighten before any non-local deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

REPO_ROOT = Path(__file__).resolve().parent.parent
RUNS_DIR = REPO_ROOT / "runs"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _decode_image(raw: bytes) -> np.ndarray:
    buf = np.frombuffer(raw, np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="could not decode image")
    return img


def _decode_data_url(data_url: str) -> np.ndarray:
    payload = data_url.split(",", 1)[-1] if "," in data_url else data_url
    try:
        raw = base64.b64decode(payload, validate=False)
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"invalid base64 frame: {exc}") from exc
    buf = np.frombuffer(raw, np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("could not decode frame")
    return img


def _build_response(img: np.ndarray, conf: float) -> dict[str, Any]:
    dets = detector.detect(img, conf=conf)
    h, w = img.shape[:2]
    return {
        "detections": [d.to_dict() for d in dets],
        "report": summarize(dets),
        "image": {"width": int(w), "height": int(h)},
        "latency_ms": detector.stats.last_ms,
    }


# ---------------------------------------------------------------------------
# routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "model": detector.info()}


@app.get("/api/metrics")
def metrics() -> dict[str, Any]:
    runs: list[dict[str, Any]] = []
    if RUNS_DIR.exists():
        for run_dir in sorted(RUNS_DIR.iterdir()):
            if not run_dir.is_dir():
                continue
            artefacts = {}
            for art in (
                "results.png",
                "confusion_matrix.png",
                "PR_curve.png",
                "results.csv",
            ):
                if (run_dir / art).exists():
                    artefacts[art] = f"/api/runs/{run_dir.name}/{art}"
            runs.append(
                {
                    "name": run_dir.name,
                    "has_weights": (run_dir / "weights" / "best.pt").exists(),
                    "artefacts": artefacts,
                }
            )
    return {
        "inference": detector.stats.snapshot(),
        "model": detector.info(),
        "runs": runs,
    }


@app.get("/api/runs/{run_name}/{filename}")
def run_artefact(run_name: str, filename: str) -> FileResponse:
    # very small allow-list to avoid traversal
    if "/" in run_name or "\\" in run_name or ".." in run_name:
        raise HTTPException(status_code=400, detail="bad run name")
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="bad file name")
    target = RUNS_DIR / run_name / filename
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="artefact not found")
    return FileResponse(target)


@app.post("/api/detect")
async def detect_endpoint(
    file: UploadFile,
    conf: float = 0.35,
) -> JSONResponse:
    if not detector.info()["ready"]:
        raise HTTPException(
            status_code=503,
            detail=detector.info().get("error", "model not loaded"),
        )
    raw = await file.read()
    img = _decode_image(raw)
    return JSONResponse(_build_response(img, conf=conf))


@app.post("/api/detect-frame")
async def detect_frame(payload: dict = Body(...)) -> JSONResponse:
    """Single frame as a base64 data-URL (handy for non-WS clients / tests)."""
    if "frame" not in payload:
        raise HTTPException(status_code=400, detail="missing 'frame'")
    try:
        img = _decode_data_url(payload["frame"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    conf = float(payload.get("conf", 0.4))
    return JSONResponse(_build_response(img, conf=conf))


@app.websocket("/api/ws")
async def ws_endpoint(socket: WebSocket) -> None:
    await socket.accept()
    if not detector.info()["ready"]:
        await socket.send_json(
            {"error": detector.info().get("error", "model not loaded")}
        )
        await socket.close()
        return

    conf = 0.4
    try:
        while True:
            message = await socket.receive()
            if "text" in message and message["text"]:
                text = message["text"]
                # control message: {"type":"conf","value":0.5}
                if text.startswith("{"):
                    import json
                    try:
                        ctl = json.loads(text)
                    except json.JSONDecodeError:
                        ctl = None
                    if isinstance(ctl, dict) and ctl.get("type") == "conf":
                        try:
                            conf = max(0.05, min(0.95, float(ctl["value"])))
                        except (TypeError, ValueError, KeyError):
                            pass
                        await socket.send_json({"type": "ack", "conf": conf})
                        continue
                try:
                    img = _decode_data_url(text)
                except ValueError as exc:
                    await socket.send_json({"error": str(exc)})
                    continue
                # inference can block the loop; offload to a thread
                response = await asyncio.to_thread(_build_response, img, conf)
                await socket.send_json(response)
            elif "bytes" in message and message["bytes"]:
                raw = message["bytes"]
                buf = np.frombuffer(raw, np.uint8)
                img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
                if img is None:
                    await socket.send_json({"error": "could not decode frame"})
                    continue
                response = await asyncio.to_thread(_build_response, img, conf)
                await socket.send_json(response)
    except WebSocketDisconnect:
        return
    except Exception as exc:
        logger.exception("ws loop crashed: %s", exc)
        try:
            await socket.send_json({"error": str(exc)})
            await socket.close()
        except Exception:
            pass


@app.on_event("startup")
def _warm_model() -> None:
    """Load the model eagerly so the first request isn't a cold start."""
    try:
        detector.ensure_loaded()
        logger.info("Detector info: %s", detector.info())
    except Exception as exc:
        logger.exception("model warmup failed: %s", exc)
