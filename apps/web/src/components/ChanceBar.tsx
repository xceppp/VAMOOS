import { useI18n } from '../i18n/I18nProvider';

export interface ChanceBarProps {
  home: number;
  draw: number;
  away: number;
  /** Compact row used in match lists */
  compact?: boolean;
  /** Decimal odds for bookmaker margin line */
  odds?: { home: number | null; draw: number | null; away: number | null } | null;
  className?: string;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function pctLabel(n: number): string {
  return `${Math.round(clamp01(n) * 100)}%`;
}

/** Display-time margin from decimal odds already on the match. */
export function bookmakerMarginPct(odds: {
  home: number | null;
  draw: number | null;
  away: number | null;
}): number | null {
  const vals = [odds.home, odds.draw, odds.away].filter(
    (v): v is number => v != null && Number.isFinite(v) && v > 1,
  );
  if (vals.length < 3) return null;
  const implied = vals.reduce((sum, o) => sum + 1 / o, 0) * 100;
  if (!Number.isFinite(implied) || implied <= 0) return null;
  return implied;
}

/** Normalize decimal odds into 1X2 probabilities when model probs are absent. */
export function probsFromOdds(odds: {
  home: number | null;
  draw: number | null;
  away: number | null;
}): { home: number; draw: number; away: number } | null {
  const h = odds.home;
  const d = odds.draw;
  const a = odds.away;
  if (h == null || d == null || a == null || h <= 1 || d <= 1 || a <= 1) return null;
  const ih = 1 / h;
  const id = 1 / d;
  const ia = 1 / a;
  const sum = ih + id + ia;
  if (sum <= 0) return null;
  return { home: ih / sum, draw: id / sum, away: ia / sum };
}

export function ChanceBar({
  home,
  draw,
  away,
  compact = false,
  odds,
  className = '',
}: ChanceBarProps) {
  const { t } = useI18n();
  const h = clamp01(home);
  const d = clamp01(draw);
  const a = clamp01(away);
  const total = h + d + a || 1;
  const hp = h / total;
  const dp = d / total;
  const ap = a / total;

  const margin = odds ? bookmakerMarginPct(odds) : null;

  return (
    <div className={`chance-bar${compact ? ' chance-bar--compact' : ''} ${className}`.trim()}>
      {!compact ? (
        <p className="chance-bar__caveat">{t('chanceCaveat')}</p>
      ) : null}
      <div
        className="chance-bar__track"
        role="img"
        aria-label={t('chanceAria', {
          home: pctLabel(hp),
          draw: pctLabel(dp),
          away: pctLabel(ap),
        })}
      >
        <div className="chance-bar__seg chance-bar__seg--home" style={{ flexGrow: hp, flexBasis: 0 }}>
          <span className="num chance-bar__pct">{pctLabel(hp)}</span>
          {!compact ? <span className="chance-bar__label">{t('chanceHome')}</span> : null}
        </div>
        <div className="chance-bar__seg chance-bar__seg--draw" style={{ flexGrow: dp, flexBasis: 0 }}>
          <span className="num chance-bar__pct">{pctLabel(dp)}</span>
          {!compact ? <span className="chance-bar__label">{t('chanceDraw')}</span> : null}
        </div>
        <div className="chance-bar__seg chance-bar__seg--away" style={{ flexGrow: ap, flexBasis: 0 }}>
          <span className="num chance-bar__pct">{pctLabel(ap)}</span>
          {!compact ? <span className="chance-bar__label">{t('chanceAway')}</span> : null}
        </div>
      </div>
      {compact ? (
        <div className="chance-bar__captions" aria-hidden>
          <span>{t('chanceHome')}</span>
          <span>{t('chanceDraw')}</span>
          <span>{t('chanceAway')}</span>
        </div>
      ) : null}
      {margin != null ? (
        <p className="chance-bar__margin">
          {t('chanceMargin', {
            total: margin.toFixed(1),
            over: Math.max(0, margin - 100).toFixed(1),
          })}
        </p>
      ) : null}
    </div>
  );
}
