#!/usr/bin/env python3
"""
Walk-forward backtest for the offline predictor (no lookahead).

Examples:
  python backtest.py --league mls
  python backtest.py --league mls --json
  python backtest.py --league mls --label after-changes --save-curve
  python backtest.py --league mls --min-history 8 --json
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from tg3d_predict.leagues import list_leagues, resolve_league
from tg3d_predict.model import LeagueCalibration, PredictorEngine
from tg3d_predict.offline import load_league_pack, synthesize_history


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Walk-forward calibration backtest")
    p.add_argument("--league", "-l", default="mls")
    p.add_argument("--list", action="store_true")
    p.add_argument("--json", action="store_true")
    p.add_argument(
        "--label",
        default="current",
        help="Tag for comparison runs (e.g. before-changes / after-changes)",
    )
    p.add_argument(
        "--min-history",
        type=int,
        default=10,
        help="Minimum finished matches before first scored prediction",
    )
    p.add_argument(
        "--games-per-team",
        type=int,
        default=14,
        help="Synthetic history depth when pack has no history_rows",
    )
    p.add_argument(
        "--save-curve",
        action="store_true",
        help="Write empirical confidence curve to data/calibration/<slug>.json",
    )
    p.add_argument(
        "--disable-dixon-coles",
        action="store_true",
        help="Ablation: force rho=0",
    )
    return p.parse_args()


def outcome_1x2(hg: int, ag: int) -> str:
    if hg > ag:
        return "H"
    if hg < ag:
        return "A"
    return "D"


def brier_multiclass(probs: dict[str, float], actual: str) -> float:
    keys = ("H", "D", "A")
    s = 0.0
    for k in keys:
        y = 1.0 if k == actual else 0.0
        s += (probs.get(k, 0.0) - y) ** 2
    return s


def log_loss_multiclass(probs: dict[str, float], actual: str, eps: float = 1e-15) -> float:
    p = clamp01(probs.get(actual, 0.0), eps)
    return -math.log(p)


def clamp01(x: float, eps: float = 1e-15) -> float:
    return max(eps, min(1.0 - eps, x))


def history_from_pack(pack: dict[str, Any], games_per_team: int) -> list[dict[str, Any]]:
    if pack.get("history_rows"):
        return list(pack["history_rows"])
    teams = pack.get("teams") or []
    return synthesize_history(
        teams,
        pack.get("name") or "League",
        games_per_team=games_per_team,
        seed=int(pack.get("seed", 42)),
    )


def run_backtest(
    pack: dict[str, Any],
    *,
    min_history: int = 10,
    games_per_team: int = 14,
    disable_dixon_coles: bool = False,
) -> dict[str, Any]:
    cal = LeagueCalibration.from_pack(pack)
    if disable_dixon_coles:
        cal.rho = 0.0

    rows = sorted(
        history_from_pack(pack, games_per_team),
        key=lambda r: (r.get("fixture") or {}).get("date") or "",
    )

    scored: list[dict[str, Any]] = []
    brier_sum = 0.0
    logloss_sum = 0.0
    correct = 0
    # tip market calibration (for goals tips)
    tip_buckets: dict[str, list[int]] = defaultdict(list)
    # 1X2 max-prob calibration
    conf_buckets: dict[str, list[int]] = defaultdict(list)

    for i in range(min_history, len(rows)):
        past = rows[:i]
        row = rows[i]
        teams = row.get("teams") or {}
        goals = row.get("goals") or {}
        hid = (teams.get("home") or {}).get("id")
        aid = (teams.get("away") or {}).get("id")
        hg, ag = goals.get("home"), goals.get("away")
        if hid is None or aid is None or hg is None or ag is None:
            continue
        hid, aid = int(hid), int(aid)
        hg, ag = int(hg), int(ag)
        hname = (teams.get("home") or {}).get("name") or str(hid)
        aname = (teams.get("away") or {}).get("name") or str(aid)

        engine = PredictorEngine(calibration=cal)
        engine.fit(past)
        engine.apply_pack_team_meta(pack)
        pred = engine.predict_match(hid, aid, hname, aname, (row.get("fixture") or {}).get("date"))

        actual = outcome_1x2(hg, ag)
        probs = {"H": pred.p_home, "D": pred.p_draw, "A": pred.p_away}
        pick = max(probs, key=probs.get)
        hit = pick == actual
        correct += int(hit)
        brier_sum += brier_multiclass(probs, actual)
        logloss_sum += log_loss_multiclass(probs, actual)

        max_p = probs[pick]
        bucket = _bucket_label(max_p)
        conf_buckets[bucket].append(1 if hit else 0)

        # Tip market hit (goals / 1X2 tip string)
        tip_hit = _tip_hit(pred.tip, hg, ag, actual)
        tip_buckets[_bucket_label(pred.tip_prob_raw)].append(1 if tip_hit else 0)

        scored.append(
            {
                "home": hname,
                "away": aname,
                "score": f"{hg}-{ag}",
                "actual": actual,
                "pick": pick,
                "p_home": round(pred.p_home, 4),
                "p_draw": round(pred.p_draw, 4),
                "p_away": round(pred.p_away, 4),
                "tip": pred.tip,
                "tip_prob_raw": round(pred.tip_prob_raw, 4),
                "tip_prob": round(pred.tip_prob, 4),
            }
        )

    n = len(scored) or 1
    calibration_table = {
        bucket: {
            "n": len(hits),
            "predicted_mid": _bucket_mid(bucket),
            "actual_rate": (sum(hits) / len(hits)) if hits else None,
        }
        for bucket, hits in sorted(conf_buckets.items(), key=lambda kv: _bucket_mid(kv[0]))
    }
    tip_calibration_table = {
        bucket: {
            "n": len(hits),
            "predicted_mid": _bucket_mid(bucket),
            "actual_rate": (sum(hits) / len(hits)) if hits else None,
        }
        for bucket, hits in sorted(tip_buckets.items(), key=lambda kv: _bucket_mid(kv[0]))
    }

    # Tip-market curve drives displayed confidence in predict.py (not 1X2).
    tip_curve = {
        str(_bucket_mid(b)): round(v["actual_rate"], 4)
        for b, v in tip_calibration_table.items()
        if v["actual_rate"] is not None and v["n"] >= 3 and v["actual_rate"] > 0.05
    }
    curve_1x2 = {
        str(_bucket_mid(b)): round(v["actual_rate"], 4)
        for b, v in calibration_table.items()
        if v["actual_rate"] is not None and v["n"] >= 3
    }

    return {
        "league": pack.get("name"),
        "matches_scored": len(scored),
        "history_total": len(rows),
        "min_history": min_history,
        "rho": cal.rho,
        "brier": round(brier_sum / n, 5),
        "log_loss": round(logloss_sum / n, 5),
        "accuracy_1x2": round(correct / n, 5),
        "calibration_table_1x2": calibration_table,
        "calibration_table_tip": tip_calibration_table,
        "confidence_curve": tip_curve,
        "confidence_curve_1x2": curve_1x2,
        "sample": scored[:8],
    }


def _bucket_label(p: float) -> str:
    pct = int(math.floor(p * 100))
    lo = (pct // 5) * 5
    lo = max(35, min(95, lo))
    hi = lo + 5
    return f"{lo}-{hi}%"


def _bucket_mid(label: str) -> float:
    lo = int(label.split("-")[0])
    return (lo + 2.5) / 100.0


def _tip_hit(tip: str, hg: int, ag: int, actual: str) -> bool:
    total = hg + ag
    btts = hg > 0 and ag > 0
    t = tip.upper()
    if t.startswith("HOME"):
        return actual == "H"
    if t.startswith("AWAY"):
        return actual == "A"
    if t.startswith("DRAW"):
        return actual == "D"
    if "BTTS YES" in t:
        return btts
    if "BTTS NO" in t:
        return not btts
    if "O0.5" in t or "GOAL IN MATCH" in t:
        return total >= 1
    if "OVER 1.5" in t:
        return total >= 2
    if "UNDER 1.5" in t:
        return total <= 1
    if "OVER 2.5" in t:
        return total >= 3
    if "UNDER 2.5" in t:
        return total <= 2
    if "OVER 3.5" in t:
        return total >= 4
    if "UNDER 3.5" in t:
        return total <= 3
    return False


def render_text(report: dict[str, Any], label: str) -> str:
    lines = [
        "=" * 72,
        "VAMOOS PREDICTOR BACKTEST",
        f"Label  : {label}",
        f"League : {report.get('league')}",
        f"Scored : {report.get('matches_scored')} / history {report.get('history_total')}",
        f"Rho    : {report.get('rho')}",
        "=" * 72,
        "",
        f"Brier score (1X2) : {report.get('brier'):.4f}   (lower better)",
        f"Log loss (1X2)    : {report.get('log_loss'):.4f}   (lower better)",
        f"Accuracy (1X2)    : {report.get('accuracy_1x2') * 100:.1f}%",
        "",
        "Calibration table (1X2 max-prob buckets)",
        f"{'Bucket':<10} {'N':>5} {'Pred mid':>10} {'Actual':>10}",
        "-" * 40,
    ]
    for bucket, row in (report.get("calibration_table_1x2") or {}).items():
        actual = "—" if row["actual_rate"] is None else f"{row['actual_rate'] * 100:5.1f}%"
        lines.append(
            f"{bucket:<10} {row['n']:>5} {row['predicted_mid'] * 100:>9.1f}% {actual:>10}"
        )
    lines.extend(
        [
            "",
            "Well-calibrated ⇒ Actual ≈ Pred mid. Gaps = over/under confidence.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    if args.list:
        print("Available packs:")
        for slug in list_leagues():
            print(f"  - {slug}")
        return 0

    try:
        slug, _ = resolve_league(args.league)
        pack = load_league_pack(slug)
    except (ValueError, FileNotFoundError) as err:
        print(err, file=sys.stderr)
        return 2

    report = run_backtest(
        pack,
        min_history=args.min_history,
        games_per_team=args.games_per_team,
        disable_dixon_coles=args.disable_dixon_coles,
    )
    report["label"] = args.label
    report["slug"] = slug
    report["at"] = datetime.now(timezone.utc).isoformat()

    if args.save_curve and report.get("confidence_curve"):
        out_dir = Path(__file__).resolve().parent / "data" / "calibration"
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"{slug}.json"
        path.write_text(
            json.dumps(
                {
                    "slug": slug,
                    "label": args.label,
                    "curve": report["confidence_curve"],
                    "max_displayed_confidence": float(
                        (pack.get("calibration") or {}).get("max_displayed_confidence", 0.72)
                    ),
                    "metrics": {
                        "brier": report["brier"],
                        "log_loss": report["log_loss"],
                        "accuracy_1x2": report["accuracy_1x2"],
                    },
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        report["curve_path"] = str(path)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        text = render_text(report, args.label)
        try:
            print(text)
        except UnicodeEncodeError:
            print(text.encode("ascii", errors="replace").decode("ascii"))
        if report.get("curve_path"):
            print(f"Saved confidence curve -> {report['curve_path']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
