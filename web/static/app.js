/* VideoDownloader dashboard logic — single + multi-link modes */
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
  const multiToggle = $("multi-toggle"), multiBox = $("multi-box"),
        multiInput = $("multi-input"), multiQuality = $("multi-quality"),
        jobsEl = $("jobs");

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
  const QUALITY_LABEL = {
    best: "Best quality", "2160": "4K", "1440": "1440p", "1080": "1080p",
    "720": "720p", "480": "480p", "360": "360p", audio: "MP3",
  };

  let currentUrl = "";
  let pollTimer = null;
  let multiMode = false;
  const jobTimers = {};

  /* ---------- multi-link toggle ---------- */
  multiToggle.addEventListener("click", () => {
    multiMode = !multiMode;
    multiBox.classList.toggle("hidden", !multiMode);
    urlInput.classList.toggle("hidden", multiMode);
    multiToggle.textContent = multiMode ? "− Single link" : "+ Multiple links";
    urlInput.required = !multiMode;
    if (multiMode) multiInput.focus(); else urlInput.focus();
  });

  /* ---------- platform chips & pills ---------- */
  $("chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    if (multiMode) multiToggle.click();
    urlInput.placeholder = "Paste a " + b.dataset.site + " link here";
    urlInput.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  $("site-pills").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const site = b.textContent.replace(" Video Downloader", "").replace(" Converter", "");
    if (multiMode) multiToggle.click();
    urlInput.placeholder = "Paste a " + site + " link here";
    urlInput.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

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
  async function postJSON(path, data) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail || "Request failed.");
    return body;
  }

  /* ================= SINGLE MODE ================= */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (multiMode) return submitMulti();
    clearError();
    const url = urlInput.value.trim();
    if (!url) return;
    currentUrl = url;
    fetchBtn.disabled = true;
    fetchBtn.textContent = "Reading…";
    result.classList.remove("hidden");
    jobsEl.classList.add("hidden");
    doneWrap.classList.add("hidden");
    progressWrap.classList.add("hidden");
    qList.innerHTML = "";
    rTitle.textContent = "Reading video info…";
    rSub.textContent = "";
    rSite.textContent = "…";
    rThumb.removeAttribute("src");
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });

    try {
      const data = await postJSON("/api/fetch", { url });
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
    ["best", ...(data.qualities || [])].forEach((q) => {
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
      b.innerHTML = "MP3<small>Audio only · 192 kbps</small>";
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
      const data = await postJSON("/api/download", { url: currentUrl, quality });
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

  /* ================= MULTI MODE ================= */
  async function submitMulti() {
    const urls = multiInput.value.split("\n").map((s) => s.trim())
      .filter((s) => /^https?:\/\//i.test(s));
    if (!urls.length) {
      multiInput.focus();
      multiInput.placeholder = "Paste at least one valid link (one per line)…";
      return;
    }
    const quality = multiQuality.value;
    result.classList.add("hidden");
    jobsEl.classList.remove("hidden");
    jobsEl.innerHTML = "";
    fetchBtn.disabled = true;
    fetchBtn.textContent = "Working…";
    jobsEl.scrollIntoView({ behavior: "smooth", block: "nearest" });

    // Process sequentially to keep the UI readable; backend runs up to 3 at once.
    for (const url of urls.slice(0, 20)) {
      addJobCard(url, quality);
    }
    const cards = [...jobsEl.children];
    for (const card of cards) {
      await runBatchJob(card);
    }
    fetchBtn.disabled = false;
    fetchBtn.textContent = "Download";
    loadHistory();
  }

  function addJobCard(url, quality) {
    const card = document.createElement("div");
    card.className = "job";
    card.dataset.url = url;
    card.dataset.quality = quality;
    card.innerHTML =
      '<img alt="" referrerpolicy="no-referrer">' +
      '<div class="j-body">' +
        '<div><span class="j-title">Reading…</span><span class="j-q">' +
          (QUALITY_LABEL[quality] || quality) + "</span></div>" +
        '<div class="j-bar"><div class="j-fill"></div></div>' +
        '<p class="j-status">Queued…</p>' +
      "</div>";
    jobsEl.appendChild(card);
    return card;
  }

  async function runBatchJob(card) {
    const url = card.dataset.url, quality = card.dataset.quality;
    const titleEl = card.querySelector(".j-title"),
          statusEl = card.querySelector(".j-status"),
          fillEl = card.querySelector(".j-fill"),
          barEl = card.querySelector(".j-bar"),
          imgEl = card.querySelector("img");
    try {
      const info = await postJSON("/api/fetch", { url });
      titleEl.textContent = info.title || url;
      if (info.thumbnail) imgEl.src = info.thumbnail;
      statusEl.textContent = "Starting…";
      const { job_id } = await postJSON("/api/download", { url, quality });
      await new Promise((resolve) => {
        jobTimers[job_id] = setInterval(async () => {
          try {
            const res = await fetch("/api/status/" + job_id);
            const j = await res.json();
            if (!res.ok) throw new Error("lost");
            if (j.status === "done") {
              clearInterval(jobTimers[job_id]);
              barEl.classList.remove("indet");
              fillEl.style.width = "100%";
              statusEl.textContent = "Done ✓";
              const a = document.createElement("a");
              a.className = "j-dl";
              a.href = "/api/file/" + job_id;
              a.textContent = "⬇ Save";
              card.appendChild(a);
              resolve();
            } else if (j.status === "error") {
              clearInterval(jobTimers[job_id]);
              statusEl.innerHTML = "";
              const e = document.createElement("span");
              e.className = "j-err";
              e.textContent = "Failed: " + (j.error || "unknown error").slice(0, 120);
              statusEl.appendChild(e);
              resolve();
            } else {
              const p = j.progress;
              if (p != null && p >= 0) {
                barEl.classList.remove("indet");
                fillEl.style.width = Math.min(100, p) + "%";
                statusEl.textContent = "Downloading… " + p.toFixed(0) + "%" +
                  (j.downloaded ? " · " + fmtBytes(j.downloaded) : "");
              } else {
                barEl.classList.add("indet");
                statusEl.textContent = "Downloading… " +
                  (j.downloaded ? fmtBytes(j.downloaded) + " received" : "please wait");
              }
            }
          } catch (err) {
            clearInterval(jobTimers[job_id]);
            statusEl.textContent = "Lost track of this download.";
            resolve();
          }
        }, 1200);
      });
    } catch (err) {
      titleEl.textContent = url;
      const e = document.createElement("span");
      e.className = "j-err";
      e.textContent = "Could not read this link: " + (err.message || "").slice(0, 120);
      statusEl.innerHTML = "";
      statusEl.appendChild(e);
    }
  }

  /* ================= HISTORY ================= */
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
