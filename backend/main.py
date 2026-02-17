"""Backend Orchestrator

FastAPI server with WebSocket endpoint that receives audio chunks
from the Chrome extension, fans out to Hume and Gemini agents in
parallel, fuses the results, and streams back to the client.
"""

import asyncio
import os
import tempfile
import time

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from agents.hume_agent import HumeAgent
from agents.gemini_agent import GeminiAgent
from agents.fusion_agent import FusionAgent

load_dotenv()

app = FastAPI(title="Sentiment Analysis Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/audio")
async def audio_websocket(websocket: WebSocket):
    await websocket.accept()

    # Initialize agents per connection
    try:
        hume_agent = HumeAgent()
        gemini_agent = GeminiAgent()
    except ValueError as e:
        await websocket.send_json({"error": str(e)})
        await websocket.close()
        return

    fusion_agent = FusionAgent()
    chunk_count = 0

    print("Client connected")

    try:
        while True:
            # Receive audio chunk as binary data
            audio_bytes = await websocket.receive_bytes()
            chunk_count += 1
            timestamp = time.strftime("%H:%M:%S")

            print(f"Received chunk #{chunk_count} ({len(audio_bytes)} bytes)")

            # Fan out to both agents in parallel
            hume_task = asyncio.create_task(
                safe_hume_analyze(hume_agent, audio_bytes)
            )
            gemini_task = asyncio.create_task(
                safe_gemini_analyze(gemini_agent, audio_bytes)
            )

            hume_scores, gemini_result = await asyncio.gather(
                hume_task, gemini_task
            )

            # Fuse results
            result = fusion_agent.fuse(
                hume_scores=hume_scores,
                gemini_result=gemini_result,
                timestamp=timestamp,
            )

            # Send back to client
            await websocket.send_json(result.to_dict())
            print(f"  -> Score: {result.final_score:.2f}, Contempt: {result.contempt_flag}")

    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except Exception:
            pass


async def safe_hume_analyze(agent: HumeAgent, audio_bytes: bytes) -> dict:
    """Run Hume analysis with error fallback."""
    try:
        scores = await agent.analyze(audio_bytes)
        return scores.to_dict()
    except Exception as e:
        print(f"Hume agent failed: {e}")
        return {
            "contempt": 0.0,
            "anger": 0.0,
            "joy": 0.0,
            "sadness": 0.0,
            "disgust": 0.0,
            "surprise": 0.0,
            "fear": 0.0,
        }


async def safe_gemini_analyze(agent: GeminiAgent, audio_bytes: bytes) -> dict:
    """Run Gemini analysis with error fallback."""
    try:
        return await agent.analyze(audio_bytes)
    except Exception as e:
        print(f"Gemini agent failed: {e}")
        return {
            "transcript": "",
            "overall_sentiment": 0.0,
            "contempt_level": 0.0,
            "hostility_level": 0.0,
            "positivity": 0.0,
        }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
