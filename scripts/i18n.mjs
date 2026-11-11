/**
 * Tłumaczenia Szajki: klucze UNDERWORLD.* z plików lang/*.json, zapasowo angielskie.
 */

export const NS = "UNDERWORLD";

/** Tłumaczy klucz z przestrzeni UNDERWORLD (z podstawieniami, gdy podano dane). */
/** Typ kompanii, której teksty są teraz potrzebne; null to teksty podstawowe (Szajka). */
let textProfile = null;

/** Ustawia typ kompanii dla kolejnych tekstów. Wywołuje go GangData.getGang przy każdym odczycie kompanii. */
export function setTextProfile(type) {
  textProfile = type && type !== "underworld" ? String(type) : null;
}

function lookup(full) {
  return foundry.utils.getProperty(game.i18n.translations, full) ?? foundry.utils.getProperty(game.i18n._fallback, full) ?? null;
}

/** Klucz z sekcji Profiles.<typ>, gdy profil nadpisuje ten tekst, w przeciwnym razie klucz podstawowy. */
function resolveKey(key, profile) {
  if (profile) {
    const override = `Profiles.${profile}.${key}`;
    if (lookup(`${NS}.${override}`) !== null) return override;
  }
  return key;
}

export function t(key, data) {
  return tFor(undefined, key, data);
}

/** Tekst dla podanego typu kompanii (undefined: typ ustawiony przez setTextProfile). */
export function tFor(type, key, data) {
  const profile = type === undefined ? textProfile : (type === "underworld" ? null : type);
  const full = `${NS}.${resolveKey(key, profile)}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

export function content(key) {
  return lookup(`${NS}.${resolveKey(key, textProfile)}`);
}

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
