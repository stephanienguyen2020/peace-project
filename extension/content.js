(function () {
  "use strict";

  let isCapturing = false;
  let overlay = null;
  let contemptLog = [];

  function isWatchPage() {
    return window.location.pathname === "/watch" || window.location.pathname.startsWith("/shorts/");
  }

  function createOverlay() {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.id = "sentiment-overlay";
    overlay.innerHTML = `
      <div class="so-header">
        <div class="so-header-left">
          <div class="so-dot" id="so-status-dot"></div>
          <span class="so-title">Sentiment</span>
        </div>
        <div class="so-header-right">
          <span class="so-hint" id="so-hint">Click extension icon to start</span>
          <button id="so-minimize" class="so-btn so-btn-icon">\u2013</button>
        </div>
      </div>
      <div class="so-body" id="so-body">
        <div class="so-section">
          <div class="so-label-row">
            <span class="so-label">SENTIMENT</span>
            <span class="so-badge" id="so-sentiment-badge">--</span>
          </div>
          <div class="so-bar-track">
            <div class="so-bar-fill" id="so-bar-fill"></div>
            <div class="so-bar-marker" id="so-bar-marker"></div>
          </div>
          <div class="so-score" id="so-score">--</div>
        </div>

        <div class="so-divider"></div>

        <div class="so-section">
          <span class="so-label">EMOTIONS</span>
          <div class="so-emotions">
            <div class="so-emo-row">
              <span class="so-emo-name">Contempt</span>
              <div class="so-emo-track"><div class="so-emo-fill so-emo-contempt" id="emo-contempt"></div></div>
              <span class="so-emo-val" id="emo-contempt-val">0</span>
            </div>
            <div class="so-emo-row">
              <span class="so-emo-name">Anger</span>
              <div class="so-emo-track"><div class="so-emo-fill so-emo-anger" id="emo-anger"></div></div>
              <span class="so-emo-val" id="emo-anger-val">0</span>
            </div>
            <div class="so-emo-row">
              <span class="so-emo-name">Joy</span>
              <div class="so-emo-track"><div class="so-emo-fill so-emo-joy" id="emo-joy"></div></div>
              <span class="so-emo-val" id="emo-joy-val">0</span>
            </div>
            <div class="so-emo-row">
              <span class="so-emo-name">Sadness</span>
              <div class="so-emo-track"><div class="so-emo-fill so-emo-sadness" id="emo-sadness"></div></div>
              <span class="so-emo-val" id="emo-sadness-val">0</span>
            </div>
            <div class="so-emo-row">
              <span class="so-emo-name">Disgust</span>
              <div class="so-emo-track"><div class="so-emo-fill so-emo-disgust" id="emo-disgust"></div></div>
              <span class="so-emo-val" id="emo-disgust-val">0</span>
            </div>
          </div>
        </div>

        <div id="so-alerts"></div>

        <div class="so-divider"></div>

        <div class="so-section">
          <span class="so-label">TRANSCRIPT</span>
          <div class="so-transcript" id="so-transcript">Waiting for audio...</div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    setupEventListeners();
    console.log("Sentiment overlay created and added to page");
  }

  function setupEventListeners() {
    document.getElementById("so-minimize").addEventListener("click", () => {
      const body = document.getElementById("so-body");
      const btn = document.getElementById("so-minimize");
      body.classList.toggle("collapsed");
      btn.textContent = body.classList.contains("collapsed") ? "+" : "\u2013";
    });

    makeDraggable(overlay, overlay.querySelector(".so-header"));
  }

  function makeDraggable(el, handle) {
    let offsetX, offsetY, isDragging = false;

    handle.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      isDragging = true;
      offsetX = e.clientX - el.getBoundingClientRect().left;
      offsetY = e.clientY - el.getBoundingClientRect().top;
      handle.style.cursor = "grabbing";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      el.style.left = (e.clientX - offsetX) + "px";
      el.style.top = (e.clientY - offsetY) + "px";
      el.style.right = "auto";
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
      handle.style.cursor = "grab";
    });
  }

  function setCapturing(active) {
    isCapturing = active;
    const dot = document.getElementById("so-status-dot");
    const hint = document.getElementById("so-hint");
    if (dot) dot.classList.toggle("active", active);
    if (hint) hint.textContent = active ? "Analyzing..." : "Click extension icon to start";
  }

  function updateUI(data) {
    if (!data || !overlay) {
      console.warn("Cannot update UI - overlay:", !!overlay, "data:", !!data);
      return;
    }
    console.log("Updating UI with data:", data);

    if (data.final_score !== undefined) {
      const pct = ((data.final_score + 1) / 2) * 100;
      const fill = document.getElementById("so-bar-fill");
      const marker = document.getElementById("so-bar-marker");
      const score = document.getElementById("so-score");
      const badge = document.getElementById("so-sentiment-badge");

      fill.style.width = pct + "%";
      marker.style.left = pct + "%";

      const label = data.final_score > 0.2 ? "Positive" :
                    data.final_score < -0.2 ? "Negative" : "Neutral";
      const sign = data.final_score >= 0 ? "+" : "";
      score.textContent = sign + (data.final_score * 100).toFixed(0) + "%";
      badge.textContent = label;

      score.className = "so-score";
      badge.className = "so-badge";
      if (data.final_score > 0.2) {
        score.classList.add("positive");
        badge.classList.add("positive");
        fill.style.background = "linear-gradient(90deg, #34d399, #10b981)";
        marker.style.borderColor = "#10b981";
      } else if (data.final_score < -0.2) {
        score.classList.add("negative");
        badge.classList.add("negative");
        fill.style.background = "linear-gradient(90deg, #f87171, #ef4444)";
        marker.style.borderColor = "#ef4444";
      } else {
        fill.style.background = "linear-gradient(90deg, #fbbf24, #f59e0b)";
        marker.style.borderColor = "#f59e0b";
      }
    }

    if (data.emotions) {
      const emos = ["contempt", "anger", "joy", "sadness", "disgust"];
      for (const emo of emos) {
        const val = data.emotions[emo] || 0;
        const bar = document.getElementById("emo-" + emo);
        const valEl = document.getElementById("emo-" + emo + "-val");
        if (bar) bar.style.width = (val * 100) + "%";
        if (valEl) valEl.textContent = (val * 100).toFixed(0);
      }
    }

    if (data.contempt_flag) {
      addContemptAlert(data.timestamp);
    }

    if (data.transcript) {
      document.getElementById("so-transcript").textContent = data.transcript;
    }
  }

  function addContemptAlert(timestamp) {
    const time = timestamp || new Date().toLocaleTimeString();
    contemptLog.push(time);
    if (contemptLog.length > 5) contemptLog.shift();

    const container = document.getElementById("so-alerts");
    container.innerHTML = contemptLog
      .map((t) => `
        <div class="so-alert">
          <div class="so-alert-dot"></div>
          <span>Contempt detected</span>
          <span class="so-alert-time">${t}</span>
        </div>
      `)
      .join("");
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Content script received message:", message.type, message.data);
    
    if (message.type === "ANALYSIS_RESULT" && message.data) {
      if (isWatchPage() && !overlay) createOverlay();
      setCapturing(true);
      updateUI(message.data);
    }
    if (message.type === "CAPTURE_STARTED") {
      if (isWatchPage() && !overlay) createOverlay();
      setCapturing(true);
    }
    if (message.type === "CAPTURE_STOPPED") {
      setCapturing(false);
    }
    return true; // Keep message channel open for async responses
  });

  // Clean up overlay when navigating away from watch pages
  // Also create overlay when navigating to watch/shorts pages
  const observer = new MutationObserver(() => {
    if (isWatchPage() && !overlay) {
      createOverlay();
    } else if (!isWatchPage() && overlay) {
      overlay.remove();
      overlay = null;
      if (isCapturing) chrome.runtime.sendMessage({ type: "STOP_CAPTURE" });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  
  // Also listen for URL changes (YouTube SPA navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      if (isWatchPage() && !overlay) {
        createOverlay();
      } else if (!isWatchPage() && overlay) {
        overlay.remove();
        overlay = null;
        if (isCapturing) chrome.runtime.sendMessage({ type: "STOP_CAPTURE" });
      }
    }
  }).observe(document, { subtree: true, childList: true });

  // Create overlay immediately if on a watch/shorts page
  if (isWatchPage()) {
    createOverlay();
  }
})();
