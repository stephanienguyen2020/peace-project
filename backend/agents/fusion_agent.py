"""Fusion/Scoring Agent

Combines Hume prosody scores and Gemini script analysis
into a single composite sentiment score with temporal smoothing.
"""

from dataclasses import dataclass, field
from collections import deque


CONTEMPT_THRESHOLD = 0.5
TONE_WEIGHT = 0.6
SCRIPT_WEIGHT = 0.4
SMOOTHING_WINDOW = 5  # Number of recent scores to average


@dataclass
class FusionResult:
    final_score: float  # -1 (negative) to 1 (positive)
    contempt_flag: bool
    emotions: dict
    transcript: str
    timestamp: str = ""

    def to_dict(self) -> dict:
        return {
            "final_score": round(self.final_score, 3),
            "contempt_flag": self.contempt_flag,
            "emotions": {k: round(v, 3) for k, v in self.emotions.items()},
            "transcript": self.transcript,
            "timestamp": self.timestamp,
        }


class FusionAgent:
    def __init__(self):
        self.score_history: deque = deque(maxlen=SMOOTHING_WINDOW)

    def fuse(self, hume_scores: dict, gemini_result: dict, timestamp: str = "") -> FusionResult:
        """Combine Hume prosody and Gemini analysis into a single score.

        Args:
            hume_scores: Emotion dict from HumeAgent (values 0-1)
            gemini_result: Dict from GeminiAgent with sentiment scores
            timestamp: Optional video timestamp

        Returns:
            FusionResult with composite score and metadata
        """
        # Convert Hume emotions to a tone score (-1 to 1)
        # Positive emotions push toward 1, negative toward -1
        positive_signals = hume_scores.get("joy", 0) + hume_scores.get("surprise", 0) * 0.3
        negative_signals = (
            hume_scores.get("contempt", 0)
            + hume_scores.get("anger", 0)
            + hume_scores.get("disgust", 0)
            + hume_scores.get("sadness", 0) * 0.5
            + hume_scores.get("fear", 0) * 0.5
        )

        # Normalize to -1..1 range
        tone_score = max(-1, min(1, positive_signals - negative_signals))

        # Get Gemini's overall sentiment (already -1 to 1)
        script_score = gemini_result.get("overall_sentiment", 0)

        # Weighted fusion
        raw_score = TONE_WEIGHT * tone_score + SCRIPT_WEIGHT * script_score

        # Temporal smoothing
        self.score_history.append(raw_score)
        smoothed_score = sum(self.score_history) / len(self.score_history)

        # Contempt detection: use both Hume prosody contempt and Gemini contempt
        hume_contempt = hume_scores.get("contempt", 0)
        gemini_contempt = gemini_result.get("contempt_level", 0)
        combined_contempt = 0.7 * hume_contempt + 0.3 * gemini_contempt
        contempt_flag = combined_contempt > CONTEMPT_THRESHOLD

        return FusionResult(
            final_score=smoothed_score,
            contempt_flag=contempt_flag,
            emotions=hume_scores,
            transcript=gemini_result.get("transcript", ""),
            timestamp=timestamp,
        )

    def reset(self):
        """Reset smoothing history for a new session."""
        self.score_history.clear()
