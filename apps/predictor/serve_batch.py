#!/usr/bin/env python3
"""
Batch Dixon-Coles / Elo predictions for the VAMOOS server.
Reads JSON from stdin, writes JSON to stdout.

Input:
  {
    "matches": [
      { "id": "…", "home": "…", "away": "…", "league": "…", "kickoff": "…" }
    ]
  }

Output:
  {
    "model": "dixon-coles-elo",
    "results": [ { …prediction… } ],
    "skipped": [ { "id", "reason" } ]
  }
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from tg3d_predict.board_markets import build_markets
from tg3d_predict.leagues import LEAGUE_ALIASES, resolve_league
from tg3d_predict.model import LeagueCalibration, PredictorEngine
from tg3d_predict.offline import load_confidence_curve, load_league_pack, pack_to_bundles
from tg3d_predict.report import goals_potential_label, high_goals_score


def norm_name(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"\b(fc|cf|sc|afc|united|city|club)\b", " ", s)
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s


def resolve_slug(league: str) -> str | None:
    raw = (league or "").strip()
    if not raw:
        return None
    # Feed often uses "England - Premier League" / "Premier League"
    parts = re.split(r"\s*[-–|/]\s*", raw)
    candidates = [raw, parts[-1] if parts else raw, parts[0] if parts else raw]
    for c in candidates:
        try:
            slug, _ = resolve_league(c)
            return slug
        except ValueError:
            key = c.strip().lower().replace("-", " ").replace("_", " ")
            for alias, slug in LEAGUE_ALIASES.items():
                if alias in key or key in alias:
                    return slug
    return None


def find_team(name: str, teams: list[dict]) -> dict | None:
    n = norm_name(name)
    if not n:
        return None
    by_exact = {norm_name(t["name"]): t for t in teams}
    if n in by_exact:
        return by_exact[n]
    # substring / containment
    best = None
    best_len = 0
    for t in teams:
        tn = norm_name(t["name"])
        if not tn:
            continue
        if n in tn or tn in n:
            score = min(len(n), len(tn))
            if score > best_len:
                best = t
                best_len = score
    return best


def predict_batch(payload: dict) -> dict:
    matches = payload.get("matches") or []
    by_slug: dict[str, list[dict]] = {}
    skipped: list[dict] = []

    for m in matches:
        mid = str(m.get("id") or "")
        home = str(m.get("home") or "").strip()
        away = str(m.get("away") or "").strip()
        league = str(m.get("league") or "").strip()
        if not mid or not home or not away:
            skipped.append({"id": mid, "reason": "missing fields"})
            continue
        slug = resolve_slug(league)
        if not slug:
            skipped.append({"id": mid, "reason": f"no league pack for '{league}'"})
            continue
        by_slug.setdefault(slug, []).append(m)

    results: list[dict] = []
    next_synth = 90_000

    for slug, group in by_slug.items():
        try:
            pack = load_league_pack(slug)
        except FileNotFoundError:
            for m in group:
                skipped.append({"id": str(m.get("id")), "reason": f"pack missing: {slug}"})
            continue

        cal = LeagueCalibration.from_pack(pack)
        _, history = pack_to_bundles(pack)
        engine = PredictorEngine(calibration=cal)
        engine.fit(history, standings=None)
        engine.apply_pack_team_meta(pack)
        curve = load_confidence_curve(slug)
        if curve:
            engine.set_confidence_curve(curve)

        teams = list(pack.get("teams") or [])

        for m in group:
            home_name = str(m["home"])
            away_name = str(m["away"])
            home = find_team(home_name, teams)
            away = find_team(away_name, teams)
            matched = bool(home and away)

            if not home:
                home = {
                    "id": next_synth,
                    "name": home_name,
                    "attack": 1.0,
                    "defense": 1.0,
                    "elo": 1500,
                }
                next_synth += 1
            if not away:
                away = {
                    "id": next_synth,
                    "name": away_name,
                    "attack": 1.0,
                    "defense": 1.0,
                    "elo": 1500,
                }
                next_synth += 1

            pred = engine.predict_match(
                home_id=int(home["id"]),
                away_id=int(away["id"]),
                home_name=home_name,
                away_name=away_name,
                kickoff=m.get("kickoff"),
            )
            board = build_markets(
                pred,
                engine=engine,
                score=m.get("score"),
                minute=m.get("minute"),
                status=m.get("status"),
            )
            heat = high_goals_score(pred)
            results.append(
                {
                    "id": str(m.get("id")),
                    "liveId": m.get("liveId"),
                    "league": m.get("league") or pack.get("name") or slug,
                    "slug": slug,
                    "home": pred.home,
                    "away": pred.away,
                    "homeLogo": m.get("homeLogo"),
                    "awayLogo": m.get("awayLogo"),
                    "kickoff": pred.kickoff,
                    "status": m.get("status"),
                    "minute": m.get("minute"),
                    "score": m.get("score"),
                    "matchedTeams": matched,
                    "pick": board["pick"],
                    "confidence": board["confidence"],
                    "confidenceRaw": board["confidenceRaw"],
                    "mostLikelyScore": pred.most_likely_score,
                    "potential": goals_potential_label(pred),
                    "heat": round(heat, 4),
                    "expectedGoals": {
                        "home": round(pred.lambda_home, 3),
                        "away": round(pred.lambda_away, 3),
                        "total": round(pred.total_xg, 3),
                    },
                    "expectedRemaining": board.get("expectedRemaining"),
                    "prob": board["prob"],
                    "markets": board["markets"],
                    "model": "dixon-coles-elo",
                }
            )

    results.sort(key=lambda r: (r.get("heat") or 0, r.get("confidence") or 0), reverse=True)
    return {
        "model": "dixon-coles-elo",
        "results": results,
        "skipped": skipped,
    }


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as err:
        print(json.dumps({"error": f"invalid json: {err}"}))
        return 1
    try:
        out = predict_batch(payload if isinstance(payload, dict) else {})
    except Exception as err:  # noqa: BLE001
        print(json.dumps({"error": str(err)}))
        return 1
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
