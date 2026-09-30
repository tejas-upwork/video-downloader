"""
Video Downloader — web backend (FastAPI)
========================================
Serves the dashboard UI and a small JSON API:

    POST /api/fetch          {url}            -> video info + available qualities
    POST /api/download       {url, quality}   -> starts a job, returns {job_id}
    GET  /api/status/{id}                     -> job progress / result
    GET  /api/file/{id}                       -> download the finished file
    GET  /api/history                        -> finished jobs
    GET  /                                   -> dashboard

Quality values: "best" | "2160" | "1440" | "1080" | "720" | "480" | "360" | "audio"
"""

from __future__ import annotations

import re
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator

try:
    from yt_dlp import YoutubeDL
except ImportError:  # pragma: no cover
    YoutubeDL = None  # type: ignore

BASE_DIR = Path(__file__).resolve().parent
DOWNLOAD_DIR = BASE_DIR / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)

MAX_CONCURRENT = 3
_download_slots = threading.Semaphore(MAX_CONCURRENT)

JOBS: Dict[str, Dict[str, Any]] = {}
JOBS_LOCK = threading.Lock()

QUALITY_LABELS = {
    "best": "Best quality",
    "2160": "4K (2160p)",
    "1440": "1440p",
    "1080": "1080p",
    "720": "720p",
    "480": "480p",
    "360": "360p",
    "audio": "MP3 audio",
}


class FetchRequest(BaseModel):
    url: str

    @field_validator("url")
    @classmethod
    def _http_url(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^https?://", v, re.IGNORECASE):
            raise ValueError("URL must start with http:// or https://")
        return v


class DownloadRequest(FetchRequest):
    quality: str = "best"

    @field_validator("quality")
    @classmethod
    def _known_quality(cls, v: str) -> str:
        if v not in QUALITY_LABELS:
            raise ValueError(f"Unknown quality: {v}")
        return v


def _format_selector(quality: str) -> Dict[str, Any]:
    """yt-dlp options for a requested quality."""
    if quality == "audio":
        return {
            "format": "bestaudio/best",
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
        }
    if quality == "best":
        return {
            "format": "bestvideo+bestaudio/best",
            "merge_output_format": "mp4",
        }
    h = int(quality)
    return {
        "format": f"bestvideo[height<={h}]+bestaudio/best[height<={h}]/best",
        "merge_output_format": "mp4",
    }


def _probe_qualities(formats: List[Dict[str, Any]]) -> List[str]:
    """Return available video heights (desc), e.g. ['2160', '1080', '720']."""
    heights = set()
    for f in formats or []:
        if f.get("vcodec") not in (None, "none") and f.get("height"):
            try:
                heights.add(int(f["height"]))
            except (TypeError, ValueError):
                continue
    # Snap to the standard ladder so the UI stays clean.
    ladder = [2160, 1440, 1080, 720, 480, 360, 240, 144]
    out = []
    for step in ladder:
        if any(h >= step * 0.9 for h in heights):
            out.append(str(step))
    return out


def _set_job(job_id: str, **fields: Any) -> None:
    with JOBS_LOCK:
        if job_id in JOBS:
            JOBS[job_id].update(fields)


def _download_worker(job_id: str, url: str, quality: str) -> None:
    job_dir = DOWNLOAD_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    def hook(d: Dict[str, Any]) -> None:
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            downloaded = d.get("downloaded_bytes", 0)
            if total:
                pct = round(downloaded / total * 100, 1)
            else:
                pct = -1.0  # unknown total -> indeterminate
            _set_job(job_id, progress=pct,
                     downloaded=downloaded, total=total or 0,
                     speed=d.get("speed"), eta=d.get("eta"))
        elif d.get("status") == "finished":
            _set_job(job_id, progress=100.0,
                     filename=Path(d.get("filename", "")).name)

    ydl_opts: Dict[str, Any] = {
        **_format_selector(quality),
        "outtmpl": str(job_dir / "%(title)s [%(id)s].%(ext)s"),
        "restrictfilenames": True,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "progress_hooks": [hook],
    }

    with _download_slots:
        _set_job(job_id, status="downloading", started_at=time.time())
        try:
            if YoutubeDL is None:
                raise RuntimeError("yt-dlp is not installed on the server.")
            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                title = (info or {}).get("title", "video")
            files = sorted(job_dir.glob("*"))
            if not files:
                raise RuntimeError("Download finished but no file was produced.")
            _set_job(job_id, status="done", progress=100.0, title=title,
                     filepath=str(files[0]), filename=files[0].name,
                     finished_at=time.time())
        except Exception as exc:  # noqa: BLE001 - surfaced to the UI
            _set_job(job_id, status="error",
                     error=str(exc)[:300], finished_at=time.time())


app = FastAPI(title="Video Downloader", version="2.0.0")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(BASE_DIR / "templates" / "index.html")


@app.post("/api/fetch")
def api_fetch(req: FetchRequest) -> JSONResponse:
    if YoutubeDL is None:
        raise HTTPException(500, "yt-dlp is not installed on the server.")
    ydl_opts = {"quiet": True, "no_warnings": True, "noplaylist": True,
                "skip_download": True, "socket_timeout": 20}
    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(req.url, download=False)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"Could not read that link: {str(exc)[:200]}")
    if not info:
        raise HTTPException(400, "Could not read that link.")
    qualities = _probe_qualities(info.get("formats", []))
    has_audio = any(
        (f.get("acodec") not in (None, "none"))
        for f in (info.get("formats") or [])
    )
    thumbs = info.get("thumbnails") or []
    thumb = thumbs[-1]["url"] if thumbs else info.get("thumbnail")
    duration = info.get("duration") or 0
    return JSONResponse({
        "title": info.get("title") or "Untitled video",
        "uploader": info.get("uploader") or info.get("channel"),
        "duration": duration,
        "duration_str": f"{duration // 3600}:{(duration % 3600) // 60:02d}:{duration % 60:02d}"
                        if duration >= 3600 else f"{duration // 60}:{duration % 60:02d}",
        "thumbnail": thumb,
        "site": info.get("extractor_key") or info.get("extractor"),
        "qualities": qualities,
        "has_audio": has_audio,
    })


