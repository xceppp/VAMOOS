#!/usr/bin/env python3
"""
VAMOOS Match Predictor (OFFLINE — no API)
Default: higher goals + BTTS/BUTS potential table.

Examples:
  python predict.py --league mls
  python predict.py --league mls --mode high
  python predict.py --league mls --mode confidence --min-confidence 0.58
  python predict.py --list
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from tg3d_predict.leagues import list_leagues, resolve_league
from tg3d_predict.model import LeagueCalibration, PredictorEngine
from tg3d_predict.offline import (
    custom_match_rows,
    load_confidence_curve,
    load_league_pack,
    pack_to_bundles,
    parse_fixture,
)
from tg3d_predict.report import (
    goals_potential_label,
    high_goals_score,
    render_confidence_report,
    render_high_goals_report,
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Offline goals/buts predictions (calibrated)",
    )
    p.add_argument("--league", "-l", default="mls", help="League pack name")
    p.add_argument("--home", help="Custom home team")
    p.add_argument("--away", help="Custom away team")
    p.add_argument("--date", "-d", default=None, help="Label date YYYY-MM-DD")
    p.add_argument(
        "--mode",
        choices=("high", "confidence", "sure"),
        default="high",
        help="high = goals/BTTS heat; confidence = calibrated high-confidence filter "
        "(legacy alias: sure)",
    )
    p.add_argument(
        "--min-confidence",
        "--sure",
        dest="min_confidence",
        type=float,
        default=0.58,
        help="Min calibrated probability for --mode confidence (default 0.58; "
        "legacy --sure maps here; 0.99 is intentionally not the default)",
    )
    p.add_argument("--json", action="store_true", help="Print JSON")
    p.add_argument("--list", action="store_true", help="List league packs")
    return p.parse_args()


def main() -> int:
    args = parse_args()

    if args.list:
        print("Available offline league packs:")
        for slug in list_leagues():
            print(f"  - {slug}")
        return 0

    day = date.fromisoformat(args.date) if args.date else datetime.now(timezone.utc).date()

    try:
        slug, league_name = resolve_league(args.league)
    except ValueError as err:
        print(err, file=sys.stderr)
        return 2

    try:
        pack = load_league_pack(slug)
    except FileNotFoundError as err:
        print(err, file=sys.stderr)
        return 2

    league_name = pack.get("name") or league_name
    mode_key = "confidence" if args.mode in ("confidence", "sure") else "high"

    if args.home and args.away:
        today_rows, history_rows = custom_match_rows(args.home, args.away, pack)
        league_name = f"{league_name} (custom match)"
    elif args.home or args.away:
        print("Provide both --home and --away for a custom match.", file=sys.stderr)
        return 2
    else:
        today_rows, history_rows = pack_to_bundles(pack)

    cal = LeagueCalibration.from_pack(pack)
    engine = PredictorEngine(calibration=cal)
    engine.fit(history_rows, standings=None)
    engine.apply_pack_team_meta(pack)
    curve = load_confidence_curve(slug)
    if curve:
        engine.set_confidence_curve(curve)

    all_preds = []
    for row in today_rows:
        fx = parse_fixture(row)
        if fx["home_id"] is None or fx["away_id"] is None:
            continue
        all_preds.append(
            engine.predict_match(
                home_id=int(fx["home_id"]),
                away_id=int(fx["away_id"]),
                home_name=str(fx["home"]),
                away_name=str(fx["away"]),
                kickoff=fx.get("date"),
            )
        )

    mode = f"offline-{mode_key}"

    if mode_key == "high":
        ranked = sorted(all_preds, key=high_goals_score, reverse=True)
        if args.json:
            payload = {
                "league": league_name,
                "slug": slug,
                "date": day.isoformat(),
                "mode": mode,
                "focus": "higher_goals_and_btts_buts",
                "calibration": {
                    "rho": cal.rho,
                    "parity": cal.parity,
                    "scoring_variance": cal.scoring_variance,
                    "max_displayed_confidence": cal.max_displayed_confidence,
                },
                "matches": [
                    {
                        "home": p.home,
                        "away": p.away,
                        "kickoff": p.kickoff,
                        "expected_goals": {
                            "home": round(p.lambda_home, 3),
                            "away": round(p.lambda_away, 3),
                            "total": round(p.total_xg, 3),
                        },
                        "prob": {
                            "home": round(p.p_home, 4),
                            "draw": round(p.p_draw, 4),
                            "away": round(p.p_away, 4),
                            "over_15": round(p.p_over_15, 4),
                            "over_25": round(p.p_over_25, 4),
                            "over_35": round(p.p_over_35, 4),
                            "btts_buts": round(p.p_btts, 4),
                        },
                        "most_likely_score": p.most_likely_score,
                        "potential": goals_potential_label(p),
                        "heat": round(high_goals_score(p), 4),
                    }
                    for p in ranked
                ],
            }
            print(json.dumps(payload, indent=2))
        else:
            report = render_high_goals_report(league_name, day.isoformat(), ranked, mode)
            try:
                print(report)
            except UnicodeEncodeError:
                print(report.encode("ascii", errors="replace").decode("ascii"))
        return 0

    # confidence analysis (formerly "sure" mode)
    all_preds.sort(key=lambda p: p.tip_prob, reverse=True)
    threshold = float(args.min_confidence)
    # Never honor absurd near-certainty thresholds as if they were skillful
    if threshold > cal.max_displayed_confidence:
        threshold = cal.max_displayed_confidence
    high_conf = [p for p in all_preds if p.tip_prob + 1e-12 >= threshold]
    near = [p for p in all_preds if p not in high_conf]

    if args.json:
        payload = {
            "league": league_name,
            "slug": slug,
            "date": day.isoformat(),
            "mode": mode,
            "focus": "calibrated_high_confidence",
            "threshold": threshold,
            "max_displayed_confidence": cal.max_displayed_confidence,
            "matches": [
                {
                    "home": p.home,
                    "away": p.away,
                    "high_confidence_pick": p.tip,
                    "probability_raw": round(p.tip_prob_raw, 6),
                    "probability": round(p.tip_prob, 6),
                    "most_likely_score": p.most_likely_score,
                }
                for p in high_conf
            ],
            "near_misses": [
                {
                    "home": p.home,
                    "away": p.away,
                    "high_confidence_pick": p.tip,
                    "probability_raw": round(p.tip_prob_raw, 6),
                    "probability": round(p.tip_prob, 6),
                }
                for p in near[:5]
            ],
        }
        print(json.dumps(payload, indent=2))
    else:
        report = render_confidence_report(
            league_name,
            day.isoformat(),
            high_conf,
            mode,
            threshold=threshold,
            near_misses=near if not high_conf else None,
            max_displayed=cal.max_displayed_confidence,
        )
        try:
            print(report)
        except UnicodeEncodeError:
            print(report.encode("ascii", errors="replace").decode("ascii"))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
