"""Offline league packs — no network / no API."""

from __future__ import annotations

from pathlib import Path

LEAGUE_ALIASES: dict[str, str] = {
    "mls": "mls",
    "major league soccer": "mls",
    "premier league": "premier_league",
    "epl": "premier_league",
    "pl": "premier_league",
    "la liga": "la_liga",
    "laliga": "la_liga",
    "spain": "la_liga",
    "serie a": "serie_a",
    "italy": "serie_a",
    "bundesliga": "bundesliga",
    "germany": "bundesliga",
    "ligue 1": "ligue_1",
    "france": "ligue_1",
    "liga mx": "liga_mx",
    "mexico": "liga_mx",
    "ucl": "ucl",
    "champions league": "ucl",
}


def data_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "leagues"


def resolve_league(query: str) -> tuple[str, str]:
    """Return (slug, display_name)."""
    key = query.strip().lower().replace("-", " ").replace("_", " ")
    # allow slug style premier_league
    slug_key = query.strip().lower().replace("-", "_").replace(" ", "_")
    if slug_key in {v for v in LEAGUE_ALIASES.values()}:
        slug = slug_key
    elif key in LEAGUE_ALIASES:
        slug = LEAGUE_ALIASES[key]
    else:
        for alias, s in LEAGUE_ALIASES.items():
            if key in alias or alias in key:
                slug = s
                break
        else:
            available = ", ".join(sorted(set(LEAGUE_ALIASES.values())))
            raise ValueError(
                f"Unknown league '{query}'. Available packs: {available}"
            )

    display = {
        "mls": "Major League Soccer",
        "premier_league": "Premier League",
        "la_liga": "La Liga",
        "serie_a": "Serie A",
        "bundesliga": "Bundesliga",
        "ligue_1": "Ligue 1",
        "liga_mx": "Liga MX",
        "ucl": "UEFA Champions League",
    }.get(slug, slug.replace("_", " ").title())
    return slug, display


def list_leagues() -> list[str]:
    return sorted(set(LEAGUE_ALIASES.values()))
