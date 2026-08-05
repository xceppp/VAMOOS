/**
 * Territory pitch — pressure band (not ball tracking).
 *
 * Band tint leans from cumulative match-stat pressure. Possession is shown
 * separately as plain percentages. Incidents come only from the events payload.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';

export interface MomentumFrame {
  at: number;
  x: number;
  heat: number;
  side: 'home' | 'away' | 'neutral';
  corner: 'home' | 'away' | null;
  shot: 'home' | 'away' | null;
}

export interface PitchIncident {
  time: number | null;
  extra: number | null;
  type: string;
  detail: string;
  teamName: string;
  player: string | null;
}

interface Props {
  frame: MomentumFrame | null;
  /** Oldest → newest; used for adaptive band transition timing. */
  history?: MomentumFrame[];
  homeName: string;
  awayName: string;
  live: boolean;
  possession: { home: number; away: number } | null;
  incidents: PitchIncident[];
}

const W = 320;
const H = 132;
const MARGIN = 10;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Interval between last two frames → CSS transition seconds (3–20). */
function transitionSeconds(history: MomentumFrame[], frame: MomentumFrame | null): number {
  if (!frame || history.length < 2) return 8;
  const a = history[history.length - 2];
  const b = history[history.length - 1];
  const dt = (b.at - a.at) / 1000;
  if (!Number.isFinite(dt) || dt <= 0) return 8;
  return clamp(dt, 3, 20);
}

function incidentKind(
  ev: PitchIncident,
): 'goal' | 'pen' | 'card' | 'sub' | 'corner' | 'var' | 'other' {
  const type = (ev.type || '').toLowerCase();
  const detail = (ev.detail || '').toLowerCase();
  if (type === 'corner' || detail.includes('corner')) return 'corner';
  if (detail.includes('penalty') || detail === 'penalty') return 'pen';
  if (type === 'goal' || detail.includes('normal goal') || detail.includes('own goal')) return 'goal';
  if (type === 'card' || detail.includes('card')) return 'card';
  if (type === 'subst' || type === 'substitution' || detail.includes('substitution')) return 'sub';
  if (type === 'var' || /\bvar\b/.test(detail)) return 'var';
  return 'other';
}

function incidentEmoji(ev: PitchIncident): string {
  switch (incidentKind(ev)) {
    case 'goal':
      return '⚽';
    case 'pen':
      return '🟢';
    case 'card':
      return (ev.detail || '').toLowerCase().includes('red') ? '🟥' : '🟨';
    case 'sub':
      return '🔄';
    case 'corner':
      return '🚩';
    case 'var':
      return '📺';
    default:
      return '•';
  }
}

function incidentMinute(ev: PitchIncident): string {
  if (ev.time == null) return '—';
  return `${ev.time}${ev.extra ? `+${ev.extra}` : ''}'`;
}

function sideOfIncident(
  ev: PitchIncident,
  homeName: string,
  awayName: string,
): 'home' | 'away' | 'neutral' {
  const n = (ev.teamName || '').toLowerCase();
  if (!n) return 'neutral';
  if (homeName.toLowerCase() === n || homeName.toLowerCase().includes(n) || n.includes(homeName.toLowerCase().slice(0, 5))) {
    return 'home';
  }
  if (awayName.toLowerCase() === n || awayName.toLowerCase().includes(n) || n.includes(awayName.toLowerCase().slice(0, 5))) {
    return 'away';
  }
  return 'neutral';
}

