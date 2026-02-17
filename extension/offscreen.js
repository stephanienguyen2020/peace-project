const CHUNK_DURATION_MS = 4000;
const BACKEND_WS_URL = "ws://localhost:8000/ws/audio";

let mediaRecorder = null;
let audioStream = null;
let audioContext = null;
let ws = null;
let chunkInterval = null;
let isRecording = false;

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "START_RECORDING") {
    startRecording(message.streamId);
  }
  if (message.type === "STOP_RECORDING") {
    stopRecording();
  }
});

async function startRecording(streamId) {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
    });

    // Pipe audio back to speakers so the video isn't muted
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(audioStream);
    source.connect(audioContext.destination);

    connectWebSocket();
    isRecording = true;
    startChunkCycle();
    broadcastStatus("CAPTURE_STARTED");
  } catch (error) {
    console.error("Recording failed:", error);
    broadcastStatus("CAPTURE_ERROR", error.message);
  }
}

function startChunkCycle() {
  // Each cycle: start a new MediaRecorder, let it record for CHUNK_DURATION_MS,
  // then stop it. This ensures every chunk is a complete WebM file with headers.
  function recordOneChunk() {
    if (!isRecording || !audioStream) return;

    mediaRecorder = new MediaRecorder(audioStream, {
      mimeType: "audio/webm;codecs=opus",
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
        event.data.arrayBuffer().then((buffer) => {
          ws.send(buffer);
        });
      }
    };

    mediaRecorder.onstop = () => {
      // Start next chunk cycle
      if (isRecording) {
        recordOneChunk();
      }
    };

    mediaRecorder.start();
    setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
    }, CHUNK_DURATION_MS);
  }

  recordOneChunk();
}

function connectWebSocket() {
  ws = new WebSocket(BACKEND_WS_URL);

  ws.onopen = () => {
    console.log("Connected to backend");
  };

  ws.onmessage = (event) => {
    try {
      // FastAPI send_json sends text messages
      const data = JSON.parse(event.data);
      console.log("Received analysis result:", data);
      broadcastStatus("ANALYSIS_RESULT", data);
    } catch (error) {
      console.error("Error parsing WebSocket message:", error, "Raw data:", event.data);
    }
  };

  ws.onclose = () => {
    console.log("WebSocket closed");
    setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        connectWebSocket();
      }
    }, 3000);
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
  };
}

function stopRecording() {
  isRecording = false;
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  cleanUp();
  broadcastStatus("CAPTURE_STOPPED");
}

function cleanUp() {
  isRecording = false;
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (audioStream) {
    audioStream.getTracks().forEach((track) => track.stop());
    audioStream = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  mediaRecorder = null;
}

function broadcastStatus(type, data = null) {
  console.log("Broadcasting status:", type, data ? Object.keys(data) : null);
  chrome.runtime.sendMessage({ type, data }).catch(err => {
    console.error("Error broadcasting status:", err);
  });
}
