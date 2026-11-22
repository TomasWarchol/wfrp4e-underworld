/**
 * WFRP4e - Podziemie: Szajka Człowieka (Mobilna Kompania)
 * Logika wykonywania 16 typów misji, postoju obozowiska i powiązania z czasem
 */

import { GangData } from "./gang-data.mjs";
import { UnderworldTables } from "./tables-data.mjs";
import { registry, time } from "../../wfrp4e-companion-lib/scripts/companion-lib.mjs";
import { OrderEffects, getAdvantage, modifyAdvantage } from "./order-effects.mjs";
import { MISSIONS, TERRAINS, TARGET_TIERS, LOOT_VALUE, TOKENS, LOOT_NAMES, LOOT_CATEGORIES, missionName, missionLootCategories } from "./world-data.mjs";
import { t, textConfig } from "./i18n.mjs";
import { DATA_MISSIONS, profileHasMission, profileOf } from "./company-profiles.mjs";

const escapeHTML = value => Handlebars.escapeExpression(String(value ?? ""));

/**
 * Oczyszcza HTML budowany przez moduł (notatki kart, efekty rozkazów): zostawia tylko proste znaczniki
 * formatowania, resztę zamienia na tekst. Wstawki od graczy są już escapowane przy składaniu tekstu.
 */
const CARD_HTML_TAGS = new Set(["STRONG", "B", "EM", "I", "U", "BR", "SMALL", "SPAN"]);
const sanitizeCardHTML = value => {
  const template = document.createElement("template");
  template.innerHTML = String(value ?? "");
  const clean = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE) { child.remove(); continue; }
      if (!CARD_HTML_TAGS.has(child.tagName)) {
        child.replaceWith(document.createTextNode(child.textContent));
        continue;
      }
      // Ikony Font Awesome (<i class="fas ...">) zostają, reszta atrybutów odpada
      const cls = child.getAttribute("class");
      for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
      if (cls && /^[\w\s-]+$/.test(cls)) child.setAttribute("class", cls);
      clean(child);
    }
  };
  clean(template.content);
  return template.innerHTML;
};

/** Granice łącznego modyfikatora szajki do progu testu (skala trudności WFRP: od Bardzo Trudnego do Wymagającego +40). */
const MIN_TARGET_MODIFIER = -30;
const MAX_TARGET_MODIFIER = 40;

/** Formuły łupów i zapasów (w srebrnych szylingach, chyba że zaznaczono inaczej). */
const LOOT_FORMULAS = {
  procureSupplies: "1d3",
  procureCoins: "1d8+1",
  pickpocketCoins: "1d8+2",
  intimidateCoins: "1d8+4",
  smuggleCoins: "2d10+5",
  tavernDrinks: "1d2",
  farmSupplies: "1d3",
  poachingSupplies: "1d3+1",
  racketIncomeDaily: "1d6",
  racketIncomeWeekly: "4d6",
  arrestNights: "1d3",
  arrestWeeks: "1d2"
};

/** Parametry zleceń (próg, umiejętność, ryzyko, opis efektu) – z katalogu MISSIONS. */
const MISSION_INFO = MISSIONS;

/**
 * Charakter ryzyka misji – decyduje o skutkach poważnej porażki:
 * low: zwiad i obóz, stealth: kradzież i oszustwo (Rozgłos, areszt), violent: przemoc (rany).
 */
const MISSION_RISK = Object.fromEntries(Object.entries(MISSIONS).filter(([, m]) => m.risk).map(([id, m]) => [id, m.risk]));

/**
 * Zlecenia, które można zaplanować (whitelista – plan zapisany w flagach aktora
 * nie może wywołać dowolnej metody) i ich przydział widoczny na liście Świty.
 */
const PLANNABLE_MISSIONS = Object.fromEntries(Object.entries(MISSIONS).filter(([, m]) => !m.noNpc).map(([id, m]) => [m.fn, id]));

export class UnderworldOperations {

  static MISSION_RISK = MISSION_RISK;
  static LOOT_FORMULAS = LOOT_FORMULAS;
  static PLANNABLE_MISSIONS = PLANNABLE_MISSIONS;
  static MISSION_INFO = MISSION_INFO;

  /** Gdy ustawione, karty zleceń są zbierane do raportu tygodnia zamiast trafiać osobno na czat. */
  static _batch = null;

  /** Rytm szajki: "daily" (każdy dzień osobno) lub "weekly" (Tydzień Szajki). */
  static isWeekly() {
    try {
      return game.settings.get("wfrp4e-underworld", "cycleMode") === "weekly";
    } catch (e) {
      return false;
    }
  }

  /** Kolejka MG w trybie dziennym: przydziały graczy czekają na rozpatrzenie przez MG. */
  static usesDailyQueue() {
    try {
      return game.settings.get("wfrp4e-underworld", "dailyQueue") === true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Czy bieżący użytkownik tylko planuje zlecenia (zamiast rozstrzygać je od razu):
   * zawsze w Tygodniu Szajki, a w trybie dziennym gracze przy włączonej kolejce MG.
   */
  static usesPlanning() {
    return this.isWeekly() || (this.usesDailyQueue() && !game.user.isGM);
  }

  /** Długość aresztu / leczenia w jednostkach cyklu, np. „2 noce” albo „1 tydzień”. */
  static cycleLabel(count) {
    const unit = this.isWeekly() ? "Week" : "Night";
    return t(`Cycle.${unit}${count === 1 ? "One" : "Many"}`, { count });
  }

  static _setting(key, fallback) {
    try {
      const val = game.settings.get("wfrp4e-underworld", key);
      return val !== undefined ? val : fallback;
    } catch (_) {
      return fallback;
    }
  }

  static maxRetinue(gang) {
    const ovr = Math.trunc(Number(gang?.maxRetinueOverride) || 0);
    if (ovr > 0) return Math.max(1, Math.min(6, ovr));
    return Math.max(1, Math.min(6, Math.trunc(Number(this._setting("maxRetinue", 3)) || 3)));
  }

  static maxRoster() {
    return Math.max(0, Math.trunc(Number(this._setting("maxRoster", 0)) || 0));
  }

  static maxGearSlots() {
    return Math.max(1, Math.min(5, Math.trunc(Number(this._setting("maxGearSlots", 2)) || 2)));
  }

  static defaultSupplyPrice() {
    return Math.max(1, Math.trunc(Number(this._setting("defaultSupplyPrice", 12)) || 12));
  }

  static supplyPrice(gang) {
    const custom = Number(gang?.camp?.supplyPricePennies);
    return custom > 0 ? Math.trunc(custom) : this.defaultSupplyPrice();
  }

  static rationsMode() {
    const mode = this._setting("rationsMode", "scaled");
    return ["scaled", "flat1", "off"].includes(mode) ? mode : "scaled";
  }

  static campRestGMOnly() {
    return this._setting("campRestGMOnly", false) === true;
  }

  static directOrdersMode() {
    const mode = this._setting("directOrdersMode", "gm");
    return ["all", "gm", "off"].includes(mode) ? mode : "gm";
  }

  static canUseDirectOrder() {
    const mode = this.directOrdersMode();
    return mode === "all" || (mode === "gm" && !!game.user?.isGM);
  }

  static lootTransferMode() {
    const mode = this._setting("lootTransferMode", "coolOnly");
    return ["gm", "coolOnly", "all"].includes(mode) ? mode : "coolOnly";
  }

  static canTransferLoot(item) {
    if (game.user?.isGM) return true;
    const mode = this.lootTransferMode();
    if (mode === "all") return true;
    if (mode === "coolOnly") return !item?.hot;
    return false;
  }

  static orderAutomation() {
    return this._setting("orderAutomation", "full") === "chatOnly" ? "chatOnly" : "full";
  }

  static orderRoundLimit() {
    return this._setting("orderRoundLimit", "one") === "unlimited" ? "unlimited" : "one";
  }

  static maxHistoryEntries() {
    return Math.max(5, Math.min(100, Math.trunc(Number(this._setting("maxHistoryEntries", 20)) || 20)));
  }

  /** Mnożnik Doświadczenia Operacyjnego (w trybie tygodniowym 3× za tydzień pracy × mnożnik świata). */
  static doMultiplier() {
    const mult = Number(this._setting("oxpMultiplier", 1)) || 1;
    return (this.isWeekly() ? 3 : 1) * mult;
  }

  static _canManageGang(actor) {
    if (!actor || actor.type !== "character") return false;
    if (game.user.isGM) return true;
    return actor.isOwner && registry.isFeatureUnlocked(actor, "underworld");
  }

  static _worldDayKey() {
    return time.dayKey();
  }

  // ════════════════════════════════════════════
  // MORALE, ROZGŁOS I RZUTY
  // ════════════════════════════════════════════

  /** Aktualne Morale (0–10); brak wartości traktujemy jak 6. */
  static getMorale(gang) {
    const value = Number(gang?.morale);
    return Number.isFinite(value) ? Math.max(0, Math.min(10, value)) : 6;
  }

  static changeMorale(gang, delta) {
    gang.morale = Math.max(0, Math.min(10, this.getMorale(gang) + (Number(delta) || 0)));
    return gang.morale;
  }

  static getNotoriety(gang) {
    const value = Number(gang?.notoriety);
    return Number.isFinite(value) ? Math.max(0, Math.min(5, value)) : 0;
  }

  static changeNotoriety(gang, delta) {
    gang.notoriety = Math.max(0, Math.min(5, this.getNotoriety(gang) + (Number(delta) || 0)));
    return gang.notoriety;
  }

  /** Modyfikator do testów misji wynikający z Morale (zgodny z progami w panelu Obozowiska). */
  static moraleModifier(gang) {
    const morale = this.getMorale(gang);
    if (morale >= 8) return { label: t("Mod.MoraleFanatic"), value: 10 };
    if (morale <= 4 && morale >= 3) return { label: t("Mod.MoraleGrumbling"), value: -10 };
    if (morale <= 2) return { label: t("Mod.MoraleMutiny"), value: -20 };
    return null;
  }

  /** Każde 2 punkty Rozgłosu to -10 – miasto i straż wiedzą, kogo szukać. */
  static notorietyModifier(gang, assignment) {
    if (assignment === "cover_tracks") return null;
    const penalty = -10 * Math.floor(this.getNotoriety(gang) / 2);
    return penalty ? { label: t("Mod.Heat", { value: this.getNotoriety(gang) }), value: penalty } : null;
  }

  /**
   * Rzuca formułę Foundry Roll i odkłada ją do listy, aby trafiła do wiadomości na czacie
   * (widoczna dla graczy i dla Dice So Nice).
   */
  static async _roll(formula, rolls) {
    const roll = await new Roll(formula).evaluate();
    rolls?.push(roll);
    return roll.total;
  }

  /** Procent doli Patrona uwzględniający indywidualny wpis kompanii i relację z Patronem. */
  static effectiveCutPercentage(gang) {
    if (!profileOf(gang).patronCut || gang?.patron?.noCut) return 0;
    let base;
    const cutText = String(gang?.patron?.cut ?? "").trim();
    const match = cutText.match(/(\d+)/);
    if (match) {
      base = Number(match[1]);
      if (base === 0) return 0;
    } else {
      base = Number(this._setting("cutPercentage", 25));
    }
    if (!Number.isFinite(base)) base = 25;
    const relation = gang?.patron?.relation || "neutral";
    const relMod = relation === "favorite" ? -5 : relation === "strained" ? 5 : relation === "hostile" ? 10 : 0;
    return Math.max(0, Math.min(75, base + relMod));
  }

  static _creditMissionProfit(gang, grossPennies) {
    const percentage = this.effectiveCutPercentage(gang);
    const gross = Math.max(0, Math.trunc(Number(grossPennies) || 0));
    const cut = Math.floor(gross * percentage / 100);
    const current = GangData.treasuryToPennies(gang.treasury);
    gang.treasury = GangData.penniesToTreasury(current + gross - cut);
    return { gross, cut, net: gross - cut, percentage };
  }

  static _applyMerchantBonus(npc, coinsSS) {
    return coinsSS + (Array.isArray(npc?.narrativePerks) && npc.narrativePerks.includes("craft_merchant") ? 2 : 0);
  }

  static _patronCutNote(profit) {
    if (!profit || profit.cut <= 0) return t("Ops.ToTreasury", { amount: this.formatPennies(profit?.net || 0) });
    return t("Ops.PatronCut", { percent: profit.percentage, cut: this.formatPennies(profit.cut), net: this.formatPennies(profit.net) });
  }

  /** Opis rzutu do notatek karty, np. „1d10+5 = 12”. */
  static _rollNote(rolls) {
    return rolls.length ? rolls.map(r => `${r.formula} = ${r.total}`).join(", ") : "";
  }

  // ════════════════════════════════════════════
  // POMOCNIK: Test i przygotowanie misji
  // ════════════════════════════════════════════

  /** Czy w bieżącym terenie i profilu istnieje zlecenie z wyborem celu (tiered). */
  static terrainHasTieredMission(gang) {
    const terrain = this.getTerrain(gang);
    return Object.values(MISSIONS).some(m =>
      m.tiered && profileHasMission(gang, m) && (m.terrains === "all" || m.terrains.includes(terrain))
    );
  }

  /**
   * Zbiera modyfikatory szajki do progu testu (+10 za każdy stopień przewagi).
   */
  static _collectTargetModifiers(gang, npc, assignment, opts = {}) {
    const modifiers = [];
    const tokensUsed = [];
    const mission = MISSIONS[assignment];
    // Zlecenie z profilu może korzystać z premii odpowiednika z Szajki (zalety, atuty, rynsztunek)
    const like = mission?.like || assignment;
    const add = (label, value) => {
      const amount = Number(value) || 0;
      if (amount) modifiers.push({ label, value: amount });
    };

    // 1. Zalety i rola poplecznika
    const strengths = Array.isArray(npc.strengths) ? [...npc.strengths] : [npc.strength, npc.extraStrength].filter(Boolean);
    add(t("Mod.Strengths"), 10 * UnderworldTables.getTraitSLModifier(strengths, "strength", like));

    // Specjalność roli głównej lub drugiej (premia liczy się raz)
    const specialty = UnderworldTables.rolesOf(npc).some(r => UnderworldTables.ROLES_CONFIG[r]?.bonusAssignments?.includes(assignment));
    if (specialty) add(t("Mod.RoleSpecialty"), 10);

    // 2. Premie z kupionych atutów operacyjnych
    const perks = Array.isArray(npc.narrativePerks) ? npc.narrativePerks : [];
    if (perks.includes("infamous_moniker") && ["intimidate", "distract"].includes(like)) add(t("Mod.InfamousMoniker"), 20);
    if (perks.includes("shadow_tongue") && ["scout", "shadow", "fence"].includes(like)) add(t("Mod.ShadowTongue"), 10);
    if (perks.includes("craft_blacksmith") && ["distract", "intimidate", "sabotage"].includes(like)) add(t("Mod.CraftBlacksmith"), 10);
    if (perks.includes("craft_scribe") && assignment === "forge") add(t("Mod.CraftScribe"), 20);
    if (perks.includes("craft_scribe") && assignment === "bribe") add(t("Mod.CraftScribe"), 10);
    if (perks.includes("craft_woodsman") && assignment === "cover_tracks") add(t("Mod.CraftWoodsman"), 20);
    if (perks.includes("craft_innkeeper") && assignment === "tavern") add(t("Mod.CraftInnkeeper"), 10);

    // 3. Ranga i rynsztunek (powiązany aktor rozwija własne umiejętności na karcie, więc nie dublujemy rangi)
    if (!opts.forLinkedActor) add(t("Mod.Rank"), 10 * (Number(npc.rank) || 0));

    const gear = Array.isArray(npc.gear) ? npc.gear : [];
    if (gear.includes("weapon") && ["distract", "intimidate", "sabotage"].includes(like)) add(t("Mod.Weapon"), 10);
    if (gear.includes("lockpicks") && ["burglary", "farm_theft", "procure", "pickpocket", "sabotage"].includes(like)) add(t("Mod.Lockpicks"), 10);
    if (gear.includes("disguise") && ["scout", "shadow", "tavern", "rumor_spread", "smuggle", "forge"].includes(like)) add(t("Mod.Disguise"), 10);

    // 4. Zatwierdzony bonus MG (w punktach procentowych, jak modyfikator testu WFRP)
    add(t("Mod.GMBonus"), Number(npc.customBonus) || 0);

    // 5. Wady
    const flaws = Array.isArray(npc.flaws) ? [...npc.flaws] : [npc.flaw].filter(Boolean);
    add(t("Mod.Flaws"), 10 * UnderworldTables.getTraitSLModifier(flaws, "flaw", like));

    // 6. Stan szajki i relacja z Patronem
    const morale = this.moraleModifier(gang);
    if (morale) add(morale.label, morale.value);
    const notoriety = this.notorietyModifier(gang, assignment);
    if (notoriety) add(notoriety.label, notoriety.value);
    const patronRelation = gang?.patron?.relation || "neutral";
    if (["favorite", "trusted"].includes(patronRelation) && assignment === "bribe") {
      add(t("Mod.PatronRelation"), 10);
    } else if (patronRelation === "hostile" && ["fence", "bribe"].includes(assignment)) {
      add(t("Mod.PatronRelation"), -10);
    }

    // 7. Wybór celu (łatwy / zwykły / bogaty) i żetony przygotowania
    const tier = mission?.tiered ? (TARGET_TIERS[opts.tier] ? opts.tier : "normal") : null;
    if (tier) {
      if (tier === "rich" && this.getToken(gang, "lead")) {
        tokensUsed.push("lead");
        modifiers.push({ label: t("Mod.RichWithLead"), value: 0 });
      } else {
        add(TARGET_TIERS[tier].name, TARGET_TIERS[tier].modifier);
      }
    }
    if ((tier || (mission?.target && !this.terrainHasTieredMission(gang))) && this.getToken(gang, "recon")) {
      add(TOKENS.recon.name, TOKENS.recon.bonus);
      tokensUsed.push("recon");
    }
    if (mission?.target && this.getToken(gang, "commotion")) {
      add(TOKENS.commotion.name, TOKENS.commotion.bonus);
      tokensUsed.push("commotion");
    }

    const raw = modifiers.reduce((sum, m) => sum + m.value, 0);
    const total = Math.max(MIN_TARGET_MODIFIER, Math.min(MAX_TARGET_MODIFIER, raw));
    return { modifiers, total, capped: total !== raw, tier, tokensUsed };
  }

  // ════════════════════════════════════════════
  // TEREN, ŻETONY PRZYGOTOWANIA I ŁUPY
  // ════════════════════════════════════════════

  /** Bieżący teren szajki (miasto / wieś / las / góry). */
  static getTerrain(gang) {
    return TERRAINS[gang?.terrain] ? gang.terrain : "city";
  }

  static getToken(gang, kind) {
    const token = gang?.tokens?.[kind];
    return token && Number(token.nightsLeft) > 0 ? token : null;
  }

  static setToken(gang, kind) {
    if (!TOKENS[kind]) return;
    gang.tokens = gang.tokens && typeof gang.tokens === "object" ? gang.tokens : {};
    gang.tokens[kind] = { nightsLeft: this.isWeekly() ? 1 : TOKENS[kind].nights };
  }

  /** Upływ nocy (lub tygodnia): żetony wygasają, łupy stygną. */
  static tickPreparationAndLoot(gang, weekly = false) {
    for (const kind of Object.keys(gang.tokens || {})) {
      const left = weekly ? 0 : (Number(gang.tokens[kind]?.nightsLeft) || 0) - 1;
      if (left > 0) gang.tokens[kind].nightsLeft = left;
      else delete gang.tokens[kind];
    }
    for (const item of gang.loot || []) {
      item.hot = weekly ? 0 : Math.max(0, (Number(item.hot) || 0) - 1);
    }
  }

  /** Nazwa kategorii łupu w bieżącym języku. */
  static lootCategoryName(category) {
    return LOOT_CATEGORIES[category]?.name || category;
  }

  /**
   * Tworzy łup (gorący towar) i dodaje go do szajki. Rzut wartości trafia do wiadomości czatu,
   * losowanie nazwy nie (to tylko kolor).
   */
  static async _createLoot(gang, assignment, tier, rolls, origin) {
    const terrain = this.getTerrain(gang);
    const categories = missionLootCategories(MISSIONS[assignment] || {}, terrain);
    const category = categories[(await this._roll(`1d${categories.length}`)) - 1];
    const names = LOOT_NAMES[category] || LOOT_NAMES.goods;
    const name = names[(await this._roll(`1d${names.length}`)) - 1];
    const valueSS = await this._roll(LOOT_VALUE[tier] || LOOT_VALUE.normal, rolls);
    const item = {
      id: foundry.utils.randomID(),
      name,
      category,
      valueSS,
      hot: !profileOf(gang).hotLoot ? 0 : this.isWeekly() ? 1 : 2,
      origin: origin || missionName(MISSIONS[assignment] || {}, terrain),
      terrain
    };
    gang.loot = Array.isArray(gang.loot) ? gang.loot : [];
    gang.loot.push(item);
    return item;
  }

  /** Opis łupu do karty czatu. */
  static lootLabel(item) {
    return `<strong>${escapeHTML(item.name)}</strong> (${this.lootCategoryName(item.category)}, ~${item.valueSS} ${t("Units.SS")}${item.hot ? `, ${t("Loot.Hot")}` : ""})`;
  }

  /**
   * Przekazuje łup Hersztowi jako zwykły przedmiot WFRP4e (np. coś, co chce zatrzymać).
   */
  static async transferLootToActor(actor, lootId) {
    if (!this._canManageGang(actor)) return false;
    const gang = GangData.getGang(actor);
    const item = (gang.loot || []).find(l => l.id === lootId);
    if (!item) return false;
    if (!this.canTransferLoot(item)) {
      ui.notifications.warn(t(this.lootTransferMode() === "gm" ? "Loot.TransferGMOnly" : "Loot.TransferHotBlocked"));
      return false;
    }
    await actor.createEmbeddedDocuments("Item", [{
      name: item.name,
      type: "trapping",
      img: "icons/containers/bags/sack-simple-leather-brown.webp",
      system: {
        trappingType: { value: "misc" },
        quantity: { value: 1 },
        price: { gc: Math.floor(item.valueSS / 20), ss: item.valueSS % 20, bp: 0 },
        description: { value: `<p>${t(item.hot ? "Loot.ItemDescHot" : "Loot.ItemDesc", { origin: escapeHTML(item.origin || "") })}</p>` }
      }
    }]);
    gang.loot = gang.loot.filter(l => l.id !== lootId);
    await GangData.saveGang(actor, gang);
    ui.notifications.info(t("Loot.Transferred", { item: item.name, actor: actor.name }));
    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="wfrp4e-underworld-chat"><p><i class="fas fa-hand-holding"></i> ${t("Loot.ChatTransferred", { item: escapeHTML(item.name), value: item.valueSS, actor: escapeHTML(actor.name) })}</p></div>`,
      flavor: t("Loot.Flavor")
    });
    return true;
  }

  /** Usuwa łup (wyrzucony, oddany, zgubiony). */
  static async discardLoot(actor, lootId) {
    if (!this._canManageGang(actor)) return false;
    const gang = GangData.getGang(actor);
    const item = (gang.loot || []).find(l => l.id === lootId);
    if (!item) return false;
    gang.loot = (gang.loot || []).filter(l => l.id !== lootId);
    await GangData.saveGang(actor, gang);
    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="wfrp4e-underworld-chat"><p><i class="fas fa-trash"></i> ${t("Loot.ChatDiscarded", { item: escapeHTML(item.name), value: item.valueSS })}</p></div>`,
      flavor: t("Loot.Flavor")
    });
    return true;
  }

