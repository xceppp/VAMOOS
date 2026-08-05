import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';

export function PrivacyPage() {
  const { t } = useI18n();

  return (
    <section className="page page--narrow page--content">
      <Link to="/" className="back-link">
        {t('backLive')}
      </Link>

      <article className="content-article">
        <h1>{t('privacyTitle')}</h1>
        <p className="muted">{t('privacyUpdated')}</p>
        <p>{t('privacyP1')}</p>

        <h2>{t('privacyDataTitle')}</h2>
        <p>{t('privacyDataP')}</p>
        <ul>
          <li>{t('privacyDataLocal')}</li>
          <li>{t('privacyDataFav')}</li>
          <li>{t('privacyDataNotify')}</li>
        </ul>

        <h2>{t('privacyAdsTitle')}</h2>
        <p>{t('privacyAdsP')}</p>
        <ul>
          <li>{t('privacyAdsCookies')}</li>
          <li>{t('privacyAdsPersonal')}</li>
          <li>{t('privacyAdsOptOut')}</li>
        </ul>

        <h2>{t('privacyContactTitle')}</h2>
        <p>{t('privacyContactP')}</p>
      </article>
    </section>
  );
}
