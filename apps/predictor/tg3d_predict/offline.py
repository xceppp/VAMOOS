"""Load offline league JSON packs and synthesize match history."""

from __future__ import annotations

import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .leagues import data_dir


def load_league_pack(slug: str) -> dict[str, Any]:
    path = data_dir() / f"{slug}.json"
    if not path.exists():
        available = [p.stem for p in data_dir().glob("*.json")]
        raise FileNotFoundError(
            f"No offline pack for '{slug}'. Found: {', '.join(available) or '(none)'}"
        )
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def _fixture_row(
    fid: int,
    when: datetime,
    home: dict[str, Any],
    away: dict[str, Any],
    score: tuple[int, int] | None,
    status: str,
    league_name: str,
) -> dict[str, Any]:
    return {
        "fixture": {
            "id": fid,
            "date": when.isoformat(),
            "status": {"short": status},
        },
        "league": {"name": league_name},
        "teams": {
            "home": {"id": home["id"], "name": home["name"]},
            "away": {"id": away["id"], "name": away["name"]},
        },
        "goals": {
            "home": None if score is None else score[0],
            "away": None if score is None else score[1],
        },
    }


def synthesize_history(
    teams: list[dict[str, Any]],
    league_name: str,
    games_per_team: int = 10,
    seed: int = 42,
) -> list[dict[str, Any]]:
    """Create finished matches from team attack/defense ratings (offline)."""
    rng = random.Random(seed)
    now = datetime.now(timezone.utc)
    history: list[dict[str, Any]] = []
    fid = 100000
    if len(teams) < 2:
        return history

    # round-robin style recent form
    for day_back in range(games_per_team * 2, 0, -1):
        i = day_back % len(teams)
        j = (day_back * 3 + 1) % len(teams)
        if i == j:
            j = (j + 1) % len(teams)
        home, away = teams[i], teams[j]
        # expected goals from ratings
        lam_h = 1.25 * home.get("attack", 1.0) * away.get("defense", 1.0) * 1.1
        lam_a = 1.10 * away.get("attack", 1.0) * home.get("defense", 1.0)
        hg = max(0, min(5, int(rng.gauss(lam_h, 0.85))))
        ag = max(0, min(5, int(rng.gauss(lam_a, 0.85))))
        when = now - timedelta(days=day_back, hours=rng.randint(0, 5))
        history.append(
            _fixture_row(fid, when, home, away, (hg, ag), "FT", league_name)
        )
        fid += 1
    return history


def pack_to_bundles(pack: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    league_name = pack.get("name") or "League"
    teams = pack.get("teams") or []
    by_id = {t["id"]: t for t in teams}
    by_name = {t["name"].lower(): t for t in teams}

    history = synthesize_history(teams, league_name, seed=pack.get("seed", 42))

    today: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc)
    for idx, fx in enumerate(pack.get("fixtures") or []):
        home = by_id.get(fx.get("home_id")) or by_name.get(str(fx.get("home", "")).lower())
        away = by_id.get(fx.get("away_id")) or by_name.get(str(fx.get("away", "")).lower())
        if not home or not away:
            continue
        kick = fx.get("kickoff")
        if kick:
            try:
                when = datetime.fromisoformat(kick.replace("Z", "+00:00"))
            except ValueError:
                when = now.replace(hour=19 + idx, minute=0, second=0, microsecond=0)
        else:
            when = now.replace(hour=18 + idx, minute=0, second=0, microsecond=0)
        today.append(
            _fixture_row(
                90000 + idx,
                when,
                home,
                away,
                None,
                "NS",
                league_name,
            )
        )

    return today, history


def parse_fixture(row: dict[str, Any]) -> dict[str, Any]:
    fixture = row.get("fixture") or {}
    teams = row.get("teams") or {}
    goals = row.get("goals") or {}
    return {
        "id": fixture.get("id"),
        "date": fixture.get("date"),
        "status": (fixture.get("status") or {}).get("short"),
        "home_id": (teams.get("home") or {}).get("id"),
        "home": (teams.get("home") or {}).get("name"),
        "away_id": (teams.get("away") or {}).get("id"),
        "away": (teams.get("away") or {}).get("name"),
        "home_goals": goals.get("home"),
        "away_goals": goals.get("away"),
    }


def custom_match_rows(
    home_name: str,
    away_name: str,
    pack: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Build a one-off match using pack ratings when names match, else neutral."""
    league_name = (pack or {}).get("name") or "Custom"
    teams = list((pack or {}).get("teams") or [])
    by_name = {t["name"].lower(): t for t in teams}

    def ensure(name: str, tid: int) -> dict[str, Any]:
        hit = by_name.get(name.lower())
        if hit:
            return hit
        # neutral custom club
        team = {
            "id": tid,
            "name": name,
            "attack": 1.0,
            "defense": 1.0,
            "elo": 1500,
        }
        teams.append(team)
        return team

    home = ensure(home_name, 1)
    away = ensure(away_name, 2)
    history = synthesize_history(teams, league_name, seed=7)
    now = datetime.now(timezone.utc)
    today = [_fixture_row(1, now, home, away, None, "NS", league_name)]
    return today, history
