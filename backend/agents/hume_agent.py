"""Hume Prosody Analysis Agent

Sends audio chunks to the Hume Expression Measurement API
and returns emotion scores including contempt detection.
"""

import asyncio
import os
from dataclasses import dataclass

from hume import AsyncHumeClient
from hume.expression_measurement.batch.types import (
    InferenceBaseRequest,
    Models,
    Prosody,
)


@dataclass
class EmotionScores:
    contempt: float = 0.0
    anger: float = 0.0
    joy: float = 0.0
    sadness: float = 0.0
    disgust: float = 0.0
    surprise: float = 0.0
    fear: float = 0.0

    def to_dict(self) -> dict:
        return {
            "contempt": self.contempt,
            "anger": self.anger,
            "joy": self.joy,
            "sadness": self.sadness,
            "disgust": self.disgust,
            "surprise": self.surprise,
            "fear": self.fear,
        }


# Target emotions we want to extract from Hume's response
TARGET_EMOTIONS = {
    "Contempt": "contempt",
    "Anger": "anger",
    "Joy": "joy",
    "Sadness": "sadness",
    "Disgust": "disgust",
    "Surprise (positive)": "surprise",
    "Fear": "fear",
}


class HumeAgent:
    def __init__(self):
        self.api_key = os.getenv("HUME_API_KEY")
        if not self.api_key:
            raise ValueError("HUME_API_KEY environment variable is required")
        self.client = AsyncHumeClient(api_key=self.api_key)

    async def analyze(self, audio_bytes: bytes) -> EmotionScores:
        """Analyze audio bytes for emotional prosody.

        Args:
            audio_bytes: Raw audio data (webm/opus format)

        Returns:
            EmotionScores with detected emotion levels (0-1 scale)
        """
        scores = EmotionScores()

        try:
            # Start batch inference job with prosody model
            job_id = await self.client.expression_measurement.batch.start_inference_job_from_local_file(
                file=[audio_bytes],
                json=InferenceBaseRequest(
                    models=Models(prosody=Prosody()),
                ),
            )

            # Poll for job completion
            await self._wait_for_job(job_id)

            # Get predictions
            predictions = await self.client.expression_measurement.batch.get_job_predictions(
                id=job_id
            )

            if not predictions:
                return scores

            # Extract emotion scores from predictions
            for prediction in predictions:
                if not prediction.results or not prediction.results.predictions:
                    continue

                for file_pred in prediction.results.predictions:
                    if not file_pred.models or not file_pred.models.prosody:
                        continue

                    prosody = file_pred.models.prosody
                    if not prosody.grouped_predictions:
                        continue

                    # Average scores across all segments
                    all_emotions = {}
                    count = 0

                    for group in prosody.grouped_predictions:
                        for pred in group.predictions:
                            count += 1
                            for emotion in pred.emotions:
                                name = emotion.name
                                if name not in all_emotions:
                                    all_emotions[name] = 0.0
                                all_emotions[name] += emotion.score

                    if count > 0:
                        for hume_name, our_name in TARGET_EMOTIONS.items():
                            if hume_name in all_emotions:
                                setattr(scores, our_name, all_emotions[hume_name] / count)

        except Exception as e:
            print(f"Hume analysis error: {e}")

        return scores

    async def _wait_for_job(self, job_id: str, timeout: float = 30.0):
        """Poll until job completes or timeout."""
        elapsed = 0.0
        interval = 1.0
        while elapsed < timeout:
            details = await self.client.expression_measurement.batch.get_job_details(id=job_id)
            state = details.state
            status = state.status if hasattr(state, "status") else str(state)
            if status in ("COMPLETED", "FAILED"):
                return
            await asyncio.sleep(interval)
            elapsed += interval
        raise TimeoutError(f"Hume job {job_id} timed out after {timeout}s")
