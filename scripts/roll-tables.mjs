/**
 * WFRP4e - Szajka: plotki i wydarzenia postoju jako natywne RollTable Foundry – osobne dla każdego terenu.
 *
 * - Kompendium modułu („Szajka – Tabele”) przechowuje wzorcowe tabele (miasto, wieś, las, góry),
 *   odświeżane przez MG przy zmianie danych modułu.
 * - MG tworzy z nich edytowalne tabele świata (folder „Szajka”). Tabela świata bez flagi terenu
 *   (z wcześniejszych wersji modułu) liczy się jako miejska.
 * - Losowanie korzysta z tabeli świata danego terenu (bez powtórzeń), a gdy jej brak – z kompendium.
 * - Typ kompanii inny niż Szajka ma własną tabelę wydarzeń świata (flaga `profile`), tworzoną przy
 *   pierwszym postoju takiej kompanii albo po otwarciu tabel przez MG. Usuniętej tabeli nie odtwarzamy.
 */

import { UnderworldTables } from "./tables-data.mjs";
import { TERRAINS, TERRAIN_IDS, TERRAIN_RUMORS, TERRAIN_EVENTS } from "./world-data.mjs";
import { queryGM } from "../../wfrp4e-companion-lib/scripts/companion-lib.mjs";
import { t, tFor } from "./i18n.mjs";
import { DEFAULT_PROFILE, PROFILES, profileOf } from "./company-profiles.mjs";

const MODULE_ID = "wfrp4e-underworld";
const PACK_ID = `${MODULE_ID}.underworld-tables`;
/** Podnieś, gdy zmieniają się wbudowane plotki lub wydarzenia – kompendium zostanie odbudowane. */
const SEED_VERSION = 3;

const TABLE_CONFIG = {
  rumors: {
    img: "icons/sundries/documents/document-sealed-signatures-red.webp",
    get name() { return t("Tables.Rumors.Name"); },
    get description() { return t("Tables.Rumors.Desc"); }
  },
  events: {
    img: "icons/environment/settlement/tent.webp",
    get name() { return t("Tables.Events.Name"); },
    get description() { return t("Tables.Events.Desc"); }
  }
};

const tableKey = (type, terrain) => `${type}:${terrain}`;

export class UnderworldRollTables {
  static PACK_ID = PACK_ID;
  static TABLE_CONFIG = TABLE_CONFIG;

  /** Usuwa znaczniki HTML z opisu wyniku tabeli. */
  static _plainText(html) {
    const div = document.createElement("div");
    div.innerHTML = String(html ?? "");
    return div.textContent.trim();
  }

  static _tableName(type, terrain) {
    return `${TABLE_CONFIG[type].name} – ${TERRAINS[terrain]?.name ?? terrain}`;
  }

  // ════════════════════════════════════════════
  // BUDOWA DANYCH TABEL
  // ════════════════════════════════════════════

  static buildRumorTableData(rumors, displayedIds = [], terrain = "city") {
    return {
      ...TABLE_CONFIG.rumors,
      name: this._tableName("rumors", terrain),
      formula: "",
      replacement: false,
      displayRoll: true,
      flags: { [MODULE_ID]: { tableType: "rumors", terrain } },
      results: rumors.map((r, i) => ({
        type: "text",
        name: r.category || t("Tables.Rumors.Result"),
        description: r.text,
        weight: 1,
        range: [i + 1, i + 1],
        drawn: displayedIds.includes(r.id),
        flags: { [MODULE_ID]: { id: r.id, source: r.source || null, location: r.location || null, category: r.category || null } }
      }))
    };
  }