  /**
   * Test WFRP4e z karty aktora. Modyfikator trafia do okna testu, więc gracz go widzi.
   * Zwraca null, gdy okno testu zostało zamknięte bez rzutu.
   */
  static async _rollWfrpSkill(actor, skillName, { title = t("Title"), modifier = 0 } = {}) {
    if (!actor?.setupSkill) return null;
    const test = await actor.setupSkill(skillName, {
      appendTitle: ` - ${title}`,
      skipTargets: true,
      fields: { difficulty: "challenging", modifier: Number(modifier) || 0 }
    });
    if (!test) return null;
    await test.roll();
    return {
      roll: Number(test.result.roll),
      sl: Number(test.result.SL) || 0,
      isSuccess: !!test.succeeded,
      target: Number(test.result.target),
      test
    };
  }

  /**
   * Test uproszczony szajki: 1d100 przeciwko progowi misji z modyfikatorami.
   * 01–05 to zawsze sukces, 96–00 zawsze porażka.
   */
  static async _rollGangTest(target, rolls) {
    const roll = await this._roll("1d100", rolls);
    const method = game.settings.get("wfrp4e", "SLMethod");
    let sl = method === "dos"
      ? Math.trunc(Math.abs(target - roll) / 10) * (target >= roll ? 1 : -1)
      : Math.floor(target / 10) - Math.floor(roll / 10);
    let isSuccess = roll <= target;
    if (roll <= 5) { isSuccess = true; sl = Math.max(sl, 1); }
    if (roll >= 96) { isSuccess = false; sl = Math.min(sl, -1); }
    return { roll, sl, isSuccess, target };
  }

  /**
   * Skutki poważnej porażki (SL -2 i gorzej) zależne od charakteru misji.
   * @returns {Promise<string[]>} opisy skutków do karty
   */
  static async _applyFailureRisk(gang, npc, assignment, sl, rolls, { forceRisk = false } = {}) {
    const risk = MISSION_RISK[assignment];
    const consequences = [];
    if (forceRisk && sl > -2) sl = -2; // bogaty cel: każda porażka grozi wpadką
    if (!risk || sl > -2) return consequences;
    const severe = sl <= -4;

    if (risk === "low") {
      if (severe) {
        this.changeNotoriety(gang, 1);
        consequences.push(t("Risk.Result.FaceRemembered"));
      }
    } else if (risk === "stealth") {
      this.changeNotoriety(gang, 1);
      if (severe) {
        const nights = await this._roll(this.isWeekly() ? LOOT_FORMULAS.arrestWeeks : LOOT_FORMULAS.arrestNights, rolls);
        npc.status = "arrested";
        npc.assignment = "none";
        npc.arrestedNights = nights;
        npc.arrestedOn = this._worldDayKey(); // areszt liczy się od następnego postoju / tygodnia
        consequences.push(t("Risk.Result.Arrested", { name: escapeHTML(npc.name), time: this.cycleLabel(nights) }));
      } else {
        consequences.push(t("Risk.Result.Chase"));
      }
    } else if (risk === "violent") {
      const gear = Array.isArray(npc.gear) ? npc.gear : [];
      const hasArmor = gear.includes("armor");
      const isVeteran = (Number(npc.rank) || 0) >= 2;
      const avoided = (hasArmor || isVeteran) && (await this._roll("1d2", rolls)) === 1;
      if (avoided) {
        const reason = hasArmor ? t("Orders.MeatShield.Armour") : t("Orders.MeatShield.Veteran");
        consequences.push(t("Risk.Result.WoundAvoided", { name: escapeHTML(npc.name), reason }));
        if (severe) {
          this.changeNotoriety(gang, 1);
          consequences.push(t("Risk.Result.FaceRemembered"));
        }
      } else {
        npc.status = "wounded";
        npc.assignment = "none";
        if (severe) {
          this.changeNotoriety(gang, 1);
          consequences.push(t("Risk.Result.WoundedLoud", { name: escapeHTML(npc.name) }));
        } else {
          consequences.push(t("Risk.Result.Wounded", { name: escapeHTML(npc.name) }));
        }
      }
    }
    return consequences;
  }

  /**
   * Wspólna logika: znajdź NPC, policz modyfikatory, wykonaj test, oznacz jako zajętego.
   * Zwraca null jeśli NPC nie istnieje albo test został anulowany.
   * Test misji przyznaje Doświadczenie Operacyjne; to nie są standardowe PD WFRP.
   */
  static async _prepareMission(actor, npcId, assignment, baseTarget, opts = {}) {
    if (!this._canManageGang(actor)) {
      ui.notifications.warn(t("Notify.NoAccess"));
      return null;
    }
    const gang = GangData.getGang(actor);
    const npc = gang.roster.find(n => n.id === npcId);
    if (!npc) return null;
    if (npc.status !== "ready" || npc.assignment === "retinue") {
      ui.notifications.warn(t("Notify.NotReadyForJob", { name: npc.name }));
      return null;
    }

    const linkedActor = npc.actorId ? game.actors.get(npc.actorId) : null;
    const testActor = linkedActor?.setupSkill && (game.user.isGM || linkedActor.isOwner) ? linkedActor : null;
    const skillName = game.i18n.localize(MISSION_INFO[assignment]?.skill || "NAME.Leadership");

    const { modifiers, total: baseTotalModifier, capped, tier, tokensUsed } = this._collectTargetModifiers(
      gang, npc, assignment, { ...opts, forLinkedActor: !!testActor }
    );
    let targetModifier = baseTotalModifier;
    const rolls = [];
    let result = null;
    let testSource = "module";

    if (testActor) {
      try {
        const missionDiffMod = (Number(baseTarget) || 50) - 50;
        result = await this._rollWfrpSkill(testActor, skillName, {
          title: `${t("Title")}: ${npc.name}`,
          modifier: baseTotalModifier + missionDiffMod
        });
        if (!result) return null; // okno testu zamknięte – misja nie wystartowała
        testSource = "linkedActor";
        if (missionDiffMod) {
          modifiers.push({ label: t("Mod.MissionDifficulty"), value: missionDiffMod });
          targetModifier += missionDiffMod;
        }
      } catch (err) {
        console.error("wfrp4e-underworld | WFRP4e test failed, falling back to the job target:", err);
        result = null;
      }
    }

    // Bez dostępnej karty członka używamy progu misji. Nie pożyczamy umiejętności
    // herszta, bo rozwój bohatera nie może zastępować rozwoju poplecznika.
    if (!result) {
      result = await this._rollGangTest(Math.max(1, baseTarget + baseTotalModifier), rolls);
    }
    const { roll, sl, isSuccess, target } = result;

    npc.status = "busy";
    npc.assignment = assignment;

    const perks = Array.isArray(npc.narrativePerks) ? npc.narrativePerks : [];
    const skipMoraleOnFail = perks.includes("battle_scarred") || perks.includes("blood_brotherhood");
    let coldBloodedTriggered = false;
    if (!isSuccess && perks.includes("cold_blooded") && !npc.coldBloodedUsedCycle) {
      npc.coldBloodedUsedCycle = true;
      coldBloodedTriggered = true;
    }

    // Efekty wad po misji
    const flaws = Array.isArray(npc.flaws) ? [...npc.flaws] : [npc.flaw].filter(Boolean);
    for (const fid of flaws) {
      const flawCfg = UnderworldTables.TRAITS_CONFIG.flaws[fid];
      if (!flawCfg) continue;
      // Kleptoman: -1 Morale po każdej misji
      if (flawCfg.moralePenalty) this.changeMorale(gang, -flawCfg.moralePenalty);
      // Mściwy / Panikarz: -1 Morale po przegranej misji
      if (!isSuccess && flawCfg.moraleOnFail && !coldBloodedTriggered && !skipMoraleOnFail) {
        this.changeMorale(gang, -flawCfg.moraleOnFail);
      }
      // Poszukiwany: +1 Rozgłos po wpadce
      if (!isSuccess && flawCfg.notorietyOnFail && !coldBloodedTriggered) {
        this.changeNotoriety(gang, flawCfg.notorietyOnFail);
      }
      // Krwiożerczy: +1 Rozgłos po udanej dywersji lub zastraszaniu
      if (isSuccess && flawCfg.notorietyOnSuccess && ["distract", "intimidate"].includes(MISSIONS[assignment]?.like || assignment)) {
        this.changeNotoriety(gang, flawCfg.notorietyOnSuccess);
      }
    }

    // Żetony przygotowania: zużyte przy tym teście znikają, sukces może dać nowe
    for (const kind of tokensUsed) delete gang.tokens?.[kind];
    const gains = [];
    const mission = MISSIONS[assignment];
    if (isSuccess && mission?.produces) {
      this.setToken(gang, mission.produces);
      gains.push(t("Tokens.Gained", { name: TOKENS[mission.produces].name, desc: TOKENS[mission.produces].desc }));
    }
    if (isSuccess && mission?.leadOnGreat && sl >= 3) {
      this.setToken(gang, "lead");
      gains.push(t("Tokens.Gained", { name: TOKENS.lead.name, desc: TOKENS.lead.desc }));
    }

    // Ryzyko poważnej porażki (bogaty cel: każda porażka); Zimna Krew chroni przed pierwszą wpadką
    let consequences = [];
    if (!isSuccess) {
      if (coldBloodedTriggered) {
        consequences = [t("Risk.Result.ColdBlooded", { name: escapeHTML(npc.name) })];
      } else {
        consequences = await this._applyFailureRisk(gang, npc, assignment, sl, rolls, {
          forceRisk: !!TARGET_TIERS[tier]?.riskOnAnyFailure
        });
      }
    }

    // Doświadczenie (DO): sukces +10 (SL >= 3: +15), porażka +5 (nauka na błędach)
    const baseXP = isSuccess ? (sl >= 3 ? 15 : 10) : 5;
    const operationalXpGained = Math.max(1, Math.round(baseXP * this.doMultiplier()));
    npc.operationalXP = (Number(npc.operationalXP) || 0) + operationalXpGained;

    return {
      gang, npc, roll, sl, isSuccess, target, targetModifier, capped, operationalXpGained,
      modifiers, consequences, rolls, testSource, tier, gains, coldBloodedTriggered
    };
  }

  /**
   * Wspólna karta bazowa do czatu
   */
  /** Czytelna nazwa roli członka (np. „Cień / Nożownik” zamiast klucza „shadow”). */
  static roleName(role) {
    const key = UnderworldTables.normalizeRole(role);
    return UnderworldTables.ROLES_CONFIG[key]?.name || role || "";
  }

