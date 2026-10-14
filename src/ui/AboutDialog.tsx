/**
 * About / privacy dialog.
 *
 * The privacy wording is deliberate: it promises exactly what the implementation guarantees
 * (nothing is uploaded, no account, no ads, no analytics, no third-party runtime requests) and
 * does not claim the *visit* is anonymous, because GitHub Pages keeps standard access logs.
 */
import { useTranslate } from '../app/useTranslate';
import { Dialog } from './common/Dialog';

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AboutDialog({ open, onClose }: AboutDialogProps) {
  const t = useTranslate();

  return (
    <Dialog open={open} onClose={onClose} title={t('about.title')} labelledBy="textcount-about-title">
      <section class="about__section">
        <h3 class="section-title">{t('about.privacy.title')}</h3>
        <p>{t('about.privacy.body')}</p>
        <p class="muted">{t('about.privacy.hosting')}</p>
      </section>

      <section class="about__section">
        <h3 class="section-title">{t('about.rules.title')}</h3>
        <p>{t('about.rules.body')}</p>
        <ul class="about__list">
          <li>{t('about.rules.han')}</li>
          <li>{t('about.rules.latin')}</li>
          <li>{t('about.rules.digit')}</li>
          <li>{t('about.rules.other')}</li>
          <li>{t('about.rules.char')}</li>
        </ul>
      </section>

      <section class="about__section">
        <h3 class="section-title">{t('about.shortcuts.title')}</h3>
        <p>{t('about.shortcuts.body')}</p>
      </section>
    </Dialog>
  );
}