export default function AttackPitch({
  frame,
  history = [],
  homeName,
  awayName,
  live,
  possession,
  incidents,
}: Props) {
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

  const x = frame?.x ?? 0;
  const heat = frame?.heat ?? 0.25;
  const side = frame?.side ?? 'neutral';
  const mirror = dir === 'rtl';
  const dur = transitionSeconds(history, frame);
  // Keep the band readable even when heat is low (seed / quiet spell).
  const tint = Math.round(32 + heat * 48);

  const tape = useMemo(() => {
    const sorted = [...incidents].sort(
      (a, b) => (a.time ?? 0) - (b.time ?? 0) || (a.extra ?? 0) - (b.extra ?? 0),
    );
    return sorted.slice(-6);
  }, [incidents]);

  const possHome = possession?.home ?? 50;
  const possAway = possession?.away ?? 50;
  const possTotal = Math.max(1, possHome + possAway);
  const possHomePct = (possHome / possTotal) * 100;

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

      <div
        style={{
          position: 'relative',
          width: '100%',
          lineHeight: 0,
          borderRadius: 6,
          overflow: 'hidden',
          border: '1px solid var(--line)',
          background: 'var(--pitch-wash)',
          minHeight: 120,
        }}
      >
        {/* Pressure band — continuous gradient, no discrete marker. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            transform: mirror ? 'scaleX(-1)' : undefined,
          }}
        >
          <div
            style={{
              width: '200%',
              height: '100%',
              marginLeft: `${-50 + x * 42}%`,
              background: `linear-gradient(90deg,
                color-mix(in srgb, var(--clay) ${tint}%, var(--pitch-wash)),
                var(--pitch-wash),
                color-mix(in srgb, var(--zellij) ${tint}%, var(--pitch-wash)))`,
              transition: `margin-left ${dur}s cubic-bezier(0.22, 0.61, 0.36, 1), background ${dur}s linear`,
            }}
          />
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={
            side === 'neutral'
              ? t('pitchPressureNeutral')
              : t('pitchPressureTeam', { team: side === 'home' ? homeName : awayName })
          }
          style={{ display: 'block', position: 'relative', zIndex: 1 }}
        >
          <g transform={mirror ? `translate(${W},0) scale(-1,1)` : undefined}>
            <rect
              x={MARGIN}
              y={MARGIN}
              width={W - MARGIN * 2}
              height={H - MARGIN * 2}
              rx="6"
              fill="transparent"
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
              r="20"
              fill="none"
              stroke="var(--line)"
              strokeWidth="1"
            />
            <rect
              x={MARGIN}
              y={H / 2 - 28}
              width="32"
              height="56"
              fill="none"
              stroke="var(--line)"
              strokeWidth="1"
            />
            <rect
              x={W - MARGIN - 32}
              y={H / 2 - 28}
              width="32"
              height="56"
              fill="none"
              stroke="var(--line)"
              strokeWidth="1"
            />

            {flash ? (
              <g opacity="0.95">
                <rect
                  x={flash.side === 'home' ? W - MARGIN - 32 : MARGIN}
                  y={H / 2 - 28}
                  width="32"
                  height="56"
                  fill="var(--saffron-wash)"
                  stroke="var(--saffron)"
                  strokeWidth="1.5"
                />
              </g>
            ) : null}
          </g>
        </svg>
      </div>

      <div style={{ marginTop: 10 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 4,
            font: '400 11px/1 var(--font-data)',
            color: 'var(--text3)',
          }}
        >
          <span>
            {t('pitchPossession')}
            {possession ? (
              <span className="num" style={{ color: 'var(--clay)', marginInlineStart: 6 }}>
                {Math.round(possAway)}%
              </span>
            ) : null}
          </span>
          <span>
            {possession ? (
              <span className="num" style={{ color: 'var(--zellij)', marginInlineEnd: 6 }}>
                {Math.round(possHome)}%
              </span>
            ) : null}
            <span>{live ? t('pitchPressureLive') : t('pitchPressureIdle')}</span>
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            height: 6,
            borderRadius: 999,
            overflow: 'hidden',
            background: 'var(--line-soft)',
            direction: 'ltr',
          }}
          aria-hidden
        >
          <span
            style={{
              width: `${100 - possHomePct}%`,
              background: 'var(--clay)',
              opacity: 0.85,
              transition: `width ${dur}s cubic-bezier(0.22, 0.61, 0.36, 1)`,
            }}
          />
          <span
            style={{
              width: `${possHomePct}%`,
              background: 'var(--zellij)',
              opacity: 0.85,
              transition: `width ${dur}s cubic-bezier(0.22, 0.61, 0.36, 1)`,
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 6,
            font: '400 11px/1 var(--font-ui)',
            color: 'var(--text3)',
          }}
        >
          <span style={{ color: side === 'away' ? 'var(--clay)' : undefined }}>{awayName}</span>
          <span style={{ color: side === 'home' ? 'var(--zellij)' : undefined }}>{homeName}</span>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <p
          style={{
            margin: '0 0 6px',
            font: '400 11px/1 var(--font-data)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text3)',
          }}
        >
          {t('pitchIncidents')}
        </p>
        {!tape.length ? (
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
            {t('noEvents')}
          </p>
        ) : (
          <ol
            aria-label={t('pitchIncidents')}
            style={{
              listStyle: 'none',
              margin: 0,
              padding: '2px 0',
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'nowrap',
              gap: 8,
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              direction: dir === 'rtl' ? 'rtl' : 'ltr',
            }}
          >
            {tape.map((ev, idx) => {
              const who = sideOfIncident(ev, homeName, awayName);
              return (
                <li
                  key={`${ev.time}-${ev.type}-${ev.detail}-${ev.player}-${idx}`}
                  title={[ev.detail, ev.teamName, ev.player].filter(Boolean).join(' · ')}
                  style={{
                    flex: '0 0 auto',
                    minWidth: '4.4rem',
                    maxWidth: '6.5rem',
                    padding: '7px 9px 6px',
                    borderRadius: 'var(--r-s)',
                    border: '1px solid var(--line-soft)',
                    background: '#0b1216',
                    textAlign: 'center',
                    borderColor:
                      who === 'home'
                        ? 'color-mix(in srgb, var(--zellij) 35%, var(--line))'
                        : who === 'away'
                          ? 'color-mix(in srgb, var(--clay) 35%, var(--line))'
                          : undefined,
                  }}
                >
                  <span
                    className="num"
                    style={{
                      display: 'block',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--pitch)',
                    }}
                  >
                    {incidentMinute(ev)}
                  </span>
                  <span style={{ fontSize: '1.05rem', lineHeight: 1 }} aria-hidden>
                    {incidentEmoji(ev)}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      marginTop: 2,
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--text2)',
                    }}
                  >
                    {who === 'home' ? 'H' : who === 'away' ? 'A' : '·'}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
