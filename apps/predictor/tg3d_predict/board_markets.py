"""Board markets: 1X2, more goals, O2.5/O3.5, BTTS, live next scorer."""

from __future__ import annotations

import math
from typing import Any

from tg3d_predict.model import MatchPrediction, PredictorEngine


def _poisson_pmf(k: int, lam: float) -> float:
    if lam <= 0:
        return 1.0 if k == 0 else 0.0
    # stable enough for small k
    return math.exp(-lam + k * math.log(lam) - math.lgamma(k + 1))


def _remaining_fraction(minute: int | None, status: str | None) -> float:
    st = (status or "").upper()
    if st in {"HT"}:
        return 0.5
    if minute is None:
        return 1.0
    m = max(0, min(int(minute), 120))
    if st in {"ET"} or m > 90:
        # rough ET: treat 90–120 as second half of ET window
        return max(0.05, (120 - m) / 30.0) * 0.25  # small residual mass
    # regulation: leave a floor so late games still get a lean
    return max(0.08, (90 - m) / 90.0)


def parse_score(score: str | None) -> tuple[int, int] | None:
    if not score or not isinstance(score, str):
        return None
    parts = score.replace(":", "-").split("-")
    if len(parts) != 2:
        return None
    try:
        return int(parts[0].strip()), int(parts[1].strip())
    except ValueError:
        return None


def _live_residual_probs(
    lam_h: float,
    lam_a: float,
    hg: int,
    ag: int,
    rem_frac: float,
    max_extra: int = 8,
) -> dict[str, float]:
    """Condition final markets on current score + remaining Poisson goals."""
    rh = max(0.01, lam_h * rem_frac)
    ra = max(0.01, lam_a * rem_frac)

    p_home = p_draw = p_away = 0.0
    p_btts = p_o15 = p_o25 = p_o35 = 0.0
    p_next_h = rh / (rh + ra)
    p_any = 1.0 - math.exp(-(rh + ra))

    for i in range(max_extra + 1):
        pi = _poisson_pmf(i, rh)
        for j in range(max_extra + 1):
            p = pi * _poisson_pmf(j, ra)
            fh, fa = hg + i, ag + j
            total = fh + fa
            if fh > fa:
                p_home += p
            elif fh == fa:
                p_draw += p
            else:
                p_away += p
            if fh > 0 and fa > 0:
                p_btts += p
            if total >= 2:
                p_o15 += p
            if total >= 3:
                p_o25 += p
            if total >= 4:
                p_o35 += p

    s = p_home + p_draw + p_away
    if s > 0:
        p_home, p_draw, p_away = p_home / s, p_draw / s, p_away / s

    return {
        "p_home": p_home,
        "p_draw": p_draw,
        "p_away": p_away,
        "p_btts": p_btts,
        "p_over_15": p_o15,
        "p_over_25": p_o25,
        "p_over_35": p_o35,
        "rem_home": rh,
        "rem_away": ra,
        "p_next_home": p_next_h,
        "p_next_away": 1.0 - p_next_h,
        "p_any_goal": p_any,
    }


def _pick_side(home: float, draw: float, away: float) -> tuple[str, str, float]:
    if home >= draw and home >= away:
        return "home", "HOME WIN", home
    if away >= draw and away >= home:
        return "away", "AWAY WIN", away
    return "draw", "DRAW", draw


def _ou_pick_fixed(over: float, line: str) -> dict[str, Any]:
    under = max(0.0, 1.0 - over)
    if over >= under:
        return {"pick": f"OVER {line}", "side": "over", "prob": over, "over": over, "under": under}
    return {"pick": f"UNDER {line}", "side": "under", "prob": under, "over": over, "under": under}


