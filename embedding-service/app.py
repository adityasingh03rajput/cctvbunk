"""
CCTV Embedding Service
======================
Minimal FastAPI service wrapping InsightFace buffalo_l (ArcFace/ResNet50).

One job: receive a face image (base64 JPEG), return a 512D embedding + quality score.
Called internally by server.js — NOT exposed publicly. Bind to localhost only.

Run:
    pip install -r requirements.txt
    uvicorn app:app --host 127.0.0.1 --port 8100
"""

import base64
import io
import os

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="CCTV Embedding Service")

# ── Model init (once, at startup) ─────────────────────────────────────────────
_face_app = None


def get_face_app():
    global _face_app
    if _face_app is None:
        from insightface.app import FaceAnalysis
        _face_app = FaceAnalysis(
            name="buffalo_l",
            providers=["CPUExecutionProvider"],
        )
        # det_size generous — crops from the camera agent may be small
        _face_app.prepare(ctx_id=-1, det_size=(640, 640))
    return _face_app


class EmbedRequest(BaseModel):
    image_base64: str


class EmbedResponse(BaseModel):
    success: bool
    embedding: list[float] | None = None
    quality_score: float = 0.0
    message: str = ""


def compute_quality(img: np.ndarray, face) -> float:
    """
    Quality gate heuristic, shared by enrollment and CCTV matching:
      - face size in pixels (bigger = better, saturates at 160px)
      - detector confidence
      - blur (variance of Laplacian, saturates at 200)
    Returns 0..1.
    """
    x1, y1, x2, y2 = face.bbox.astype(int)
    face_w = max(1, x2 - x1)
    face_h = max(1, y2 - y1)
    size_score = min(1.0, min(face_w, face_h) / 160.0)

    det_score = float(face.det_score)  # already 0..1

    crop = img[max(0, y1):y2, max(0, x1):x2]
    if crop.size == 0:
        return 0.0
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    blur_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    blur_score = min(1.0, blur_var / 200.0)

    return round(0.4 * size_score + 0.3 * det_score + 0.3 * blur_score, 4)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest):
    try:
        raw = base64.b64decode(req.image_base64)
        arr = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return EmbedResponse(success=False, message="Could not decode image")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image: {e}")

    faces = get_face_app().get(img)
    if not faces:
        return EmbedResponse(success=False, message="No face detected in image")

    # Largest face wins (crops should contain exactly one anyway)
    face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))

    emb = face.normed_embedding  # already L2-normalized, 512D
    quality = compute_quality(img, face)

    return EmbedResponse(
        success=True,
        embedding=[float(v) for v in emb],
        quality_score=quality,
        message="OK",
    )
