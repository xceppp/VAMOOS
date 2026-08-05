import { useState } from 'react';
import { SettingsToggle } from '../components/SettingsToggle';
import { useI18n } from '../i18n/I18nProvider';
import { useNotifySettings } from '../hooks/useNotifySettings';
import {
  clearGoalSong,
  saveGoalSong,
  testGoalSong,
  updateNotifySettings,
  type NotifyEventKey,
} from '../lib/goalSong';

export function NotifyPage() {
  const { t } = useI18n();
  const settings = useNotifySettings();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      await saveGoalSong(file);
      setMessage(t('savedSong', { name: file.name }));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const toggleEvent = (key: NotifyEventKey) => {
    updateNotifySettings({
      events: { ...settings.events, [key]: !settings.events[key] },
    });
  };

  const labelFor = (key: NotifyEventKey) => {
    if (key === 'goal') return t('eventGoal');
    if (key === 'kickoff') return t('eventKickoff');
    return t('eventFulltime');
  };

  return (
    <section className="page page--narrow">
      <p className="section-label">{t('notifyTitle')}</p>
      <p className="page-lede muted">{t('notifyIntro')}</p>

      <div className="settings">
        <div className="settings__row">
          <span>{t('goalAlertBar')}</span>
          <SettingsToggle
            checked={settings.goalBar}
            onChange={(goalBar) => updateNotifySettings({ goalBar })}
            ariaLabel={t('goalAlertBar')}
          />
        </div>

        <div className="settings__row">
          <span>{t('muteAll')}</span>
          <SettingsToggle
            checked={settings.muted}
            onChange={(muted) => updateNotifySettings({ muted })}
            ariaLabel={t('muteAll')}
          />
        </div>

        <div className="settings__row">
          <span>{t('webPushAlerts')}</span>
          <SettingsToggle
            checked={settings.webPush}
            onChange={(webPush) => updateNotifySettings({ webPush })}
            ariaLabel={t('webPushAlerts')}
          />
        </div>

        <label className="settings__row settings__row--stack">
          <span>{t('volume', { n: Math.round(settings.volume * 100) })}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={settings.volume}
            onChange={(e) => updateNotifySettings({ volume: Number(e.target.value) })}
          />
        </label>

        <fieldset className="settings__fieldset">
          <legend>{t('notifyEvents')}</legend>
          {(['goal', 'kickoff', 'fulltime'] as NotifyEventKey[]).map((key) => (
            <div key={key} className="settings__row">
              <span>{labelFor(key)}</span>
              <SettingsToggle
                checked={settings.events[key]}
                onChange={() => toggleEvent(key)}
                ariaLabel={labelFor(key)}
              />
            </div>
          ))}
        </fieldset>

        <div className="settings__song">
          <h2>{t('songTitle')}</h2>
          <p className="muted">
            {settings.songName
              ? t('songCurrent', { name: settings.songName })
              : t('songDefault')}
          </p>
          <div className="settings__actions">
            <label className="btn btn--ghost file-btn">
              {busy ? '…' : t('uploadSong')}
              <input
                type="file"
                accept="audio/mpeg,audio/wav,audio/ogg,audio/*"
                hidden
                disabled={busy}
                onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void testGoalSong().then(() => setMessage(t('playedTest')))}
            >
              {t('testSong')}
            </button>
            {settings.songName && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() =>
                  void clearGoalSong().then(() => setMessage(t('backToCheer')))
                }
              >
                {t('clearSong')}
              </button>
            )}
          </div>
          {message && <p className="settings__msg">{message}</p>}
        </div>
      </div>
    </section>
  );
}
