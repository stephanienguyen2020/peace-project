let offscreenDocCreated = false;
let activeTabId = null;

async function ensureOffscreenDocument() {
  if (offscreenDocCreated) return;

  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });

  if (existingContexts.length > 0) {
    offscreenDocCreated = true;
    return;
  }

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "Capture tab audio for sentiment analysis",
  });
  offscreenDocCreated = true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_CAPTURE") {
    const tabId = message.tabId || (sender.tab && sender.tab.id);
    if (!tabId) {
      sendResponse({ success: false, error: "No tab ID" });
      return false;
    }
    activeTabId = tabId;
    handleStartCapture(tabId).then(sendResponse);
    return true;
  }

  if (message.type === "STOP_CAPTURE") {
    chrome.runtime.sendMessage({ type: "STOP_RECORDING" }).catch(() => {});
    activeTabId = null;
    sendResponse({ success: true });
    return false;
  }

  if (message.type === "GET_STATUS") {
    sendResponse({ capturing: !!activeTabId });
    return false;
  }

  // Forward messages from offscreen document to the content script
  if (
    activeTabId &&
    (message.type === "ANALYSIS_RESULT" ||
      message.type === "CAPTURE_STARTED" ||
      message.type === "CAPTURE_STOPPED")
  ) {
    console.log("Background forwarding message to tab", activeTabId, ":", message.type);
    chrome.tabs.sendMessage(activeTabId, message).catch(err => {
      console.error("Error sending message to content script:", err);
    });
    if (message.type === "CAPTURE_STOPPED") {
      activeTabId = null;
    }
  }
});

async function handleStartCapture(tabId) {
  try {
    await ensureOffscreenDocument();

    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId,
    });

    chrome.runtime.sendMessage({
      type: "START_RECORDING",
      streamId: streamId,
      tabId: tabId,
    }).catch(() => {});

    return { success: true };
  } catch (error) {
    console.error("Failed to start capture:", error);
    return { success: false, error: error.message };
  }
}
