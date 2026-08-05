import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import type { DixonMarkets } from '../lib/pageCache';
import { ChanceBar } from './ChanceBar';

export interface PredictionCardProps {
  home: string;
  away: string;
  homeLogo?: string;
  awayLogo?: string;
  league?: string;
  pick: string;
  confidence: number;
  scoreline?: string;
  meta?: string;
  markets?: DixonMarkets | null;
  probs?: { home: number; draw: number; away: number } | null;
  href?: string;
  external?: boolean;
  risk?: 'green' | 'orange' | 'red';
}

function pct(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

function cleanPick(raw: string): string {
  return raw
    .replace(/^MORE GOALS ·\s*/i, '')
    .replace(/^OVER\/UNDER\s*/i, '')
    .replace(/^BTTS ·\s*/i, '')
    .replace(/^1X2 ·\s*/i, '')
    .trim();
}

function Crest({ logo, name }: { logo?: string; name: string }) {
  const [broken, setBroken] = useState(false);
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase() || '?';

  if (logo && !broken) {
    return (
      <img
        src={logo}
        alt=""
        className="pred-crest"
        width={36}
        height={36}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
      />
    );
  }
  return <span className="pred-crest pred-crest--fallback num">{initials}</span>;
}

function BetRow({
  market,
  pick,
  prob,
  highlight,
}: {
  market: string;
  pick: string;
  prob: string;
  highlight?: boolean;
}) {
  return (
    <li className={`bet-row${highlight ? ' bet-row--on' : ''}`}>
      <span className="bet-row__market">{market}</span>
      <span className="bet-row__pick">{pick}</span>
      <span className="bet-row__prob num">{prob}</span>
    </li>
  );
}

export function PredictionCard({
  home,
  away,
  homeLogo,
  awayLogo,
  league,
  pick,
  confidence,
  scoreline,
  meta,
  markets,
  probs,
  href,
  external,
  risk,
}: PredictionCardProps) {
  const { t } = useI18n();
  const confPct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  const riskLabel =
    risk === 'green' ? t('riskBet') : risk === 'orange' ? t('riskMaybe') : risk === 'red' ? t('riskSkip') : null;

  const resultRows: Array<{ key: string; market: string; pick: string; prob: string; on?: boolean }> = [];
  const goalsRows: typeof resultRows = [];
  const otherRows: typeof resultRows = [];

  if (markets) {
    resultRows.push({
      key: 'result',
      market: t('predMktResult'),
      pick: cleanPick(markets.result.pick),
      prob: pct(markets.result.prob),
      on: true,
    });
    goalsRows.push({
      key: 'o25',
      market: t('predMktOver25'),
      pick: cleanPick(markets.over25.pick),
      prob: pct(markets.over25.prob),
    });
    goalsRows.push({
      key: 'o35',
      market: t('predMktOver35'),
      pick: cleanPick(markets.over35.pick),
      prob: pct(markets.over35.prob),
    });
    goalsRows.push({
      key: 'more',
      market: t('predMktMoreGoals'),
      pick: cleanPick(markets.moreGoals.pick),
      prob: pct(markets.moreGoals.prob),
    });
    otherRows.push({
      key: 'btts',
      market: t('predMktBtts'),
      pick: cleanPick(markets.btts.pick),
      prob: pct(markets.btts.prob),
    });
    if (markets.nextGoal) {
      otherRows.push({
        key: 'next',
        market: t('predMktNextGoal'),
        pick: markets.nextGoal.team || cleanPick(markets.nextGoal.pick),
        prob: pct(markets.nextGoal.prob),
      });
    }
  }

  const body = (
    <>
      <header className="pred-card__header">
        <div className="pred-card__teams">
          <div className="pred-card__club pred-card__club--home">
            <Crest logo={homeLogo} name={home} />
            <span className="pred-card__team-name">{home}</span>
          </div>
          <div className="pred-card__mid">
            <span className="pred-card__vs num">{meta || 'vs'}</span>
            {league ? <span className="pred-card__league-line">{league}</span> : null}
          </div>
          <div className="pred-card__club pred-card__club--away">
            <span className="pred-card__team-name">{away}</span>
            <Crest logo={awayLogo} name={away} />
          </div>
        </div>
      </header>

      <div className={`pred-tip pred-tip--${risk ?? 'orange'}`}>
        <span className="pred-tip__eyebrow">{t('predMainTip')}</span>
        <p className="pred-tip__pick">{cleanPick(pick)}</p>
        <p className="pred-tip__meta num">
          {confPct}% {t('predConfidence')}
          {riskLabel ? ` · ${riskLabel}` : ''}
          {scoreline ? ` · ${t('predLikelyScore', { s: scoreline })}` : ''}
        </p>
        <div className="pred-card__bar" aria-hidden>
          <span className="pred-card__bar-fill" style={{ width: `${confPct}%` }} />
        </div>
      </div>

      <div className="pred-bets">
        <h3 className="pred-bets__title">{t('predBetOnTitle')}</h3>

        {probs ? (
          <section className="pred-bet-group" aria-label={t('predBetGroupResult')}>
            <p className="pred-bet-group__label">{t('predBetGroupResult')}</p>
            <ChanceBar home={probs.home} draw={probs.draw} away={probs.away} />
            {resultRows.length > 0 ? (
              <ul className="bet-list">
                {resultRows.map((r) => (
                  <BetRow key={r.key} market={r.market} pick={r.pick} prob={r.prob} highlight={r.on} />
                ))}
              </ul>
            ) : null}
          </section>
        ) : resultRows.length > 0 ? (
          <section className="pred-bet-group" aria-label={t('predBetGroupResult')}>
            <p className="pred-bet-group__label">{t('predBetGroupResult')}</p>
            <ul className="bet-list">
              {resultRows.map((r) => (
                <BetRow key={r.key} market={r.market} pick={r.pick} prob={r.prob} highlight={r.on} />
              ))}
            </ul>
          </section>
        ) : null}

        {goalsRows.length > 0 ? (
          <section className="pred-bet-group" aria-label={t('predBetGroupGoals')}>
            <p className="pred-bet-group__label">{t('predBetGroupGoals')}</p>
            <ul className="bet-list">
              {goalsRows.map((r) => (
                <BetRow key={r.key} market={r.market} pick={r.pick} prob={r.prob} />
              ))}
            </ul>
          </section>
        ) : null}

        {otherRows.length > 0 ? (
          <section className="pred-bet-group" aria-label={t('predBetGroupOther')}>
            <p className="pred-bet-group__label">{t('predBetGroupOther')}</p>
            <ul className="bet-list">
              {otherRows.map((r) => (
                <BetRow key={r.key} market={r.market} pick={r.pick} prob={r.prob} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <p className="chance-bar__caveat">{t('chanceCaveat')}</p>
    </>
  );

  if (!href) {
    return <article className="pred-card pred-card--tips">{body}</article>;
  }

  if (external) {
    return (
      <a className="pred-card pred-card--tips" href={href} target="_blank" rel="noreferrer">
        {body}
      </a>
    );
  }

  return (
    <Link className="pred-card pred-card--tips" to={href}>
      {body}
    </Link>
  );
}