  static _baseCard(r, title) {
    return {
      title,
      npcName: r.npc.name,
      npcRole: this.roleName(r.npc.role),
      npcImg: r.npc.img || "icons/svg/mystery-man.svg",
      roll: r.roll,
      sl: r.sl,
      target: r.target,
      targetModifier: r.targetModifier,
      capped: r.capped,
      isSuccess: r.isSuccess,
      operationalXpGained: r.operationalXpGained,
      modifiers: r.modifiers,
      consequences: r.consequences,
      gains: r.gains || [],
      tierName: r.tier ? TARGET_TIERS[r.tier].name : null,
      rolls: r.rolls,
      testSource: r.testSource,
      noPatronCut: !profileOf(r.gang).patronCut || !!r.gang?.patron?.noCut,
      patronCutPct: this.effectiveCutPercentage(r.gang),
      // Wygląd Księgi: glif zlecenia, typ kompanii i wielki sukces (pieczęć na karcie czatu)
      jobGlyph: MISSIONS[r.npc.assignment] ? `job-${r.npc.assignment}` : null,
      companyType: profileOf(r.gang).id,
      greatSuccess: !!r.isSuccess && Number(r.sl) >= 3
    };
  }

  // ════════════════════════════════════════════
  // TYDZIEŃ SZAJKI: PLANOWANIE I ROZPATRZENIE
  // ════════════════════════════════════════════

  /** Zwraca zbiór łupów i rannych już zarezerwowanych w aktywnych planach. */
  static plannedResourceUsage(gang) {
    const lootIds = new Set();
    const woundedIds = new Set();
    for (const npc of gang?.roster || []) {
      const plan = npc.plannedMission;
      if (!plan || npc.status !== "busy") continue;
      const assignment = PLANNABLE_MISSIONS[plan.fn];
      if (assignment === "fence") {
        for (const id of String(plan.input || "").split(",").map(s => s.trim()).filter(Boolean)) {
          lootIds.add(id);
        }
      } else if (assignment === "tend_wounded" && plan.input) {
        woundedIds.add(String(plan.input));
      } else if (plan.cargoId) {
        lootIds.add(String(plan.cargoId));
      }
    }
    return { lootIds, woundedIds };
  }

  /**
   * Planuje zlecenie na tydzień – bez testu. Członek jest zajęty do rozpatrzenia tygodnia przez MG.
   * @param {string} fn     Nazwa metody zlecenia (musi być w PLANNABLE_MISSIONS)
   * @param {string} input  Opis celu / ładunku albo id rannego dla Opieki nad Rannymi
   */
  static async planMission(actor, npcId, fn, input = "", tier = null) {
    if (!this._canManageGang(actor)) {
      ui.notifications.warn(t("Notify.NoAccess"));
      return false;
    }
    const assignment = PLANNABLE_MISSIONS[fn];
    if (!assignment) return false;
    const gang = GangData.getGang(actor);
    // Zlecenie musi należeć do typu kompanii, a zlecenie z ładunkiem wymaga niezarezerwowanego łupu
    if (!profileHasMission(gang, MISSIONS[assignment])) return false;
    const usage = this.plannedResourceUsage(gang);
    let plannedInput = String(input ?? "").slice(0, 300);
    let cargoId = null;

    if (MISSIONS[assignment].consumes) {
      const cargo = this.cargoFor(gang, MISSIONS[assignment], usage.lootIds);
      if (!cargo) {
        ui.notifications.warn(t("Ops.NoCargo", { mission: t(`Missions.${assignment}.Name`) }));
        return false;
      }
      cargoId = cargo.id;
    } else if (assignment === "fence") {
      const freeIds = plannedInput.split(",").map(s => s.trim()).filter(id => id && !usage.lootIds.has(id));
      if (!freeIds.length) {
        ui.notifications.warn(t("Card.PlannedReserved"));
        return false;
      }
      plannedInput = freeIds.join(",");
    } else if (assignment === "tend_wounded") {
      if (!plannedInput || usage.woundedIds.has(plannedInput)) {
        ui.notifications.warn(t("Card.PlannedReserved"));
        return false;
      }
    }

    const npc = gang.roster.find(n => n.id === npcId);
    if (!npc || npc.status !== "ready" || npc.assignment === "retinue") {
      ui.notifications.warn(t("Notify.NotReadyForAssignment", { name: npc?.name || t("ThisMember") }));
      return false;
    }
    npc.status = "busy";
    npc.assignment = assignment;
    npc.plannedMission = {
      fn,
      input: plannedInput,
      tier: TARGET_TIERS[tier] ? tier : null,
      ...(cargoId ? { cargoId } : {})
    };
    await GangData.saveGang(actor, gang);
    return true;
  }

  /**
   * Rozpatruje cały tydzień (tylko MG): zaplanowane zlecenia po kolei, potem tydzień w obozie
   * (wyżywienie, leczenie, zdarzenie, obława, dezercja). Wszystko trafia do jednego raportu.
   * @param {object} options  Opcje obozu jak w executeCampRest oraz advanceTime (przesuń czas świata o 7 dni)
   */
  static async executeWeek(actor, options = {}) {
    if (!game.user.isGM) {
      ui.notifications.warn(t("Notify.GMResolvesWeek"));
      return false;
    }
    if (!this._canManageGang(actor)) return false;
    const gang = GangData.getGang(actor);
    if (gang.lastCampRestDay === this._worldDayKey()) {
      ui.notifications.warn(t("Notify.WeekAlreadyResolved"));
      return false;
    }

    const { missionCards, extraRolls } = await this._resolvePlans(actor);
    const result = await this.executeCampRest(actor, { ...options, weekly: true, missionCards, extraRolls });
    if (result !== false && options.advanceTime) {
      await game.time.advance(7 * time.secondsPerDay());
    }
    return result;
  }

  /**
   * Rozpatruje wszystkie zaplanowane zlecenia szajki (u MG) i zbiera ich karty zamiast publikować je osobno.
   * @returns {Promise<{missionCards: object[], extraRolls: Roll[]}>}
   */
  static async _resolvePlans(actor) {
    const gang = GangData.getGang(actor);

    // Zaplanowani członkowie wracają do gotowości, aby zlecenia mogły ich wysłać
    const plans = [];
    for (const npc of gang.roster) {
      const plan = npc.plannedMission;
      delete npc.plannedMission;
      if (!plan || !PLANNABLE_MISSIONS[plan.fn] || npc.status !== "busy") continue;
      npc.status = "ready";
      npc.assignment = "none";
      // Plan sprzed zmiany typu kompanii przepada, a członek wraca do gotowości
      if (!profileHasMission(gang, MISSIONS[PLANNABLE_MISSIONS[plan.fn]])) continue;
      plans.push({ npcId: npc.id, ...plan });
    }
    await GangData.saveGang(actor, gang);

    const missionCards = [];
    this._batch = missionCards;
    try {
      for (const plan of plans) {
        await this[plan.fn](actor, plan.npcId, plan.input, { tier: plan.tier, cargoId: plan.cargoId });
      }
    } finally {
      this._batch = null;
    }
    return { missionCards, extraRolls: missionCards.flatMap(card => card.rolls || []) };
  }

