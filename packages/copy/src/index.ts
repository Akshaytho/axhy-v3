/**
 * @axhy/copy
 *
 * i18n catalogs (en/hi/te) + content style guide. Single source of truth
 * for every user-facing string in Axhy.
 *
 * @derives(ADR-0017)
 */

export const SUPPORTED_LOCALES = ['en', 'hi', 'te'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
