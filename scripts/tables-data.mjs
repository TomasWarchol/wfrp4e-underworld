/**
 * WFRP4e - Podziemie: Szajka Człowieka (Mobilna Kompania)
 * Tabele losowe, plotki, profile rekrutów i komplikacje
 * Dostosowane do kampanii Wewnętrzny Wróg (Rogaty Szczur, Imperium w Ruinie)
 */

import { UnderworldRollTables } from "./roll-tables.mjs";
import { TERRAINS, TERRAIN_RUMORS, TERRAIN_EVENTS } from "./world-data.mjs";
import { t, contentList, textConfig, withText } from "./i18n.mjs";

/** Teren szajki (miasto, gdy nieustawiony). */
const terrainOf = gang => (TERRAINS[gang?.terrain] ? gang.terrain : "city");

export class UnderworldTables {

  // ────────────────────────────────────────────
  // PLOTKI OGÓLNE (Zwiad Terenu)
  // ────────────────────────────────────────────
  static get RUMORS() { return contentList("Content.Rumors"); }

  // ────────────────────────────────────────────
  // PLOTKI KARCZEMNE (Nasłuch w Szynku)
  // ────────────────────────────────────────────
  static get TAVERN_GOSSIP() { return contentList("Content.TavernGossip"); }

  // ────────────────────────────────────────────
  // WYNIKI ŚLEDZENIA (Śledzenie Celu)
  // ────────────────────────────────────────────
  static get SHADOW_RESULTS() { return contentList("Content.ShadowResults"); }


  // ────────────────────────────────────────────
  // WYNIKI ZASTRASZANIA (Zastraszanie / Wymuszenie)
  // ────────────────────────────────────────────
  static get INTIMIDATION_RESULTS() { return contentList("Content.IntimidationResults"); }

  // ────────────────────────────────────────────
  // TYPY SFAŁSZOWANYCH DOKUMENTÓW (Fałszowanie)
  // ────────────────────────────────────────────
  static get FORGE_DOCUMENTS() { return contentList("Content.ForgeDocuments"); }

  // ────────────────────────────────────────────
  // KOMPLIKACJE PRZEMYTU (Przemyt)
  // ────────────────────────────────────────────
  static get SMUGGLE_COMPLICATIONS() { return contentList("Content.SmuggleComplications"); }

  // ────────────────────────────────────────────
  // ZDARZENIA LOSOWE NOCNEGO POSTOJU
  // ────────────────────────────────────────────
  static CAMP_EVENT_EFFECTS = [
    { moraleDelta: 1 },
    { moraleDelta: 0 },
    { moraleDelta: -1 },
    { suppliesFound: 2, moraleDelta: 1 },
    { moraleDelta: 0 },
    { moraleDelta: -1 },
    { moraleDelta: 1 },
    { moraleDelta: 0 },
    { moraleDelta: -1 },
    { coinsFoundSS: 5, moraleDelta: 1 }
  ];

  static get CAMP_EVENTS() {
    return contentList("Content.CampEvents").map((e, i) => ({ id: `camp-${i + 1}`, title: e.Title, text: e.Text, ...this.CAMP_EVENT_EFFECTS[i] }));
  }

  // ────────────────────────────────────────────
  // METODY POMOCNICZE I BAZA PLOTEK / WYDARZEŃ
  // ────────────────────────────────────────────

  // Klimatyczne źródła plotek (gdy w JSON pominięto pole "source")
  static get RUMOR_SOURCES() { return contentList("Content.RumorSources"); }

  static _externalContent = null;

