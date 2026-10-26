import { LOCALES, useT } from '../lib/i18n';

/** Language switch: a native select, so it works with a keyboard, screen readers and every mobile OS. */
export function LanguagePicker({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useT();
  return (
    <label className={`inline-flex items-center gap-1.5 text-xs text-stone-500 ${className}`}>
      <span className="sr-only">{t('language.label')}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.5 9h17M3.5 15h17M12 3c2.5 2.4 4 5.6 4 9s-1.5 6.6-4 9c-2.5-2.4-4-5.6-4-9s1.5-6.6 4-9Z" />
      </svg>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as typeof locale)}
        className="cursor-pointer rounded-lg border border-transparent bg-transparent py-1 pl-0.5 pr-1 text-xs text-stone-600 outline-none transition hover:border-stone-200 focus:border-stone-300"
        aria-label={t('language.label')}
      >
        {LOCALES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.native}
          </option>
        ))}
      </select>
    </label>
  );
}
