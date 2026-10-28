/**
 * WFRP4e - Podziemie: Szajka Człowieka (Mobilna Kompania)
 * Model danych i operacje na flagach aktora/świata
 */
import { t } from "./i18n.mjs";

export class GangData {
  static MODULE_ID = "wfrp4e-underworld";
  static FLAG_KEY = "gang";
  static _snapshots = new WeakMap();
  static _saveQueues = new Map();

  /**
   * Zwraca domyślną strukturę nowej mobilnej szajki
   */
  static getDefaultData() {
    return {
      name: game.i18n ? t("DefaultGangName") : "Crew",
      motto: "",
      type: "underworld",
      hideout: "",
      territory: "",
      patron: {
        name: "",
        title: "",
        relation: "neutral",
        cut: "",
        notes: ""
      },
      notoriety: 0,
      bounty: "",
      allies: "",
      rivals: "",
      code: "",
      notes: "",
      supplies: 0,
      morale: 6,
      treasury: { gc: 0, ss: 0, d: 0 },
      camp: { type: "basic" },
      terrain: "city",
      loot: [],
      tokens: {},
      racket: null,
      roster: [],
      history: []
    };
  }
  /**
   * Pobiera dane szajki powiązane z aktorem (lub domyślne)
   * @param {Actor} actor 
   */
  static getGang(actor) {
    if (!actor) return null;
    const flag = actor.getFlag(this.MODULE_ID, this.FLAG_KEY);
    const defaults = this.getDefaultData();
    if (!flag) return defaults;
    const result = (typeof foundry !== "undefined" && foundry.utils?.mergeObject)
      ? foundry.utils.mergeObject(defaults, flag, { inplace: false, insertKeys: true, insertValues: true })
      : Object.assign({}, defaults, flag);

    // Automatyczna naprawa i oczyszczenie nazwy szajki (zabezpieczenie przed tablicami i duplikatami)
    if (Array.isArray(result.name)) {
      const custom = result.name.find(n => typeof n === "string" && n.trim() && n.trim() !== defaults.name);
      result.name = custom || result.name[0] || defaults.name;
    }
    if (typeof result.name === "string") {
      result.name = result.name.trim();
    }

    // Automatyczna naprawa i oczyszczenie motta
    if (Array.isArray(result.motto)) {
      const custom = result.motto.find(m => typeof m === "string" && m.trim() && m.trim() !== defaults.motto);
      result.motto = custom || result.motto[0] || defaults.motto;
    }
    if (typeof result.motto === "string") {
      result.motto = result.motto.trim();
    }

    // Zachowaj stan bazowy przed migracją pola XP, aby zapis usunął dawny klucz
    // i przeniósł pulę rozwoju poplecznika pod nazwę Doświadczenie Operacyjne.
    const saveBaseline = foundry.utils.deepClone(result);
    for (const npc of result.roster || []) {
      if (Object.prototype.hasOwnProperty.call(npc, "xp")) {
        npc.operationalXP = Number(npc.xp) || Number(npc.operationalXP) || 0;
        delete npc.xp;
      }
    }

    // Zapis aktualizuje tylko pola zmienione przez tę operację i nie nadpisuje
    // równoległych zmian innych danych aktora.
    this._snapshots.set(result, saveBaseline);
    return result;
  }

  /**
   * Zapisuje dane szajki na aktorze
   * @param {Actor} actor 
   * @param {Object} gangData 
   */
  static async saveGang(actor, gangData, baseData = null) {
    if (!actor || !gangData) return;

    const actorKey = actor.uuid || actor.id;
    const base = baseData
      ? foundry.utils.deepClone(baseData)
      : this._snapshots.get(gangData)
        ? foundry.utils.deepClone(this._snapshots.get(gangData))
        : null;
    const next = foundry.utils.deepClone(gangData);
    const previousSave = this._saveQueues.get(actorKey) || Promise.resolve();
    const save = previousSave.catch(() => {}).then(async () => {
      const current = actor.getFlag(this.MODULE_ID, this.FLAG_KEY);
      const updates = {};

      // Pierwszy zapis tworzy kompletny zapis aktora. Późniejsze zapisy
      // wysyłają tylko zmienione ścieżki, zachowując inne aktualne dane.
      if (!current || !base) {
        updates[`flags.${this.MODULE_ID}.${this.FLAG_KEY}`] = next;
      } else {
        const writeDiff = (before, after, path) => {
          if (Object.is(before, after)) return;
          const beforeObject = before && typeof before === "object" && !Array.isArray(before);
          const afterObject = after && typeof after === "object" && !Array.isArray(after);
          if (beforeObject && afterObject) {
            const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
            for (const key of keys) {
              const childPath = `${path}.${key}`;
              if (!(key in after)) updates[`${path}.-=${key}`] = null;
              else if (!(key in before)) updates[childPath] = foundry.utils.deepClone(after[key]);
              else writeDiff(before[key], after[key], childPath);
            }
            return;
          }
          if (JSON.stringify(before) !== JSON.stringify(after)) {
            updates[path] = foundry.utils.deepClone(after);
          }
        };

        writeDiff(base, next, `flags.${this.MODULE_ID}.${this.FLAG_KEY}`);
      }

      if (Object.keys(updates).length) await actor.update(updates);
      this._snapshots.set(gangData, next);
      return actor;
    });

    this._saveQueues.set(actorKey, save);
    try {
      return await save;
    } finally {
      if (this._saveQueues.get(actorKey) === save) this._saveQueues.delete(actorKey);
    }
  }

  /**
   * Przelicza stan skarbca na pensy (1 GC = 240 d, 1 ss = 12 d, 1 d = 1 d)
   */
  static treasuryToPennies(treasury) {
    if (!treasury) return 0;
    return (Number(treasury.gc) || 0) * 240 + (Number(treasury.ss) || 0) * 12 + (Number(treasury.d) || 0);
  }

  /**
   * Zamienia pensy na monety w standardzie WFRP
   */
  static penniesToTreasury(totalD) {
    let remainder = Math.max(0, Number(totalD) || 0);
    const gc = Math.floor(remainder / 240);
    remainder %= 240;
    const ss = Math.floor(remainder / 12);
    const d = remainder % 12;
    return { gc, ss, d };
  }
}
