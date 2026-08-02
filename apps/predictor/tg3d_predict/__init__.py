"""TG3D football match probability predictor (offline)."""

from .leagues import list_leagues, resolve_league
from .model import MatchPrediction, PredictorEngine

__all__ = ["list_leagues", "resolve_league", "MatchPrediction", "PredictorEngine"]
