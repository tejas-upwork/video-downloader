# ⬇️ Video Downloader

![version](https://img.shields.io/badge/version-2.0.0-blue)
![python](https://img.shields.io/badge/Python-3.8%2B-3776AB?logo=python&logoColor=white)
![yt-dlp](https://img.shields.io/badge/powered_by-yt--dlp-red)
![license](https://img.shields.io/badge/license-MIT-green)

> Download videos in the **best available quality** (merged to MP4) —
> from **YouTube and 1000+ other sites**, powered by `yt-dlp`.
>
> **Now with a web dashboard** — paste a link in your browser, pick a
> quality, and save the file. No app, no signup.

## 🌐 Web app (new in v2.0.0)

A clean, mobile-friendly dashboard:

- 🔗 **Paste any video link** — YouTube, Facebook, Instagram, TikTok, X, Vimeo + 1000 more
- 🎬 **True high quality** — best video + best audio merged to MP4, up to 4K where available
- 🎚️ **Quality picker** — Best / 4K / 1440p / 1080p / 720p / 480p / 360p / MP3 audio
- 📊 **Live progress bar** while downloading, then one-click save
- 🕘 **Download history** for the session
- 📱 **Works on phones** — fully responsive, nothing to install

### Run it locally

```bash
pip install -r requirements.txt
uvicorn web.app:app --host 0.0.0.0 --port 8000
# open http://localhost:8000
```

Requires `ffmpeg` on PATH (for merging streams and MP3 extraction).

### Deploy it online

**Docker** (any host):

```bash
docker build -t video-downloader .
docker run -p 8000:8000 video-downloader
```

**Render** (free): this repo ships a `render.yaml` blueprint —
create a new Blueprint on Render pointing at this repo and it deploys
as a Docker web service automatically.

### API

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Dashboard UI |
| `POST` | `/api/fetch` | `{url}` → title, thumbnail, duration, available qualities |
| `POST` | `/api/download` | `{url, quality}` → starts a job, returns `{job_id}` |
| `GET` | `/api/status/{job_id}` | Job status + live progress |
| `GET` | `/api/file/{job_id}` | Download the finished file |
| `GET` | `/api/history` | Finished jobs (latest first) |

Quality values: `best` · `2160` · `1440` · `1080` · `720` · `480` · `360` · `audio`

## 💻 Command-line tool (v1)

The original CLI still works — `download.py` is unchanged:

```bash
pip install yt-dlp

# Best quality -> MP4 in ./downloads
python download.py "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Custom folder
python download.py "URL" -o ~/Videos

# Audio only -> MP3
python download.py "URL" --audio-only
```

## 🗂️ Project structure

```
video-downloader/
├── download.py            # CLI tool (v1)
├── web/
│   ├── app.py             # FastAPI backend + JSON API
│   ├── templates/
│   │   └── index.html     # dashboard page
│   └── static/
│       ├── style.css      # dashboard styles
│       └── app.js         # dashboard logic
├── requirements.txt       # web app dependencies
├── Dockerfile             # container build (includes ffmpeg)
├── render.yaml            # one-click Render deploy
├── LICENSE
└── README.md
```

## ⚠️ Fair use

Video downloaders are a standard developer-tool category, but please respect
each site's Terms of Service — download only content you have the right to save.

## 📄 Version

**v2.0.0** — web dashboard: quality picker, live progress, history, MP3 mode,
Docker + Render deploy configs.
**v1.0.0** — initial release: best-quality MP4 download, audio-only MP3
mode, custom output folder.

## 📝 License

MIT — see [LICENSE](LICENSE).