  static buildEventTableData(events, terrain = "city", profile = null) {
    const own = profile
      ? { name: `${tFor(profile, "Title")}: ${tFor(DEFAULT_PROFILE, "Tables.ProfileEvents.Name")}`, description: tFor(DEFAULT_PROFILE, "Tables.ProfileEvents.Desc") }
      : { name: this._tableName("events", terrain) };
    return {
      ...TABLE_CONFIG.events,
      ...own,
      formula: "",
      replacement: true,
      displayRoll: true,
      flags: { [MODULE_ID]: profile ? { tableType: "events", profile, seedVersion: SEED_VERSION } : { tableType: "events", terrain, seedVersion: SEED_VERSION } },
      results: events.map((e, i) => ({
        type: "text",
        name: e.title || t("Tables.Events.Result"),
        description: e.text || "",
        weight: 1,
        range: [i + 1, i + 1],
        flags: {
          [MODULE_ID]: {
            id: e.id,
            moraleDelta: Number(e.moraleDelta) || 0,
            suppliesFound: Number(e.suppliesFound) || 0,
            coinsFoundSS: Number(e.coinsFoundSS) || 0,
            ...(e.role ? { role: e.role, okText: e.okText || "", ok: e.ok || {} } : {}),
            ...(e.terrains ? { terrains: e.terrains } : {}),
            ...(e.next ? { next: e.next } : {}),
            ...(e.only ? { only: true } : {})
          }
        }
      }))
    };
  }

  /** Wbudowane treści modułu dla terenu (miasto: pliki JSON lub listy domyślne). */
  static async _builtInContent(terrain = "city") {
    const shipped = await UnderworldTables.loadTerrainEvents(terrain);
    if (terrain !== "city") {
      return {
        rumors: (TERRAIN_RUMORS[terrain] || []).map((r, i) => UnderworldTables.normalizeRumor(r, i)),
        events: shipped.length ? shipped : (TERRAIN_EVENTS[terrain] || []).map((e, i) => UnderworldTables.normalizeEvent(e, i))
      };
    }
    const external = await UnderworldTables.loadWorldContent();
    const rumors = (external?.rumors?.length ? external.rumors : UnderworldTables.RUMORS.map((text, i) => ({ id: `rumor-${i + 1}`, text })))
      .map((r, i) => UnderworldTables.normalizeRumor(r, i));
    const events = (external?.events?.length ? external.events : (shipped.length ? shipped : UnderworldTables.CAMP_EVENTS))
      .map((e, i) => UnderworldTables.normalizeEvent(e, i));
    return { rumors, events };
  }

  // ════════════════════════════════════════════
  // KOMPENDIUM I TABELE ŚWIATA (tylko MG)
  // ════════════════════════════════════════════