  /**
   * Wczytuje bazę plotek i wydarzeń z zewnętrznych plików JSON w bieżącym języku:
   * 1. data/rumors.<lang>.json, potem data/rumors.json
   * 2. data/events.<lang>.json, potem data/events.json
   * 3. data/rumors-and-events.json jako stary format
   * Bez pliku dla języka zostają wbudowane treści z lang/*.json.
   * Wspiera bezpośrednią tablicę [...] oraz obiekt { rumors: [...] } / { events: [...] }
   */
  static async loadWorldContent(forceReload = false) {
    if (this._externalContent && !forceReload) return this._externalContent;

    let rumorsRaw = null;
    let eventsRaw = null;

    const lang = game.i18n?.lang || "en";
    const fetchList = async (name, key) => {
      for (const file of [`${name}.${lang}.json`, `${name}.json`]) {
        try {
          const res = await fetch(`modules/wfrp4e-underworld/data/${file}`);
          if (!res.ok) continue;
          const json = await res.json();
          return Array.isArray(json) ? json : (Array.isArray(json[key]) ? json[key] : []);
        } catch (_) {}
      }
      return null;
    };

    // 1–2. Plotki i wydarzenia w bieżącym języku
    rumorsRaw = await fetchList("rumors", "rumors");
    eventsRaw = await fetchList("events", "events");

    // 3. Fallback do starego pliku data/rumors-and-events.json jeśli osobne pliki nie istnieją
    if (rumorsRaw === null || eventsRaw === null) {
      try {
        const fallbackRes = await fetch("modules/wfrp4e-underworld/data/rumors-and-events.json");
        if (fallbackRes.ok) {
          const json = await fallbackRes.json();
          if (rumorsRaw === null && Array.isArray(json.rumors)) rumorsRaw = json.rumors;
          if (eventsRaw === null && Array.isArray(json.events)) eventsRaw = json.events;
        }
      } catch (_) {}
    }

    const normRumors = Array.isArray(rumorsRaw) ? rumorsRaw.map((r, i) => this.normalizeRumor(r, i)) : [];
    const normEvents = Array.isArray(eventsRaw) ? eventsRaw.map((e, i) => this.normalizeEvent(e, i)) : [];

    // Jeśli plik rumors.json definiował flagę displayed: true na wpisach, zsynchronizuj z historią świata
    if (Array.isArray(rumorsRaw) && rumorsRaw.length > 0) {
      const displayedFromFile = [];
      normRumors.forEach(r => {
        if (r.displayed) displayedFromFile.push(r.id);
      });
      if (displayedFromFile.length > 0) {
        const currentDisplayed = this.getDisplayedRumorIds();
        const merged = Array.from(new Set([...currentDisplayed, ...displayedFromFile]));
        await this.setDisplayedRumorIds(merged);
      }
    }

    this._externalContent = {
      rumors: normRumors,
      events: normEvents
    };

    console.log(`WFRP4e Underworld | Loaded ${normRumors.length} rumours (rumors.json) and ${normEvents.length} events (events.json).`);
    return this._externalContent;
  }

  static _slugify(text) {
    if (!text) return Math.random().toString(36).substring(2, 8);
    return text.toLowerCase()
      .replace(/[ąćęłńóśźż]/g, c => ({ 'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z' }[c] || c))
      .replace(/[^a-z0-9]+/g, '-')
      .substring(0, 16);
  }

  /**
   * Normalizuje wpis plotki - obsługuje stringi, obiekty częściowe i pełne
   */
  static normalizeRumor(item, index = 0) {
    if (typeof item === "string") {
      const slug = this._slugify(item);
      return {
        id: `rumor-${index + 1}-${slug}`,
        text: item.trim(),
        source: null,
        location: t("Rumor.DefaultLocation"),
        category: t("Rumor.DefaultCategory"),
        truth: null,
        displayed: false
      };
    }
    const text = item.text || item.title || "";
    const slug = this._slugify(text);
    return {
      id: item.id || `rumor-${index + 1}-${slug}`,
      text: text.trim(),
      source: item.source || null,
      location: item.location || t("Rumor.DefaultLocation"),
      category: item.category || t("Rumor.DefaultCategory"),
      truth: item.truth || null,
      displayed: item.displayed === true || item.shown === true || item.wyswietlona === true
    };
  }

  /**
   * Normalizuje wpis wydarzenia obozowego - obsługuje stringi, obiekty częściowe i pełne
   */
  static normalizeEvent(item, index = 0) {
    if (typeof item === "string") {
      return {
        id: `ev-${index + 1}-${this._slugify(item)}`,
        title: t("CampEvent.DefaultTitle"),
        text: item.trim(),
        moraleDelta: 0,
        suppliesFound: 0,
        coinsFoundSS: 0
      };
    }
    const title = item.title || t("CampEvent.DefaultTitle");
    const text = item.text || item.desc || "";
    return {
      id: item.id || `ev-${index + 1}-${this._slugify(title)}`,
      title: title.trim(),
      text: text.trim(),
      moraleDelta: item.morale !== undefined ? Number(item.morale) : (item.moraleDelta !== undefined ? Number(item.moraleDelta) : 0),
      suppliesFound: item.supplies !== undefined ? Number(item.supplies) : (item.suppliesFound !== undefined ? Number(item.suppliesFound) : 0),
      coinsFoundSS: item.coinsSS !== undefined ? Number(item.coinsSS) : (item.coinsFoundSS !== undefined ? Number(item.coinsFoundSS) : 0)
    };
  }

