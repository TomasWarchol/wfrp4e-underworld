/**
 * Tłumaczenia Szajki: klucze UNDERWORLD.* z plików lang/*.json, zapasowo angielskie.
 */

export const NS = "UNDERWORLD";

/** Tłumaczy klucz z przestrzeni UNDERWORLD (z podstawieniami, gdy podano dane). */
export function t(key, data) {
  const full = `${NS}.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

/**
 * Surowa wartość z tłumaczeń (tablica, obiekt): bieżący język, potem angielski.
 * Tak samo Foundry czyta przymiotniki tokenów.
 */
export function content(key) {
  const full = `${NS}.${key}`;
  return foundry.utils.getProperty(game.i18n.translations, full)
    ?? foundry.utils.getProperty(game.i18n._fallback, full)
    ?? null;
}

/** Lista tekstów z tłumaczeń (pusta, gdy brak). */
export function contentList(key) {
  const value = content(key);
  return Array.isArray(value) ? value : [];
}

/**
 * Dodaje do obiektu gettery tłumaczonych pól: pole `name` czyta klucz `${prefix}.Name` itd.
 * @param {object} target
 * @param {string} prefix  np. "Roles.bodyguard"
 * @param {Record<string, string>} fields  pole obiektu → nazwa klucza, np. { name: "Name", desc: "Desc" }
 */
export function withText(target, prefix, fields) {
  for (const [field, key] of Object.entries(fields)) {
    Object.defineProperty(target, field, { get: () => t(`${prefix}.${key}`), enumerable: true, configurable: true });
  }
  return target;
}

/** Buduje słownik konfiguracji z tłumaczonymi polami dla każdego wpisu. */
export function textConfig(raw, prefix, fields) {
  const out = {};
  for (const [id, entry] of Object.entries(raw)) out[id] = withText({ id, ...entry }, `${prefix}.${id}`, fields);
  return out;
}
