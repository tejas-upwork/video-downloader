/* VideoDownloader dashboard logic */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const form = $("dl-form"), urlInput = $("url-input"), fetchBtn = $("fetch-btn");
  const result = $("result"), rThumb = $("r-thumb"), rSite = $("r-site"),
        rTitle = $("r-title"), rSub = $("r-sub"), qList = $("q-list"),
        rError = $("r-error");
  const progressWrap = $("progress-wrap"), progressFill = $("progress-fill"),
        progressText = $("progress-text"), progressBar = progressWrap.querySelector(".progress-bar");
  const doneWrap = $("done-wrap"), fileLink = $("file-link");
  const historyEl = $("history");

  const QUALITY_META = {
    best:  ["Best quality", "Highest available"],
    "2160": ["4K", "2160p"],
    "1440": ["1440p", "QHD"],
    "1080": ["1080p", "Full HD"],
    "720":  ["720p", "HD"],
    "480":  ["480p", "SD"],
    "360":  ["360p", "SD"],
    audio:  ["MP3", "Audio only · 192 kbps"],
  };

  let currentUrl = "";
  let pollTimer = null;

  function showError(msg) {
    rError.textContent = msg;
    rError.classList.remove("hidden");
  }
  function clearError() {
    rError.classList.add("hidden");
    rError.textContent = "";
  }
  function fmtBytes(n) {
    if (!n) return "";
    const u = ["B", "KB", "MB", "GB"];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(n >= 10 || i === 0 ? 0 : 1) + " " + u[i];
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const url = urlInput.value.trim();
    if (!url) return;
    currentUrl = url;
    fetchBtn.disabled = true;
    fetchBtn.textContent = "Reading…";
    result.classList.remove("hidden");
    doneWrap.classList.add("hidden");
    progressWrap.classList.add("hidden");
    qList.innerHTML = "";
    rTitle.textContent = "Reading video info…";
    rSub.textContent = "";
    rSite.textContent = "…";
    rThumb.removeAttribute("src");
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });

    try {
      const res = await fetch("/api/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not read that link.");
      renderInfo(data);
    } catch (err) {
      rTitle.textContent = "Something went wrong";
      rSub.textContent = "";
      rSite.textContent = "error";
      showError(err.message || "Could not read that link. Check the URL and try again.");
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.textContent = "Download";
    }
  });

  function renderInfo(data) {
    rSite.textContent = data.site || "video";
    rTitle.textContent = data.title || "Untitled video";
    const bits = [];
    if (data.uploader) bits.push(data.uploader);
    if (data.duration) bits.push(data.duration_str);
    rSub.textContent = bits.join(" • ");
    if (data.thumbnail) { rThumb.src = data.thumbnail; rThumb.alt = data.title || ""; }

    qList.innerHTML = "";
    const quals = ["best", ...(data.qualities || [])];
    quals.forEach((q) => {
      const meta = QUALITY_META[q] || [q, ""];
      const b = document.createElement("button");
      b.type = "button";
      b.className = "q-btn" + (q === "best" ? " best" : "");
      b.innerHTML = meta[0] + (meta[1] ? "<small>" + meta[1] + "</small>" : "");
      b.addEventListener("click", () => startDownload(q, b));
      qList.appendChild(b);
    });
    if (data.has_audio) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "q-btn";
      b.innerHTML = 'MP3<small>Audio only · 192 kbps</small>';
      b.addEventListener("click", () => startDownload("audio", b));
      qList.appendChild(b);
    }
  }

  async function startDownload(quality, btn) {
    clearError();
    qList.querySelectorAll("button").forEach((b) => (b.disabled = true));
    if (btn) btn.textContent = "Starting…";
    doneWrap.classList.add("hidden");
    progressWrap.classList.remove("hidden");
    progressFill.style.width = "0";
    progressBar.classList.add("indet");
    progressText.textContent = "Starting download…";
    if (pollTimer) clearInterval(pollTimer);

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: currentUrl, quality }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not start download.");
      pollStatus(data.job_id);
    } catch (err) {
      progressWrap.classList.add("hidden");
      qList.querySelectorAll("button").forEach((b) => (b.disabled = false));
      showError(err.message || "Could not start download.");
    }
  }

  function pollStatus(jobId) {
    pollTimer = setInterval(async () => {
      try {
        const res = await fetch("/api/status/" + jobId);
        const j = await res.json();
        if (!res.ok) throw new Error(j.detail || "Lost track of the download.");

        if (j.status === "downloading" || j.status === "queued") {
          const p = j.progress;
          if (p != null && p >= 0) {
            progressBar.classList.remove("indet");
            progressFill.style.width = Math.min(100, p) + "%";
            let t = "Downloading… " + p.toFixed(0) + "%";
            if (j.downloaded) t += " · " + fmtBytes(j.downloaded) + " received";
            progressText.textContent = t;
          } else {
            progressBar.classList.add("indet");
            progressText.textContent = "Downloading… " +
              (j.downloaded ? fmtBytes(j.downloaded) + " received" : "please wait");
          }
        } else if (j.status === "done") {
          clearInterval(pollTimer);
          progressWrap.classList.add("hidden");
          fileLink.href = "/api/file/" + jobId;
          fileLink.setAttribute("download", j.filename || "video");
          doneWrap.classList.remove("hidden");
          qList.querySelectorAll("button").forEach((b) => (b.disabled = false));
          loadHistory();
        } else if (j.status === "error") {
          clearInterval(pollTimer);
          progressWrap.classList.add("hidden");
          qList.querySelectorAll("button").forEach((b) => (b.disabled = false));
          showError("Download failed: " + (j.error || "unknown error"));
          loadHistory();
        }
      } catch (err) {
        clearInterval(pollTimer);
        progressWrap.classList.add("hidden");
        showError(err.message || "Lost track of the download.");
      }
    }, 1200);
  }

  async function loadHistory() {
    try {
      const res = await fetch("/api/history");
      const items = await res.json();
      historyEl.innerHTML = "";
      if (!items.length) {
        historyEl.innerHTML = '<li class="empty">Nothing downloaded yet.</li>';
        return;
      }
      items.slice(0, 10).forEach((j) => {
        const li = document.createElement("li");
        if (j.status === "done") {
          li.innerHTML = "";
          const t = document.createElement("span");
          t.className = "h-title";
          t.textContent = j.title || "Untitled video";
          const q = document.createElement("span");
          q.className = "h-q";
          q.textContent = j.quality_label || "";
          const a = document.createElement("a");
          a.className = "h-dl";
          a.href = "/api/file/" + j.id;
          a.textContent = "⬇ Save";
          li.append(t, q, a);
        } else {
          const t = document.createElement("span");
          t.className = "h-title";
          t.textContent = j.title || j.id;
          const e = document.createElement("span");
          e.className = "h-err";
          e.textContent = "failed";
          li.append(t, e);
        }
        historyEl.appendChild(li);
      });
    } catch (e) { /* history is best-effort */ }
  }

  loadHistory();
})();