  static getRandomSource() {
    return this.RUMOR_SOURCES[Math.floor(Math.random() * this.RUMOR_SOURCES.length)];
  }

  static getDisplayedRumorIds() {
    try {
      const list = game.settings?.get("wfrp4e-underworld", "displayedRumors");
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  static async setDisplayedRumorIds(ids) {
    try {
      await game.settings?.set("wfrp4e-underworld", "displayedRumors", ids);
    } catch (_) {}
  }

  static isRumorDisplayed(rumorId) {
    return this.getDisplayedRumorIds().includes(rumorId);
  }

  static async toggleRumorDisplayed(rumorId, state = null) {
    let ids = [...this.getDisplayedRumorIds()];
    const isCurrentlyDisplayed = ids.includes(rumorId);
    const targetState = state !== null ? !!state : !isCurrentlyDisplayed;

    if (targetState) {
      if (!ids.includes(rumorId)) ids.push(rumorId);
    } else {
      ids = ids.filter(id => id !== rumorId);
    }
    await this.setDisplayedRumorIds(ids);
    return targetState;
  }

  static async resetDisplayedRumors() {
    await this.setDisplayedRumorIds([]);
  }

  /**
   * Losuje unikalną, jeszcze niewyświetloną plotkę
   * Gdy wszystkie zostaną wylosowane, resetuje pulę i powiadamia MG
   */
  static async drawRumor(gang, options = {}) {
    // Tabele RollTable (świat / kompendium) mają pierwszeństwo; stare listy z Edytora Świata są tylko zapasem
    const terrain = terrainOf(gang);
    if (!options.category) {
      const fromTable = await UnderworldRollTables.draw("rumors", terrain);
      if (fromTable) return fromTable;
    }

    const allRumors = terrain === "city"
      ? this.getRumors(gang)
      : (TERRAIN_RUMORS[terrain] || []).map((r, i) => this.normalizeRumor(r, i));
    if (!allRumors.length) return null;

    let displayedIds = this.getDisplayedRumorIds();
    let available = allRumors.filter(r => !displayedIds.includes(r.id));

    if (options.category) {
      const inCat = available.filter(r => r.category === options.category);
      if (inCat.length > 0) available = inCat;
    }

    if (available.length === 0) {
      displayedIds = [];
      await this.setDisplayedRumorIds([]);
      available = options.category
        ? (allRumors.filter(r => r.category === options.category).length ? allRumors.filter(r => r.category === options.category) : allRumors)
        : [...allRumors];
      ui.notifications?.info(t("Notify.RumorPoolReset"));
    }

    const picked = available[Math.floor(Math.random() * available.length)];
    const selected = { ...picked };
    displayedIds.push(selected.id);
    await this.setDisplayedRumorIds(displayedIds);

    if (!selected.source) {
      selected.source = this.getRandomSource();
    }
    return selected;
  }

  static _random(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  static getRandomRumor(gang) {
    const all = this.getRumors(gang);
    if (!all.length) return "";
    const r = all[Math.floor(Math.random() * all.length)];
    return r?.text || r;
  }

  static getRandomTavernGossip() {
    return this._random(this.TAVERN_GOSSIP);
  }

  static getRandomShadowResult() {
    return this._random(this.SHADOW_RESULTS);
  }

  static getRandomIntimidationResult() {
    return this._random(this.INTIMIDATION_RESULTS);
  }

  static getRandomForgeDocument() {
    return this._random(this.FORGE_DOCUMENTS);
  }

  static getRandomSmuggleComplication() {
    return this._random(this.SMUGGLE_COMPLICATIONS);
  }

  static getRandomCampEvent(gang) {
    const all = this.getCampEvents(gang);
    if (!all.length) return { title: t("CampEvent.QuietTitle"), text: t("CampEvent.QuietText"), moraleDelta: 0 };
    return { ...all[Math.floor(Math.random() * all.length)] };
  }

  static async drawCampEvent(gang) {
    const terrain = terrainOf(gang);
    const fromTable = await UnderworldRollTables.draw("events", terrain);
    if (fromTable) return fromTable;

    const events = terrain === "city"
      ? this.getCampEvents(gang)
      : (TERRAIN_EVENTS[terrain] || []).map((e, i) => this.normalizeEvent(e, i));
    if (!events.length) return { title: t("CampEvent.QuietTitle"), text: t("CampEvent.QuietText"), moraleDelta: 0 };

    let displayedIds = this.getDisplayedEventIds();
    let available = events.filter(event => !displayedIds.includes(event.id));
    if (available.length === 0) {
      displayedIds = [];
      await this.setDisplayedEventIds(displayedIds);
      available = events;
    }

    const selected = { ...available[Math.floor(Math.random() * available.length)] };
    displayedIds.push(selected.id);
    await this.setDisplayedEventIds(displayedIds);
    return selected;
  }

  static getDisplayedEventIds() {
    try {
      const list = game.settings?.get("wfrp4e-underworld", "displayedEvents");
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  static async setDisplayedEventIds(ids) {
    try {
      await game.settings?.set("wfrp4e-underworld", "displayedEvents", ids);
    } catch (_) {}
  }

  static async resetDisplayedEvents() {
    await this.setDisplayedEventIds([]);
  }

  // ────────────────────────────────────────────
  // RANGI I DOŚWIADCZENIE OPERACYJNE (DO) — awans kupowany za DO z misji
  // ────────────────────────────────────────────
  static RANKS_CONFIG = [
    {
      level: 0,
      id: "rookie",
      icon: "fas fa-user",
      badgeClass: "rank-rookie",
      costOperationalXP: 0,
      slBonus: 0,
    },
    {
      level: 1,
      id: "seasoned",
      icon: "fas fa-star",
      badgeClass: "rank-seasoned",
      costOperationalXP: 120,
      slBonus: 1,
    },
    {
      level: 2,
      id: "veteran",
      icon: "fas fa-award",
      badgeClass: "rank-veteran",
      costOperationalXP: 300,
      slBonus: 2,
    },
    {
      level: 3,
      id: "lieutenant",
      icon: "fas fa-crown",
      badgeClass: "rank-lieutenant",
      costOperationalXP: 650,
      slBonus: 3,
      unique: true,
    }
  ].map(rank => withText(rank, `Ranks.${rank.id}`, { name: "Name", desc: "Desc" }));

  // ────────────────────────────────────────────
  // ZBROJOWNIA I EKWIPUNEK (GEAR)
  // ────────────────────────────────────────────
  static GEAR_CONFIG = textConfig({
    armor: {
      id: "armor",
      icon: "fas fa-shield-alt",
      costPennies: 120, // 10 ss
    },
    weapon: {
      id: "weapon",
      icon: "fas fa-khanda",
      costPennies: 180, // 15 ss
    },
    lockpicks: {
      id: "lockpicks",
      icon: "fas fa-key",
      costPennies: 144, // 12 ss
    },
    disguise: {
      id: "disguise",
      icon: "fas fa-mask",
      costPennies: 96, // 8 ss
    },
    medkit: {
      id: "medkit",
      icon: "fas fa-medkit",
      costPennies: 120, // 10 ss
    },
    horse: {
      id: "horse",
      icon: "fas fa-horse",
      costPennies: 240, // 1 ZK
    }
  }, "Gear", { name: "Name", bonusDesc: "Bonus" });

    // ────────────────────────────────────────────
  // PREDEFINIOWANE ROLE W SZAJCE (7 ARCHETYPÓW BANICKICH)
  // Prawa Ręka jest osobną, unikalną rangą awansu (Ranga 3)!
  // ────────────────────────────────────────────
  static ROLES_CONFIG = textConfig({
    bodyguard: {
      id: "bodyguard",
      icon: "fas fa-shield-alt",
      badgeClass: "role-bodyguard",
      tactics: ["meatshield", "trip", "bullrush"],
      bonusAssignments: ["intimidate", "distract"]
    },
    shadow: {
      id: "shadow",
      icon: "fas fa-user-ninja",
      badgeClass: "role-shadow",
      tactics: ["flank", "volley", "kidneystrike"],
      bonusAssignments: ["scout", "shadow", "pickpocket", "smuggle"]
    },
    marksman: {
      id: "marksman",
      icon: "fas fa-crosshairs",
      badgeClass: "role-marksman",
      tactics: ["cover", "disarm", "volley"],
      bonusAssignments: ["scout", "procure", "sabotage"]
    },
    provocateur: {
      id: "provocateur",
      icon: "fas fa-theater-masks",
      badgeClass: "role-provocateur",
      tactics: ["distract", "smoke", "sand"],
      bonusAssignments: ["tavern", "rumor_spread", "distract"]
    },
    scavenger: {
      id: "scavenger",
      icon: "fas fa-toolbox",
      badgeClass: "role-scavenger",
      tactics: ["resupply", "retreat", "draught"],
      bonusAssignments: ["procure", "fence", "tend_wounded"]
    },
    smuggler: {
      id: "smuggler",
      icon: "fas fa-horse-head",
      badgeClass: "role-smuggler",
      tactics: ["retreat", "resupply", "flank"],
      bonusAssignments: ["smuggle", "procure", "cover_tracks"]
    },
    saboteur: {
      id: "saboteur",
      icon: "fas fa-fire",
      badgeClass: "role-saboteur",
      tactics: ["smoke", "sand", "volley"],
      bonusAssignments: ["sabotage", "distract", "cover_tracks"]
    }
  }, "Roles", { name: "Name", shortDesc: "Desc" });

  // ────────────────────────────────────────────
  // PREDEFINIOWANE ZALETY I WADY (20 ZALET, 20 WAD) Z EFEKTAMI MECHANICZNYMI
  // ────────────────────────────────────────────
  static TRAITS_CONFIG = {
    strengths: textConfig({
      tough: {
        id: "tough",
        icon: "fas fa-fist-raised",
        bonusAssignments: ["intimidate", "distract"],
        slBonus: 1
      },
      stealthy: {
        id: "stealthy",
        icon: "fas fa-user-ninja",
        bonusAssignments: ["scout", "shadow", "smuggle"],
        slBonus: 1
      },
      nimble: {
        id: "nimble",
        icon: "fas fa-hands",
        bonusAssignments: ["procure", "forge", "pickpocket"],
        slBonus: 1
      },
      talkative: {
        id: "talkative",
        icon: "fas fa-comments",
        bonusAssignments: ["tavern", "rumor_spread", "fence"],
        slBonus: 1
      },
      eagle_eye: {
        id: "eagle_eye",
        icon: "fas fa-eye",
        bonusAssignments: ["scout", "sabotage", "cover_tracks"],
        slBonus: 1
      },
      trusted_face: {
        id: "trusted_face",
        icon: "fas fa-handshake",
        bonusAssignments: ["bribe", "fence"],
        slBonus: 1
      },
      local_knowledge: {
        id: "local_knowledge",
        icon: "fas fa-map-marked-alt",
        bonusAssignments: ["scout", "procure"],
        slBonus: 1
      },
      field_medic: {
        id: "field_medic",
        icon: "fas fa-medkit",
        bonusAssignments: ["tend_wounded"],
        slBonus: 1,
        special: "instant_heal_50"
      },
      brutal: {
        id: "brutal",
        icon: "fas fa-skull-crossbones",
        bonusAssignments: ["intimidate"],
        slBonus: 2,
        penaltyAssignments: ["tavern", "rumor_spread"],
        slPenalty: 1
      },
      war_veteran: {
        id: "war_veteran",
        icon: "fas fa-shield-alt",
        bonusAssignments: ["distract", "cover_tracks", "sabotage"],
        slBonus: 1
      },
      horse_thief: {
        id: "horse_thief",
        icon: "fas fa-horse",
        bonusAssignments: ["smuggle", "procure"],
        slBonus: 1
      },
      iron_will: {
        id: "iron_will",
        icon: "fas fa-heartbeat",
        bonusAssignments: ["cover_tracks", "distract"],
        slBonus: 1,
        special: "pain_resistant"
      },
      keen_senses: {
        id: "keen_senses",
        icon: "fas fa-search",
        bonusAssignments: ["scout", "tavern"],
        slBonus: 1
      },
      quick_escape: {
        id: "quick_escape",
        icon: "fas fa-running",
        bonusAssignments: ["pickpocket", "distract", "smuggle"],
        slBonus: 1
      },
      arsonist: {
        id: "arsonist",
        icon: "fas fa-fire",
        bonusAssignments: ["sabotage"],
        slBonus: 2
      },
      juggler: {
        id: "juggler",
        icon: "fas fa-magic",
        bonusAssignments: ["distract", "rumor_spread"],
        slBonus: 1
      },
      poacher: {
        id: "poacher",
        icon: "fas fa-leaf",
        bonusAssignments: ["procure", "scout"],
        slBonus: 1,
        special: "extra_food"
      },
      drinking_buddy: {
        id: "drinking_buddy",
        icon: "fas fa-beer",
        bonusAssignments: ["tavern", "rumor_spread"],
        slBonus: 1
      },
      tight_lipped: {
        id: "tight_lipped",
        icon: "fas fa-lock",
        special: "never_snitch"
      },
      knife_master: {
        id: "knife_master",
        icon: "fas fa-khanda",
        bonusAssignments: ["shadow", "pickpocket", "distract"],
        slBonus: 1
      }
    }, "Strengths", { name: "Name", desc: "Desc" }),
    flaws: textConfig({
      coward: {
        id: "coward",
        icon: "fas fa-running",
        penaltyAssignments: ["distract", "sabotage"],
        slPenalty: 1
      },
      alcoholic: {
        id: "alcoholic",
        icon: "fas fa-wine-bottle",
        penaltyAssignments: ["scout", "cover_tracks"],
        slPenalty: 1,
        campEffect: { chance: 20, type: "unavailable" }
      },
      kleptomaniac: {
        id: "kleptomaniac",
        icon: "fas fa-mask",
        moralePenalty: 1,
        campEffect: { chance: 15, type: "steal_treasury", amount: 12 }
      },
      loudmouth: {
        id: "loudmouth",
        icon: "fas fa-bullhorn",
        penaltyAssignments: ["shadow", "smuggle"],
        slPenalty: 1
      },
      wanted: {
        id: "wanted",
        icon: "fas fa-scroll",
        notorietyOnFail: 1
      },
      gambler: {
        id: "gambler",
        icon: "fas fa-dice",
        campEffect: { chance: 25, type: "steal_treasury", amountDice: "1d6ss" }
      },
      lazy: {
        id: "lazy",
        icon: "fas fa-bed",
        penaltyAssignments: ["procure", "pickpocket"],
        slPenalty: 1
      },
      vengeful: {
        id: "vengeful",
        icon: "fas fa-angry",
        moraleOnFail: 1
      },
      old_slow: {
        id: "old_slow",
        icon: "fas fa-cane",
        penaltyAssignments: ["scout", "shadow"],
        slPenalty: 1
      },
      traitor: {
        id: "traitor",
        icon: "fas fa-user-secret",
        campEffect: { chance: 10, type: "info_leak" }
      },
      brawler: {
        id: "brawler",
        icon: "fas fa-fist-raised",
        campEffect: { chance: 15, type: "morale_loss" }
      },
      superstitious: {
        id: "superstitious",
        icon: "fas fa-crow",
        penaltyAssignments: ["shadow", "sabotage"],
        slPenalty: 1
      },
      repulsive: {
        id: "repulsive",
        icon: "fas fa-poo",
        penaltyAssignments: ["tavern", "rumor_spread", "fence"],
        slPenalty: 1
      },
      glutton: {
        id: "glutton",
        icon: "fas fa-utensils",
        campEffect: { chance: 100, type: "extra_food" }
      },
      one_eyed: {
        id: "one_eyed",
        icon: "fas fa-eye-slash",
        penaltyAssignments: ["scout", "cover_tracks"],
        slPenalty: 1
      },
      afraid_horses: {
        id: "afraid_horses",
        icon: "fas fa-ban",
        penaltyAssignments: ["smuggle"],
        slPenalty: 1
      },
      in_debt: {
        id: "in_debt",
        icon: "fas fa-coins",
        campEffect: { chance: 10, type: "debt_trouble" }
      },
      clumsy: {
        id: "clumsy",
        icon: "fas fa-hammer",
        penaltyAssignments: ["procure", "forge"],
        slPenalty: 1
      },
      panicker: {
        id: "panicker",
        icon: "fas fa-flushed",
        moraleOnFail: 1
      },
      bloodthirsty: {
        id: "bloodthirsty",
        icon: "fas fa-tint",
        notorietyOnSuccess: 1
      }
    }, "Flaws", { name: "Name", desc: "Desc" })
  };

  // ────────────────────────────────────────────
  // FABULARNY ROZWÓJ POPLECZNIKÓW (NARRATIVE PERKS) ZA DO
  // ────────────────────────────────────────────
  static NARRATIVE_PERKS = textConfig({
    // ── DAWNY FACH (Wybór unikalnego zawodu z przeszłości — limit: 1 na postać) ──
    craft_chirurgeon: {
      id: "craft_chirurgeon",
      isCraft: true,
      icon: "fas fa-medkit",
      costOperationalXP: 60,
    },
    craft_blacksmith: {
      id: "craft_blacksmith",
      isCraft: true,
      icon: "fas fa-hammer",
      costOperationalXP: 60,
    },
    craft_innkeeper: {
      id: "craft_innkeeper",
      isCraft: true,
      icon: "fas fa-beer",
      costOperationalXP: 60,
    },
    craft_merchant: {
      id: "craft_merchant",
      isCraft: true,
      icon: "fas fa-coins",
      costOperationalXP: 60,
    },
    craft_woodsman: {
      id: "craft_woodsman",
      isCraft: true,
      icon: "fas fa-tree",
      costOperationalXP: 60,
    },
    craft_scribe: {
      id: "craft_scribe",
      isCraft: true,
      icon: "fas fa-pen-nib",
      costOperationalXP: 60,
    },

    // ── GRIMDARK ULEPSZENIA I CECHY BOJOWE ──
    blood_brotherhood: {
      id: "blood_brotherhood",
      icon: "fas fa-tint",
      costOperationalXP: 75,
    },
    infamous_moniker: {
      id: "infamous_moniker",
      icon: "fas fa-skull",
      costOperationalXP: 50,
    },
    battle_scarred: {
      id: "battle_scarred",
      icon: "fas fa-shield-virus",
      costOperationalXP: 50,
    },
    guard_contacts: {
      id: "guard_contacts",
      icon: "fas fa-user-secret",
      costOperationalXP: 60,
    },
    shadow_tongue: {
      id: "shadow_tongue",
      icon: "fas fa-mask",
      costOperationalXP: 40,
    },
    cold_blooded: {
      id: "cold_blooded",
      icon: "fas fa-snowflake",
      costOperationalXP: 60,
    }
  }, "Perks", { name: "Name", desc: "Desc" });

  /**
   * Oblicza bonus/karę SL za zaletę poplecznika dla danej misji
   */
  static getTraitSLModifier(traitInput, traitType, assignment) {
    if (!traitInput) return 0;
    const traitIds = Array.isArray(traitInput) ? traitInput : [traitInput];
    const pool = traitType === "strength" ? this.TRAITS_CONFIG.strengths : this.TRAITS_CONFIG.flaws;

    let mod = 0;
    for (const tid of traitIds) {
      if (!tid) continue;
      const trait = pool[tid];
      if (!trait) continue;
      if (trait.bonusAssignments && trait.bonusAssignments.includes(assignment)) {
        mod += (trait.slBonus || 0);
      }
      if (trait.penaltyAssignments && trait.penaltyAssignments.includes(assignment)) {
        mod -= (trait.slPenalty || 0);
      }
    }
    return mod;
  }

  /**
   * Normalizuje dowolny ciąg roli do poprawnego identyfikatora ROLES_CONFIG
   */
  static normalizeRole(role) {
    if (!role) return "bodyguard";
    const r = String(role).toLowerCase().trim();
    if (this.ROLES_CONFIG[r]) return r;

    if (/ochron|goryl|osiłek|rzeźnik|żołnierz|tarczownik|drab|mięśniak|kafar|bodyguard|bruiser|thug|soldier|muscle|brute/i.test(r)) return "bodyguard";
    if (/cień|nożownik|nożownicz|złodziej|włamywacz|skrytobój|zabójca|shadow|knife|thief|burglar|assassin|cutthroat/i.test(r)) return "shadow";
    if (/strzelec|kłusownik|kusznik|łucznik|snajper|marksman|poacher|archer|crossbow|sniper|shooter/i.test(r)) return "marksman";
    if (/prowokator|szuler|kuglarz|karciarz|żebrak|aktor|krzykacz|provocateur|sharper|juggler|gambler|beggar|actor/i.test(r)) return "provocateur";
    if (/szabrownik|felczer|zielar|medyk|paser|zbieracz|doktor|scavenger|surgeon|herb|medic|fence|forager|doctor/i.test(r)) return "scavenger";
    if (/woźnic|woznica|przemyt|furman|woźba|przewoźnik|stangret|smuggler|carter|driver|coachman|teamster/i.test(r)) return "smuggler";
    if (/podpal|sabota|pirotech|saper|ogniomistrz|arson|saboteur|pyro|sapper|demolition/i.test(r)) return "saboteur";
    if (/zwiad|tropiciel|scout|tracker/i.test(r)) return "shadow";

    return "bodyguard";
  }
  /**
   * Pobiera listę plotek (ze świata, pliku JSON lub domyślnych)
   * Zwraca tablicę znormalizowanych obiektów plotek
   */
  static getRumors(gang) {
    let list = [];
    if (gang?.customRumors && Array.isArray(gang.customRumors) && gang.customRumors.length > 0) {
      list = gang.customRumors;
    } else {
      try {
        const worldRumors = game.settings?.get("wfrp4e-underworld", "customRumors");
        if (worldRumors && Array.isArray(worldRumors) && worldRumors.length > 0) {
          list = worldRumors;
        }
      } catch (e) {}
    }

    if (list.length === 0 && this._externalContent?.rumors?.length > 0) {
      return this._externalContent.rumors;
    }

    if (list.length === 0) {
      list = this.RUMORS.map((text, i) => ({ id: `rumor-${i + 1}`, text }));
    }

    return list.map((r, i) => this.normalizeRumor(r, i));
  }

  /**
   * Pobiera listę wydarzeń obozowych (ze świata, pliku JSON lub domyślnych)
   * Zwraca tablicę znormalizowanych obiektów wydarzeń
   */
  static getCampEvents(gang) {
    let list = [];
    if (gang?.customCampEvents && Array.isArray(gang.customCampEvents) && gang.customCampEvents.length > 0) {
      list = gang.customCampEvents;
    } else {
      try {
        const worldEvents = game.settings?.get("wfrp4e-underworld", "customCampEvents");
        if (worldEvents && Array.isArray(worldEvents) && worldEvents.length > 0) {
          list = worldEvents;
        }
      } catch (e) {}
    }

    if (list.length === 0 && this._externalContent?.events?.length > 0) {
      return this._externalContent.events;
    }

    if (list.length === 0) {
      list = this.CAMP_EVENTS;
    }

    return list.map((e, i) => this.normalizeEvent(e, i));
  }


  static get RECRUIT_NAMES() { return contentList("Content.RecruitNames"); }

  static RECRUIT_AVATARS = [
    "icons/svg/mystery-man.svg",
    "icons/svg/hooded.svg",
    "icons/svg/target.svg",
    "icons/svg/combat.svg",
    "icons/svg/trap.svg"
  ];

  /**
   * Generuje kandydatów do rekrutacji dla graczy (z 7 rolami, 20 zaletami i 20 wadami)
   */
  static generateRecruitCandidates(count = 3) {
    const rolesKeys = Object.keys(this.ROLES_CONFIG);
    const strengthKeys = Object.keys(this.TRAITS_CONFIG.strengths);
    const flawKeys = Object.keys(this.TRAITS_CONFIG.flaws);

    const shuffledNames = [...this.RECRUIT_NAMES].sort(() => 0.5 - Math.random());
    const candidates = [];

    for (let i = 0; i < count; i++) {
      const roleId = rolesKeys[Math.floor(Math.random() * rolesKeys.length)];
      const roleCfg = this.ROLES_CONFIG[roleId];

      const sKey = strengthKeys[Math.floor(Math.random() * strengthKeys.length)];
      const sCfg = this.TRAITS_CONFIG.strengths[sKey];

      const fKey = flawKeys[Math.floor(Math.random() * flawKeys.length)];
      const fCfg = this.TRAITS_CONFIG.flaws[fKey];

      const name = shuffledNames[i] || t("RecruitFallback", { n: i + 1 });
      const img = this.RECRUIT_AVATARS[Math.floor(Math.random() * this.RECRUIT_AVATARS.length)];

      candidates.push({
        id: `cand-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
        name,
        img,
        role: roleId,
        roleName: roleCfg.name,
        roleIcon: roleCfg.icon,
        roleBadgeClass: roleCfg.badgeClass,
        strengths: [sKey],
        strength: sKey,
        strengthName: sCfg.name,
        strengthDesc: sCfg.desc,
        flaws: [fKey],
        flaw: fKey,
        flawName: fCfg.name,
        flawDesc: fCfg.desc
      });
    }

    return candidates;
  }
}

for (const gear of Object.values(UnderworldTables.GEAR_CONFIG)) {
  Object.defineProperty(gear, "costLabel", { get: () => formatPennies(gear.costPennies), enumerable: true, configurable: true });
}
for (const [id, flaw] of Object.entries(UnderworldTables.TRAITS_CONFIG.flaws)) {
  if (flaw.campEffect) withText(flaw.campEffect, `Flaws.${id}`, { text: "Camp" });
}

/** Cena w pensach jako „10 s” / „1 GC” (skróty walut z tłumaczeń). */
function formatPennies(pennies) {
  if (pennies % 240 === 0) return `${pennies / 240} ${t("Units.GC")}`;
  return `${Math.round(pennies / 12)} ${t("Units.SS")}`;
}
