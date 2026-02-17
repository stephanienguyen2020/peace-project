document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("start-btn");
  const statusEl = document.getElementById("status");

  // Check current status
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
    if (response && response.capturing) {
      startBtn.textContent = "Stop";
      startBtn.classList.add("active");
      statusEl.textContent = "Analyzing audio...";
      statusEl.className = "status on";
    }
  });

  startBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
      if (response && response.capturing) {
        // Stop
        chrome.runtime.sendMessage({ type: "STOP_CAPTURE" });
        startBtn.textContent = "Start Capture";
        startBtn.classList.remove("active");
        statusEl.textContent = "Not capturing";
        statusEl.className = "status";
      } else {
        // Start — this popup click gives us the activeTab permission
        chrome.runtime.sendMessage({ type: "START_CAPTURE", tabId: tab.id }, (res) => {
          if (res && res.success) {
            startBtn.textContent = "Stop";
            startBtn.classList.add("active");
            statusEl.textContent = "Analyzing audio...";
            statusEl.className = "status on";
          } else {
            statusEl.textContent = "Error: " + (res?.error || "unknown");
            statusEl.className = "status error";
          }
        });
      }
    });
  });

});
