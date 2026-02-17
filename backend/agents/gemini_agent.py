"""Gemini Multimodal Analysis Agent

Sends audio directly to Gemini 2.0 Flash for both
transcription and sentiment analysis in a single call.
"""

import json
import os

from google import genai
from google.genai import types


ANALYSIS_PROMPT = """Analyze this audio clip. Provide:

1. A transcript of what is being said
2. Sentiment analysis of the content and tone, rating each on a scale of -1 (very negative) to 1 (very positive):
   - overall_sentiment: The general sentiment
   - contempt_level: Level of contempt or disdain (0 to 1, where 1 is extreme contempt)
   - hostility_level: Level of hostility or aggression (0 to 1)
   - positivity: Level of genuine positivity (0 to 1)

Respond ONLY with valid JSON in this exact format:
{
  "transcript": "what was said...",
  "overall_sentiment": 0.0,
  "contempt_level": 0.0,
  "hostility_level": 0.0,
  "positivity": 0.0
}"""


class GeminiAgent:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY environment variable is required")
        self.client = genai.Client(api_key=self.api_key)

    async def analyze(self, audio_bytes: bytes) -> dict:
        """Analyze audio using Gemini multimodal capabilities.

        Args:
            audio_bytes: Raw audio data (webm/opus format)

        Returns:
            Dict with transcript, overall_sentiment, contempt_level,
            hostility_level, and positivity scores.
        """
        default_result = {
            "transcript": "",
            "overall_sentiment": 0.0,
            "contempt_level": 0.0,
            "hostility_level": 0.0,
            "positivity": 0.0,
        }

        try:
            response = await self.client.aio.models.generate_content(
                model="gemini-2.0-flash",
                contents=[
                    types.Content(
                        parts=[
                            types.Part(
                                inline_data=types.Blob(
                                    mime_type="audio/webm",
                                    data=audio_bytes,
                                )
                            ),
                            types.Part(text=ANALYSIS_PROMPT),
                        ]
                    )
                ],
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    max_output_tokens=500,
                ),
            )

            # Parse the JSON response
            text = response.text.strip()
            # Handle markdown code blocks if present
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                text = text.rsplit("```", 1)[0]
            text = text.strip()

            result = json.loads(text)

            # Validate and clamp values
            return {
                "transcript": result.get("transcript", ""),
                "overall_sentiment": max(-1, min(1, float(result.get("overall_sentiment", 0)))),
                "contempt_level": max(0, min(1, float(result.get("contempt_level", 0)))),
                "hostility_level": max(0, min(1, float(result.get("hostility_level", 0)))),
                "positivity": max(0, min(1, float(result.get("positivity", 0)))),
            }

        except Exception as e:
            print(f"Gemini analysis error: {e}")
            return default_result
