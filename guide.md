# Chrome Extension: YouTube Video Sentiment & Contempt Detection

## Architecture Overview

This is a real-time audio analysis pipeline that captures YouTube audio, processes it through multiple AI services, and displays a live sentiment bar. Here's the full breakdown.

---

## Agent Team

You need **4 core agents** and **2 support components**:

### 1. **Audio Capture Agent**

- Lives in the Chrome extension's **content script**
- Uses the `chrome.tabCapture` or `AudioContext` API to capture the YouTube tab's audio stream
- Chunks audio into small segments (e.g., 3–5 second windows) for streaming to backend
- Handles buffering, overlap, and silence detection

### 2. **Tone/Prosody Analysis Agent (Hume AI)**

- Receives audio chunks
- Calls the **Hume Expression Measurement API** Here's the documentation to Hume https://dev.hume.ai/docs/expression-measurement/overview
- Returns emotion scores: contempt, anger, disgust, joy, sadness, etc.
- This is your primary contempt detector — Hume's prosody model is specifically trained to detect vocal emotional expressions including contempt

### 3. **Transcript + Script Analysis Agent (Gemini or Hume)**

- **Option A — Hume Language Model**: Hume also has a language emotion model that can analyze transcript text for emotional content. Keeps your stack simpler.
- **Option B — Whisper + Gemini**: Use OpenAI Whisper (or Deepgram) for speech-to-text, then pass the transcript to Gemini with a prompt like _"Rate the contempt, hostility, and positivity in this text on a scale of -1 to 1."_
- **Option C — Gemini Multimodal**: Send audio directly to Gemini 2.0 Flash, which can process audio natively and give both transcript + sentiment analysis in one call

### 4. **Fusion/Scoring Agent**

- Combines the tone signal (Hume) and the script signal (Gemini/Hume language) into a single **composite sentiment score**
- Weighted average approach, e.g.: `final_score = 0.6 * tone_score + 0.4 * script_score`
- Handles temporal smoothing so the bar doesn't flicker wildly
- Detects specific contempt spikes and flags them

### 5. **Backend Orchestrator** (support)

- A lightweight server (Node.js or Python FastAPI) that sits between the extension and the AI APIs
- Manages API keys securely (never put Hume/Gemini keys in the extension)
- Routes audio to the right agents, collects results, fuses them, and sends back to the extension via WebSocket

### 6. **UI Renderer** (support)

- Extension popup or injected overlay on the YouTube page
- Renders the positive/negative bar (a gradient bar or gauge)
- Shows real-time contempt alerts, rolling transcript, and emotion breakdown

---

## Workflow

```
┌─────────────────────────────────────────────────────────┐
│                   CHROME EXTENSION                       │
│                                                          │
│  YouTube Page                                            │
│  ┌──────────┐    ┌──────────────┐    ┌────────────────┐ │
│  │ Audio     │───▶│ Content      │───▶│ WebSocket      │ │
│  │ Stream    │    │ Script       │    │ Client         │ │
│  └──────────┘    │ (capture +   │    └───────┬────────┘ │
│                  │  chunk audio)│            │          │
│  ┌──────────────────────────────┐            │          │
│  │ Overlay UI: Sentiment Bar    │◀───────────┘          │
│  │ [███████░░░] 72% positive    │   (results back)     │
│  │ ⚠ Contempt detected @ 3:42  │                       │
│  └──────────────────────────────┘                       │
└─────────────────────────────────────────────────────────┘
                         │
                    Audio chunks
                    (via WebSocket)
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   BACKEND SERVER                         │
│                  (FastAPI / Node)                         │
│                                                          │
│  ┌─────────────┐                                        │
│  │ Orchestrator │──── fan-out to parallel agents ──┐    │
│  └──────┬──────┘                                   │    │
│         │                                          │    │
│         ▼                                          ▼    │
│  ┌──────────────┐                    ┌─────────────────┐│
│  │ Hume Prosody │                    │ Transcription    ││
│  │ Agent        │                    │ (Whisper/Deepgram││
│  │              │                    │  or Gemini)      ││
│  │ Returns:     │                    └────────┬────────┘│
│  │ {contempt:   │                             │         │
│  │  0.73,       │                             ▼         │
│  │  joy: 0.12,  │                    ┌─────────────────┐│
│  │  anger: 0.45}│                    │ Script Sentiment ││
│  └──────┬───────┘                    │ Agent (Gemini    ││
│         │                            │ or Hume Language)││
│         │                            └────────┬────────┘│
│         │                                     │         │
│         ▼                                     ▼         │
│  ┌──────────────────────────────────────────────┐       │
│  │           Fusion / Scoring Agent              │       │
│  │                                               │       │
│  │  tone_score = normalize(hume_emotions)        │       │
│  │  script_score = normalize(gemini_sentiment)   │       │
│  │  final = 0.6 * tone + 0.4 * script           │       │
│  │  contempt_flag = hume.contempt > threshold    │       │
│  └──────────────────┬───────────────────────────┘       │
│                     │                                    │
└─────────────────────┼────────────────────────────────────┘
                      │
               WebSocket push
                      │
                      ▼
              Extension UI updates
```

---

## Tech Stack Recommendation

| Component       | Technology                                                                |
| --------------- | ------------------------------------------------------------------------- |
| Extension       | Manifest V3, content script + service worker                              |
| Audio capture   | `chrome.tabCapture.capture()` or `OffscreenDocument` with `MediaRecorder` |
| Transport       | WebSocket (real-time bidirectional)                                       |
| Backend         | **Python FastAPI** (best Hume SDK support)                                |
| Tone analysis   | **Hume Expression Measurement API** — prosody model                       |
| Transcription   | **Deepgram** (fastest, streaming) or Whisper                              |
| Script analysis | **Gemini 2.0 Flash** (cheap, fast, good at sentiment prompts)             |
| Fusion          | Custom Python logic in the orchestrator                                   |
| UI              | Injected React/Preact overlay on YouTube DOM                              |

---

## Key Design Decisions

**Why not just Gemini for everything?** Hume's prosody model detects vocal microexpressions (contempt in _tone_) that text analysis completely misses. Someone can say "That's great" with contemptuous tone — Gemini on text alone would mark it positive. You need both signals.

**Why not just Hume for everything?** You could — Hume has both prosody and language models. But Gemini gives you more flexibility to customize your contempt detection prompt and is arguably stronger at nuanced language analysis. Start with Hume-only for simplicity, add Gemini later if needed.

**Streaming vs. batch?** Use Hume's **streaming WebSocket API** for prosody — it's designed for real-time. For transcript analysis, batch every 10–15 seconds to avoid hammering Gemini with too many calls.

---

## MVP Build Order

1. **Chrome extension** that captures YouTube audio and sends it to your backend
2. **Backend** that receives audio and forwards to Hume prosody API
3. **Simple sentiment bar** that displays Hume's emotion scores
4. Add **transcription** (Deepgram streaming)
5. Add **Gemini script analysis** on transcripts
6. Build the **fusion agent** to combine both signals
7. Polish the UI with contempt alerts, timeline markers, and emotion breakdowns

This gets you a working prototype at step 3, and a full system by step 7.
