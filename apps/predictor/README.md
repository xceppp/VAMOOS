# Match Predictor (Python, OFFLINE)

No API key. No internet. Pure stats on local league packs.

## Model

- Attack / defense ratings  
- Elo  
- Recent form  
- Poisson scorelines → 1X2, BTTS, Over/Under 2.5, most likely score

## Run

```bash
cd apps/predictor
python predict.py --league mls
python predict.py --league "Premier League"
python predict.py --league la_liga
python predict.py --list
```

### Single custom match

```bash
python predict.py --league mls --home "Inter Miami" --away "LAFC"
```

### JSON output

```bash
python predict.py --league bundesliga --json
```

## Available packs

`mls`, `premier_league`, `la_liga`, `serie_a`, `bundesliga`, `ligue_1`, `liga_mx`, `ucl`

Edit fixtures/ratings anytime in:

`apps/predictor/data/leagues/<pack>.json`

## Note

This is a statistical model for analysis — not betting advice.
