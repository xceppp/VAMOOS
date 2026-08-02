import { Link } from 'react-router-dom';

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
  risk = 'orange',
}: PredictionCardProps) {
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  const body = (
    <>
      <div className="pred-card__match">
        {home} <span className="pred-card__vs">vs</span> {away}
      </div>
      <div className="pred-card__pick">{pick}</div>
      <div className="pred-card__bar" aria-hidden>
        <span className="pred-card__bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className={`pred-card__pct pred-card__pct--${risk}`}>{pct}%</div>
    </>
  );

  if (!href) {
    return <article className={`pred-card pred-card--${risk}`}>{body}</article>;
  }

  if (external) {
    return (
      <a className={`pred-card pred-card--${risk}`} href={href} target="_blank" rel="noreferrer">
        {body}
      </a>
    );
  }

  return (
    <Link className={`pred-card pred-card--${risk}`} to={href}>
      {body}
    </Link>
  );
}
