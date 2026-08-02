"""Statistical match prediction: Elo + attack/defense ratings + Poisson scorelines."""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any


def poisson_pmf(k: int, lam: float) -> float:
    if lam <= 0:
        return 1.0 if k == 0 else 0.0
    return math.exp(-lam) * (lam**k) / math.factorial(k)


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


@dataclass
class TeamStrength:
    team_id: int
    name: str
    attack: float = 1.0
    defense: float = 1.0
    elo: float = 1500.0
    played: int = 0
    gf: float = 0.0
    ga: float = 0.0
    points: float = 0.0
    form: list[float] = field(default_factory=list)  # recent match expected points-ish


@dataclass
class MatchPrediction:
    home: str
    away: str
    home_id: int
    away_id: int
    kickoff: str | None
    lambda_home: float
    lambda_away: float
    p_home: float
    p_draw: float
    p_away: float
    p_btts: float
    p_over_05: float
    p_under_05: float
    p_over_15: float
    p_under_15: float
    p_over_25: float
    p_under_25: float
    p_over_35: float
    p_under_35: float
    total_xg: float
    most_likely_score: str
    top_scores: list[tuple[str, float]]
    confidence: float
    tip: str
    tip_prob: float
    rationale: list[str]


class PredictorEngine:
    """
    Builds team attack/defense from finished matches, blends Elo,
    then predicts 1X2 / BTTS / O-U via independent Poisson.
    """

    def __init__(
        self,
        home_advantage: float = 1.12,
        max_goals: int = 8,
        form_games: int = 6,
    ) -> None:
        self.home_advantage = home_advantage
        self.max_goals = max_goals
        self.form_games = form_games
        self.teams: dict[int, TeamStrength] = {}
        self.league_avg_home = 1.35
        self.league_avg_away = 1.15

    def _team(self, team_id: int, name: str) -> TeamStrength:
        if team_id not in self.teams:
            self.teams[team_id] = TeamStrength(team_id=team_id, name=name)
        else:
            self.teams[team_id].name = name or self.teams[team_id].name
        return self.teams[team_id]

    def fit(self, finished: list[dict[str, Any]], standings: list[dict[str, Any]] | None = None) -> None:
        home_goals: list[int] = []
        away_goals: list[int] = []
        scored_for: dict[int, list[int]] = defaultdict(list)
        conceded: dict[int, list[int]] = defaultdict(list)
        elo: dict[int, float] = defaultdict(lambda: 1500.0)
        names: dict[int, str] = {}

        # chronological if possible
        rows = sorted(
            finished,
            key=lambda r: (r.get("fixture") or {}).get("date") or "",
        )

        for row in rows:
            teams = row.get("teams") or {}
            goals = row.get("goals") or {}
            hid = (teams.get("home") or {}).get("id")
            aid = (teams.get("away") or {}).get("id")
            hg = goals.get("home")
            ag = goals.get("away")
            if hid is None or aid is None or hg is None or ag is None:
                continue
            hname = (teams.get("home") or {}).get("name") or str(hid)
            aname = (teams.get("away") or {}).get("name") or str(aid)
            names[hid] = hname
            names[aid] = aname
            hg, ag = int(hg), int(ag)
            home_goals.append(hg)
            away_goals.append(ag)
            scored_for[hid].append(hg)
            scored_for[aid].append(ag)
            conceded[hid].append(ag)
            conceded[aid].append(hg)

            # Elo update
            eh, ea = elo[hid], elo[aid]
            exp_h = 1.0 / (1.0 + 10 ** ((ea - eh - 60) / 400))
            if hg > ag:
                score_h = 1.0
            elif hg == ag:
                score_h = 0.5
            else:
                score_h = 0.0
            k = 20
            elo[hid] = eh + k * (score_h - exp_h)
            elo[aid] = ea + k * ((1.0 - score_h) - (1.0 - exp_h))

        if home_goals:
            self.league_avg_home = sum(home_goals) / len(home_goals)
            self.league_avg_away = sum(away_goals) / len(away_goals)
        else:
            self.league_avg_home, self.league_avg_away = 1.35, 1.15

        league_avg = max(0.6, (self.league_avg_home + self.league_avg_away) / 2)

        # optional standings seed
        standing_pts: dict[int, float] = {}
        if standings:
            for row in standings:
                tid = (row.get("team") or {}).get("id")
                if tid is None:
                    continue
                names[tid] = (row.get("team") or {}).get("name") or names.get(tid, str(tid))
                standing_pts[tid] = float((row.get("points") or 0))
                all_stats = row.get("all") or {}
                gf = float((all_stats.get("goals") or {}).get("for") or 0)
                ga = float((all_stats.get("goals") or {}).get("against") or 0)
                played = float(all_stats.get("played") or 0) or 1.0
                scored_for.setdefault(tid, [gf / played] * int(played))
                conceded.setdefault(tid, [ga / played] * int(played))

        team_ids = set(names) | set(scored_for) | set(conceded) | set(standing_pts)
        for tid in team_ids:
            name = names.get(tid, str(tid))
            t = self._team(tid, name)
            gf_list = scored_for.get(tid) or [league_avg]
            ga_list = conceded.get(tid) or [league_avg]
            # recent form weight
            recent_gf = gf_list[-self.form_games :]
            recent_ga = ga_list[-self.form_games :]
            att = (sum(recent_gf) / len(recent_gf)) / league_avg
            deff = (sum(recent_ga) / len(recent_ga)) / league_avg
            # shrink to mean when small sample
            n = len(recent_gf)
            shrink = n / (n + 4.0)
            t.attack = clamp(1.0 + shrink * (att - 1.0), 0.45, 2.2)
            t.defense = clamp(1.0 + shrink * (deff - 1.0), 0.45, 2.2)
            t.elo = elo.get(tid, 1500.0)
            if tid in standing_pts:
                # mild Elo bump from table position proxy
                t.elo += clamp((standing_pts[tid] - 20) * 2.5, -80, 120)
            t.played = len(gf_list)
            t.gf = sum(gf_list)
            t.ga = sum(ga_list)

            # form: last results approximated from goal diffs in recent games
            form_vals: list[float] = []
            for i in range(1, min(self.form_games, len(gf_list)) + 1):
                diff = gf_list[-i] - ga_list[-i]
                if diff > 0:
                    form_vals.append(1.0)
                elif diff == 0:
                    form_vals.append(0.5)
                else:
                    form_vals.append(0.0)
            t.form = form_vals

    def _expected_goals(self, home_id: int, away_id: int) -> tuple[float, float, list[str]]:
        home = self.teams.get(home_id) or TeamStrength(home_id, str(home_id))
        away = self.teams.get(away_id) or TeamStrength(away_id, str(away_id))
        rationale: list[str] = []

        # base poisson lambdas
        lam_h = self.league_avg_home * home.attack * away.defense * self.home_advantage
        lam_a = self.league_avg_away * away.attack * home.defense

        # Elo blend
        elo_diff = home.elo - away.elo
        elo_factor = clamp(1.0 + elo_diff / 800.0, 0.75, 1.35)
        lam_h *= elo_factor
        lam_a *= 2.0 - elo_factor
        rationale.append(f"Elo edge: {home.name} {home.elo:.0f} vs {away.name} {away.elo:.0f}")

        # form blend (last games win-rate)
        hf = sum(home.form) / len(home.form) if home.form else 0.5
        af = sum(away.form) / len(away.form) if away.form else 0.5
        form_delta = hf - af
        lam_h *= clamp(1.0 + 0.12 * form_delta, 0.85, 1.18)
        lam_a *= clamp(1.0 - 0.12 * form_delta, 0.85, 1.18)
        rationale.append(f"Recent form index H {hf:.2f} / A {af:.2f}")
        rationale.append(
            f"Attack/Defense - {home.name}: att {home.attack:.2f} def {home.defense:.2f}; "
            f"{away.name}: att {away.attack:.2f} def {away.defense:.2f}"
        )

        lam_h = clamp(lam_h, 0.35, 4.2)
        lam_a = clamp(lam_a, 0.25, 3.8)
        return lam_h, lam_a, rationale

    def predict_match(
        self,
        home_id: int,
        away_id: int,
        home_name: str,
        away_name: str,
        kickoff: str | None = None,
    ) -> MatchPrediction:
        self._team(home_id, home_name)
        self._team(away_id, away_name)
        lam_h, lam_a, rationale = self._expected_goals(home_id, away_id)

        p_home = p_draw = p_away = 0.0
        p_btts = p_over15 = p_over25 = p_over35 = 0.0
        score_probs: list[tuple[str, float]] = []

        for i in range(self.max_goals + 1):
            pi = poisson_pmf(i, lam_h)
            for j in range(self.max_goals + 1):
                pj = poisson_pmf(j, lam_a)
                p = pi * pj
                total_goals = i + j
                if i > j:
                    p_home += p
                elif i == j:
                    p_draw += p
                else:
                    p_away += p
                if i > 0 and j > 0:
                    p_btts += p
                if total_goals >= 2:
                    p_over15 += p
                if total_goals >= 3:
                    p_over25 += p
                if total_goals >= 4:
                    p_over35 += p
                score_probs.append((f"{i}-{j}", p))

        total = p_home + p_draw + p_away
        if total > 0:
            p_home, p_draw, p_away = p_home / total, p_draw / total, p_away / total

        score_probs.sort(key=lambda x: x[1], reverse=True)
        top = score_probs[:5]
        best_score, best_p = top[0]

        # Goals-only tip (no 1X2). Pick the single strongest market.
        p_00 = poisson_pmf(0, lam_h) * poisson_pmf(0, lam_a)
        p_over05 = 1.0 - p_00
        p_under05 = p_00
        p_under15 = 1.0 - p_over15
        p_under25 = 1.0 - p_over25
        p_under35 = 1.0 - p_over35

        markets = [
            ("GOAL IN MATCH (O0.5)", p_over05),
            ("OVER 1.5", p_over15),
            ("UNDER 1.5", p_under15),
            ("OVER 2.5", p_over25),
            ("UNDER 2.5", p_under25),
            ("OVER 3.5", p_over35),
            ("UNDER 3.5", p_under35),
            ("BTTS YES", p_btts),
            ("BTTS NO", 1.0 - p_btts),
        ]
        tip, tip_prob = max(markets, key=lambda m: m[1])
        confidence = tip_prob

        rationale.append(f"Expected goals xG: {home_name} {lam_h:.2f} - {away_name} {lam_a:.2f}")
        rationale.append(f"Total xG {lam_h + lam_a:.2f}")
        rationale.append(f"Most likely score {best_score} ({best_p * 100:.1f}%)")
        rationale.append(f"Strongest goals market: {tip} @ {tip_prob * 100:.1f}%")

        return MatchPrediction(
            home=home_name,
            away=away_name,
            home_id=home_id,
            away_id=away_id,
            kickoff=kickoff,
            lambda_home=lam_h,
            lambda_away=lam_a,
            p_home=p_home,
            p_draw=p_draw,
            p_away=p_away,
            p_btts=p_btts,
            p_over_05=p_over05,
            p_under_05=p_under05,
            p_over_15=p_over15,
            p_under_15=p_under15,
            p_over_25=p_over25,
            p_under_25=p_under25,
            p_over_35=p_over35,
            p_under_35=p_under35,
            total_xg=lam_h + lam_a,
            most_likely_score=best_score,
            top_scores=top,
            confidence=confidence,
            tip=tip,
            tip_prob=tip_prob,
            rationale=rationale,
        )