  /** Odbudowuje tabele w kompendium modułu, jeśli są puste lub nieaktualne. */
  static async seedCompendium() {
    if (game.user !== game.users.activeGM) return;
    const pack = game.packs.get(PACK_ID);
    if (!pack) {
      console.warn(`${MODULE_ID} | Missing compendium ${PACK_ID}.`);
      return;
    }
    const seeded = Number(game.settings.get(MODULE_ID, "tablesSeedVersion")) || 0;
    const seededLang = game.settings.get(MODULE_ID, "tablesSeedLang");
    const index = await pack.getIndex();
    if (index.size > 0 && seeded >= SEED_VERSION && seededLang === game.i18n.lang) return;

    const tables = [];
    for (const terrain of TERRAIN_IDS) {
      const { rumors, events } = await this._builtInContent(terrain);
      tables.push(this.buildRumorTableData(rumors, [], terrain), this.buildEventTableData(events, terrain));
    }
    const wasLocked = pack.locked;
    if (wasLocked) await pack.configure({ locked: false });
    try {
      const existingIds = index.map(entry => entry._id);
      if (existingIds.length) await RollTable.deleteDocuments(existingIds, { pack: PACK_ID });
      await RollTable.createDocuments(tables, { pack: PACK_ID });
      await game.settings.set(MODULE_ID, "tablesSeedVersion", SEED_VERSION);
      await game.settings.set(MODULE_ID, "tablesSeedLang", game.i18n.lang);
      console.log(`${MODULE_ID} | Table compendium: ${tables.length} tables for ${TERRAIN_IDS.length} terrains (${game.i18n.lang}).`);
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }

  /**
   * Tworzy brakujące edytowalne tabele świata – każdą tylko raz (usuniętej nie odtwarza).
   * Miejskie przejmują własne plotki i wydarzenia z dawnego Edytora Świata oraz historię wyświetlonych plotek.
   */
  static async ensureWorldTables() {
    if (game.user !== game.users.activeGM) return;
    const created = new Set(game.settings.get(MODULE_ID, "worldTablesCreatedKeys") || []);
    if (game.settings.get(MODULE_ID, "worldTablesCreated")) {
      created.add(tableKey("rumors", "city"));
      created.add(tableKey("events", "city"));
    }

    await this._upgradeLegacyEventTables();

    const toCreate = [];
    for (const terrain of TERRAIN_IDS) {
      for (const type of ["rumors", "events"]) {
        const key = tableKey(type, terrain);
        if (created.has(key) || this.findWorldTable(type, terrain)) {
          created.add(key);
          continue;
        }
        const builtIn = await this._builtInContent(terrain);
        if (type === "rumors") {
          const custom = terrain === "city" ? game.settings.get(MODULE_ID, "customRumors") : null;
          const rumors = Array.isArray(custom) && custom.length ? custom.map((r, i) => UnderworldTables.normalizeRumor(r, i)) : builtIn.rumors;
          toCreate.push(this.buildRumorTableData(rumors, terrain === "city" ? UnderworldTables.getDisplayedRumorIds() : [], terrain));
        } else {
          const custom = terrain === "city" ? game.settings.get(MODULE_ID, "customCampEvents") : null;
          const events = Array.isArray(custom) && custom.length ? custom.map((e, i) => UnderworldTables.normalizeEvent(e, i)) : builtIn.events;
          toCreate.push(this.buildEventTableData(events, terrain));
        }
        created.add(key);
      }
    }
    if (!toCreate.length) return;

    const folder = await this._folder();
    await RollTable.createDocuments(toCreate.map(data => ({ ...data, folder: folder.id })));
    await game.settings.set(MODULE_ID, "worldTablesCreatedKeys", [...created]);
    await game.settings.set(MODULE_ID, "worldTablesCreated", true);
    ui.notifications.info(t("Tables.Created", { count: toCreate.length, folder: folder.name }));
  }

  /**
   * Tabele wydarzeń świata z wcześniejszych wersji (8–12 wpisów, bez znacznika wersji) to niezmienione tabele
   * domyślne – zastępujemy je nową, dużą tabelą. Tabele, które MG rozbudował, zostają nietknięte.
   */
  static async _upgradeLegacyEventTables() {
    for (const terrain of TERRAIN_IDS) {
      const table = this.findWorldTable("events", terrain);
      if (!table || table.getFlag(MODULE_ID, "seedVersion")) continue;
      const { events } = await this._builtInContent(terrain);
      if (events.length < 100 || table.results.size > 12) continue;
      const data = this.buildEventTableData(events, terrain);
      await table.deleteEmbeddedDocuments("TableResult", table.results.map(r => r.id));
      await table.update({ formula: data.formula, flags: { [MODULE_ID]: { seedVersion: SEED_VERSION } } });
      await table.createEmbeddedDocuments("TableResult", data.results);
      ui.notifications.info(t("Tables.EventsUpgraded", { terrain: TERRAINS[terrain]?.name ?? terrain, count: events.length }));
    }
  }

  /** Folder tabel modułu (tworzony przy pierwszej tabeli). */
  static async _folder() {
    const folderNames = [t("Tables.Folder"), "Szajka", "Underworld Crew"];
    return game.folders.find(f => f.type === "RollTable" && folderNames.includes(f.name))
      ?? await Folder.create({ name: t("Tables.Folder"), type: "RollTable", color: "#5a3d28" });
  }

  /**
   * Tabela świata danego rodzaju i terenu (tabela bez flagi terenu liczy się jako miejska)
   * albo, z podanym typem kompanii, jego własna tabela wydarzeń.
   */
  static findWorldTable(type, terrain = "city", profile = null) {
    return game.tables?.find(t => t.getFlag(MODULE_ID, "tableType") === type && (profile
      ? t.getFlag(MODULE_ID, "profile") === profile
      : !t.getFlag(MODULE_ID, "profile") && (t.getFlag(MODULE_ID, "terrain") || "city") === terrain)) ?? null;
  }

  /** Tworzy (tylko MG, tylko raz) edytowalną tabelę wydarzeń typu kompanii z pliku modułu. */
  static async ensureProfileTable(profile) {
    if (!PROFILES[profile] || profile === DEFAULT_PROFILE) return null;
    const existing = this.findWorldTable("events", null, profile);
    if (existing || game.user !== game.users.activeGM) return existing;
    const key = `events:profile:${profile}`;
    const created = new Set(game.settings.get(MODULE_ID, "worldTablesCreatedKeys") || []);
    if (created.has(key)) return null; // MG usunął tabelę – zdarzenia typu idą z pliku modułu
    const events = await UnderworldTables.loadProfileEvents(profile);
    if (!events.length) return null;
    const folder = await this._folder();
    const [table] = await RollTable.createDocuments([{ ...this.buildEventTableData(events, null, profile), folder: folder.id }]);
    created.add(key);
    await game.settings.set(MODULE_ID, "worldTablesCreatedKeys", [...created]);
    ui.notifications.info(t("Tables.ProfileCreated", { name: table.name, folder: folder.name }));
    return table;
  }

  /** Tabela do losowania: najpierw tabela świata, potem kompendium. */
  static async getTable(type, terrain = "city") {
    const worldTable = this.findWorldTable(type, terrain);
    if (worldTable) return worldTable;
    const pack = game.packs?.get(PACK_ID);
    if (!pack) return null;
    const index = await pack.getIndex({ fields: ["flags"] });
    const entry = index.find(e => e.flags?.[MODULE_ID]?.tableType === type && (e.flags?.[MODULE_ID]?.terrain || "city") === terrain);
    return entry ? pack.getDocument(entry._id) : null;
  }

  /** Otwiera arkusze tabel kompanii: plotki terenu, wydarzenia terenu (typy z tabelami świata) i tabelę typu. */
  static async openTables(terrain = "city", profileId = DEFAULT_PROFILE) {
    const profile = profileOf(profileId);
    const tables = [await this.getTable("rumors", terrain)];
    if (profile.worldTables) tables.push(await this.getTable("events", terrain));
    if (profile.id !== DEFAULT_PROFILE) tables.push(await this.ensureProfileTable(profile.id));
    for (const table of tables) table?.sheet?.render({ force: true });
  }

  // ════════════════════════════════════════════
  // LOSOWANIE
  // ════════════════════════════════════════════

  static _resultToRumor(result) {
    const data = result.getFlag?.(MODULE_ID) ?? result.flags?.[MODULE_ID] ?? {};
    return {
      id: data.id || result.id,
      text: this._plainText(result.description) || result.name,
      source: data.source || UnderworldTables.getRandomSource(),
      location: data.location || null,
      category: data.category || null
    };
  }

  static _resultToEvent(result) {
    const data = result.getFlag?.(MODULE_ID) ?? result.flags?.[MODULE_ID] ?? {};
    return {
      id: data.id || result.id,
      title: result.name || "Wydarzenie",
      text: this._plainText(result.description),
      moraleDelta: Number(data.moraleDelta) || 0,
      suppliesFound: Number(data.suppliesFound) || 0,
      coinsFoundSS: Number(data.coinsFoundSS) || 0,
      ...(data.role ? { role: data.role, okText: data.okText || "", ok: data.ok || {} } : {}),
      ...(Array.isArray(data.terrains) && data.terrains.length ? { terrains: data.terrains } : {}),
      ...(data.next ? { next: String(data.next) } : {}),
      ...(data.only ? { only: true } : {})
    };
  }

  /** Wydarzenie o danym id z tabeli terenu (świata, potem kompendium, potem plik) – dla haków łańcuchów. */
  static async findEvent(terrain, id) {
    const table = await this.getTable("events", terrain);
    const result = table?.results?.find(r => (r.getFlag?.(MODULE_ID, "id") ?? r.flags?.[MODULE_ID]?.id) === id);
    if (result) return this._resultToEvent(result);
    const shipped = await UnderworldTables.loadTerrainEvents(terrain);
    const found = shipped.find(e => e.id === id);
    return found ? { ...found } : null;
  }

  /**
   * Losuje z tabeli danego rodzaju i terenu albo z tabeli typu kompanii. Tabela świata bez powtórzeń
   * wymaga prawa edycji (MG), więc gracz prosi o losowanie aktywnego MG. Zwraca null, gdy tabeli nie ma.
   * @param {"rumors"|"events"} type
   * @param {string} terrain
   * @param {{profile?: string, exclude?: string[]}} options  tabela typu i id wydarzeń, które kompania już widziała
   */
  static async draw(type, terrain = "city", { profile = null, exclude = [] } = {}) {
    const table = profile ? this.findWorldTable("events", null, profile) : await this.getTable(type, terrain);
    if (!table) return null;
    const canMark = !table.pack && table.canUserModify(game.user, "update");

    if (!canMark && !table.pack && game.users.activeGM && !game.user.isGM) {
      return queryGM(`${MODULE_ID}.drawTable`, { type, terrain, profile, exclude });
    }

    if (canMark && !table.replacement && table.results.every(r => r.drawn)) {
      await table.resetResults();
    }
    // Losujemy ponownie wpisy „tylko następnik” (zakończenia łańcuchów), zdarzenia typu spoza terenu
    // i (dopóki się da) zdarzenia, które kompania już widziała
    const flag = (result, key) => result?.getFlag?.(MODULE_ID, key) ?? result?.flags?.[MODULE_ID]?.[key];
    const seen = new Set(exclude);
    let roll = null, result = null, fallback = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const drawn = canMark ? await table.draw({ displayChat: false }) : await table.roll();
      const candidate = drawn.results?.[0];
      if (!candidate) break;
      if (type === "events" && flag(candidate, "only")) continue;
      const terrains = flag(candidate, "terrains");
      if (Array.isArray(terrains) && terrains.length && !terrains.includes(terrain)) continue;
      fallback ??= { roll: drawn.roll, result: candidate };
      if (seen.has(flag(candidate, "id") || candidate.id)) continue;
      roll = drawn.roll;
      result = candidate;
      break;
    }
    if (!result && fallback) ({ roll, result } = fallback);
    if (!result) return null;
    const data = type === "rumors" ? this._resultToRumor(result) : this._resultToEvent(result);
    data.tableRoll = roll ? { formula: roll.formula, total: roll.total } : null;
    return data;
  }

  /** Zdarzenie z tabeli świata typu kompanii (MG tworzy ją przy pierwszym użyciu); null, gdy tabeli nie ma. */
  static async drawProfileEvent(profile, terrain, exclude = []) {
    const table = this.findWorldTable("events", null, profile) ?? await this.ensureProfileTable(profile);
    if (!table) return null;
    return this.draw("events", terrain, { profile, exclude });
  }

  /** Handler zapytania (u MG): losowanie dla gracza bez prawa edycji tabeli. */
  static async onDrawQuery({ type, terrain = "city", profile = null, exclude = [] } = {}) {
    if (!["rumors", "events"].includes(type) || !TERRAIN_IDS.includes(terrain)) return null;
    if (profile && !PROFILES[profile]) return null;
    return this.draw(type, terrain, { profile, exclude: Array.isArray(exclude) ? exclude.slice(-400) : [] });
  }
}
