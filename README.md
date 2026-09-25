# Video Downloader

Download videos in the best available quality, merged to MP4.
Works with YouTube and 1000+ other sites (via `yt-dlp`).

## Requirements

- Python 3.8+
- `yt-dlp`: `pip install yt-dlp`
- `ffmpeg` (for merging / audio extraction)

## Usage

```bash
# Best quality video -> MP4 in ./downloads
python download.py "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Custom folder
python download.py "URL" -o ~/Downloads

# Audio only -> MP3
python download.py "URL" --audio-only
```

## Note

Video downloaders are a standard developer-tool category — `yt-dlp` itself
is one of the most-starred open-source projects on GitHub. This script is a
thin, readable wrapper around it, shared as a portfolio sample.
Please respect each site's Terms of Service and download only content
you have the right to save.
