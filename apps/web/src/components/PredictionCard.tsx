import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import type { DixonMarkets } from '../lib/pageCache';

export interface PredictionCardProps {
  home: string;
  away: string;
  pick: string;
  confidence: number;
  scoreline?: string;
  meta?: string;
  markets?: DixonMarkets | null;
  href?: string;
  external?: boolean;
  risk?: 'green' | 'orange' | 'red';
}

function pct(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

export function PredictionCard({
  home,
  away,
  pick,
  confidence,
  scoreline,
  meta,
  markets,
  href,
  external,
  risk,
}: PredictionCardProps) {
  const { t } = useI18n();
  const confPct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  const riskLabel =
    risk === 'green' ? t('riskBet') : risk === 'orange' ? t('riskMaybe') : risk === 'red' ? t('riskSkip') : null;

  const rows: Array<{ key: string; label: string; value: string; sub?: string }> = [];
  if (markets) {
    rows.push({
      key: 'result',
      label: t('predMktResult'),
      value: markets.result.pick,
      sub: pct(markets.result.prob),
    });
    rows.push({
      key: 'more',
      label: t('predMktMoreGoals'),
      value: markets.moreGoals.pick.replace(/^MORE GOALS ·\s*/i, ''),
      sub: pct(markets.moreGoals.prob),
    });
    rows.push({
      key: 'o25',
      label: t('predMktOver25'),
      value: markets.over25.pick,
      sub: pct(markets.over25.prob),
    });
    rows.push({
      key: 'o35',
      label: t('predMktOver35'),
      value: markets.over35.pick,
      sub: pct(markets.over35.prob),
    });
    rows.push({
      key: 'btts',
      label: t('predMktBtts'),
      value: markets.btts.pick,
      sub: pct(markets.btts.prob),
    });
    if (markets.nextGoal) {
      rows.push({
        key: 'next',
        label: t('predMktNextGoal'),
        value: markets.nextGoal.team || markets.nextGoal.pick,
        sub: `${pct(markets.nextGoal.prob)} · ${t('predMktAnyGoal', {
          n: Math.round((markets.nextGoal.anyGoal ?? 0) * 100),
        })}`,
      });
    }
  }

  const body = (
    <>
      <div className="pred-card__face">
        <span className="pred-card__team pred-card__team--home">{home}</span>
        <span className="pred-card__vs num">–</span>
        <span className="pred-card__team pred-card__team--away">{away}</span>
      </div>
      {meta ? <p className="pred-card__meta">{meta}</p> : null}
      <p className="pred-card__pick">{pick}</p>
      {scoreline ? <p className="pred-card__scoreline">{t('predLikelyScore', { s: scoreline })}</p> : null}

      {rows.length > 0 ? (
        <ul className="pred-card__markets" aria-label={t('predMarketsAria')}>
          {rows.map((r) => (
            <li key={r.key} className="pred-card__market">
              <span className="pred-card__market-label">{r.label}</span>
              <span className="pred-card__market-value">{r.value}</span>
              <span className="pred-card__market-prob num">{r.sub}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="pred-card__footer">
        <div className="pred-card__bar" aria-hidden>
          <span className="pred-card__bar-fill" style={{ width: `${confPct}%` }} />
        </div>
        <p className="pred-card__pct num">
          {confPct}% {t('predConfidence')}
          {riskLabel ? (
            <span className={`pred-card__risk pred-card__risk--${risk ?? 'orange'}`}> · {riskLabel}</span>
          ) : null}
        </p>
        <p className="chance-bar__caveat">{t('chanceCaveat')}</p>
      </div>
    </>
  );

  if (!href) {
    return <article className="pred-card">{body}</article>;
  }

  if (external) {
    return (
      <a className="pred-card" href={href} target="_blank" rel="noreferrer">
        {body}
      </a>
    );
  }

  return (
    <Link className="pred-card" to={href}>
      {body}
    </Link>
  );
}
