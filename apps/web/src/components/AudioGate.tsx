import { useI18n } from '../i18n/I18nProvider';

interface AudioGateProps {
  open: boolean;
  onEnable: () => void;
}

export function AudioGate({ open, onEnable }: AudioGateProps) {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <div className="audio-gate">
      <div className="audio-gate__panel">
        <h2>{t('audioGateTitle')}</h2>
        <p>{t('audioGateBody')}</p>
        <button type="button" className="btn btn--primary" onClick={onEnable}>
          {t('audioGateCta')}
        </button>
      </div>
    </div>
  );
}
