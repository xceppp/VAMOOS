import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';

export interface PredictionCardProps {
  home: string;
  away: string;
  pick: string;
  confidence: number;
  href?: string;
  external?: boolean;
  risk?: 'green' | 'orange' | 'red';
}

export function PredictionCard({
  home,
  away,
  pick,
  confidence,
  href,
  external,
}: PredictionCardProps) {
  const { t } = useI18n();
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  const body = (
    <>
      <p className="pred-card__match">
        {home} vs {away}
      </p>
      <p className="pred-card__pick">{pick}</p>
      <div className="pred-card__bar" aria-hidden>
        <span className="pred-card__bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="pred-card__pct">
        {pct}% {t('predConfidence')}
      </p>
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
