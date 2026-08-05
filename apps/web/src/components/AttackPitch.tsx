/**
 * Attack pressure pitch.
 *
 * Renders where the game is being played right now, derived from stat-counter
 * deltas — not from tracked ball coordinates. Labelled honestly as pressure so
 * it never claims to be something it isn't.
 *
 * Drop at: apps/web/src/components/AttackPitch.tsx
 */

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';

export interface MomentumFrame {
  at: number;
  x: number;
  heat: number;
  side: 'home' | 'away' | 'neutral';
  corner: 'home' | 'away' | null;
  shot: 'home' | 'away' | null;
}

interface Props {
  frame: MomentumFrame | null;
  /** Most recent frames, oldest first — drives the trail. */
  history?: MomentumFrame[];
  homeName: string;
  awayName: string;
  live: boolean;
}

const W = 320;
const H = 148;
const MARGIN = 10;

/** Map momentum x (-1 away .. +1 home) to an SVG x. Home attacks rightward. */
function toSvgX(x: number): number {
  const clamped = Math.max(-1, Math.min(1, x));
  const half = (W - MARGIN * 2) / 2;
  return MARGIN + half + clamped * half;
}

export default function AttackPitch({ frame, history = [], homeName, awayName, live }: Props) {
  const { t, dir } = useI18n();
  const [flash, setFlash] = useState<{ kind: 'corner' | 'shot'; side: 'home' | 'away' } | null>(
    null,
  );
  const lastAt = useRef<number>(0);

  useEffect(() => {
    if (!frame || frame.at === lastAt.current) return;
    lastAt.current = frame.at;
    const kind = frame.shot ? 'shot' : frame.corner ? 'corner' : null;
    const side = frame.shot ?? frame.corner;
    if (!kind || !side) return;
    setFlash({ kind, side });
    const timer = window.setTimeout(() => setFlash(null), 1400);
    return () => window.clearTimeout(timer);
  }, [frame]);

  const x = frame ? toSvgX(frame.x) : W / 2;
  const heat = frame?.heat ?? 0;
  const side = frame?.side ?? 'neutral';

  const accent =
    side === 'home' ? 'var(--zellij)' : side === 'away' ? 'var(--clay)' : 'var(--text3)';

  // Mirror the whole pitch in Arabic so the home side reads first.
  const mirror = dir === 'rtl';

  const trail = history.slice(-14);

  return (
    <section
      aria-label={t('pitchPressureTitle')}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-m)',
        padding: '14px 14px 10px',
        boxShadow: 'var(--shadow)',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 10,
          gap: 12,
        }}
      >
        <h2
          style={{
            font: '500 14px/1.2 var(--font-display)',
            color: 'var(--text)',
            margin: 0,
          }}
        >
          {t('pitchPressureTitle')}
        </h2>
        <span style={{ font: '400 11px/1 var(--font-data)', color: 'var(--text3)' }}>
          {t('pitchPressureSub')}
        </span>
      </header>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={
          side === 'neutral'
            ? t('pitchPressureNeutral')
            : t('pitchPressureTeam', { team: side === 'home' ? homeName : awayName })
        }
        style={{ display: 'block' }}
      >
        <g transform={mirror ? `translate(${W},0) scale(-1,1)` : undefined}>
          <rect
            x={MARGIN}
            y={MARGIN}
            width={W - MARGIN * 2}
            height={H - MARGIN * 2}
            rx="6"
            fill="var(--pitch-wash)"
            stroke="var(--line)"
            strokeWidth="1"
          />
          <line
            x1={W / 2}
            y1={MARGIN}
            x2={W / 2}
            y2={H - MARGIN}
            stroke="var(--line)"
            strokeWidth="1"
          />
          <circle
            cx={W / 2}
            cy={H / 2}
            r="22"
            fill="none"
            stroke="var(--line)"
            strokeWidth="1"
          />
          <rect
            x={MARGIN}
            y={H / 2 - 30}
            width="34"
            height="60"
            fill="none"
            stroke="var(--line)"
            strokeWidth="1"
          />
          <rect
            x={W - MARGIN - 34}
            y={H / 2 - 30}
            width="34"
            height="60"
            fill="none"
            stroke="var(--line)"
            strokeWidth="1"
          />

          {trail.map((f, i) => (
            <circle
              key={f.at}
              cx={toSvgX(f.x)}
              cy={H / 2}
              r={2 + (i / trail.length) * 2}
              fill={accent}
              opacity={(i / trail.length) * 0.22}
            />
          ))}

          <g
            style={{
              transform: `translateX(${x - W / 2}px)`,
              transition: 'transform 1.6s cubic-bezier(0.22, 0.61, 0.36, 1)',
            }}
          >
            <circle
              cx={W / 2}
              cy={H / 2}
              r={16 + heat * 22}
              fill={accent}
              opacity={0.1 + heat * 0.22}
              style={{ transition: 'r 1.2s var(--ease), opacity 1.2s var(--ease)' }}
            />
            <circle
              cx={W / 2}
              cy={H / 2}
              r="6"
              fill={accent}
              stroke="var(--bg)"
              strokeWidth="1.5"
            />
          </g>

          {flash ? (
            <g opacity="0.9">
              <rect
                x={flash.side === 'home' ? W - MARGIN - 34 : MARGIN}
                y={H / 2 - 30}
                width="34"
                height="60"
                fill="var(--saffron-wash)"
                stroke="var(--saffron)"
                strokeWidth="1.5"
              />
            </g>
          ) : null}
        </g>
      </svg>

      <footer
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 8,
          font: '400 11px/1 var(--font-ui)',
          color: 'var(--text3)',
        }}
      >
        <span style={{ color: side === 'away' ? 'var(--clay)' : undefined }}>{awayName}</span>
        {flash ? (
          <span style={{ color: 'var(--saffron)' }}>
            {flash.kind === 'shot' ? t('pitchShotOnTarget') : t('pitchCornerWon')}
          </span>
        ) : (
          <span>{live ? t('pitchPressureLive') : t('pitchPressureIdle')}</span>
        )}
        <span style={{ color: side === 'home' ? 'var(--zellij)' : undefined }}>{homeName}</span>
      </footer>
    </section>
  );
}
