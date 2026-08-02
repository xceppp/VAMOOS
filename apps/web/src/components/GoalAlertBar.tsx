import { useEffect, useState } from 'react';

export interface GoalAlertPayload {
  id: string;
  matchId: number;
  teams: string;
  newScore: string;
  scorer?: string;
  minute?: number | null;
  homeLogo?: string;
  awayLogo?: string;
  scorerSide?: 'home' | 'away';
}

interface GoalAlertBarProps {
  alert: GoalAlertPayload | null;
  onDismiss: () => void;
  onTap: (alert: GoalAlertPayload) => void;
}

async function hapticPulse() {
  try {
    const mod = await import('@capacitor/haptics');
    await mod.Haptics.impact({ style: mod.ImpactStyle.Medium });
  } catch {
    try {
      navigator.vibrate?.(40);
    } catch {
      /* web / unsupported */
    }
  }
}

export function GoalAlertBar({ alert, onDismiss, onTap }: GoalAlertBarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!alert) {
      setVisible(false);
      return;
    }
    const raf = requestAnimationFrame(() => setVisible(true));
    void hapticPulse();
    const hideAt = window.setTimeout(() => setVisible(false), 4500);
    const dismissAt = window.setTimeout(onDismiss, 4500 + 250);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(hideAt);
      window.clearTimeout(dismissAt);
    };
  }, [alert, onDismiss]);

  if (!alert) return null;

  const crest =
    alert.scorerSide === 'away'
      ? alert.awayLogo
      : alert.homeLogo || alert.awayLogo;

  const label =
    alert.scorer && alert.minute != null
      ? `${alert.scorer} ⚽ ${alert.minute}'`
      : alert.scorer
        ? `${alert.scorer} ⚽`
        : alert.teams;

  return (
    <div
      className={`goal-alert${visible ? ' goal-alert--in' : ''}`}
      role="status"
      onClick={() => onTap(alert)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap(alert);
        }
      }}
      tabIndex={0}
    >
      <div className="goal-alert__left">
        <span className="pulse-wrap" aria-hidden>
          <span className="pulse-ring" />
          <span className="pulse-dot" />
        </span>
        {crest ? (
          <img src={crest} alt="" className="goal-alert__crest" width={22} height={22} />
        ) : (
          <span className="goal-alert__crest goal-alert__crest--fallback" />
        )}
        <span className="goal-alert__text">{label}</span>
      </div>
      <span className="goal-alert__score">{alert.newScore}</span>
    </div>
  );
}
