"""Goals / buts potential table (high scoring + BTTS)."""

from __future__ import annotations

from .model import MatchPrediction


def pct(x: float) -> str:
    return f"{x * 100:4.0f}%"


def _short(name: str, width: int = 16) -> str:
    name = name.strip()
    if len(name) <= width:
        return name.ljust(width)
    return (name[: width - 1] + ".").ljust(width)


def high_goals_score(p: MatchPrediction) -> float:
    """0..1 score for higher goals + BTTS (buts) potential."""
    return (
        0.30 * p.p_over_25
        + 0.20 * p.p_over_35
        + 0.15 * p.p_over_15
        + 0.30 * p.p_btts
        + 0.05 * min(p.total_xg / 4.0, 1.0)
    )


def goals_potential_label(p: MatchPrediction) -> str:
    bits: list[str] = []
    if p.p_over_35 >= 0.40:
        bits.append("HIGH O3.5")
    elif p.p_over_25 >= 0.55:
        bits.append("HIGH O2.5")
    elif p.p_over_25 >= 0.48:
        bits.append("O2.5 lean")
    else:
        bits.append("Low goals")

    if p.p_btts >= 0.58:
        bits.append("BTTS/BUTS strong")
    elif p.p_btts >= 0.50:
        bits.append("BTTS/BUTS ok")
    else:
        bits.append("BTTS weak")

    return " + ".join(bits)


def render_high_goals_table(predictions: list[MatchPrediction]) -> str:
    cols = [
        ("#", 3),
        ("MATCH", 35),
        ("xG H-A", 9),
        ("TOT", 5),
        ("O1.5", 5),
        ("O2.5", 5),
        ("O3.5", 5),
        ("BTTS", 5),
        ("SCORE", 7),
        ("POTENTIAL", 28),
        ("HEAT", 5),
    ]

    def fmt_row(values: list[str]) -> str:
        parts = []
        for val, (_, width) in zip(values, cols):
            parts.append(str(val)[:width].ljust(width))
        return " | ".join(parts)

    header = fmt_row([c[0] for c in cols])
    sep = "-+-".join("-" * c[1] for c in cols)
    rows = [header, sep]

    for i, p in enumerate(predictions, start=1):
        heat = high_goals_score(p)
        match = f"{_short(p.home, 16)} v {_short(p.away, 16)}".strip()
        rows.append(
            fmt_row(
                [
                    str(i),
                    match,
                    f"{p.lambda_home:.1f}-{p.lambda_away:.1f}",
                    f"{p.total_xg:.1f}",
                    pct(p.p_over_15),
                    pct(p.p_over_25),
                    pct(p.p_over_35),
                    pct(p.p_btts),
                    p.most_likely_score,
                    goals_potential_label(p),
                    pct(heat),
                ]
            )
        )
    return "\n".join(rows)


def render_high_goals_report(
    league_name: str,
    day: str,
    predictions: list[MatchPrediction],
    mode: str,
) -> str:
    ranked = sorted(predictions, key=high_goals_score, reverse=True)
    top = [p for p in ranked if high_goals_score(p) >= 0.48] or ranked[:3]

    lines = [
        "=" * 120,
        "TG3D HIGHER GOALS + BUTS (BTTS) POTENTIAL",
        "No winner picks. Focus = many goals + both teams to score.",
        f"League : {league_name}",
        f"Date   : {day}",
        f"Mode   : {mode}",
        "=" * 120,
        "",
        "FULL TABLE (hottest high-goals games first)",
        "",
        render_high_goals_table(ranked),
        "",
        "BEST POTENTIAL PICKS",
        "",
    ]

    for i, p in enumerate(top[:5], start=1):
        lines.append(
            f"{i}. {p.home} v {p.away}"
            f"  |  xG {p.lambda_home:.2f}-{p.lambda_away:.2f} (tot {p.total_xg:.2f})"
            f"  |  O2.5 {pct(p.p_over_25).strip()}  O3.5 {pct(p.p_over_35).strip()}"
            f"  |  BTTS/BUTS {pct(p.p_btts).strip()}"
            f"  |  {goals_potential_label(p)}"
            f"  |  heat {pct(high_goals_score(p)).strip()}"
        )

    lines.extend(
        [
            "",
            "Legend:",
            "  O1.5/O2.5/O3.5 = Over goals probability",
            "  BTTS / BUTS    = Both teams score (les deux equipes marquent)",
            "  HEAT           = combined higher-goals + buts potential score",
            "  SCORE          = most likely exact score",
        ]
    )
    return "\n".join(lines)


def render_sure_table(predictions: list[MatchPrediction], threshold: float) -> str:
    cols = [
        ("#", 3),
        ("MATCH", 39),
        ("xG", 9),
        ("TOT", 5),
        ("SURE PICK", 22),
        ("PROB", 7),
        ("SCORE", 7),
    ]

    def fmt_row(values: list[str]) -> str:
        parts = []
        for val, (_, width) in zip(values, cols):
            parts.append(str(val)[:width].ljust(width))
        return " | ".join(parts)

    header = fmt_row([c[0] for c in cols])
    sep = "-+-".join("-" * c[1] for c in cols)
    rows = [header, sep]

    for i, p in enumerate(predictions, start=1):
        match = f"{_short(p.home, 18)} v {_short(p.away, 18)}".strip()
        rows.append(
            fmt_row(
                [
                    str(i),
                    match,
                    f"{p.lambda_home:.1f}-{p.lambda_away:.1f}",
                    f"{p.total_xg:.1f}",
                    p.tip,
                    pct(p.tip_prob),
                    p.most_likely_score,
                ]
            )
        )
    if not predictions:
        rows.append(f"(no picks at >= {threshold * 100:.0f}% sure)")
    return "\n".join(rows)


def render_report(
    league_name: str,
    day: str,
    predictions: list[MatchPrediction],
    mode: str,
    threshold: float = 0.99,
    near_misses: list[MatchPrediction] | None = None,
) -> str:
    header = [
        "=" * 100,
        f"TG3D SURE GOALS ONLY  (>= {threshold * 100:.0f}% model probability)",
        "No winner / draw picks. Goals markets only.",
        f"League : {league_name}",
        f"Date   : {day}",
        f"Mode   : {mode}",
        "=" * 100,
        "",
        f"Sure picks: {len(predictions)}",
        "",
        render_sure_table(predictions, threshold),
    ]

    if not predictions and near_misses:
        header.extend(
            [
                "",
                "No 99% sure goals pick found.",
                "Closest (still NOT 99%):",
                "",
                render_sure_table(near_misses[:5], threshold),
            ]
        )

    header.append("")
    header.append("PROB = model probability for that single goals market (honest, not forced to 99).")
    return "\n".join(header)
