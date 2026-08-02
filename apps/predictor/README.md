# VAMOOS Match Predictor (Python, OFFLINE)

No API key. No internet. Calibrated stats on local league packs.

## Model

- Home/away split attack & defense ratings  
- Recency-weighted fit (exponential half-life)  
- Bayesian shrinkage for small samples  
- Margin-of-victory Elo  
- **Dixon-Coles** correction on low scorelines  
- Per-league calibration (`rho`, parity, variance)  
- Optional manual `availability_penalty` / `key_absences`  
- Displayed confidence capped by backtest-aware calibration  

Football is high-variance — treat near-99% “sure” labels as a bug, not a feature.

## Run predictions

```bash
cd apps/predictor
python predict.py --league mls
python predict.py --league "Premier League"
python predict.py --league mls --mode confidence --min-confidence 0.58
python predict.py --list
```

Legacy `--mode sure` still works (alias of `confidence`). Default threshold is **0.58**, not 0.99.

### Single custom match

```bash
python predict.py --league mls --home "Inter Miami" --away "LAFC"
```

### JSON

```bash
python predict.py --league bundesliga --json
```

## Backtest (measure calibration first)

```bash
python backtest.py --league mls
python backtest.py --league mls --label after-changes --save-curve --json
python backtest.py --league mls --disable-dixon-coles --label before-dc
```

Metrics: **Brier**, **log loss**, **1X2 accuracy**, confidence **calibration tables**.  
`--save-curve` writes `data/calibration/<slug>.json` for display capping in `predict.py`.

## League pack schema (extras)

```json
{
  "calibration": {
    "rho": -0.10,
    "home_advantage": 1.12,
    "scoring_variance": 1.0,
    "parity": 1.0,
    "max_displayed_confidence": 0.72
  },
  "teams": [
    {
      "id": 1,
      "name": "Example FC",
      "attack": 1.2,
      "defense": 0.95,
      "attack_home": 1.26,
      "attack_away": 1.14,
      "defense_home": 0.91,
      "defense_away": 0.99,
      "elo": 1550,
      "availability_penalty": 0.0,
      "key_absences": []
    }
  ]
}
```

Edit packs in `apps/predictor/data/leagues/<pack>.json`.

## Available packs

`mls`, `premier_league`, `la_liga`, `serie_a`, `bundesliga`, `ligue_1`, `liga_mx`, `ucl`

## Note

Statistical analysis only — not betting advice.