  /**
   * Kolejka MG (tryb dzienny): rozpatruje przydziały graczy i publikuje jeden raport.
   */
  static async resolveQueue(actor) {
    if (!game.user.isGM) {
      ui.notifications.warn(t("Notify.GMResolvesQueue"));
      return false;
    }
    if (!this._canManageGang(actor)) return false;
    const { missionCards, extraRolls } = await this._resolvePlans(actor);
    if (!missionCards.length) {
      ui.notifications.info(t("Notify.NoPendingAssignments"));
      return false;
    }
    const html = await foundry.applications.handlebars.renderTemplate(
      "modules/wfrp4e-underworld/templates/chat/missions-report.hbs",
      { title: t("Report.QueueTitle"), missions: missionCards }
    );
    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content: html,
      rolls: extraRolls,
      flavor: t("Report.QueueFlavor")
    });
    return true;
  }

  // ════════════════════════════════════════════
  // KATEGORIA 1: WYWIAD
  // ════════════════════════════════════════════

  /**
   * Zwiad Terenu – przeczesanie okolicy, tropy, plotki ze szlaku
   */
  static async executeScoutMission(actor, npcId) {
    const r = await this._prepareMission(actor, npcId, "scout", MISSION_INFO.scout.target);
    if (!r) return;

    const rumorObj = r.isSuccess ? await UnderworldTables.drawRumor(r.gang) : null;
    const rumor = rumorObj ? (typeof rumorObj === "string" ? rumorObj : rumorObj.text) : null;
    await GangData.saveGang(actor, r.gang);

    const card = {
      ...this._baseCard(r, missionName(MISSIONS.scout, this.getTerrain(r.gang))),
      rumor,
      rumorData: rumorObj,
      notes: r.isSuccess
        ? t("Card.Scout.Success")
        : t("Card.Scout.Fail")
    };
    await this.postMissionChatCard(actor, card);
    return card;

  }

  /**
   * Śledzenie Celu – dyskretna obserwacja konkretnej osoby
   */
  static async executeShadowMission(actor, npcId, targetName) {
    const r = await this._prepareMission(actor, npcId, "shadow", MISSION_INFO.shadow.target);
    if (!r) return;

    const detail = r.isSuccess ? UnderworldTables.getRandomShadowResult() : null;
    await GangData.saveGang(actor, r.gang);

    const card = {
      ...this._baseCard(r, missionName(MISSIONS.shadow, this.getTerrain(r.gang))),
      rumor: detail,
      notes: r.isSuccess
        ? t("Card.Shadow.Success", { name: escapeHTML(r.npc.name), target: escapeHTML(targetName || t("Card.Shadow.Unknown")) })
        : t("Card.Shadow.Fail", { name: escapeHTML(r.npc.name), target: escapeHTML(targetName || t("Card.Shadow.Target")) })
    };
    await this.postMissionChatCard(actor, card);
    return card;
  }

  /**
   * Nasłuch w Szynku – zbieranie plotek w karczmie
   */
  static async executeTavernMission(actor, npcId) {
    const r = await this._prepareMission(actor, npcId, "tavern", MISSION_INFO.tavern.target);
    if (!r) return;

    const rumorObj = r.isSuccess ? await UnderworldTables.drawRumor(r.gang) : null;
    const gossip = rumorObj ? (typeof rumorObj === "string" ? rumorObj : rumorObj.text) : null;
    let extraRumorText = "";

    // Drobny koszt: kolejki dla gadatliwych + dodatkowa plotka przy Dawnym Fachu Szynkarza
    let drinksSS = 0;
    if (r.isSuccess) {
      drinksSS = await this._roll(LOOT_FORMULAS.tavernDrinks, r.rolls);
      const curP = GangData.treasuryToPennies(r.gang.treasury);
      r.gang.treasury = GangData.penniesToTreasury(Math.max(0, curP - drinksSS * 12));

      if (Array.isArray(r.npc.narrativePerks) && r.npc.narrativePerks.includes("craft_innkeeper")) {
        const extraObj = await UnderworldTables.drawRumor(r.gang);
        const extraText = extraObj ? (typeof extraObj === "string" ? extraObj : extraObj.text) : null;
        if (extraText && extraText !== gossip) {
          extraRumorText = ` ${t("Card.Tavern.ExtraRumor", { rumor: escapeHTML(extraText) })}`;
        }
      }
    }

    await GangData.saveGang(actor, r.gang);

    const card = {
      ...this._baseCard(r, missionName(MISSIONS.tavern, this.getTerrain(r.gang))),
      rumor: gossip,
      rumorData: rumorObj,
      notes: r.isSuccess
        ? t("Card.Tavern.Success", { name: escapeHTML(r.npc.name), cost: drinksSS }) + extraRumorText
        : t("Card.Tavern.Fail", { name: escapeHTML(r.npc.name) })
    };
    await this.postMissionChatCard(actor, card);
    return card;

  }

  // ════════════════════════════════════════════
  // KATEGORIA 2: ZASOBY
  // ════════════════════════════════════════════

  /**
   * Szaber i Zbieractwo – zapasy i drobne pieniądze
   */
  static async executeProcureMission(actor, npcId) {
    const r = await this._prepareMission(actor, npcId, "procure", MISSION_INFO.procure.target);
    if (!r) return;

    let suppliesFound = 0;
    let coinsFoundSS = 0;
    let horseBonusText = "";
    if (r.isSuccess) {
      suppliesFound = await this._roll(LOOT_FORMULAS.procureSupplies, r.rolls);
      if (Array.isArray(r.npc.gear) && r.npc.gear.includes("horse")) {
        suppliesFound += 1;
        horseBonusText = t("Card.Procure.HorseBonus");
      }
      coinsFoundSS = this._applyMerchantBonus(r.npc, await this._roll(LOOT_FORMULAS.procureCoins, r.rolls));
      r.gang.supplies = Math.min(30, (r.gang.supplies || 0) + suppliesFound);
      this._creditMissionProfit(r.gang, coinsFoundSS * 12);
    }

    await GangData.saveGang(actor, r.gang);

    const card = {
      ...this._baseCard(r, missionName(MISSIONS.procure, this.getTerrain(r.gang))),
      suppliesFound,
      coinsFoundSS,
      notes: r.isSuccess
        ? t("Card.Procure.Success", { supplies: suppliesFound, horse: horseBonusText, coins: coinsFoundSS })
        : t("Card.Procure.Fail")
    };
    await this.postMissionChatCard(actor, card);
    return card;
  }

  /**
   * Kieszonkarstwo – gotówka od razu (zależna od celu), czasem kosztowność do upłynnienia
   */
  static async executePickpocketMission(actor, npcId, input, opts = {}) {
    const r = await this._prepareMission(actor, npcId, "pickpocket", MISSION_INFO.pickpocket.target, opts);
    if (!r) return;

    let coinsFoundSS = 0;
    let lootItem = null;
    if (r.isSuccess) {
      const multiplier = TARGET_TIERS[r.tier]?.multiplier ?? 1;
      coinsFoundSS = this._applyMerchantBonus(r.npc, Math.max(1, Math.round((await this._roll(LOOT_FORMULAS.pickpocketCoins, r.rolls)) * multiplier)));
      this._creditMissionProfit(r.gang, coinsFoundSS * 12);
      const lootChance = r.tier === "rich" ? 35 : (r.tier === "normal" ? 15 : 0);
      if (lootChance > 0 && (await this._roll("1d100", r.rolls)) <= lootChance) {
        const lootTier = r.tier === "rich" ? "normal" : "easy";
        lootItem = await this._createLoot(r.gang, "pickpocket", lootTier, r.rolls);
      }
    } else if (!r.coldBloodedTriggered) {
      this.changeMorale(r.gang, -1);
    }

    await GangData.saveGang(actor, r.gang);

    const card = {
      ...this._baseCard(r, missionName(MISSIONS.pickpocket, this.getTerrain(r.gang))),
      coinsFoundSS,
      notes: r.isSuccess
        ? t("Card.Pickpocket.Success", { name: escapeHTML(r.npc.name), coins: coinsFoundSS }) + (lootItem ? ` ${t("Card.Pickpocket.Extra", { loot: this.lootLabel(lootItem) })}` : "")
        : t("Card.Pickpocket.Fail", { name: escapeHTML(r.npc.name) })
    };
    await this.postMissionChatCard(actor, card);
    return card;
  }

  /**
   * Wspólny przebieg zleceń, które dają łup do upłynnienia (włamanie, napad, grabież…).
   * extraOnGreat: przy SL 3+ drugi łup.
   */
  static async _lootMission(actor, npcId, assignment, input, opts, { successText, failText, supplies = null }) {
    const r = await this._prepareMission(actor, npcId, assignment, MISSION_INFO[assignment].target, opts);
    if (!r) return;
    const loot = [];
    let suppliesFound = 0;
    if (r.isSuccess) {
      loot.push(await this._createLoot(r.gang, assignment, r.tier, r.rolls, input ? `${missionName(MISSIONS[assignment], this.getTerrain(r.gang))}: ${input}` : null));
      if (r.sl >= 3) loot.push(await this._createLoot(r.gang, assignment, r.tier, r.rolls));
      if (supplies) {
        const multiplier = TARGET_TIERS[r.tier]?.multiplier ?? 1;
        suppliesFound = Math.max(1, Math.round((await this._roll(supplies, r.rolls)) * multiplier));
        r.gang.supplies = Math.min(30, (r.gang.supplies || 0) + suppliesFound);
      }
    }
    await GangData.saveGang(actor, r.gang);

    const lootText = loot.map(item => this.lootLabel(item)).join(", ");
    const card = {
      ...this._baseCard(r, missionName(MISSIONS[assignment], this.getTerrain(r.gang))),
      suppliesFound,
      notes: r.isSuccess
        ? [successText(r), t("Card.Loot.Haul", { loot: lootText }), suppliesFound ? t("Card.Loot.Supplies", { value: suppliesFound }) : "", t("Card.Loot.HotHint")].filter(Boolean).join(" ")
        : failText(r)
    };
    await this.postMissionChatCard(actor, card);
    return card;
  }

  /**
   * Zlecenie opisane danymi (DATA_MISSIONS): test, potem skutki z success / great / failure.
   */
  static async executeDataMission(id, actor, npcId, input, opts = {}) {
    const mission = MISSIONS[id];
    const initialGang = GangData.getGang(actor);
    const plannedCargo = opts.cargoId ? (initialGang.loot || []).find(item => item.id === opts.cargoId) : null;
    // Zlecenie z ładunkiem (np. kurs barką, raport) nie rusza bez pasującego łupu
    if (mission.consumes && !plannedCargo && !this.cargoFor(initialGang, mission)) {
      ui.notifications.warn(t("Ops.NoCargo", { mission: t(`Missions.${id}.Name`) }));
      return;
    }
    const r = await this._prepareMission(actor, npcId, id, mission.target, opts);
    if (!r) return;

    const multiplier = TARGET_TIERS[r.tier]?.multiplier ?? 1;
    const outcomes = [r.isSuccess ? mission.success : mission.failure];
    if (r.isSuccess && r.sl >= 3 && mission.great) outcomes.push(mission.great);

    let coinsFoundSS = 0;
    const cargoNotes = [];
    const cargo = mission.consumes
      ? ((opts.cargoId && (r.gang.loot || []).find(item => item.id === opts.cargoId)) || this.cargoFor(r.gang, mission))
      : null;
    if (cargo && (r.isSuccess || mission.consumes.always)) {
      r.gang.loot = r.gang.loot.filter(item => item.id !== cargo.id);
      if (r.isSuccess) coinsFoundSS += Math.max(1, Math.round(cargo.valueSS * mission.consumes.multiplier * multiplier));
      cargoNotes.push(t(r.isSuccess ? "Ops.Cargo" : "Ops.CargoLost", { item: this.lootLabel(cargo) }));
    }
    let suppliesFound = 0;
    let morale = 0;
    let notoriety = 0;
    let xp = 0;
    const loot = [];
    for (const outcome of outcomes) {
      if (outcome.coins) coinsFoundSS += Math.max(1, Math.round((await this._roll(outcome.coins, r.rolls)) * multiplier));
      if (outcome.supplies) suppliesFound += await this._roll(String(outcome.supplies), r.rolls);
      morale += Number(outcome.morale) || 0;
      notoriety += Number(outcome.notoriety) || 0;
      xp += Number(outcome.xp) || 0;
      if (outcome.loot) loot.push(await this._createLoot(r.gang, id, outcome.loot, r.rolls));
    }

    if (r.isSuccess && coinsFoundSS > 0) coinsFoundSS = this._applyMerchantBonus(r.npc, coinsFoundSS);
    if (!r.isSuccess && r.coldBloodedTriggered && morale < 0) morale = 0;
    if (xp) xp = Math.max(1, Math.round(xp * this.doMultiplier()));

    if (coinsFoundSS) this._creditMissionProfit(r.gang, coinsFoundSS * 12);
    if (suppliesFound) r.gang.supplies = Math.min(30, (r.gang.supplies || 0) + suppliesFound);
    if (morale) this.changeMorale(r.gang, morale);
    if (notoriety) this.changeNotoriety(r.gang, notoriety);
    if (xp) r.npc.operationalXP += xp;
    await GangData.saveGang(actor, r.gang);

    const signed = value => (value > 0 ? `+${value}` : `${value}`);
    const notes = [t(`Missions.${id}.${r.isSuccess ? "Success" : "Fail"}`, {
      name: escapeHTML(r.npc.name),
      target: escapeHTML(input || t(`Missions.${id}.Name`))
    })];
    notes.push(...cargoNotes);
    if (loot.length) notes.push(t("Card.Loot.Haul", { loot: loot.map(item => this.lootLabel(item)).join(", ") }));
    if (suppliesFound) notes.push(t("Card.Loot.Supplies", { value: suppliesFound }));
    if (morale) notes.push(t("Ops.DataEffect.Morale", { value: signed(morale) }));
    if (notoriety) notes.push(t("Ops.DataEffect.Heat", { value: signed(notoriety) }));
    if (xp) notes.push(t("Ops.DataEffect.Xp", { value: signed(xp) }));

    const card = {
      ...this._baseCard(r, missionName(mission, this.getTerrain(r.gang))),
      coinsFoundSS,
      suppliesFound,
      notes: notes.join(" ")
    };
    await this.postMissionChatCard(actor, card);
    return card;
  }

  /** Najcenniejszy łup, który zlecenie może zużyć (null, gdy zlecenie niczego nie zużywa albo nic nie pasuje). */
  static cargoFor(gang, mission, excludedIds = null) {
    const categories = mission?.consumes?.categories;
    if (!categories) return null;
    return (gang?.loot || [])
      .filter(item => categories.includes(item.category) && (!excludedIds || !excludedIds.has(item.id)))
      .sort((a, b) => (Number(b.valueSS) || 0) - (Number(a.valueSS) || 0))[0] ?? null;
  }

  /** Włamanie (miasto) – łup do upłynnienia */
  static async executeBurglaryMission(actor, npcId, input, opts = {}) {
    return this._lootMission(actor, npcId, "burglary", input, opts, {
      successText: r => input ? t("Card.Burglary.SuccessAt", { name: escapeHTML(r.npc.name), place: escapeHTML(input) }) : t("Card.Burglary.Success", { name: escapeHTML(r.npc.name) }),
      failText: r => t("Card.Burglary.Fail", { name: escapeHTML(r.npc.name) })
    });
  }

  /** Kradzież z obejścia (wieś) – racje i towar */
  static async executeFarmTheftMission(actor, npcId, input, opts = {}) {
    return this._lootMission(actor, npcId, "farm_theft", input, opts, {
      supplies: LOOT_FORMULAS.farmSupplies,
      successText: r => t("Card.FarmTheft.Success", { name: escapeHTML(r.npc.name) }),
      failText: r => t("Card.FarmTheft.Fail", { name: escapeHTML(r.npc.name) })
    });
  }

  /** Napad na trakcie / karawanę (las, góry) – łup, ryzyko ran */
  static async executeHighwayRobberyMission(actor, npcId, input, opts = {}) {
    return this._lootMission(actor, npcId, "highway_robbery", input, opts, {
      successText: r => t("Card.Highway.Success", { name: escapeHTML(r.npc.name) }),
      failText: r => t("Card.Highway.Fail", { name: escapeHTML(r.npc.name) })
    });
  }

  /** Grabież kopalni (góry) – kruszec */
  static async executeMineRaidMission(actor, npcId, input, opts = {}) {
    return this._lootMission(actor, npcId, "mine_raid", input, opts, {
      successText: r => t("Card.MineRaid.Success", { name: escapeHTML(r.npc.name) }),
      failText: r => t("Card.MineRaid.Fail", { name: escapeHTML(r.npc.name) })
    });
  }

  /** Kłusownictwo / polowanie (las, góry) – racje */
  static async executePoachingMission(actor, npcId) {
    const r = await this._prepareMission(actor, npcId, "poaching", MISSION_INFO.poaching.target);
    if (!r) return;
    let suppliesFound = 0;
    if (r.isSuccess) {
      suppliesFound = await this._roll(LOOT_FORMULAS.poachingSupplies, r.rolls);
      r.gang.supplies = Math.min(30, (r.gang.supplies || 0) + suppliesFound);
    }
    await GangData.saveGang(actor, r.gang);
    const card = {
      ...this._baseCard(r, missionName(MISSIONS.poaching, this.getTerrain(r.gang))),
      suppliesFound,
      notes: r.isSuccess
        ? t("Card.Poaching.Success", { name: escapeHTML(r.npc.name), value: suppliesFound })
        : t("Card.Poaching.Fail", { name: escapeHTML(r.npc.name) })
    };
    await this.postMissionChatCard(actor, card);
    return card;
  }

  /**
   * Zdarzenie dla roli: jeśli w szajce jest zdolny członek z daną rolą (główną lub drugą), rzuca k100
   * (50 + 10 za rangę, maks. 80). Sukces zamienia skutki zdarzenia na korzystne, porażka zostawia je bez zmian.
   */
  static async _resolveEventRole(gang, event, rolls) {
    if (!event?.role) return event;
    const roleName = UnderworldTables.ROLES_CONFIG[event.role]?.name || event.role;
    const specialists = gang.roster.filter(n => !["dead", "wounded", "arrested"].includes(n.status) && UnderworldTables.hasRole(n, [event.role]));
    if (!specialists.length) {
      return { ...event, roleNote: t("CampEvent.NoSpecialist", { role: escapeHTML(roleName) }) };
    }
    const hero = specialists.sort((a, b) => (Number(b.rank) || 0) - (Number(a.rank) || 0))[0];
    const target = Math.min(80, 50 + 10 * (Number(hero.rank) || 0));
    const roll = await this._roll("1d100", rolls);
    const name = escapeHTML(hero.name);
    if (roll > target) {
      return { ...event, roleNote: t("CampEvent.RoleFailed", { name, role: escapeHTML(roleName), roll, target }) };
    }
    const ok = event.ok || {};
    return {
      ...event,
      text: event.okText ? `${event.text} ${event.okText}` : event.text,
      moraleDelta: Number(ok.moraleDelta) || 0,
      suppliesFound: Number(ok.suppliesFound) || 0,
      coinsFoundSS: Number(ok.coinsFoundSS) || 0,
      roleNote: t("CampEvent.RoleSaved", { name, role: escapeHTML(roleName), roll, target })
    };
  }

  /** Haracz (miasto) – codzienny dochód z rewiru */
  static async executeRacketMission(actor, npcId, input) {
    const r = await this._prepareMission(actor, npcId, "racket", MISSION_INFO.racket.target);
    if (!r) return;
    const district = String(input || "").trim() || t("Card.Racket.DefaultDistrict");
    if (r.isSuccess) r.gang.racket = { district, since: this._worldDayKey() };
    await GangData.saveGang(actor, r.gang);
    const card = {
      ...this._baseCard(r, missionName(MISSIONS.racket, this.getTerrain(r.gang))),
      notes: r.isSuccess
        ? t("Card.Racket.Success", { district: escapeHTML(district), daily: LOOT_FORMULAS.racketIncomeDaily, weekly: LOOT_FORMULAS.racketIncomeWeekly })
        : t("Card.Racket.Fail", { district: escapeHTML(district), name: escapeHTML(r.npc.name) })
    };
    await this.postMissionChatCard(actor, card);
    return card;
  }

  /** Stawka pasera w % wartości łupu (podgląd w panelu i rozliczenie). */
  static fenceRate(terrain, item, sl = 0) {
    const fence = TERRAINS[terrain]?.fence || TERRAINS.city.fence;
    let rate = fence.rate + (fence.likes.includes(item.category) ? 10 : 0) + 5 * (Number(sl) || 0);
    if (item.hot) rate -= 20;
    return Math.max(10, Math.min(80, rate));
  }

  /**
   * Upłynnienie łupów u pasera danego terenu. input: identyfikatory łupów rozdzielone przecinkami.
   * Stawka = stawka pasera (+10 za ulubioną kategorię) + 5 za każdy SL, −20 za gorący towar.
   */
  static async executeFenceMission(actor, npcId, input) {
    const gang = GangData.getGang(actor);
    const terrain = this.getTerrain(gang);
    const fence = TERRAINS[terrain].fence;
    const ids = String(input || "").split(",").map(s => s.trim()).filter(Boolean);
    const offered = (gang.loot || []).filter(item => ids.includes(item.id) && !fence.refuses.includes(item.category));
    if (!offered.length) {
      ui.notifications.warn(t("Card.Fence.NothingToSell", { fence: fence.name }));
      return;
    }

    const r = await this._prepareMission(actor, npcId, "fence", MISSION_INFO.fence.target);
    if (!r) return;

    const sold = [];
    let confiscated = [];
    let totalSS = 0;
    if (r.isSuccess) {
      let grossSS = 0;
      for (const item of offered) {
        const rate = this.fenceRate(terrain, item, r.sl);
        const priceSS = Math.max(1, Math.floor(item.valueSS * rate / 100));
        grossSS += priceSS;
        sold.push({ item, rate, priceSS });
      }
      totalSS = this._applyMerchantBonus(r.npc, grossSS);
      r.gang.loot = r.gang.loot.filter(item => !sold.some(s => s.item.id === item.id));
      r.profit = this._creditMissionProfit(r.gang, totalSS * 12);
    } else if (r.sl <= -2) {
      // Paser okazał się donosicielem: gorący towar przepada
      confiscated = offered.filter(item => item.hot);
      r.gang.loot = r.gang.loot.filter(item => !confiscated.some(c => c.id === item.id));
    }
    await GangData.saveGang(actor, r.gang);

    const soldText = sold.map(s => `${escapeHTML(s.item.name)}: ${s.priceSS} ${t("Units.SS")} (${s.rate}%)`).join("; ");
    const card = {
      ...this._baseCard(r, missionName(MISSIONS.fence, terrain)),
      coinsFoundSS: totalSS,
      notes: r.isSuccess
        ? t("Card.Fence.Success", { fence: escapeHTML(fence.name), sold: soldText })
        : `${t("Card.Fence.Fail", { fence: escapeHTML(fence.name) })} ${confiscated.length ? t("Card.Fence.Confiscated", { items: confiscated.map(c => escapeHTML(c.name)).join(", ") }) : t("Card.Fence.Returned")}`
    };
    await this.postMissionChatCard(actor, card);
    return card;
  }

  // ════════════════════════════════════════════
  // KATEGORIA 3: WPŁYWY
  // ════════════════════════════════════════════

  /**
   * Zastraszanie / Wymuszenie – pieniądze; nieudane wymuszenie podkopuje morale
   */
  static async executeIntimidateMission(actor, npcId) {
    const r = await this._prepareMission(actor, npcId, "intimidate", MISSION_INFO.intimidate.target);
    if (!r) return;

    let coinsFoundSS = 0;
    const flavor = UnderworldTables.getRandomIntimidationResult();

    if (r.isSuccess) {
      coinsFoundSS = await this._roll(LOOT_FORMULAS.intimidateCoins, r.rolls);
      this._creditMissionProfit(r.gang, coinsFoundSS * 12);
    } else if (!r.coldBloodedTriggered) {
      this.changeMorale(r.gang, -1);
    }

    await GangData.saveGang(actor, r.gang);

    const card = {
      ...this._baseCard(r, missionName(MISSIONS.intimidate, this.getTerrain(r.gang))),
      coinsFoundSS,
      rumor: flavor,
      notes: r.isSuccess
        ? t("Card.Intimidate.Success", { name: escapeHTML(r.npc.name), coins: coinsFoundSS })
        : t("Card.Intimidate.Fail", { name: escapeHTML(r.npc.name) })
    };
    await this.postMissionChatCard(actor, card);
    return card;
  }

  /**
   * Szerzenie Plotek / Dezinformacja
   */
  static async executeRumorSpreadMission(actor, npcId, rumorText) {
    if (!this._canManageGang(actor)) return;
    const gang = GangData.getGang(actor);
    const npc = gang.roster.find(n => n.id === npcId);
    if (!npc || npc.status !== "ready" || npc.assignment === "retinue") return;

    npc.status = "busy";
    npc.assignment = "rumor_spread";
    await GangData.saveGang(actor, gang);

    const card = {
      title: missionName(MISSIONS.rumor_spread, this.getTerrain(gang)),
      npcName: npc.name,
      npcRole: this.roleName(npc.role),
      npcImg: npc.img || "icons/svg/mystery-man.svg",
      isSuccess: true,
      notes: t("Card.RumorSpread.Success", { name: escapeHTML(npc.name), rumor: escapeHTML(rumorText || t("Card.RumorSpread.Default")) })
    };
    await this.postMissionChatCard(actor, card);
    return card;
  }


  /**
   * Przekupstwo. input: "release:<id członka>" (uwolnienie z aresztu, 15 ss),
   * "notoriety" (Rozgłos −1, 20 ss) albo "favor:<opis, np. 5 ss>" (przysługa).
   */
  static async executeBribeMission(actor, npcId, input) {
    if (!this._canManageGang(actor)) return;
    const gang = GangData.getGang(actor);
    const raw = String(input || "");
    let mode = "favor";
    let detail = raw;
    if (raw.startsWith("release:")) { mode = "release"; detail = raw.slice(8); }
    else if (raw === "notoriety") { mode = "notoriety"; detail = ""; }
    else if (raw.startsWith("favor:")) { detail = raw.slice(6); }

    let costSS = 5;
    if (mode === "release") costSS = 15;
    else if (mode === "notoriety") costSS = 20;
    else {
      const costMatch = detail.match(/(\d+)\s*(?:ss|s\b|szyling|shilling)/i);
      if (costMatch) costSS = Math.max(1, Math.min(10000, parseInt(costMatch[1], 10) || 5));
    }
    if (gang?.patron?.relation === "favorite") {
      costSS = Math.max(1, Math.round(costSS * 0.8));
    }
    const prisoner = mode === "release" ? gang.roster.find(n => n.id === detail && n.status === "arrested") : null;
    if (mode === "release" && !prisoner) {
      ui.notifications.warn(t("Card.Bribe.NotArrested"));
      return;
    }
    const costPennies = costSS * 12;
    if (GangData.treasuryToPennies(gang.treasury) < costPennies) {
      ui.notifications.warn(t("Notify.NotEnoughFunds", { cost: costSS }));
      return;
    }

    const r = await this._prepareMission(actor, npcId, "bribe", MISSION_INFO.bribe.target);
    if (!r) return;
    r.gang.treasury = GangData.penniesToTreasury(GangData.treasuryToPennies(r.gang.treasury) - costPennies);

    let effect = "";
    if (r.isSuccess) {
      if (mode === "release") {
        const freed = r.gang.roster.find(n => n.id === prisoner.id);
        if (freed) {
          freed.status = "ready";
          delete freed.arrestedNights;
          delete freed.arrestedOn;
        }
        effect = t("Card.Bribe.Released", { name: escapeHTML(prisoner.name) });
      } else if (mode === "notoriety") {
        this.changeNotoriety(r.gang, -1);
        effect = t("Card.Bribe.HeatDown");
      } else {
        effect = t("Card.Bribe.Favor", { favor: escapeHTML(detail || t("Card.Bribe.FavorDefault")) });
      }
    }
    await GangData.saveGang(actor, r.gang);

    const card = {
      ...this._baseCard(r, missionName(MISSIONS.bribe, this.getTerrain(r.gang))),
      notes: r.isSuccess
        ? `${t("Card.Bribe.Paid", { name: escapeHTML(r.npc.name), cost: costSS })} ${effect}`
        : t("Card.Bribe.Fail", { name: escapeHTML(r.npc.name), cost: costSS })
    };
    await this.postMissionChatCard(actor, card);
    return card;
  }
  /**
   * Siatka „Człowieka” – gryps do syndykatu
   */
  static async executeTheManContact(actor) {
    if (!this._canManageGang(actor)) return;
    const card = {
      title: missionName(MISSIONS.theman, "city"),
      npcName: t("Card.TheMan.Courier"),
      npcRole: t("Card.TheMan.Role"),
      npcImg: "icons/svg/item-bag.svg",
      isSuccess: true,
      notes: t("Card.TheMan.Note")
    };
    await this.postMissionChatCard(actor, card);
    return card;
  }

  // ════════════════════════════════════════════
  // KATEGORIA 4: OPERACJE
  // ════════════════════════════════════════════

  /**
   * Dywersja i Zadyma – odwrócenie uwagi, +10 do Skradania
   */
  static async executeDiversionMission(actor, npcId) {
    const r = await this._prepareMission(actor, npcId, "distract", MISSION_INFO.distract.target);
    if (!r) return;
    await GangData.saveGang(actor, r.gang);

    const card = {
      ...this._baseCard(r, missionName(MISSIONS.distract, this.getTerrain(r.gang))),
      notes: r.isSuccess
        ? t("Card.Diversion.Success", { name: escapeHTML(r.npc.name) })
        : t("Card.Diversion.Fail", { name: escapeHTML(r.npc.name) })
    };
    await this.postMissionChatCard(actor, card);
    return card;
  }

  /**
   * Sabotaż – zniszczenie konkretnego celu
   */
  static async executeSabotageMission(actor, npcId, targetDesc) {
    const r = await this._prepareMission(actor, npcId, "sabotage", MISSION_INFO.sabotage.target);
    if (!r) return;

    await GangData.saveGang(actor, r.gang);

    const card = {
      ...this._baseCard(r, missionName(MISSIONS.sabotage, this.getTerrain(r.gang))),
      notes: r.isSuccess
        ? t("Card.Sabotage.Success", { name: escapeHTML(r.npc.name), target: escapeHTML(targetDesc || t("Card.Sabotage.Default")) })
        : t("Card.Sabotage.Fail", { name: escapeHTML(r.npc.name), target: escapeHTML(targetDesc || t("Card.Sabotage.Default")) })
    };
    await this.postMissionChatCard(actor, card);
    return card;
  }

  /**
   * Przemyt – przeprowadzenie towaru przez kontrolę; dobry zarobek, ale wpadka kończy się aresztem
   */
  static async executeSmuggleMission(actor, npcId, cargoDesc) {
    const r = await this._prepareMission(actor, npcId, "smuggle", MISSION_INFO.smuggle.target);
    if (!r) return;

    const complication = UnderworldTables.getRandomSmuggleComplication();
    let coinsFoundSS = 0;
    if (r.isSuccess) {
      const terrainBonus = this.getTerrain(r.gang) === "mountains" ? 1.5 : 1; // przemyt przez przełęcz płaci lepiej
      coinsFoundSS = this._applyMerchantBonus(r.npc, Math.round((await this._roll(LOOT_FORMULAS.smuggleCoins, r.rolls)) * terrainBonus));
      this._creditMissionProfit(r.gang, coinsFoundSS * 12);
    }

    await GangData.saveGang(actor, r.gang);

    const card = {
      ...this._baseCard(r, missionName(MISSIONS.smuggle, this.getTerrain(r.gang))),
      coinsFoundSS,
      rumor: complication,
      notes: r.isSuccess
        ? t("Card.Smuggle.Success", { name: escapeHTML(r.npc.name), cargo: escapeHTML(cargoDesc || t("Card.Smuggle.Default")), coins: coinsFoundSS })
        : t("Card.Smuggle.Fail", { name: escapeHTML(r.npc.name), cargo: escapeHTML(cargoDesc || t("Card.Smuggle.Default")) })
    };
    await this.postMissionChatCard(actor, card);
    return card;
  }

  /**
   * Fałszowanie Dokumentów – podrobienie glejtu, pieczęci, listu
   */
  static async executeForgeMission(actor, npcId, docDesc) {
    const r = await this._prepareMission(actor, npcId, "forge", MISSION_INFO.forge.target);
    if (!r) return;

    const docType = docDesc || UnderworldTables.getRandomForgeDocument();

    await GangData.saveGang(actor, r.gang);

    const card = {
      ...this._baseCard(r, missionName(MISSIONS.forge, this.getTerrain(r.gang))),
      notes: r.isSuccess
        ? t("Card.Forge.Success", { name: escapeHTML(r.npc.name), doc: escapeHTML(docType) })
        : t("Card.Forge.Fail", { name: escapeHTML(r.npc.name), doc: escapeHTML(docType) })
    };
    await this.postMissionChatCard(actor, card);
    return card;
  }

  // ════════════════════════════════════════════
  // KATEGORIA 5: OBÓZ
  // ════════════════════════════════════════════

  /**
   * Maskowanie Śladów – zacieranie tropów; jedyny sposób, by szajka sama obniżyła Rozgłos
   */
  static async executeCoverTracksMission(actor, npcId) {
    const r = await this._prepareMission(actor, npcId, "cover_tracks", MISSION_INFO.cover_tracks.target);
    if (!r) return;
    let notorietyNote = "";
    if (r.isSuccess) {
      if (!r.gang.camp) r.gang.camp = {};
      r.gang.camp.tracksCovered = true;
      if (this.getNotoriety(r.gang) > 0) {
        this.changeNotoriety(r.gang, -1);
        notorietyNote = ` ${t("Card.CoverTracks.HeatDown")}`;
      }
    }
    await GangData.saveGang(actor, r.gang);

    const card = {
      ...this._baseCard(r, missionName(MISSIONS.cover_tracks, this.getTerrain(r.gang))),
      notes: r.isSuccess
        ? t("Card.CoverTracks.Success", { name: escapeHTML(r.npc.name) }) + notorietyNote
        : t("Card.CoverTracks.Fail", { name: escapeHTML(r.npc.name) })
    };
    await this.postMissionChatCard(actor, card);
    return card;
  }

  /**
   * Opieka nad Rannymi – przyspieszenie leczenia
   */
  static async executeTendWoundedMission(actor, npcId, woundedNpcId) {
    if (!this._canManageGang(actor)) return;
    const gang = GangData.getGang(actor);
    const npc = gang.roster.find(n => n.id === npcId);
    if (!npc || npc.status !== "ready" || npc.assignment === "retinue") return;

    const wounded = gang.roster.find(n => n.id === woundedNpcId && n.status === "wounded");

    npc.status = "busy";
    npc.assignment = "tend_wounded";

    const operationalXpGained = Math.max(1, Math.round((wounded ? 10 : 5) * this.doMultiplier()));
    npc.operationalXP = (Number(npc.operationalXP) || 0) + operationalXpGained;

    const rolls = [];
    let notes = "";
    if (wounded) {
      const hasMedkit = Array.isArray(npc.gear) && npc.gear.includes("medkit");
      const strengths = Array.isArray(npc.strengths) ? npc.strengths : [npc.strength].filter(Boolean);
      const isFieldMedic = strengths.includes("field_medic");
      if (hasMedkit) {
        wounded.status = "ready";
        notes = t("Card.Tend.Medkit", { name: escapeHTML(npc.name), wounded: escapeHTML(wounded.name) });
      } else if (isFieldMedic && (await this._roll("1d2", rolls)) === 1) {
        wounded.status = "ready";
        notes = t("Card.Tend.FieldMedic", { name: escapeHTML(npc.name), wounded: escapeHTML(wounded.name) });
      } else {
        wounded.status = "resting";
        notes = t("Card.Tend.Resting", { name: escapeHTML(npc.name), wounded: escapeHTML(wounded.name) });
      }
    } else {
      notes = t("Card.Tend.Nobody", { name: escapeHTML(npc.name) });
    }

    await GangData.saveGang(actor, gang);

    const card = {
      title: missionName(MISSIONS.tend_wounded, this.getTerrain(gang)),
      npcName: npc.name,
      npcRole: this.roleName(npc.role),
      npcImg: npc.img || "icons/svg/mystery-man.svg",
      isSuccess: !!wounded,
      operationalXpGained,
      rolls,
      companyType: profileOf(gang).id,
      notes
    };
    await this.postMissionChatCard(actor, card);
    return card;
  }

  // ════════════════════════════════════════════
  // NOCNY POSTÓJ / ODPOCZYNEK
  // ════════════════════════════════════════════

  /** Liczba racji wymagana do wyżywienia kompanii na jeden postój (zależna od ustawienia świata). */
  static requiredRations(gang, weekly = false) {
    const mode = this.rationsMode();
    if (mode === "off") return 0;
    const mouths = (gang?.roster || []).filter(n => !["dead", "arrested"].includes(n.status)).length;
    if (mouths === 0) return 0;
    if (mode === "flat1") return 1;
    return weekly ? mouths : Math.max(1, Math.ceil(mouths / 3));
  }

  /** Żołd / koszt utrzymania kompanii w szylingach (0, gdy wyłączone globalnie lub dla tej kompanii). */
  static calculateUpkeepSS(gang, weekly = false) {
    if (gang?.upkeepOverride === "free") return 0;
    if (this._setting("upkeepEnabled", true) === false) return 0;
    const isMerc = profileOf(gang).id === "mercenaries";
    const active = (gang?.roster || []).filter(n => !["dead", "arrested"].includes(n.status));
    let total = 0;
    for (const n of active) {
      const rank = Math.max(0, Number(n.rank) || 0);
      total += weekly ? ((isMerc ? 2 : 1) + rank) : (1 + (rank >= 2 ? 1 : 0) + (isMerc ? 1 : 0));
    }
    if (total <= 0) return 0;
    const mult = Number(this._setting("upkeepMultiplier", 1)) || 1;
    return Math.max(1, Math.round(total * mult));
  }

  /**
   * Nocny Postój / Długi Odpoczynek Obozowiska
   */
  static async executeCampRest(actor, options = {}) {
    if (!this._canManageGang(actor)) {
      ui.notifications.warn(t("Notify.NoAccess"));
      return false;
    }
    if (!options.weekly && this.campRestGMOnly() && !game.user.isGM) {
      ui.notifications.warn(t("Camp.GMResolvesNightHint"));
      return false;
    }

    // Kolejka MG w trybie dziennym: zaległe przydziały rozpatrujemy przed postojem, w tym samym raporcie
    if (!options.weekly && GangData.getGang(actor).roster.some(n => n.plannedMission)) {
      if (GangData.getGang(actor).lastCampRestDay === this._worldDayKey()) {
        ui.notifications.warn(t("Notify.CampAlreadyResolved"));
        return false;
      }
      if (!game.user.isGM) {
        ui.notifications.warn(t("Notify.CampWaitsForQueue"));
        return false;
      }
      const resolved = await this._resolvePlans(actor);
      options = {
        ...options,
        missionCards: [...(options.missionCards || []), ...resolved.missionCards],
        extraRolls: [...(options.extraRolls || []), ...resolved.extraRolls]
      };
    }

    const gang = GangData.getGang(actor);
    const dayKey = this._worldDayKey();
    const restLock = gang.campRestInProgress;
    const lockIsFresh = restLock?.dayKey === dayKey && Date.now() - restLock.startedAt < 120000;
    if (gang.lastCampRestDay === dayKey || lockIsFresh) {
      ui.notifications.warn(t("Notify.CampAlreadyResolved"));
      return false;
    }
    gang.campRestInProgress = { dayKey, startedAt: Date.now() };
    await GangData.saveGang(actor, gang);

    // Wszystkie rzuty postoju (i zleceń tygodnia) trafiają do wiadomości na czacie
    const weekly = !!options.weekly;
    const rolls = [...(options.extraRolls || [])];
    const missionCards = options.missionCards || [];

    // 1. Schronienie (zależne od terenu)
    const terrainId = this.getTerrain(gang);
    const terrain = TERRAINS[terrainId];
    const allowedShelters = ["makeshift", "basic", "comfortable"];
    const requestedShelter = options.shelterType || gang.camp.type || "basic";
    const shelterType = allowedShelters.includes(requestedShelter) ? requestedShelter : "basic";
    const isMakeshift = shelterType === "makeshift";
    gang.camp.type = shelterType;
    let shelterName = t("Camp.Shelter.Basic");
    let shelterMoraleDelta = 0;

    if (isMakeshift) {
      shelterName = t("Camp.Shelter.Makeshift", { place: terrain.makeshiftLabel });
      shelterMoraleDelta = terrain.coldMakeshift ? -2 : -1;
      if (terrain.coldMakeshift) shelterName += ` – ${t("Camp.Shelter.Frost")}`;
    } else if (shelterType === "comfortable") {
      shelterName = t("Camp.Shelter.Comfortable", { place: terrain.comfortableLabel });
      const curP = GangData.treasuryToPennies(gang.treasury);
      const costSS = terrain.comfortableCostSS * (weekly ? 3 : 1);
      const costP = costSS * 12;
      if (curP >= costP) {
        shelterMoraleDelta = 1;
        gang.treasury = GangData.penniesToTreasury(curP - costP);
      } else {
        shelterName = t("Camp.Shelter.BasicNoFunds");
        gang.camp.type = "basic";
        ui.notifications.warn(t("Camp.Shelter.NoFundsNotify", { cost: costSS }));
      }
    }

    // 2. Wartownicy (nagradzani +3 DO × mnożnik rytmu; ranni z Wojennymi Bliznami też mogą pełnić wartę)
    const watchmenIds = [...new Set(Array.isArray(options.watchmenIds) ? options.watchmenIds : [])];
    const watchmenNames = [];
    const watchXP = Math.max(1, Math.round(3 * this.doMultiplier()));
    gang.roster.forEach(n => {
      const canWatch = !["dead", "arrested"].includes(n.status)
        && (n.status !== "wounded" || (Array.isArray(n.narrativePerks) && n.narrativePerks.includes("battle_scarred")));
      if (watchmenIds.includes(n.id) && canWatch) {
        watchmenNames.push(n.name);
        n.operationalXP = (Number(n.operationalXP) || 0) + watchXP;
      }
    });
    const isUnprotected = watchmenNames.length === 0;

    // 3. Wyżywienie (skalowane ustawieniem i liczbą członków; zewnętrzne zaopatrzenie tylko dla MG)
    const needed = this.requiredRations(gang, weekly);
    const rationsOff = this.rationsMode() === "off";
    const externalSupplies = game.user.isGM && !!options.externalSupplies;
    let foodSummary = "";
    let foodMoraleDelta = 0;

    if (options.fasting && !rationsOff) {
      foodSummary = t("Camp.Food.Fasting");
      foodMoraleDelta = -1;
    } else if (externalSupplies) {
      foodSummary = t("Camp.Food.External");
    } else if (needed === 0) {
      foodSummary = rationsOff ? t("Camp.Food.Off") : t("Camp.Food.Used", { used: 0, left: gang.supplies || 0 });
    } else {
      const parsedCount = parseInt(options.suppliesCount, 10);
      const requested = Number.isFinite(parsedCount) ? Math.max(0, parsedCount) : needed;
      const used = Math.min(gang.supplies || 0, requested);
      gang.supplies = Math.max(0, (gang.supplies || 0) - used);
      if (used === 0) {
        foodSummary = t("Camp.Food.Empty");
        foodMoraleDelta = -1;
      } else if (used < needed) {
        foodSummary = t("Camp.Food.Short", { used, needed, left: gang.supplies });
        foodMoraleDelta = -1;
      } else {
        foodSummary = t("Camp.Food.Used", { used, left: gang.supplies });
      }
    }

    // 3b. Żołd i utrzymanie
    const upkeepSS = this.calculateUpkeepSS(gang, weekly);
    let upkeepSummary = "";
    let upkeepMoraleDelta = 0;
    if (upkeepSS > 0) {
      const upkeepPennies = upkeepSS * 12;
      const curP = GangData.treasuryToPennies(gang.treasury);
      if (curP >= upkeepPennies) {
        gang.treasury = GangData.penniesToTreasury(curP - upkeepPennies);
        upkeepSummary = t("Camp.UpkeepPaid", { amount: this.formatPennies(upkeepPennies) });
      } else {
        gang.treasury = GangData.penniesToTreasury(0);
        upkeepMoraleDelta = -1;
        upkeepSummary = t("Camp.UpkeepShort", {
          paid: this.formatPennies(curP),
          due: this.formatPennies(upkeepPennies)
        });
      }
    }

    // Efekty Dawnego Fachu (Perks) w obozowisku (tylko aktywni członkowie)
    const perksInGang = [];
    gang.roster.forEach(n => {
      if (["dead", "arrested"].includes(n.status)) return;
      if (Array.isArray(n.narrativePerks)) {
        n.narrativePerks.forEach(p => perksInGang.push({ perkId: p, npcName: n.name }));
      }
    });

    // 4. Morale (schronienie, jedzenie, żołd, potem Prawa Ręka i Szynkarz)
    this.changeMorale(gang, shelterMoraleDelta + foodMoraleDelta + upkeepMoraleDelta);

    const perkEffects = [];
    const lieutenant = gang.roster.find(n => !["dead", "arrested", "wounded"].includes(n.status) && (Number(n.rank) || 0) >= 3);
    if (lieutenant && this.getMorale(gang) < 7) {
      this.changeMorale(gang, 1);
      perkEffects.push(t("Camp.Perk.Lieutenant", { name: escapeHTML(lieutenant.name) }));
    }

    // Dawny Fach: Szynkarz / Piwowar -> +1 Morale z napitku (gdy Morale < 8)
    const brewer = perksInGang.find(p => p.perkId === "craft_innkeeper");
    if (brewer && this.getMorale(gang) < 8) {
      this.changeMorale(gang, 1);
      foodSummary += ` ${t("Camp.Food.Brewer", { name: brewer.npcName })}`;
    }

    // Dawny Fach: Leśnik / Kłusownik -> +1 darmowa racja dziczyzny (tylko w lesie)
    const woodsman = perksInGang.find(p => p.perkId === "craft_woodsman");
    if (woodsman && terrainId === "forest") {
      gang.supplies = Math.min(30, (gang.supplies || 0) + 1);
      foodSummary += ` ${t("Camp.Food.Woodsman", { name: woodsman.npcName })}`;
    }

    // 5. Leczenie, areszt i reset przydziałów
    const healedList = [];
    const chirurgeon = perksInGang.find(p => p.perkId === "craft_chirurgeon");
    let chirurgeonHealed = false;

    gang.roster.forEach(n => {
      delete n.coldBloodedUsedCycle;
      if (n.status === "resting") {
        n.status = "ready";
        healedList.push(t("Camp.Heal.Rested", { name: n.name }));
      } else if (n.status === "wounded") {
        if (weekly) {
          // Tydzień w obozie wystarcza, by stanąć na nogi
          n.status = "ready";
          healedList.push(t("Camp.Heal.Week", { name: n.name }));
        } else if (chirurgeon && !chirurgeonHealed) {
          n.status = "ready";
          healedList.push(t("Camp.Heal.Chirurgeon", { name: n.name, medic: chirurgeon.npcName }));
          chirurgeonHealed = true;
        } else {
          n.status = "resting";
          healedList.push(t("Camp.Heal.Healing", { name: n.name }));
        }
      } else if (n.status === "arrested") {
        if (n.arrestedOn === dayKey) {
          healedList.push(t("Camp.Heal.JustArrested", { name: n.name, time: this.cycleLabel(Number(n.arrestedNights) || 1) }));
          n.assignment = "none";
          return;
        }
        n.arrestedNights = Math.max(0, (Number(n.arrestedNights) || 1) - 1);
        if (n.arrestedNights === 0) {
          n.status = "ready";
          delete n.arrestedNights;
          delete n.arrestedOn;
          healedList.push(t("Camp.Heal.Released", { name: n.name }));
        } else {
          healedList.push(t("Camp.Heal.StillArrested", { name: n.name, time: this.cycleLabel(n.arrestedNights) }));
        }
      } else if (n.status === "busy") {
        n.status = "ready";
      }
      n.assignment = "none";
    });

    // 6. Losowe wydarzenie nocy: bez warty 60%, z wartą 40%, z maskowaniem śladów o połowę mniej
    let event = null;
    const tracksCovered = gang.camp.tracksCovered || false;
    let eventChance = isUnprotected ? terrain.eventChance.unguarded : terrain.eventChance.guarded;
    if (tracksCovered) eventChance = Math.floor(eventChance / 2);

    if (await this._roll("1d100", rolls) <= eventChance) {
      event = await UnderworldTables.drawCampEvent(gang);
      event = await this._resolveEventRole(gang, event, rolls);
      const sup = Number(event.suppliesFound ?? event.supplies) || 0;
      if (sup) {
        gang.supplies = Math.max(0, Math.min(30, (gang.supplies || 0) + sup));
      }
      const coins = Number(event.coinsFoundSS ?? event.coinsSS) || 0;
      if (coins) {
        const curP = GangData.treasuryToPennies(gang.treasury);
        gang.treasury = GangData.penniesToTreasury(Math.max(0, curP + coins * 12));
      }
      const mor = Number(event.moraleDelta ?? event.morale) || 0;
      if (mor) this.changeMorale(gang, mor);
    }

    // 7. Obława straży przy wysokim Rozgłosie (maskowanie, prowizoryczne kryjówki i wtyka zmniejszają ryzyko)
    const raid = await this._resolveRaid(gang, { isUnprotected, isMakeshift, tracksCovered, rolls });

    // Reset flag cyklu na nowy dzień/tydzień
    gang.camp.tracksCovered = false;
    delete gang.cycleTreasuryNetPennies;
    delete gang.cycleDepositMoraleAwarded;
    delete gang.cycleWithdrawnPennies;

    // 7b. Haracz: dochód z rewiru (tylko w mieście), czasem konkurencja zrywa układ
    const racket = await this._resolveRacket(gang, { weekly, terrainId, rolls });

    // 7c. Żetony przygotowania wygasają, łupy stygną
    this.tickPreparationAndLoot(gang, weekly);

    // 8. Efekty wad i zalet popleczników podczas postoju
    const flawEffects = [];

    for (const n of gang.roster) {
      if (n.status === "dead" || n.status === "arrested") continue;

      // ZALETY
      const strengths = Array.isArray(n.strengths) ? n.strengths : [n.strength].filter(Boolean);

      if (strengths.includes("poacher")) {
        gang.supplies = Math.min(30, (gang.supplies || 0) + 1);
        perkEffects.push(t("Camp.Perk.Poacher", { name: escapeHTML(n.name) }));
      }

      // WADY
      const flaws = Array.isArray(n.flaws) ? n.flaws : [n.flaw].filter(Boolean);
      for (const fid of flaws) {
        const flawCfg = UnderworldTables.TRAITS_CONFIG?.flaws?.[fid];
        if (!flawCfg || !flawCfg.campEffect) continue;

        const effect = flawCfg.campEffect;
        if (await this._roll("1d100", rolls) > effect.chance) continue;

        if (effect.type === "unavailable") {
          n.status = "resting";
          n.assignment = "none";
          flawEffects.push(`<strong>${escapeHTML(n.name)}</strong> ${effect.text} <em>(${t("Camp.Flaw.Resting")})</em>`);
        } else if (effect.type === "steal_treasury") {
          const stolen = effect.amountDice === "1d6ss"
            ? (await this._roll("1d6", rolls)) * 12
            : (effect.amount || 0);
          const currentP = GangData.treasuryToPennies(gang.treasury);
          const actualStolen = Math.min(stolen, currentP);
          if (actualStolen > 0) {
            gang.treasury = GangData.penniesToTreasury(currentP - actualStolen);
            flawEffects.push(`<strong>${escapeHTML(n.name)}</strong> ${effect.text} <em>(${t("Camp.Flaw.Lost", { value: Math.ceil(actualStolen / 12) })})</em>`);
          }
        } else if (effect.type === "info_leak") {
          this.changeNotoriety(gang, 1);
          flawEffects.push(`<strong>${escapeHTML(n.name)}</strong> ${effect.text}`);
        } else if (effect.type === "extra_food") {
          if (gang.supplies > 0) {
            gang.supplies = Math.max(0, gang.supplies - 1);
            flawEffects.push(`<strong>${escapeHTML(n.name)}</strong> ${effect.text} <em>(${t("Camp.Flaw.Ration")})</em>`);
          } else {
            this.changeMorale(gang, -1);
            flawEffects.push(`<strong>${escapeHTML(n.name)}</strong> ${effect.text}${t("Camp.Flaw.EmptyLarder")}`);
          }
        } else if (effect.type === "morale_loss") {
          this.changeMorale(gang, -1);
          flawEffects.push(`<strong>${escapeHTML(n.name)}</strong> ${effect.text}`);
        } else if (effect.type === "debt_trouble") {
          this.changeNotoriety(gang, 1);
          flawEffects.push(`<strong>${escapeHTML(n.name)}</strong> ${effect.text}`);
        }
      }
    }

    // 9. Dezercja przy upadku Morale (2: 15%, 1: 30%, 0: 45%)
    const desertion = await this._resolveDesertion(gang, rolls);

    // Historia
    gang.lastCampRestDay = dayKey;
    delete gang.campRestInProgress;
    const historyNotes = [raid?.summary, desertion?.summary].filter(Boolean).join(" ");
    const entry = {
      date: time.format(time.now()),
      logSummary: t("Camp.Log", { shelter: shelterName, watch: watchmenNames.join(", ") || t("None"), food: foodSummary, morale: gang.morale, heat: this.getNotoriety(gang) }) + (historyNotes ? ` ${historyNotes}` : "")
    };
    if (!gang.history) gang.history = [];
    gang.history.unshift(entry);
    const maxHistory = this.maxHistoryEntries();
    if (gang.history.length > maxHistory) gang.history.length = maxHistory;

    await GangData.saveGang(actor, gang);

    // Karta czatu
    const templateData = {
      title: weekly ? t("Camp.TitleWeek") : t("Camp.TitleNight"),
      weekly,
      terrainName: terrain.name,
      companyType: profileOf(gang).id,
      skyline: `her-skyline_${this.getTerrain(gang)}`,
      racket,
      missions: missionCards,
      shelterName,
      watchmenNames: watchmenNames.join(", ") || t("Camp.NoWatch"),
      watchmenCount: watchmenNames.length,
      foodSummary,
      upkeepSummary,
      healedList: healedList.join(", ") || t("Camp.AllHealthy"),
      morale: gang.morale,
      notoriety: this.getNotoriety(gang),
      supplies: gang.supplies,
      event,
      raid,
      desertion,
      flawEffects,
      perkEffects
    };

    const template = "modules/wfrp4e-underworld/templates/chat/camp-rest.hbs";
    const html = await foundry.applications.handlebars.renderTemplate(template, templateData);

    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content: html,
      rolls,
      flavor: weekly ? t("Camp.FlavorWeek") : t("Camp.FlavorNight")
    });
  }

  /**
   * Obława straży w nocy. Wartownicy lub wtyka w straży pozwalają uciec (tracąc część zapasów i drobne),
   * bez warty i wtyki jeden z ludzi trafia do aresztu, a straż zabiera część skarbca i gorący towar.
   * Po obławie Rozgłos spada o 1 – straż uznaje sprawę za załatwioną.
   * @returns {Promise<object|null>}
   */
  static async _resolveRaid(gang, { isUnprotected, isMakeshift = false, tracksCovered, rolls }) {
    if (this._setting("raidsEnabled", true) === false) return null;
    const notoriety = this.getNotoriety(gang);
    const terrain = TERRAINS[this.getTerrain(gang)];
    const minNotoriety = terrain.raidMinNotoriety;
    if (notoriety < minNotoriety) return null;
    const hasGuardContacts = (gang.roster || []).some(n =>
      !["dead", "arrested"].includes(n.status)
      && Array.isArray(n.narrativePerks)
      && n.narrativePerks.includes("guard_contacts")
    );
    let chance = (notoriety - minNotoriety + 1) * 20;
    if (tracksCovered) chance = Math.floor(chance / 2);
    if (isMakeshift) chance = Math.floor(chance / 2);
    if (hasGuardContacts) chance = Math.floor(chance / 2);
    const check = await this._roll("1d100", rolls);
    if (check > chance) return null;

    const raid = { title: terrain.raidTitle, lines: [] };
    if (!isUnprotected || hasGuardContacts) {
      if (isUnprotected && hasGuardContacts) raid.lines.push(t("Raid.GuardTipOff"));
      const lost = Math.min(gang.supplies || 0, await this._roll("1d3", rolls));
      gang.supplies = Math.max(0, (gang.supplies || 0) - lost);
      raid.lines.push(t("Raid.Escaped", { lost }));
      const seizedSS = await this._roll("1d6", rolls);
      const curP = GangData.treasuryToPennies(gang.treasury);
      const seized = Math.min(curP, seizedSS * 12);
      gang.treasury = GangData.penniesToTreasury(curP - seized);
      if (seized > 0) raid.lines.push(t("Raid.EscapedCoin", { amount: this.formatPennies(seized) }));
    } else {
      const candidates = gang.roster.filter(n => ["ready", "resting"].includes(n.status));
      const victim = candidates.length ? candidates[Math.floor(await this._roll(`1d${candidates.length}`, rolls)) - 1] : null;
      if (victim) {
        victim.status = "arrested";
        victim.assignment = "none";
        victim.arrestedNights = await this._roll(this.isWeekly() ? LOOT_FORMULAS.arrestWeeks : LOOT_FORMULAS.arrestNights, rolls);
        raid.lines.push(t("Raid.Arrested", { name: escapeHTML(victim.name), time: this.cycleLabel(victim.arrestedNights) }));
      }
      const seizedSS = await this._roll("1d6", rolls);
      const curP = GangData.treasuryToPennies(gang.treasury);
      const seized = Math.min(curP, seizedSS * 12);
      gang.treasury = GangData.penniesToTreasury(curP - seized);
      if (seized > 0) raid.lines.push(t("Raid.Seized", { amount: this.formatPennies(seized) }));
      // Gorący towar w niestrzeżonym obozie to dowód – przepada
      const hotLoot = (gang.loot || []).filter(item => item.hot);
      if (hotLoot.length) {
        gang.loot = gang.loot.filter(item => !item.hot);
        raid.lines.push(t("Raid.HotLost", { items: hotLoot.map(item => escapeHTML(item.name)).join(", ") }));
      }
      this.changeMorale(gang, -1);
      raid.lines.push(t("Raid.Morale"));
    }
    this.changeNotoriety(gang, -1);
    raid.lines.push(t("Raid.Settled"));
    raid.summary = t("Raid.Summary");
    return raid;
  }

  /**
   * Haracz: w mieście co noc 1d6 ss (tydzień: 4d6) do skarbca po doli Patrona;
   * na 1 (1d10 dziennie, 1d6 tygodniowo) konkurencja przejmuje rewir i Rozgłos rośnie.
   * @returns {Promise<object|null>}
   */
  static async _resolveRacket(gang, { weekly, terrainId, rolls }) {
    const { missions } = profileOf(gang);
    if (!gang.racket || (missions && !missions.includes("racket"))) return null;
    if (terrainId !== "city") return { district: gang.racket.district, dormant: true, text: t("Racket.Dormant") };
    const incomeSS = await this._roll(weekly ? LOOT_FORMULAS.racketIncomeWeekly : LOOT_FORMULAS.racketIncomeDaily, rolls);
    const profit = this._creditMissionProfit(gang, incomeSS * 12);
    const conflict = (await this._roll(weekly ? "1d6" : "1d10", rolls)) === 1;
    const district = gang.racket.district;
    let text = `${t("Racket.Income", { district: escapeHTML(district), income: incomeSS })} ${this._patronCutNote(profit)}`;
    if (conflict) {
      delete gang.racket;
      this.changeNotoriety(gang, 1);
      text += ` ${t("Racket.Lost")}`;
    }
    return { district, incomeSS, conflict, text };
  }

  /**
   * Dezercja przy niskim Morale: odchodzi najniższy rangą członek spoza Świty, zabierając 1d6 ss.
   * @returns {Promise<object|null>}
   */
  static async _resolveDesertion(gang, rolls) {
    if (this._setting("desertionEnabled", true) === false) return null;
    const morale = this.getMorale(gang);
    if (morale > 2) return null;
    const chance = (3 - morale) * 15;
    if (await this._roll("1d100", rolls) > chance) return null;

    const candidates = gang.roster
      .filter(n => !["dead", "arrested"].includes(n.status)
        && n.assignment !== "retinue"
        && !(Array.isArray(n.narrativePerks) && n.narrativePerks.includes("blood_brotherhood")))
      .sort((a, b) => (Number(a.rank) || 0) - (Number(b.rank) || 0));
    const deserter = candidates[0];
    if (!deserter) return null;

    const takenSS = await this._roll("1d6", rolls);
    const curP = GangData.treasuryToPennies(gang.treasury);
    const taken = Math.min(curP, takenSS * 12);
    gang.treasury = GangData.penniesToTreasury(curP - taken);
    gang.roster = gang.roster.filter(n => n.id !== deserter.id);

    const takenText = taken > 0 ? t("Desertion.Taken", { amount: this.formatPennies(taken) }) : "";
    return {
      name: deserter.name,
      text: t("Desertion.Text", { name: escapeHTML(deserter.name), taken: takenText }),
      summary: t("Desertion.Summary", { name: deserter.name })
    };
  }


  // ════════════════════════════════════════════
  // KALENDARZ I PRZYPOMNIENIA
  // ════════════════════════════════════════════

  static async checkCalendarReminder(worldTime) {
    // W trybie tygodniowym ani gdy przypomnienia są wyłączone nie wysyłamy karty nocnej
    if (this.isWeekly() || this._setting("campReminder", true) === false) return;
    const { hour } = time.components(worldTime);
    const dayKey = time.dayKey(worldTime);

    if (hour >= 3 && hour < 4) {
      const lastSentDay = game.settings.get("wfrp4e-underworld", "lastReminderDay");
      if (lastSentDay !== dayKey) {
        await game.settings.set("wfrp4e-underworld", "lastReminderDay", dayKey);
        await this.postCampReminderMessage();
      }
    }
  }

  static async postCampReminderMessage() {
    const html = `
      <div class="wfrp4e-underworld chat-card camp-reminder-card" style="background: #fdfaf3; border: 2px solid #5a3d28; border-radius: 4px; padding: 10px; font-family: Caslon Antique, Palatino, serif;">
        <div style="border-bottom: 2px solid #7c5e44; padding-bottom: 4px; margin-bottom: 6px;">
          <h3 style="margin: 0; color: #4a2810; font-size: 1.1rem;"><i class="fas fa-moon"></i> ${t("Reminder.Title")}</h3>
        </div>
        <p style="margin: 4px 0; font-size: 0.88rem; color: #2b231d;">
          ${t("Reminder.Text")}
        </p>
        <button type="button" class="btn-chat-open-rest" style="width: 100%; padding: 8px; margin-top: 8px; background: #4a3424; color: #fff; font-weight: bold; border-radius: 3px; cursor: pointer; border: 1px solid #2b1f15;">
          <i class="fas fa-campground"></i> ${t("Reminder.Button")}
        </button>
      </div>
    `;

    await ChatMessage.create({
      user: game.user.id,
      speaker: { alias: t("Reminder.Speaker") },
      content: html,
      flavor: t("Reminder.Flavor")
    });
  }

  // ════════════════════════════════════════════
  // PUBLIKACJA KART CZATU
  // ════════════════════════════════════════════

  static async postMissionChatCard(actor, data) {
    const template = "modules/wfrp4e-underworld/templates/chat/mission-card.hbs";
    let notes = String(data.notes ?? "");
    if (Number(data.coinsFoundSS) > 0) {
      const needsFallback = data.noPatronCut === undefined || !Number.isFinite(Number(data.patronCutPct));
      const fallbackGang = needsFallback ? GangData.getGang(actor) : null;
      const noCut = data.noPatronCut ?? (fallbackGang ? (!profileOf(fallbackGang).patronCut || !!fallbackGang?.patron?.noCut) : false);
      const gross = Math.trunc(Number(data.coinsFoundSS) * 12);
      if (noCut) {
        notes += ` ${t("Ops.ToTreasury", { amount: this.formatPennies(gross) })}`;
      } else {
        const percentage = Math.max(0, Math.min(100, Number.isFinite(Number(data.patronCutPct)) ? Number(data.patronCutPct) : this.effectiveCutPercentage(fallbackGang)));
        const cut = Math.floor(gross * percentage / 100);
        notes += ` ${this._patronCutNote({ gross, cut, net: gross - cut, percentage })}`;
      }
    }
    const safeNotes = sanitizeCardHTML(notes);
    const { rolls = [], ...cardData } = data;
    // Rzuty łupów i skutków (test 1d100 jest pokazany osobno w nagłówku karty)
    const lootRolls = rolls.filter(r => r.formula !== "1d100");

    // Tydzień Szajki: karta trafia do zbiorczego raportu
    if (this._batch) {
      this._batch.push({ ...cardData, notes: safeNotes, rollSummary: this._rollNote(lootRolls), rolls });
      return null;
    }
    const html = await foundry.applications.handlebars.renderTemplate(template, {
      ...cardData,
      notes: safeNotes,
      rollSummary: this._rollNote(lootRolls)
    });

    return ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content: html,
      rolls,
      flavor: `${t("Report.MissionFlavor")}: ${data.title}`
    });
  }

  /**
   * Rozkazy taktyczne, które Herszt może teraz wydać (ma w Świcie kogoś z wymaganą rolą),
   * z kosztem w Przewadze. Dla innych modułów, np. Warhammer Battle HUD (game.underworld.tacticalOrders).
   * Postać bez kompanii albo bez dostępu do niej dostaje pustą listę.
   */
  static availableOrders(actor) {
    if (!actor?.getFlag?.(GangData.MODULE_ID, GangData.FLAG_KEY) || !this._canManageGang(actor)) return [];
    const gang = GangData.getGang(actor);
    const retinue = gang.roster.filter(n => n.assignment === "retinue" && !["dead", "wounded", "arrested"].includes(n.status));
    return Object.entries(this.TACTICAL_ORDERS).flatMap(([id, order]) => {
      const roles = Array.isArray(order.requiredRoles) ? order.requiredRoles : [];
      const executor = roles.length
        ? retinue.find(n => UnderworldTables.canGiveOrder(n, id, order))
        : retinue.find(n => Number(n.rank) >= 3);
      if (roles.length && !executor) return [];
      const [group, icon] = this.ORDER_META[id] || ["offensive", "fas fa-bolt"];
      return [{
        id, group, icon,
        name: order.name,
        description: order.desc ?? "",
        effect: order.effect ?? "",
        cost: Number(order.advantageCost) || 0,
        executor: executor?.name ?? null
      }];
    });
  }

  static TACTICAL_ORDERS = textConfig({
    // 🛡️ OCHRONIARZ / GORYL
    "meatshield": {
      advantageCost: 0,
      modifier: 0,
      requiredRoles: ["bodyguard"]
    },
    "trip": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["bodyguard", "duelist"]
    },
    "bullrush": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["bodyguard"]
    },

    // 🗡️ CIEŃ / NOŻOWNIK
    "flank": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["shadow", "duelist", "scout", "smuggler"]
    },
    "volley": {
      advantageCost: 2,
      modifier: -10,
      requiredRoles: ["shadow", "marksman", "scout"]
    },
    "kidneystrike": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["shadow", "duelist"]
    },

    // 🏹 STRZELEC / KŁUSOWNIK
    "cover": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["marksman", "scout"]
    },
    "disarm": {
      advantageCost: 2,
      modifier: -10,
      requiredRoles: ["marksman", "duelist"]
    },

    // 🎭 PROWOKATOR / SZULER
    "distract": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["provocateur", "charlatan", "duelist"]
    },
    "smoke": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["provocateur", "saboteur", "smuggler"]
    },
    "sand": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["provocateur", "smuggler", "scout"]
    },

    // 🧰 SZABROWNIK / FELCZER
    "resupply": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["scavenger", "smuggler", "fixer"]
    },
    "retreat": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["scavenger", "smuggler", "scout"]
    },
    "draught": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["scavenger", "charlatan"]
    },

    // 📢 PRAWA RĘKA / ZASTĘPCA
    "rally": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: [] // Uniwersalny dla Herszta, Prawa Ręka wzmacnia
    },
    "coordinate": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["lieutenant"]
    },
    "retaliation": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["lieutenant"]
    },
    "bodyblock": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["bodyguard"]
    },
    "grapple": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["bodyguard"]
    },
    "circle": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["bodyguard"]
    },
    "parry": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["duelist"]
    },
    "riposte": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["duelist"]
    },
    "challenge": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["duelist"]
    },
    "pindown": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["marksman", "scout"]
    },
    "fireoil": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["saboteur"]
    },
    "caltrops": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["saboteur", "smuggler"]
    },
    "collapse": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["saboteur"]
    },
    "wagonwall": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["smuggler"]
    },
    "spooked": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["smuggler"]
    },
    "getaway": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["smuggler"]
    },
    "spot": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["scout"]
    },
    "lure": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["scout"]
    },
    "snare": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["scout"]
    },
    "forgedorder": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["fixer"]
    },
    "payoff": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["fixer"]
    },
    "salve": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["charlatan", "scavenger"]
    },
    "fumes": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["charlatan", "provocateur"]
    },
    "evileye": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["charlatan"]
    },
    "regroup": {
      advantageCost: 1,
      modifier: 0,
      requiredRoles: ["lieutenant"]
    }
  }, "Orders", { name: "Name", desc: "Desc", effect: "Effect" });

  /** Grupa karty (ofensywne / kontrola / ochrona) i ikona rozkazu w zakładce Taktyka. */
  static ORDER_META = {
    trip: ["offensive", "fas fa-person-falling"],
    bullrush: ["offensive", "fas fa-shield-alt"],
    flank: ["offensive", "fas fa-shoe-prints"],
    volley: ["offensive", "fas fa-crosshairs"],
    kidneystrike: ["offensive", "fas fa-tint"],
    cover: ["offensive", "fas fa-bullseye"],
    disarm: ["offensive", "fas fa-hand-holding-box"],
    distract: ["control", "fas fa-mask"],
    smoke: ["control", "fas fa-smog"],
    sand: ["control", "fas fa-eye-slash"],
    rally: ["control", "fas fa-fist-raised"],
    coordinate: ["control", "fas fa-users-cog"],
    retaliation: ["control", "fas fa-bolt"],
    meatshield: ["protection", "fas fa-user-shield"],
    resupply: ["protection", "fas fa-toolbox"],
    retreat: ["protection", "fas fa-door-closed"],
    draught: ["protection", "fas fa-flask"],
    bodyblock: ["protection", "fas fa-user-shield"],
    grapple: ["offensive", "fas fa-hands"],
    circle: ["protection", "fas fa-ring"],
    parry: ["protection", "fas fa-shield-halved"],
    riposte: ["offensive", "fas fa-khanda"],
    challenge: ["offensive", "fas fa-gavel"],
    pindown: ["offensive", "fas fa-crosshairs"],
    fireoil: ["offensive", "fas fa-fire"],
    caltrops: ["offensive", "fas fa-asterisk"],
    collapse: ["offensive", "fas fa-house-crack"],
    wagonwall: ["protection", "fas fa-cart-flatbed"],
    spooked: ["control", "fas fa-horse"],
    getaway: ["protection", "fas fa-person-running"],
    spot: ["protection", "fas fa-binoculars"],
    lure: ["control", "fas fa-bullseye"],
    snare: ["offensive", "fas fa-circle-notch"],
    forgedorder: ["control", "fas fa-stamp"],
    payoff: ["control", "fas fa-coins"],
    salve: ["protection", "fas fa-kit-medical"],
    fumes: ["control", "fas fa-biohazard"],
    evileye: ["control", "fas fa-eye"],
    regroup: ["control", "fas fa-users"]
  };

  static async postTacticalOrder(actor, orderId, options = {}) {
    if (!this._canManageGang(actor)) return ui.notifications.warn(t("Notify.NoAccess"));
    const order = foundry.utils.duplicate(this.TACTICAL_ORDERS[orderId] || {});
    if (!order || !order.name) return;

    const gang = GangData.getGang(actor);
    const method = ["leadership", "advantage", "direct"].includes(options.method) ? options.method : "leadership";
    if (method === "direct" && orderId !== "meatshield" && !this.canUseDirectOrder()) {
      ui.notifications.warn(t("Orders.Notify.DirectDisabled"));
      return false;
    }
    const advantage = getAdvantage(actor);
    const advCost = Number(order.advantageCost) || 0;
    if (method === "advantage" && (orderId === "rally" || advCost <= 0 || advantage < advCost)) {
      ui.notifications.warn(t("Orders.Notify.NoAdvantage"));
      return false;
    }
    // Limit: jeden rozkaz na rundę walki (akcja Herszta), a Żywa Tarcza osobno jako Reakcja
    const combat = game.combat;
    const roundKey = combat?.started ? `${combat.id}:${combat.round}` : null;
    const isReaction = orderId === "meatshield";
    if (roundKey && this.orderRoundLimit() !== "unlimited" && (isReaction ? gang.lastReactionRound === roundKey : gang.lastOrderRound === roundKey)) {
      ui.notifications.warn(t("Orders.Notify.AlreadyThisRound"));
      return false;
    }

    let rollResult = null;
    const orderRolls = [];

    // Ustal wykonawcę ze Świty
    let executorNpc = options.executorNpc ? gang.roster.find(n => n.id === options.executorNpc.id) : null;
    if (executorNpc && (executorNpc.assignment !== "retinue" || ["dead", "wounded", "arrested"].includes(executorNpc.status))) {
      ui.notifications.warn(t("Orders.Notify.NotInRetinue"));
      return false;
    }
    if (!executorNpc && Array.isArray(order.requiredRoles) && order.requiredRoles.length > 0) {
      const activeRetinue = gang.roster.filter(n => 
        n.assignment === "retinue" && !["dead", "wounded", "arrested"].includes(n.status)
      );
      executorNpc = activeRetinue.find(n => UnderworldTables.canGiveOrder(n, orderId, order)) || null;
    }
    if (Array.isArray(order.requiredRoles) && order.requiredRoles.length > 0 && !executorNpc) {
      ui.notifications.warn(t("Orders.Notify.NeedsMember"));
      return false;
    }
    if (executorNpc && Array.isArray(order.requiredRoles) && order.requiredRoles.length > 0) {
      if (!UnderworldTables.canGiveOrder(executorNpc, orderId, order)) {
        ui.notifications.warn(t("Orders.Notify.WrongRole"));
        return false;
      }
    }

    if (method === "leadership") {
      const skill = actor.itemTypes?.skill?.find(s => 
        s.name.toLowerCase().includes("dowodzenie") || s.name.toLowerCase().includes("leadership")
      );
      const skillName = skill ? skill.name : t("Orders.NoLeadership");
      const modifier = order.modifier || 0;
      const testResult = await this._rollWfrpSkill(actor, skill?.name || game.i18n.localize("NAME.Leadership"), {
        title: `${t("Orders.Order")}: ${order.name}`, modifier
      });
      if (!testResult) {
        ui.notifications.error(t("Orders.Notify.NoTest"));
        return false;
      }
      const rollVal = testResult.roll;
      const sl = testResult.sl;
      const isSuccess = testResult.isSuccess;
      const target = testResult.test.result.target;

      // Przewaga tylko tam, gdzie jest efektem rozkazu (Okrzyk Bojowy, Zmyłka) – nie za sam test
      let advantageGained = 0;
      if (isSuccess) {
        if (orderId === "rally") advantageGained = Math.min(3, Math.max(1, sl));
        if (orderId === "distract") advantageGained = sl >= 3 ? 2 : 1;
      }
      if (advantageGained > 0) {
        await modifyAdvantage(actor, advantageGained);
      }

      rollResult = {
        skillName,
        target,
        roll: rollVal,
        sl,
        isSuccess,
        advantageGained
      };
    } else if (method === "advantage") {
      await modifyAdvantage(actor, -advCost);
    }

    const orderFailed = method === "leadership" && rollResult && !rollResult.isSuccess;
    if (roundKey) {
      if (isReaction) gang.lastReactionRound = roundKey;
      else gang.lastOrderRound = roundKey;
    }

    if (orderId === "meatshield" && !orderFailed) {
      // Wybierz ochroniarza ze świty jako ofiarę ciosu
      let victim = null;
      if (executorNpc) {
        victim = gang.roster.find(n => n.id === executorNpc.id);
      }
      if (!victim) {
        const retinueGuards = gang.roster.filter(n => n.assignment === "retinue" && n.status === "ready");
        victim = retinueGuards[0] || gang.roster.find(n => n.status === "ready");
      }

      if (victim) {
        const hasArmor = Array.isArray(victim.gear) && victim.gear.includes("armor");
        const isVeteran = (Number(victim.rank) || 0) >= 2;
        const hasBloodBond = Array.isArray(victim.narrativePerks) && victim.narrativePerks.includes("blood_brotherhood");
        const absorbsBlow = (hasArmor || isVeteran || hasBloodBond) && (await this._roll("1d2", orderRolls)) === 1;

        if (absorbsBlow) {
          victim.status = "ready";
          const reason = hasArmor ? t("Orders.MeatShield.Armour") : isVeteran ? t("Orders.MeatShield.Veteran") : t("Orders.MeatShield.BloodBond");
          order.effect += `<br><br><strong>${t("Orders.MeatShield.Saved", { name: escapeHTML(victim.name), reason })}</strong>`;
        } else {
          victim.status = "wounded";
          victim.assignment = "none";
          order.effect += `<br><br><strong>${t("Orders.MeatShield.Wounded", { name: escapeHTML(victim.name) })}</strong>`;
        }
        await GangData.saveGang(actor, gang);
      } else {
        ui.notifications.warn(t("Orders.MeatShield.Nobody"));
        return;
      }
    }

    // Hojny Datek (payoff): pobiera 1d10 SS ze skarbca (lub sakwy) przy próbie przekupstwa wroga
    if (orderId === "payoff" && !orderFailed && method !== "direct") {
      const bribeSS = await this._roll("1d10", orderRolls);
      const bribePennies = bribeSS * 12;
      const treasuryP = GangData.treasuryToPennies(gang.treasury);
      const fromTreasury = Math.min(treasuryP, bribePennies);
      if (fromTreasury > 0) {
        gang.treasury = GangData.penniesToTreasury(treasuryP - fromTreasury);
      }
      const remaining = bribePennies - fromTreasury;
      if (remaining > 0) {
        const actorP = this.getActorPennies(actor);
        const fromPurse = Math.min(actorP, remaining);
        if (fromPurse > 0) await this.deductActorPennies(actor, fromPurse);
      }
      order.effect += `<br><br><strong>${t("Orders.PayoffCost", { cost: bribeSS })}</strong>`;
    }

    // Efekty na wskazanych tokenach (stany WFRP4e, Przewaga) – wykonuje MG (o ile automatyzacja jest włączona)
    const automationLines = !orderFailed && method !== "direct" && this.orderAutomation() !== "chatOnly" && OrderEffects.isAutomated(orderId)
      ? await OrderEffects.applyFromIssuer(actor, orderId, { method, executorRank: Number(executorNpc?.rank) || 0 })
      : [];

    // Dołącz dane roli wykonawcy na kopii (bez zanieczyszczania flag aktora)
    const cardExecutor = executorNpc ? {
      ...executorNpc,
      roleConfig: UnderworldTables.ROLES_CONFIG[UnderworldTables.normalizeRole(executorNpc.role)] || null
    } : null;

    const template = "modules/wfrp4e-underworld/templates/chat/tactic-card.hbs";
    order.effect = sanitizeCardHTML(order.effect);
    const html = await foundry.applications.handlebars.renderTemplate(template, {
      order,
      orderGlyph: `order-${orderId}`,
      companyType: profileOf(gang).id,
      actor,
      method,
      rollResult,
      orderFailed,
      automationLines,
      inCombat: !!roundKey,
      executor: cardExecutor
    });
    await GangData.saveGang(actor, gang);

    return ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content: html,
      rolls: orderRolls,
      flavor: `${t("Orders.Flavor")}: ${order.name}`
    });
  }

  // ════════════════════════════════════════════
  // SKARBIEC, SAKWA GRACZA I ZAPASY
  // ════════════════════════════════════════════

  /**
   * Zwraca sformatowany tekst waluty WFRP 4e (np. "1 GC, 5 s, 6 d" / "1 ZK, 5 SS, 6 bp")
   */
  static formatPennies(totalD) {
    const coins = GangData.penniesToTreasury(totalD);
    const parts = [];
    if (coins.gc > 0) parts.push(`${coins.gc} ${t("Units.GC")}`);
    if (coins.ss > 0) parts.push(`${coins.ss} ${t("Units.SS")}`);
    if (coins.d > 0 || parts.length === 0) parts.push(`${coins.d} ${t("Units.BP")}`);
    return parts.join(", ");
  }

  /**
   * Wykrywa typ monety WFRP (gc, ss, bp) na podstawie systemu i nazwy przedmiotu
   */
  static _getCoinType(item) {
    if (!item) return null;
    const coinValue = Number(item.system?.coinValue?.value ?? item.system?.coinValue);
    if (coinValue === 240) return "gc";
    if (coinValue === 12) return "ss";
    if (coinValue === 1) return "bp";

    const name = (item.name || "").toLowerCase().trim();
    if (name.includes("gc") || name.includes("crown") || name.includes("koron") || name.includes("złot") || name.includes("gold")) {
      return "gc";
    }
    if (name.includes("ss") || name.includes("shilling") || name.includes("szyling") || name.includes("srebr") || name.includes("silver")) {
      return "ss";
    }
    if (name.includes("bp") || name.includes("penn") || name.includes("pens") || name.includes("mosięż") || name.includes("brass") || /\bd\b/i.test(name) || /\bp\b/i.test(name)) {
      return "bp";
    }
    return null;
  }

  /**
   * Sprawdza stan sakwy postaci w pensach (WFRP4e Money items)
   */
  static getActorPennies(actor) {
    if (!actor) return 0;
    const items = actor.getItemTypes ? actor.getItemTypes("money") : (actor.items?.filter(i => i.type === "money") || []);
    if (!items || items.length === 0) return 0;

    let totalD = 0;
    for (const item of items) {
      const qty = Number(item.system?.quantity?.value ?? item.system?.quantity ?? 0);
      const value = Number(item.system?.coinValue?.value ?? item.system?.coinValue);
      const coinType = this._getCoinType(item);
      totalD += qty * (value > 0 ? value : ({ gc: 240, ss: 12, bp: 1 }[coinType] || 0));
    }
    return totalD;
  }

  /**
   * Odejmuje pensy z sakwy postaci
   */
  static async deductActorPennies(actor, penniesToDeduct) {
    if (!actor || penniesToDeduct <= 0) return true;
    const current = this.getActorPennies(actor);
    if (current < penniesToDeduct) return false;
    return await this.setActorPennies(actor, current - penniesToDeduct);
  }

  /**
   * Dodaje pensy do sakwy postaci
   */
  static async addActorPennies(actor, penniesToAdd) {
    if (!actor || penniesToAdd <= 0) return true;
    const current = this.getActorPennies(actor);
    return await this.setActorPennies(actor, current + penniesToAdd);
  }

  /**
   * Ustawia stan monet w sakwie postaci
   */
  static async setActorPennies(actor, totalD) {
    if (!actor) return false;
    let items = actor.getItemTypes ? actor.getItemTypes("money") : (actor.items?.filter(i => i.type === "money") || []);
    
    // Jeśli postać nie ma żadnych przedmiotów monet w ekwipunku, utwórz standardowe
    const existingValues = new Set((items || []).map(item => Number(item.system?.coinValue?.value ?? item.system?.coinValue)).filter(v => v > 0));
    const missing = [[240, "Gold Crown"], [12, "Silver Shilling"], [1, "Brass Penny"]].filter(([value]) => !existingValues.has(value));
    if (missing.length && actor.createEmbeddedDocuments) {
      try {
        await actor.createEmbeddedDocuments("Item", missing.map(([value, name]) => ({
          name, type: "money", system: { coinValue: { value }, quantity: { value: 0 } }
        })));
        items = actor.getItemTypes ? actor.getItemTypes("money") : (actor.items?.filter(i => i.type === "money") || []);
      } catch (err) {
        console.warn("wfrp4e-underworld | Could not create the default coin items:", err);
      }
    }
    if (!items || items.length === 0) return false;

    let remainder = Math.max(0, Math.trunc(Number(totalD) || 0));
    const updates = [];
    const denominations = new Map();
    for (const item of items) {
      const value = Number(item.system?.coinValue?.value ?? item.system?.coinValue);
      if (value > 0) {
        const group = denominations.get(value) || [];
        group.push(item);
        denominations.set(value, group);
      }
    }
    for (const [value, group] of [...denominations.entries()].sort((a, b) => b[0] - a[0])) {
      const amount = Math.floor(remainder / value);
      remainder -= amount * value;
      group.forEach((item, index) => updates.push({ _id: item.id, "system.quantity.value": index === 0 ? amount : 0 }));
    }
    if (remainder > 0) return false;

    if (updates.length > 0) {
      try {
        await actor.updateEmbeddedDocuments("Item", updates);
        return true;
      } catch (err) {
        console.error("wfrp4e-underworld | Could not set coins:", err);
        return false;
      }
    }
    return false;
  }

  /**
   * Wpłata ze swojej sakwy do skarbca szajki
   */
  static async depositTreasury(actor, amountPennies, sourceActor = null) {
    const src = sourceActor || actor;
    amountPennies = Math.trunc(Number(amountPennies) || 0);
    if (!this._canManageGang(actor) || !src?.isOwner || amountPennies <= 0) return false;

    const srcPennies = this.getActorPennies(src);
    if (srcPennies < amountPennies) {
      ui.notifications.error(t("Treasury.PurseShort", { have: this.formatPennies(srcPennies), need: this.formatPennies(amountPennies) }));
      return false;
    }

    const deducted = await this.deductActorPennies(src, amountPennies);
    if (!deducted) {
      ui.notifications.error(t("Treasury.DeductFailed"));
      return false;
    }

    const gang = GangData.getGang(actor);
    const currentTreasuryP = GangData.treasuryToPennies(gang.treasury);
    gang.treasury = GangData.penniesToTreasury(currentTreasuryP + amountPennies);
    gang.cycleTreasuryNetPennies = (Number(gang.cycleTreasuryNetPennies) || 0) + amountPennies;

    let moraleBoostMsg = "";
    if (!gang.cycleDepositMoraleAwarded && gang.cycleTreasuryNetPennies >= 240) {
      gang.cycleDepositMoraleAwarded = true;
      this.changeMorale(gang, 1);
      moraleBoostMsg = ` ${t("Treasury.Generous")}`;
    }

    try {
      await GangData.saveGang(actor, gang);
    } catch (err) {
      await this.addActorPennies(src, amountPennies);
      ui.notifications.error(t("Treasury.SaveFailedPurse"));
      return false;
    }

    const formattedAmount = this.formatPennies(amountPennies);
    ui.notifications.info(t("Treasury.Deposited", { amount: formattedAmount }));

    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: src }),
      content: `<div class="wfrp4e-underworld-chat">
        <h3><i class="fas fa-coins text-gold"></i> ${t("Treasury.DepositTitle")}</h3>
        <p>${t("Treasury.DepositText", { name: escapeHTML(src.name), amount: formattedAmount })}</p>
        <p>${t("Treasury.NewBalance", { amount: this.formatPennies(GangData.treasuryToPennies(gang.treasury)) })}${moraleBoostMsg ? `<br><span class="text-green font-bold"><i class="fas fa-arrow-up"></i>${moraleBoostMsg}</span>` : ""}</p>
      </div>`,
      flavor: t("Treasury.FlavorDeposit")
    });

    return true;
  }

  /**
   * Pobranie monet ze skarbca szajki do sakwy
   * Ryzyko utraty Morale i buntu przy braku autorytetu!
   */
  static async withdrawTreasury(actor, amountPennies, targetActor = null) {
    const tgt = targetActor || actor;
    amountPennies = Math.trunc(Number(amountPennies) || 0);
    if (!this._canManageGang(actor) || !tgt?.isOwner || amountPennies <= 0) return false;

    const gang = GangData.getGang(actor);
    const currentTreasuryP = GangData.treasuryToPennies(gang.treasury);
    if (currentTreasuryP < amountPennies) {
      ui.notifications.error(t("Treasury.StashShort", { have: this.formatPennies(currentTreasuryP) }));
      return false;
    }

    const credited = await this.addActorPennies(tgt, amountPennies);
    if (!credited) {
      ui.notifications.error(t("Treasury.CreditFailed"));
      return false;
    }
    gang.treasury = GangData.penniesToTreasury(currentTreasuryP - amountPennies);
    gang.cycleTreasuryNetPennies = (Number(gang.cycleTreasuryNetPennies) || 0) - amountPennies;
    gang.cycleWithdrawnPennies = (Number(gang.cycleWithdrawnPennies) || 0) + amountPennies;

    const cycleWithdrawnSS = gang.cycleWithdrawnPennies / 12;
    const formattedAmount = this.formatPennies(amountPennies);

    let moraleResult = "";
    if (cycleWithdrawnSS < 10) {
      moraleResult = t("Treasury.SmallWithdrawal");
    } else {
      let skillTarget = 40;
      const skills = tgt.items?.filter(i => i.type === "skill") || [];
      const leadItem = skills.find(i => /dowodzen|leadership/i.test(i.name));
      if (leadItem) {
        skillTarget = Number(leadItem.system?.total?.value ?? leadItem.system?.advances?.value ?? 40);
      } else if (tgt.system?.characteristics?.fel?.value) {
        skillTarget = Number(tgt.system.characteristics.fel.value);
      }

      const isLarge = cycleWithdrawnSS > 40;
      const diffMod = isLarge ? -20 : 0;
      let finalTarget = Math.max(5, skillTarget + diffMod);
      let roll;
      let isSuccess;
      try {
        if (leadItem) {
          const result = await this._rollWfrpSkill(tgt, leadItem.name, { title: t("Treasury.WithdrawTest"), modifier: diffMod });
          roll = result.roll;
          finalTarget = result.test.result.target;
          isSuccess = result.isSuccess;
        } else {
          const test = await tgt.setupCharacteristic("fel", {
            appendTitle: ` - ${t("Treasury.WithdrawTest")}`,
            skipTargets: true,
            fields: { difficulty: "challenging" }
          });
          if (test.preData) test.preData.testModifier = (Number(test.preData.testModifier) || 0) + diffMod;
          await test.roll();
          roll = Number(test.result.roll);
          finalTarget = Number(test.result.target);
          isSuccess = !!test.succeeded;
        }
      } catch (err) {
        console.error("wfrp4e-underworld | Withdrawal test failed:", err);
        roll = (await (new Roll("1d100")).evaluate()).total;
        isSuccess = roll <= finalTarget;
      }

      if (isSuccess) {
        moraleResult = t("Treasury.AuthorityHeld", { roll, target: finalTarget });
      } else {
        const moraleLoss = isLarge ? 2 : 1;
        this.changeMorale(gang, -moraleLoss);
        moraleResult = `<span class="text-crimson font-bold"><i class="fas fa-exclamation-triangle"></i> ${t("Treasury.AuthorityLost", { roll, target: finalTarget, loss: moraleLoss })}</span>`;
      }
    }

    try {
      await GangData.saveGang(actor, gang);
    } catch (err) {
      await this.deductActorPennies(tgt, amountPennies);
      ui.notifications.error(t("Treasury.SaveFailedStash"));
      return false;
    }
    ui.notifications.warn(t("Treasury.Withdrawn", { amount: formattedAmount }));

    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: tgt }),
      content: `<div class="wfrp4e-underworld-chat">
        <h3><i class="fas fa-hand-holding-usd text-warning"></i> ${t("Treasury.WithdrawTitle")}</h3>
        <p>${t("Treasury.WithdrawText", { name: escapeHTML(tgt.name), amount: formattedAmount })}</p>
        <p>${t("Treasury.Remaining", { amount: this.formatPennies(GangData.treasuryToPennies(gang.treasury)) })}</p>
        <div class="underworld-morale-alert">${moraleResult}</div>
      </div>`,
      flavor: t("Treasury.FlavorWithdraw")
    });

    return true;
  }

  /**
   * Kupowanie zapasów do obozowiska
   */
  static async buySupplies(actor, count, paymentSource = "treasury") {
    if (!this._canManageGang(actor)) return false;
    count = Math.max(1, parseInt(count, 10) || 1);
    const gang = GangData.getGang(actor);
    const currentSupplies = gang.supplies || 0;
    if (currentSupplies >= 30) {
      ui.notifications.warn(t("Supplies.Full"));
      return false;
    }

    const actualCount = Math.min(count, 30 - currentSupplies);
    const pricePerUnit = this.supplyPrice(gang);
    const totalCostPennies = actualCount * pricePerUnit;
    const formattedCost = this.formatPennies(totalCostPennies);

    if (paymentSource === "purse") {
      const actorPennies = this.getActorPennies(actor);
      if (actorPennies < totalCostPennies) {
        ui.notifications.error(t("Treasury.PurseShort", { have: this.formatPennies(actorPennies), need: formattedCost }));
        return false;
      }
      const deducted = await this.deductActorPennies(actor, totalCostPennies);
      if (!deducted) return false;
    } else {
      const treasuryPennies = GangData.treasuryToPennies(gang.treasury);
      if (treasuryPennies < totalCostPennies) {
        ui.notifications.error(t("Supplies.StashShort", { need: formattedCost, have: this.formatPennies(treasuryPennies) }));
        return false;
      }
      gang.treasury = GangData.penniesToTreasury(treasuryPennies - totalCostPennies);
    }

    gang.supplies = currentSupplies + actualCount;
    await GangData.saveGang(actor, gang);

    const sourceLabel = paymentSource === "purse" ? t("Supplies.SourcePurse") : t("Supplies.SourceStash");
    ui.notifications.info(t("Supplies.Bought", { count: actualCount, cost: formattedCost }));

    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="wfrp4e-underworld-chat">
        <h3><i class="fas fa-bread-slice text-gold"></i> ${t("Supplies.ChatTitle")}</h3>
        <p>${t("Supplies.ChatBought", { count: actualCount })}</p>
        <p>${t("Supplies.ChatCost", { cost: formattedCost, source: sourceLabel })}</p>
        <p>${t("Supplies.ChatLarder", { value: gang.supplies })}</p>
      </div>`,
      flavor: t("Supplies.Flavor")
    });

    return true;
  }

  /**
   * Ustawianie ceny jednostkowej zapasów (tylko MG)
   */
  static async setSupplyPrice(actor, pricePennies) {
    if (!game.user.isGM) return false;
    const gang = GangData.getGang(actor);
    if (!gang.camp) gang.camp = {};
    gang.camp.supplyPricePennies = Math.max(1, parseInt(pricePennies, 10) || 12);
    await GangData.saveGang(actor, gang);
    ui.notifications.info(t("Supplies.PriceSet", { price: this.formatPennies(gang.camp.supplyPricePennies) }));
    return true;
  }

  /**
   * Czyści blokady cyklu i walki dla MG (np. po cofnięciu sceny lub pomyłce).
   */
  static async resetCycleLocks(actor) {
    if (!game.user.isGM || !actor) return false;
    const gang = GangData.getGang(actor);
    delete gang.lastCampRestDay;
    delete gang.campRestInProgress;
    delete gang.lastOrderRound;
    delete gang.lastReactionRound;
    delete gang.cycleTreasuryNetPennies;
    delete gang.cycleDepositMoraleAwarded;
    delete gang.cycleWithdrawnPennies;
    await GangData.saveGang(actor, gang);
    ui.notifications.info(t("Camp.LocksReset"));
    return true;
  }

}

// Każde zlecenie z danych dostaje własną metodę: rozsyłanie i plany zapisują nazwę metody (fn)
for (const id of Object.keys(DATA_MISSIONS)) {
  UnderworldOperations[DATA_MISSIONS[id].fn] = function (actor, npcId, input, opts) {
    return this.executeDataMission(id, actor, npcId, input, opts);
  };
}
