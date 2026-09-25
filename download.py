#!/usr/bin/env python3
"""
Video Downloader
================
Download videos in the best available quality (merged to MP4).
Works with YouTube and 1000+ other sites via yt-dlp.

Requires: pip install yt-dlp

Usage:
    python download.py "https://www.youtube.com/watch?v=..."
    python download.py "URL" -o ~/Downloads --audio-only
"""

import argparse
import sys
from pathlib import Path

__version__ = "1.0.0"


def main():
    ap = argparse.ArgumentParser(description="Download videos in best quality (MP4).")
    ap.add_argument("url", help="Video page URL (YouTube or any yt-dlp supported site)")
    ap.add_argument("-o", "--output-dir", default="downloads",
                    help="Folder to save into (default: ./downloads)")
    ap.add_argument("--audio-only", action="store_true",
                    help="Download audio only (MP3)")
    ap.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    args = ap.parse_args()

    try:
        from yt_dlp import YoutubeDL
    except ImportError:
        sys.exit("Error: yt-dlp is not installed. Run: pip install yt-dlp")

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.audio_only:
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": str(out_dir / "%(title)s.%(ext)s"),
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
        }
    else:
        ydl_opts = {
            "format": "bestvideo+bestaudio/best",
            "merge_output_format": "mp4",
            "outtmpl": str(out_dir / "%(title)s.%(ext)s"),
        }

    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(args.url, download=True)
        title = info.get("title", "unknown")
        duration = info.get("duration") or 0
        print(f"\nDone: {title}")
        print(f"  Duration: {duration // 60}:{duration % 60:02d}")
        print(f"  Saved to: {out_dir.resolve()}")


if __name__ == "__main__":
    main()
