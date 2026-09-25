# ⬇️ Video Downloader

![version](https://img.shields.io/badge/version-1.0.0-blue)
![python](https://img.shields.io/badge/Python-3.8%2B-3776AB?logo=python&logoColor=white)
![yt-dlp](https://img.shields.io/badge/powered_by-yt--dlp-red)
![license](https://img.shields.io/badge/license-MIT-green)

> Download videos in the **best available quality** (merged to MP4) —
> from **YouTube and 1000+ other sites**, powered by `yt-dlp`.

## 📖 What is this?

A small, readable command-line wrapper around
[yt-dlp](https://github.com/yt-dlp/yt-dlp) — one of the most-starred
open-source projects on GitHub. Give it a video page URL, get the best
video+audio merged into a single MP4 (or MP3 with `--audio-only`).

## ✨ Features

- 🎬 **Best quality** — merges best video + best audio into one MP4
- 🌍 **1000+ sites** — YouTube, Vimeo, Twitter/X, Instagram, and more
  (everything yt-dlp supports)
- 🎧 **Audio-only mode** — extract to MP3
- 📁 **Organized output** — saves into a folder you choose, named by video title

## 🛠️ How it works

1. `yt-dlp` resolves the page URL and lists available formats.
2. The script selects `bestvideo+bestaudio` (or `bestaudio` for MP3 mode).
3. `ffmpeg` merges the streams into a single `.mp4`
   (or extracts `.mp3` via the FFmpegExtractAudio post-processor).
4. The file is saved as `<video title>.mp4` in your output folder.

## 📦 Requirements

- Python 3.8+
- `pip install yt-dlp`
- `ffmpeg` on PATH (for merging / audio extraction)

## 🚀 Usage

```bash
# Best quality -> MP4 in ./downloads
python download.py "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Custom folder
python download.py "URL" -o ~/Downloads

# Audio only -> MP3
python download.py "URL" --audio-only

# Check version
python download.py --version
```

### Options

| Option | Default | Description |
|---|---|---|
| `url` | *(required)* | Video page URL |
| `-o / --output-dir` | `./downloads` | Folder to save into |
| `--audio-only` | off | Download audio only as MP3 |
| `--version` | | Print version and exit |

## 💡 Example

```bash
$ python download.py "https://www.youtube.com/watch?v=dQw4w9WgXcQ" -o ~/Videos

Done: Never Gonna Give You Up
  Duration: 3:33
  Saved to: /home/user/Videos
```

## ⚠️ Fair use

Video downloaders are a standard developer-tool category, but please respect
each site's Terms of Service — download only content you have the right to save.

## 📄 Version

**v1.0.0** — initial release: best-quality MP4 download, audio-only MP3
mode, custom output folder.

## 📝 License

MIT — see [LICENSE](LICENSE).
