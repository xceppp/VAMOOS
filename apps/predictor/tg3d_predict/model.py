"""Statistical match prediction with calibrated Poisson / Dixon-Coles scorelines."""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


def poisson_pmf(k: int, lam: float) -> float:
    if lam <= 0:
        return 1.0 if k == 0 else 0.0
    return math.exp(-lam) * (lam**k) / math.factorial(k)


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def parse_match_date(row: dict[str, Any]) -> datetime | None:
    raw = (row.get("fixture") or {}).get("date")
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None


def dixon_coles_tau(i: int, j: int, lam_h: float, lam_a: float, rho: float) -> float:
    """Dixon-Coles correlation factor for low scorelines (0-0, 1-0, 0-1, 1-1)."""
    if i == 0 and j == 0:
        return 1.0 - lam_h * lam_a * rho
    if i == 0 and j == 1:
        return 1.0 + lam_h * rho
    if i == 1 and j == 0:
        return 1.0 + lam_a * rho
    if i == 1 and j == 1:
        return 1.0 - rho
    return 1.0


def mov_elo_multiplier(goal_diff: int) -> float:
    """Margin-of-victory multiplier for Elo updates (club-Elo style)."""
    gd = abs(int(goal_diff))
    if gd <= 1:
        return 1.0
    if gd == 2:
        return 1.5
    # log taper for blowouts
    return clamp((11.0 + gd) / 8.0, 1.5, 2.75)


@dataclass
class LeagueCalibration:
    """Per-league scoring / parity knobs."""

    rho: float = -0.10
    home_advantage: float = 1.12
    scoring_variance: float = 1.0
    parity: float = 1.0  # >1 = more parity (shrink edges); <1 = more top-heavy
    max_displayed_confidence: float = 0.72

    @classmethod
    def from_pack(cls, pack: dict[str, Any] | None) -> "LeagueCalibration":
        cfg = (pack or {}).get("calibration") or {}
        return cls(
            rho=float(cfg.get("rho", -0.10)),
            home_advantage=float(cfg.get("home_advantage", 1.12)),
            scoring_variance=float(cfg.get("scoring_variance", 1.0)),
            parity=float(cfg.get("parity", 1.0)),
            max_displayed_confidence=float(cfg.get("max_displayed_confidence", 0.72)),
        )


@dataclass
class TeamStrength:
    team_id: int
    name: str
    attack: float = 1.0
    defense: float = 1.0
    attack_home: float = 1.0
    attack_away: float = 1.0
    defense_home: float = 1.0
    defense_away: float = 1.0
    elo: float = 1500.0
    played: int = 0
    gf: float = 0.0
    ga: float = 0.0
    points: float = 0.0
    form: list[float] = field(default_factory=list)
    availability_penalty: float = 0.0
    key_absences: list[str] = field(default_factory=list)


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
    tip_prob_raw: float
    rationale: list[str]