@app.post("/api/download")
def api_download(req: DownloadRequest) -> JSONResponse:
    job_id = uuid.uuid4().hex[:12]
    with JOBS_LOCK:
        JOBS[job_id] = {
            "id": job_id, "url": req.url, "quality": req.quality,
            "quality_label": QUALITY_LABELS[req.quality],
            "status": "queued", "progress": 0.0,
            "title": None, "filename": None, "filepath": None,
            "error": None, "created_at": time.time(),
        }
    t = threading.Thread(target=_download_worker,
                         args=(job_id, req.url, req.quality), daemon=True)
    t.start()
    return JSONResponse({"job_id": job_id})


@app.get("/api/status/{job_id}")
def api_status(job_id: str) -> JSONResponse:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job.")
    job = dict(job)
    job.pop("filepath", None)  # never leak server paths
    return JSONResponse(job)


@app.get("/api/file/{job_id}")
def api_file(job_id: str) -> FileResponse:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    if not job or job.get("status") != "done":
        raise HTTPException(404, "File not ready.")
    path = Path(job["filepath"])
    if not path.exists():
        raise HTTPException(410, "File was removed from the server.")
    return FileResponse(path, filename=job.get("filename") or path.name)


@app.get("/api/history")
def api_history() -> JSONResponse:
    with JOBS_LOCK:
        done = [j for j in JOBS.values() if j.get("status") in ("done", "error")]
    done.sort(key=lambda j: j.get("finished_at", 0), reverse=True)
    out = []
    for j in done[:30]:
        out.append({
            "id": j["id"], "title": j.get("title"),
            "quality_label": j.get("quality_label"),
            "status": j.get("status"), "error": j.get("error"),
            "finished_at": j.get("finished_at"),
        })
    return JSONResponse(out)


@app.get("/api/health")
def api_health() -> JSONResponse:
    return JSONResponse({"ok": True, "yt_dlp": YoutubeDL is not None,
                         "ffmpeg": True})