def build_markets(
    pred: MatchPrediction,
    *,
    engine: PredictorEngine | None = None,
    score: str | None = None,
    minute: int | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    """Build board markets. Live rows condition on current score + minute."""
    home_name = pred.home
    away_name = pred.away
    scored = parse_score(score)
    st = (status or "").upper()
    is_live = scored is not None and (
        st in {"LIVE", "HT", "ET", "1H", "2H"} or minute is not None
    )

    p_home, p_draw, p_away = pred.p_home, pred.p_draw, pred.p_away
    p_btts = pred.p_btts
    p_o15, p_o25, p_o35 = pred.p_over_15, pred.p_over_25, pred.p_over_35
    rem_h = pred.lambda_home
    rem_a = pred.lambda_away
    next_goal = None

    if is_live and scored is not None:
        hg, ag = scored
        rem_frac = _remaining_fraction(minute, status)
        live = _live_residual_probs(pred.lambda_home, pred.lambda_away, hg, ag, rem_frac)
        p_home = live["p_home"]
        p_draw = live["p_draw"]
        p_away = live["p_away"]
        p_btts = live["p_btts"]
        p_o15 = live["p_over_15"]
        p_o25 = live["p_over_25"]
        p_o35 = live["p_over_35"]
        rem_h = live["rem_home"]
        rem_a = live["rem_away"]
        next_side = "home" if live["p_next_home"] >= live["p_next_away"] else "away"
        next_pick = home_name if next_side == "home" else away_name
        next_prob = live["p_next_home"] if next_side == "home" else live["p_next_away"]
        next_goal = {
            "pick": f"NEXT GOAL · {next_pick}",
            "side": next_side,
            "team": next_pick,
            "prob": round(next_prob, 4),
            "anyGoal": round(live["p_any_goal"], 4),
            "home": round(live["p_next_home"], 4),
            "away": round(live["p_next_away"], 4),
        }

    side, result_label, result_prob = _pick_side(p_home, p_draw, p_away)
    result = {
        "pick": result_label,
        "side": side,
        "prob": round(result_prob, 4),
        "home": round(p_home, 4),
        "draw": round(p_draw, 4),
        "away": round(p_away, 4),
    }

    # Who scores more (final) — same as 1X2 sides, but label as team / draw goals
    if side == "draw":
        more = {
            "pick": "EQUAL GOALS",
            "side": "draw",
            "team": None,
            "prob": round(p_draw, 4),
        }
    else:
        team = home_name if side == "home" else away_name
        more = {
            "pick": f"MORE GOALS · {team}",
            "side": side,
            "team": team,
            "prob": round(result_prob, 4),
        }

    over25 = _ou_pick_fixed(p_o25, "2.5")
    over35 = _ou_pick_fixed(p_o35, "3.5")
    over15 = _ou_pick_fixed(p_o15, "1.5")

    btts_yes = p_btts
    btts_no = 1.0 - p_btts
    if btts_yes >= btts_no:
        btts = {
            "pick": "BTTS YES",
            "side": "yes",
            "prob": round(btts_yes, 4),
            "yes": round(btts_yes, 4),
            "no": round(btts_no, 4),
        }
    else:
        btts = {
            "pick": "BTTS NO",
            "side": "no",
            "prob": round(btts_no, 4),
            "yes": round(btts_yes, 4),
            "no": round(btts_no, 4),
        }

    # Primary tip: strongest among *open* useful markets (never O0.5 / settled 100%s)
    def open_enough(prob: float) -> bool:
        return 0.02 < prob < 0.98

    candidates: list[tuple[str, float]] = []
    if open_enough(result["prob"]):
        candidates.append((result["pick"], result["prob"]))
    if open_enough(more["prob"]):
        candidates.append((more["pick"], more["prob"]))
    if open_enough(over25["prob"]):
        candidates.append((over25["pick"], over25["prob"]))
    if open_enough(over35["prob"]):
        candidates.append((over35["pick"], over35["prob"]))
    if open_enough(btts["prob"]):
        candidates.append((btts["pick"], btts["prob"]))
    if next_goal and next_goal["anyGoal"] >= 0.25 and open_enough(next_goal["prob"]):
        candidates.append((next_goal["pick"], next_goal["prob"]))

    if not candidates:
        candidates = [
            (result["pick"], result["prob"]),
            (over25["pick"], over25["prob"]),
            (btts["pick"], btts["prob"]),
        ]

    tip, tip_raw = max(candidates, key=lambda x: x[1])
    tip_prob = tip_raw
    if engine is not None:
        tip_prob = engine.calibrate_probability(tip_raw)

    return {
        "pick": tip,
        "confidence": round(tip_prob, 4),
        "confidenceRaw": round(tip_raw, 4),
        "markets": {
            "result": result,
            "moreGoals": more,
            "over15": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in over15.items()},
            "over25": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in over25.items()},
            "over35": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in over35.items()},
            "btts": btts,
            "nextGoal": next_goal,
        },
        "prob": {
            "home": round(p_home, 4),
            "draw": round(p_draw, 4),
            "away": round(p_away, 4),
            "over15": round(p_o15, 4),
            "over25": round(p_o25, 4),
            "over35": round(p_o35, 4),
            "btts": round(p_btts, 4),
        },
        "expectedRemaining": {
            "home": round(rem_h, 3),
            "away": round(rem_a, 3),
            "total": round(rem_h + rem_a, 3),
        },
    }