class PredictorEngine:
    """
    Team home/away attack-defense + MOV Elo + recency-weighted fit,
    Dixon-Coles Poisson scorelines, Bayesian shrinkage, availability nudges.
    """

    def __init__(
        self,
        home_advantage: float = 1.12,
        max_goals: int = 8,
        form_games: int = 6,
        rho: float = -0.10,
        half_life_matches: float = 12.0,
        prior_strength: float = 6.0,
        scoring_variance: float = 1.0,
        parity: float = 1.0,
        max_displayed_confidence: float = 0.72,
        calibration: LeagueCalibration | None = None,
    ) -> None:
        cal = calibration or LeagueCalibration(
            rho=rho,
            home_advantage=home_advantage,
            scoring_variance=scoring_variance,
            parity=parity,
            max_displayed_confidence=max_displayed_confidence,
        )
        self.calibration = cal
        self.home_advantage = cal.home_advantage
        self.max_goals = max_goals
        self.form_games = form_games
        self.rho = cal.rho
        self.half_life_matches = half_life_matches
        self.prior_strength = prior_strength
        self.scoring_variance = cal.scoring_variance
        self.parity = cal.parity
        self.max_displayed_confidence = cal.max_displayed_confidence
        self.teams: dict[int, TeamStrength] = {}
        self.league_avg_home = 1.35
        self.league_avg_away = 1.15
        # Empirical calibration curve from backtest: raw_bucket_mid -> actual hit rate
        self.confidence_curve: dict[float, float] = {}

    def apply_calibration(self, cal: LeagueCalibration) -> None:
        self.calibration = cal
        self.home_advantage = cal.home_advantage
        self.rho = cal.rho
        self.scoring_variance = cal.scoring_variance
        self.parity = cal.parity
        self.max_displayed_confidence = cal.max_displayed_confidence

    def set_confidence_curve(self, curve: dict[float, float]) -> None:
        self.confidence_curve = dict(curve)

    def calibrate_probability(self, raw: float) -> float:
        """Map raw model prob to a displayable, backtest-aware confidence."""
        raw = clamp(raw, 0.0, 0.999)
        # Soft-shrink overconfidence first (football is noisy)
        shrunk = 0.5 + (raw - 0.5) * 0.82
        capped = min(shrunk, self.max_displayed_confidence)

        if self.confidence_curve:
            keys = sorted(k for k, v in self.confidence_curve.items() if v is not None and v > 0.05)
            if keys:
                if raw <= keys[0]:
                    emp = self.confidence_curve[keys[0]]
                elif raw >= keys[-1]:
                    emp = self.confidence_curve[keys[-1]]
                else:
                    lo = max(k for k in keys if k <= raw)
                    hi = min(k for k in keys if k >= raw)
                    if hi == lo:
                        emp = self.confidence_curve[lo]
                    else:
                        t = (raw - lo) / (hi - lo)
                        emp = self.confidence_curve[lo] * (1 - t) + self.confidence_curve[hi] * t
                # Pull toward empirical rate, never erase a strong market to ~0
                if emp is not None and emp > 0.05:
                    capped = min(capped, max(emp, 0.50), self.max_displayed_confidence)

        return clamp(capped, 0.0, self.max_displayed_confidence)

    def _team(self, team_id: int, name: str) -> TeamStrength:
        if team_id not in self.teams:
            self.teams[team_id] = TeamStrength(team_id=team_id, name=name)
        else:
            self.teams[team_id].name = name or self.teams[team_id].name
        return self.teams[team_id]

    def apply_pack_team_meta(self, pack: dict[str, Any]) -> None:
        """Blend pack priors + optional home/away splits + availability flags."""
        for t in pack.get("teams") or []:
            tid = int(t["id"])
            team = self._team(tid, t["name"])
            att = float(t.get("attack", 1.0))
            deff = float(t.get("defense", 1.0))
            team.attack = 0.55 * team.attack + 0.45 * att
            team.defense = 0.55 * team.defense + 0.45 * deff
            team.attack_home = 0.55 * team.attack_home + 0.45 * float(t.get("attack_home", att * 1.05))
            team.attack_away = 0.55 * team.attack_away + 0.45 * float(t.get("attack_away", att * 0.95))
            team.defense_home = 0.55 * team.defense_home + 0.45 * float(t.get("defense_home", deff * 0.95))
            team.defense_away = 0.55 * team.defense_away + 0.45 * float(t.get("defense_away", deff * 1.05))
            if "elo" in t:
                team.elo = 0.55 * team.elo + 0.45 * float(t["elo"])
            team.availability_penalty = clamp(float(t.get("availability_penalty", 0.0)), 0.0, 1.0)
            absences = t.get("key_absences") or []
            team.key_absences = [str(x) for x in absences] if isinstance(absences, list) else []

    def fit(
        self,
        finished: list[dict[str, Any]],
        standings: list[dict[str, Any]] | None = None,
    ) -> None:
        home_goals: list[float] = []
        away_goals: list[float] = []
        home_w: list[float] = []
        away_w: list[float] = []

        # Per-team weighted samples: (goals_for, goals_against, is_home, weight)
        samples: dict[int, list[tuple[float, float, bool, float]]] = defaultdict(list)
        elo: dict[int, float] = defaultdict(lambda: 1500.0)
        names: dict[int, str] = {}

        rows = sorted(
            finished,
            key=lambda r: (r.get("fixture") or {}).get("date") or "",
        )
        n_rows = len(rows)
        decay = math.log(2) / max(self.half_life_matches, 1.0)

        for idx, row in enumerate(rows):
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
            names[int(hid)] = hname
            names[int(aid)] = aname
            hid, aid = int(hid), int(aid)
            hg, ag = int(hg), int(ag)

            # Recency weight: last match ≈ 1.0, older decay by half-life in match count
            age = (n_rows - 1 - idx)
            w = math.exp(-decay * age)

            home_goals.append(hg)
            away_goals.append(ag)
            home_w.append(w)
            away_w.append(w)
            samples[hid].append((float(hg), float(ag), True, w))
            samples[aid].append((float(ag), float(hg), False, w))

            # MOV-adjusted Elo
            eh, ea = elo[hid], elo[aid]
            exp_h = 1.0 / (1.0 + 10 ** ((ea - eh - 60) / 400))
            if hg > ag:
                score_h = 1.0
            elif hg == ag:
                score_h = 0.5
            else:
                score_h = 0.0
            mov = mov_elo_multiplier(hg - ag)
            k = 20.0 * mov * (0.65 + 0.35 * w)
            elo[hid] = eh + k * (score_h - exp_h)
            elo[aid] = ea + k * ((1.0 - score_h) - (1.0 - exp_h))

        if home_goals and sum(home_w) > 0:
            self.league_avg_home = sum(g * w for g, w in zip(home_goals, home_w)) / sum(home_w)
            self.league_avg_away = sum(g * w for g, w in zip(away_goals, away_w)) / sum(away_w)
        else:
            self.league_avg_home, self.league_avg_away = 1.35, 1.15

        league_avg = max(0.55, (self.league_avg_home + self.league_avg_away) / 2)
        prior_att = 1.0
        prior_def = 1.0

        standing_pts: dict[int, float] = {}
        if standings:
            for row in standings:
                tid = (row.get("team") or {}).get("id")
                if tid is None:
                    continue
                tid = int(tid)
                names[tid] = (row.get("team") or {}).get("name") or names.get(tid, str(tid))
                standing_pts[tid] = float((row.get("points") or 0))

        team_ids = set(names) | set(samples) | set(standing_pts)
        for tid in team_ids:
            name = names.get(tid, str(tid))
            t = self._team(tid, name)
            samp = samples.get(tid) or []

            def shrink_rate(obs: float, n_eff: float, prior: float = 1.0) -> float:
                # Bayesian shrinkage toward league-average prior
                alpha = self.prior_strength
                return (n_eff * obs + alpha * prior) / (n_eff + alpha)

            # Overall
            if samp:
                w_sum = sum(x[3] for x in samp)
                gf = sum(x[0] * x[3] for x in samp) / w_sum
                ga = sum(x[1] * x[3] for x in samp) / w_sum
                n_eff = w_sum
            else:
                gf = ga = league_avg
                n_eff = 0.0

            att = shrink_rate(gf / league_avg, n_eff, prior_att)
            deff = shrink_rate(ga / league_avg, n_eff, prior_def)
            t.attack = clamp(att, 0.45, 2.2)
            t.defense = clamp(deff, 0.45, 2.2)

            # Home split
            home_s = [x for x in samp if x[2]]
            away_s = [x for x in samp if not x[2]]
            if home_s:
                hw = sum(x[3] for x in home_s)
                hgf = sum(x[0] * x[3] for x in home_s) / hw
                hga = sum(x[1] * x[3] for x in home_s) / hw
                t.attack_home = clamp(
                    shrink_rate(hgf / max(self.league_avg_home, 0.4), hw, prior_att),
                    0.45,
                    2.3,
                )
                t.defense_home = clamp(
                    shrink_rate(hga / max(self.league_avg_away, 0.35), hw, prior_def),
                    0.45,
                    2.3,
                )
            else:
                t.attack_home = clamp(t.attack * 1.04, 0.45, 2.3)
                t.defense_home = clamp(t.defense * 0.97, 0.45, 2.3)

            if away_s:
                aw = sum(x[3] for x in away_s)
                agf = sum(x[0] * x[3] for x in away_s) / aw
                aga = sum(x[1] * x[3] for x in away_s) / aw
                t.attack_away = clamp(
                    shrink_rate(agf / max(self.league_avg_away, 0.35), aw, prior_att),
                    0.45,
                    2.3,
                )
                t.defense_away = clamp(
                    shrink_rate(aga / max(self.league_avg_home, 0.4), aw, prior_def),
                    0.45,
                    2.3,
                )
            else:
                t.attack_away = clamp(t.attack * 0.96, 0.45, 2.3)
                t.defense_away = clamp(t.defense * 1.03, 0.45, 2.3)

            t.elo = elo.get(tid, 1500.0)
            if tid in standing_pts:
                t.elo += clamp((standing_pts[tid] - 20) * 2.5, -80, 120)
            t.played = len(samp)
            t.gf = sum(x[0] for x in samp)
            t.ga = sum(x[1] for x in samp)

            form_vals: list[float] = []
            for gf_i, ga_i, _is_home, _w in reversed(samp[-self.form_games :]):
                diff = gf_i - ga_i
                if diff > 0:
                    form_vals.append(1.0)
                elif diff == 0:
                    form_vals.append(0.5)
                else:
                    form_vals.append(0.0)
            t.form = form_vals

    def _expected_goals(
        self,
        home_id: int,
        away_id: int,
    ) -> tuple[float, float, list[str]]:
        home = self.teams.get(home_id) or TeamStrength(home_id, str(home_id))
        away = self.teams.get(away_id) or TeamStrength(away_id, str(away_id))
        rationale: list[str] = []

        # Home/away split ratings
        lam_h = (
            self.league_avg_home
            * home.attack_home
            * away.defense_away
            * self.home_advantage
        )
        lam_a = self.league_avg_away * away.attack_away * home.defense_home

        # Parity: pull lambdas toward league means when parity high
        if self.parity != 1.0:
            pull = clamp(self.parity - 1.0, -0.35, 0.45)
            # parity>1 => more equal; blend toward league averages
            blend = clamp(pull, 0.0, 0.45)
            lam_h = lam_h * (1 - blend) + self.league_avg_home * self.home_advantage * blend
            lam_a = lam_a * (1 - blend) + self.league_avg_away * blend

        # Scoring variance: scale total goals without changing ratio much
        if self.scoring_variance != 1.0:
            mid = (lam_h + lam_a) / 2
            lam_h = mid + (lam_h - mid) * self.scoring_variance
            lam_a = mid + (lam_a - mid) * self.scoring_variance
            scale = clamp(self.scoring_variance, 0.75, 1.35)
            lam_h *= scale
            lam_a *= scale

        elo_diff = home.elo - away.elo
        # Parity also softens Elo edges
        elo_scale = 800.0 * clamp(self.parity, 0.75, 1.4)
        elo_factor = clamp(1.0 + elo_diff / elo_scale, 0.78, 1.28)
        lam_h *= elo_factor
        lam_a *= 2.0 - elo_factor
        rationale.append(f"Elo edge: {home.name} {home.elo:.0f} vs {away.name} {away.elo:.0f}")

        hf = sum(home.form) / len(home.form) if home.form else 0.5
        af = sum(away.form) / len(away.form) if away.form else 0.5
        form_delta = hf - af
        lam_h *= clamp(1.0 + 0.10 * form_delta, 0.88, 1.14)
        lam_a *= clamp(1.0 - 0.10 * form_delta, 0.88, 1.14)
        rationale.append(f"Recent form index H {hf:.2f} / A {af:.2f}")
        rationale.append(
            f"H/A ratings — {home.name}: attH {home.attack_home:.2f} defH {home.defense_home:.2f}; "
            f"{away.name}: attA {away.attack_away:.2f} defA {away.defense_away:.2f}"
        )

        # Manual availability penalty (optional pack field)
        for side, team, is_home in ((home, home, True), (away, away, False)):
            pen = clamp(team.availability_penalty, 0.0, 1.0)
            if team.key_absences and pen <= 0:
                # soft default if only labels provided
                pen = min(0.12 * len(team.key_absences), 0.35)
            if pen > 0:
                factor = 1.0 - 0.35 * pen
                if is_home:
                    lam_h *= factor
                    lam_a *= 1.0 + 0.08 * pen  # opponent gets a small boost
                else:
                    lam_a *= factor
                    lam_h *= 1.0 + 0.08 * pen
                label = ", ".join(team.key_absences) if team.key_absences else f"penalty {pen:.2f}"
                rationale.append(f"Availability ({team.name}): {label}")

        lam_h = clamp(lam_h, 0.30, 3.8)
        lam_a = clamp(lam_a, 0.22, 3.4)
        return lam_h, lam_a, rationale

    def scoreline_matrix(
        self,
        lam_h: float,
        lam_a: float,
    ) -> list[list[float]]:
        """Dixon-Coles adjusted joint scoreline probabilities (normalized)."""
        grid = [[0.0 for _ in range(self.max_goals + 1)] for _ in range(self.max_goals + 1)]
        total = 0.0
        for i in range(self.max_goals + 1):
            pi = poisson_pmf(i, lam_h)
            for j in range(self.max_goals + 1):
                pj = poisson_pmf(j, lam_a)
                tau = dixon_coles_tau(i, j, lam_h, lam_a, self.rho)
                p = max(0.0, pi * pj * tau)
                grid[i][j] = p
                total += p
        if total > 0:
            for i in range(self.max_goals + 1):
                for j in range(self.max_goals + 1):
                    grid[i][j] /= total
        return grid

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
        grid = self.scoreline_matrix(lam_h, lam_a)

        p_home = p_draw = p_away = 0.0
        p_btts = p_over15 = p_over25 = p_over35 = 0.0
        score_probs: list[tuple[str, float]] = []

        for i in range(self.max_goals + 1):
            for j in range(self.max_goals + 1):
                p = grid[i][j]
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

        p_00 = grid[0][0]
        p_over05 = 1.0 - p_00
        p_under05 = p_00
        p_under15 = 1.0 - p_over15
        p_under25 = 1.0 - p_over25
        p_under35 = 1.0 - p_over35

        # Goals / BTTS tip only (1X2 is exposed separately on the prediction object)
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
        tip, tip_prob_raw = max(markets, key=lambda m: m[1])
        tip_prob = self.calibrate_probability(tip_prob_raw)
        confidence = tip_prob

        rationale.append(f"Dixon-Coles rho={self.rho:.3f}")
        rationale.append(f"Expected goals xG: {home_name} {lam_h:.2f} - {away_name} {lam_a:.2f}")
        rationale.append(f"Total xG {lam_h + lam_a:.2f}")
        rationale.append(f"Most likely score {best_score} ({best_p * 100:.1f}%)")
        rationale.append(
            f"Strongest market: {tip} raw {tip_prob_raw * 100:.1f}% → "
            f"calibrated {tip_prob * 100:.1f}%"
        )

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
            tip_prob_raw=tip_prob_raw,
            rationale=rationale,
        )
