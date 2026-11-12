/**
 * WFRP4e - Podziemie: Szajka Człowieka (Mobilna Kompania)
 * Główny interfejs aplikacji zarządzania szajką (ApplicationV2)
 */

import { GangData } from "./gang-data.mjs";
import { UnderworldOperations } from "./operations.mjs";
import { UnderworldTables } from "./tables-data.mjs";
import { UnderworldRollTables } from "./roll-tables.mjs";
import { OrderEffects } from "./order-effects.mjs";
import {
  MISSIONS, MISSION_CATEGORIES, CATEGORY_ICON_CLASS, TERRAINS, TERRAIN_IDS, TARGET_TIERS, TOKENS, LOOT_CATEGORIES, MISSION_HOURS,
  missionAvailable, missionName, missionDesc
} from "./world-data.mjs";
import { registry, dialogContent, dialogValue, escapeHTML } from "../../wfrp4e-companion-lib/scripts/companion-lib.mjs";
import { t } from "./i18n.mjs";
import { profileHasMission, profileOf } from "./company-profiles.mjs";

/** Zakładki, które MG może ukryć przed graczem (Informacje są zawsze widoczne). */
export const HIDEABLE_TABS = ["dashboard", "roster", "tasks", "loot", "tactics"];
const TAB_LABEL_KEYS = { dashboard: "Tabs.Camp", roster: "Tabs.Roster", tasks: "Tabs.Tasks", loot: "Tabs.Loot", tactics: "Tabs.Tactics" };

/** Nazwa stanu członka w bieżącym języku (ready → „Dostępny” itd.). */
const statusLabel = status => t(`Status.${String(status || "ready").charAt(0).toUpperCase()}${String(status || "ready").slice(1)}`);

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/** Kategorie zleceń rozwinięte przy pierwszym otwarciu panelu. */
const OPEN_CATEGORIES = new Set(["intel", "resources"]);

export class GangSheet extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor, options = {}) {
    super({ id: GangSheet.appIdFor(actor), ...options });
    this.actor = actor;
  }

  /** Identyfikator okna szajki dla danego aktora (jedno okno na postać). */
  static appIdFor(actor) {
    return `underworld-gang-sheet-${actor.id}`;
  }

  static DEFAULT_OPTIONS = {
    classes: ["wfrp4e", "sheet", "underworld-app"],
    tag: "form",
    window: {
      title: "UNDERWORLD.WindowTitle",
      icon: "fas fa-skull-crossbones",
      resizable: true
    },
    position: {
      width: 1000,
      height: 760
    },
    form: {
      handler: GangSheet.#onSubmitForm,
      submitOnChange: true,
      closeOnSubmit: false
    }
  };

  static PARTS = {
    sheet: {
      template: "modules/wfrp4e-underworld/templates/gang-sheet.hbs"
    }
  };

  tabGroups = { primary: "dashboard" };

  async render(options = {}, _options = {}) {
    if (!game.user.isGM && (!this.actor?.isOwner || !registry.isFeatureUnlocked(this.actor, "underworld"))) {
      ui.notifications.warn(t("Notify.NoAccess"));
      return this;
    }
    return super.render(options, _options);
  }

  get title() {
    const gang = GangData.getGang(this.actor);
    const gangName = gang?.name || t("DefaultGangName");
    return `WFRP4e - ${gangName} (${this.actor.name})`;
  }

  async _prepareContext(options) {
    const data = await super._prepareContext(options);
    const gang = GangData.getGang(this.actor);

    // Zabezpieczenie danych
    if (!gang.roster) gang.roster = [];
    if (!gang.camp) gang.camp = { type: "basic" };
    if (!gang.camp.type) gang.camp.type = "basic";
    if (!gang.treasury) gang.treasury = { gc: 0, ss: 0, d: 0 };
    gang.treasury.gc = Number(gang.treasury.gc) || 0;
    gang.treasury.ss = Number(gang.treasury.ss) || 0;
    gang.treasury.d = Number(gang.treasury.d) || 0;
    if (typeof gang.supplies !== "number" || isNaN(gang.supplies)) gang.supplies = 0;
    if (typeof gang.morale !== "number" || isNaN(gang.morale)) gang.morale = 0;

    // Uzupełnienie danych profilowych / informacyjnych
    if (!gang.patron) gang.patron = {};
    if (!gang.patron.name) gang.patron.name = "";
    if (!gang.patron.title) gang.patron.title = "";
    if (!gang.patron.relation) gang.patron.relation = "neutral";
    if (!gang.patron.cut) gang.patron.cut = "";
    if (gang.patron.notes === undefined) gang.patron.notes = "";

    if (!gang.name) gang.name = t("DefaultGangName");
    if (Array.isArray(gang.name)) {
      const defaults = ["Szajka", "Crew", t("DefaultGangName")];
      const custom = gang.name.find(n => typeof n === "string" && n.trim() && !defaults.includes(n.trim()));
      gang.name = custom || gang.name[0] || t("DefaultGangName");
    }

    if (typeof gang.notoriety !== "number" || isNaN(gang.notoriety)) gang.notoriety = 0;
    if (gang.motto === undefined) gang.motto = "";
    if (Array.isArray(gang.motto)) {
      const custom = gang.motto.find(m => typeof m === "string" && m.trim() && m.trim() !== "");
      gang.motto = custom || gang.motto[0] || "";
    }
    if (gang.type === undefined) gang.type = "underworld";
    if (gang.hideout === undefined) gang.hideout = "";
    if (gang.territory === undefined) gang.territory = "";
    if (gang.bounty === undefined) gang.bounty = "";
    if (gang.allies === undefined) gang.allies = "";
    if (gang.rivals === undefined) gang.rivals = "";
    if (gang.code === undefined) gang.code = "";
    if (gang.notes === undefined) gang.notes = "";

    // Na pierwszym otwarciu pokazuj zwartą listę; szczegóły można rozwinąć pojedynczo.
    if (!this._collapsedNpcIds) this._collapsedNpcIds = new Set(gang.roster.map(npc => npc.id));

    // Aktualizacja danych aktorów
    for (const npc of gang.roster) {
      npc.isCollapsed = this._collapsedNpcIds.has(npc.id);
      if (!npc.assignment) npc.assignment = "none";
      if (!npc.status) npc.status = "ready";
      npc.rank = Number(npc.rank) || 0;
      npc.operationalXP = Number(npc.operationalXP) || 0;
      if (!Array.isArray(npc.gear)) npc.gear = [];
      npc.customBonus = Number(npc.customBonus) || 0;
      if (!Array.isArray(npc.strengths)) {
        npc.strengths = [npc.strength].filter(Boolean);
      }
      if (!Array.isArray(npc.flaws)) {
        npc.flaws = [npc.flaw].filter(Boolean);
      }
      if (!Array.isArray(npc.narrativePerks)) {
        npc.narrativePerks = [];
      }
      npc.role = UnderworldTables.roleForCompany(npc.role, gang.type);
      npc.role2 = npc.role2 && UnderworldTables.ROLES_CONFIG[npc.role2] && npc.role2 !== npc.role ? npc.role2 : "";
      npc.roleConfig = UnderworldTables.ROLES_CONFIG[npc.role] || UnderworldTables.ROLES_CONFIG["bodyguard"];
      Object.assign(npc, this._memberGlyphs(npc));

      if (npc.actorId) {
        const linkedActor = game.actors.get(npc.actorId);
        if (linkedActor) {
          npc.img = linkedActor.img || npc.img || "icons/svg/mystery-man.svg";
          npc.actorName = linkedActor.name;
        } else {
          npc.actorMissing = true;
          npc.img = npc.img || "icons/svg/mystery-man.svg";
        }
      } else {
        npc.img = npc.img || "icons/svg/mystery-man.svg";
      }
    }

    // Świta Herszta (Personal Retinue)
    const retinueMembers = gang.roster.filter(n =>
      n.assignment === "retinue" && !["dead", "wounded", "arrested"].includes(n.status)
    );
    data.activeRetinue = retinueMembers;
    data.retinueCount = retinueMembers.length;
    data.maxRetinue = 3;
    data.canAddRetinue = retinueMembers.length < 3;

    // Przygotowanie widoku rozkazów taktycznych
    const tacticalOrdersView = {};
    for (const [orderId, order] of Object.entries(UnderworldOperations.TACTICAL_ORDERS)) {
      const reqRoles = Array.isArray(order.requiredRoles) ? order.requiredRoles : [];
      let isUnlocked = false;
      let executor = null;

      if (reqRoles.length === 0) {
        // Zdolność uniwersalna Herszta (np. Okrzyk Bojowy)
        isUnlocked = true;
        executor = retinueMembers.find(n => Number(n.rank) >= 3) || null;
      } else {
        executor = retinueMembers.find(n => UnderworldTables.canGiveOrder(n, orderId, order)) || null;
        isUnlocked = !!executor;
      }

      const reqRoleNames = UnderworldTables.orderRoleNames(orderId, order, gang).join(` ${t("Or")} `);

      const [group, icon] = UnderworldOperations.ORDER_META[orderId] || ["offensive", "fas fa-bolt"];
      const cost = orderId === "meatshield" ? { costClass: "sacrifice", costIcon: "fas fa-heart-broken", costLabel: t("TacticsTab.WoundRisk") }
        : orderId === "rally" ? { costClass: "free", costIcon: "fas fa-dice", costLabel: t("TacticsTab.LeadershipAction") }
        : Number(order.advantageCost) >= 2 ? { costClass: "advantage-high", costIcon: "fas fa-bolt", costLabel: t("TacticsTab.Cost2") }
        : { costClass: "advantage", costIcon: "fas fa-bolt", costLabel: t("TacticsTab.Cost1") };

      tacticalOrdersView[orderId] = {
        ...order,
        id: orderId,
        glyph: `order-${orderId}`,
        costPips: Array.from({ length: Number(order.advantageCost) || 0 }),
        group,
        icon,
        ...cost,
        danger: orderId === "meatshield",
        universal: orderId === "rally",
        isUnlocked: orderId === "rally" ? true : isUnlocked,
        executor,
        reqRoleNames
      };
    }
    data.tacticalOrders = tacticalOrdersView;
    data.tacticGroups = [
      ["offensive", "fas fa-skull-crossbones", "Offensive"],
      ["control", "fas fa-theater-masks", "Control"],
      ["protection", "fas fa-shield-alt", "Protection"]
    ].map(([id, icon, key]) => ({
      id, icon, title: t(`TacticsTab.${key}`),
      orders: Object.values(tacticalOrdersView).filter(o => o.group === id)
    }));
    data.rolesConfig = UnderworldTables.ROLES_CONFIG;
    data.companyType = gang.type;

    data.availableOutlaws = gang.roster.filter(n => n.status === "ready" && (!n.assignment || n.assignment === "none"));

    // Waluta i zaopatrzenie
    const treasuryPennies = GangData.treasuryToPennies(gang.treasury);
    data.treasuryPennies = treasuryPennies;
    data.treasuryFormatted = UnderworldOperations.formatPennies(treasuryPennies);

    const supplyPrice = gang.camp?.supplyPricePennies || 12;
    data.supplyPricePennies = supplyPrice;
    data.supplyPriceFormatted = UnderworldOperations.formatPennies(supplyPrice);

    const actorPennies = UnderworldOperations.getActorPennies(this.actor);
    data.actorPennies = actorPennies;
    data.actorMoneyFormatted = UnderworldOperations.formatPennies(actorPennies);
    data.actor = this.actor;
    data.gang = gang;
    data.isGM = game.user.isGM;
    data.isWeekly = UnderworldOperations.isWeekly();
    data.dailyQueue = !data.isWeekly && UnderworldOperations.usesDailyQueue();
    data.plannedCount = gang.roster.filter(n => n.plannedMission && !n.plannedMission.endsAt).length;

    // Zakładki widoczne dla gracza (MG widzi wszystkie) i zlecenia z licznikiem czasu
    const hidden = new Set(Array.isArray(gang.hiddenTabs) ? gang.hiddenTabs : []);
    data.tabsVisible = Object.fromEntries(["info", ...HIDEABLE_TABS].map(id => [id, data.isGM || id === "info" || !hidden.has(id)]));
    data.timedMissions = UnderworldOperations.timedMissions(gang);
    data.hasTimedMissions = data.timedMissions.length > 0;
    if (data.isGM) data.gmView = this._gmView(gang);

    // Teren, żetony przygotowania, łupy i zlecenia dostępne w tym terenie
    const terrainId = UnderworldOperations.getTerrain(gang);
    const terrain = TERRAINS[terrainId];
    data.terrain = { id: terrainId, ...terrain };
    data.terrainOptions = TERRAIN_IDS.map(id => ({ id, name: TERRAINS[id].name, icon: TERRAINS[id].icon, glyph: `ui-terrain_${id}`, active: id === terrainId }));
    data.comfortableCostLabel = terrain.comfortableCostSS ? `${terrain.comfortableCostSS} ${t("Units.SS")}` : t("Free");

    data.activeTokens = Object.entries(TOKENS).flatMap(([id, cfg]) => {
      const token = UnderworldOperations.getToken(gang, id);
      if (!token) return [];
      const nights = Number(token.nightsLeft) || 0;
      const left = data.isWeekly ? t("Tokens.UntilWeekEnd") : (nights <= 1 ? t("Tokens.ExpiresTonight") : t("Cycle.NightMany", { count: nights }));
      return [{ id, ...cfg, left }];
    });

    const fence = terrain.fence;
    const loot = Array.isArray(gang.loot) ? gang.loot : [];
    data.lootView = loot.map(item => {
      const refused = fence.refuses.includes(item.category);
      const rate = UnderworldOperations.fenceRate(terrainId, item, 0);
      return {
        ...item,
        categoryName: LOOT_CATEGORIES[item.category]?.name || item.category,
        categoryIcon: LOOT_CATEGORIES[item.category]?.icon || "fas fa-box",
        glyph: LOOT_CATEGORIES[item.category] ? `ui-loot_${item.category}` : "ui-loot_goods",
        terrainName: TERRAINS[item.terrain]?.name || "",
        refused,
        liked: fence.likes.includes(item.category),
        rate,
        estimateSS: refused ? 0 : Math.max(1, Math.floor(item.valueSS * rate / 100))
      };
    });
    data.lootCount = loot.length;
    data.hotLootCount = loot.filter(item => item.hot).length;
    data.lootValueSS = loot.reduce((sum, item) => sum + (Number(item.valueSS) || 0), 0);
    data.lootEstimateSS = data.lootView.reduce((sum, item) => sum + item.estimateSS, 0);
    data.fence = {
      ...fence,
      likesNames: fence.likes.map(c => LOOT_CATEGORIES[c]?.name || c).join(", "),
      refusesNames: fence.refuses.map(c => LOOT_CATEGORIES[c]?.name || c).join(", ")
    };

    this._categoryCollapsed ??= {};
    data.missionCategories = Object.entries(MISSION_CATEGORIES).map(([id, cat]) => ({
      id,
      ...cat,
      cssKey: id,
      glyph: `ui-category_${id}`,
      iconClass: CATEGORY_ICON_CLASS[id],
      collapsed: this._categoryCollapsed[id] ?? !OPEN_CATEGORIES.has(id),
      missions: Object.entries(MISSIONS)
        .filter(([, m]) => m.category === id && missionAvailable(m, terrainId) && profileHasMission(gang, m))
        .map(([missionId, m]) => ({
          id: missionId,
          icon: m.icon,
          glyph: `job-${missionId}`,
          name: missionName(m, terrainId),
          desc: missionDesc(m, terrainId),
          tiered: !!m.tiered,
          noNpc: !!m.noNpc,
          duration: this._durationLabel(missionId, terrainId, m.tiered ? "normal" : null)
        }))
    })).filter(cat => cat.missions.length);

    data.ledger = this.constructor.useLedger();
    if (data.ledger) data.ledgerView = this._ledgerView(gang, terrainId, data);
    return data;
  }

  /** Dane zakładki MG: zasady świata (tura, złoto, czas zleceń) i ustawienia tej kompanii. */
  _gmView(gang) {
    const hidden = new Set(Array.isArray(gang.hiddenTabs) ? gang.hiddenTabs : []);
    let overrides = {};
    try { overrides = game.settings.get("wfrp4e-underworld", "missionHoursById") || {}; } catch (e) { overrides = {}; }
    const terrainId = UnderworldOperations.getTerrain(gang);
    return {
      turnDays: UnderworldOperations.customTurnDays(),
      effectiveTurn: UnderworldOperations.turnDays(),
      goldMultiplier: UnderworldOperations.goldMultiplier(),
      missionTempo: UnderworldOperations.missionTempo(),
      weekly: UnderworldOperations.isWeekly(),
      now: UnderworldOperations.formatDateTime(game.time.worldTime),
      tabs: HIDEABLE_TABS.map(id => ({ id, label: t(TAB_LABEL_KEYS[id]), visible: !hidden.has(id) })),
      missions: Object.entries(MISSIONS)
        .filter(([, m]) => !m.noNpc && profileHasMission(gang, m) && missionAvailable(m, terrainId))
        .map(([id, m]) => ({
          id,
          name: missionName(m, terrainId),
          hours: overrides[id] === undefined || overrides[id] === null ? "" : overrides[id],
          defaultHours: MISSION_HOURS[id] ?? 0,
          effective: this._durationLabel(id, terrainId, m.tiered ? "normal" : null) || t("GM.Instant")
        })),
      restLocked: !!gang.lastCampRestDay
    };
  }

  /** Czy panel używa wyglądu „Księga Kompanii” (ustawienie klienta). */
  static useLedger() {
    try {
      return game.settings.get("wfrp4e-underworld", "sheetStyle") !== "classic";
    } catch (_) {
      return true;
    }
  }

  /**
   * Plan dnia w Księdze: portret gotowego członka przeciąga się na kartę zlecenia (wysłanie)
   * albo na wolny slot Świty (dołączenie). Upuszczenie wywołuje te same metody co przyciski.
   */
  _bindLedgerDragDrop(html) {
    const DRAG_TYPE = "UnderworldMember";
    const readDrag = (ev) => {
      try {
        const data = JSON.parse(ev.dataTransfer?.getData("text/plain") || "null");
        return data?.type === DRAG_TYPE ? data.npcId : null;
      } catch (_) {
        return null;
      }
    };
    for (const token of html.querySelectorAll(".uw-l-token[draggable='true']")) {
      token.addEventListener("dragstart", (ev) => {
        ev.dataTransfer.setData("text/plain", JSON.stringify({ type: DRAG_TYPE, npcId: token.dataset.npcId }));
        ev.dataTransfer.effectAllowed = "move";
        html.classList.add("uw-l-dragging");
      });
      token.addEventListener("dragend", () => html.classList.remove("uw-l-dragging"));
    }
    const target = (el, onDrop) => {
      el.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        el.classList.add("uw-l-drop-hover");
      });
      el.addEventListener("dragleave", () => el.classList.remove("uw-l-drop-hover"));
      el.addEventListener("drop", async (ev) => {
        el.classList.remove("uw-l-drop-hover");
        html.classList.remove("uw-l-dragging");
        const npcId = readDrag(ev);
        if (!npcId) return; // np. aktor z paska bocznego – obsługuje go zwykły handler okna
        ev.preventDefault();
        ev.stopPropagation();
        await onDrop(npcId);
      });
    };
    for (const card of html.querySelectorAll(".uw-l-job[data-job]")) {
      target(card, (npcId) => this._onSendMission(card.dataset.job, { npcId }));
    }
    for (const slot of html.querySelectorAll(".uw-l-slot.is-empty")) {
      target(slot, async (npcId) => {
        const npc = GangData.getGang(this.actor).roster.find(n => n.id === npcId);
        if (!npc || npc.assignment === "retinue") return;
        await this._onClickAction({ preventDefault() {}, stopPropagation() {} }, { dataset: { action: "toggle-retinue", npcId } });
      });
    }
  }

  /** Glify i podpisy członka do widoku Księgi: rola, ranga, stan i bieżący przydział. */
  _memberGlyphs(npc) {
    const statuses = { ready: "Ready", busy: "Busy", resting: "Resting", wounded: "Wounded", arrested: "Arrested", dead: "Dead" };
    const status = statuses[npc.status] ? npc.status : "ready";
    const rank = Math.max(0, Math.min(3, Number(npc.rank) || 0));
    const assignment = npc.assignment && npc.assignment !== "none" ? npc.assignment : null;
    const assignGlyph = !assignment ? null
      : assignment === "retinue" ? "ui-retinue"
        : assignment === "guard" ? "ui-watch"
          : MISSIONS[assignment] ? `job-${assignment}` : null;
    return {
      roleGlyph: `role-${npc.role}`,
      role2Glyph: npc.role2 ? `role-${npc.role2}` : null,
      role2Name: npc.role2 ? UnderworldTables.ROLES_CONFIG[npc.role2]?.name ?? "" : "",
      statusGlyph: `ui-status_${status}`,
      statusLabel: t(`Status.${statuses[status]}`),
      rankGlyph: ["ui-rank_rookie", "ui-rank_seasoned", "ui-rank_veteran", "ui-rank_lieutenant"][rank],
      rankName: UnderworldTables.RANKS_CONFIG?.[rank]?.name ?? "",
      assignGlyph,
      assignLabel: assignGlyph ? t(`Badges.${assignment}`) : "",
      available: status === "ready" && !assignment
    };
  }

  /** Kafle schronienia na noc (Księga): zamiast listy wyboru trzy ilustrowane opcje z efektem. */
  _shelterTiles(gang, data) {
    const terrain = data.terrain || {};
    const current = gang.camp?.type || "basic";
    return [
      { id: "makeshift", glyph: "ui-shelter_makeshift", label: t("DashTab.Makeshift", { place: terrain.makeshiftLabel }), effect: `${terrain.coldMakeshift ? -2 : -1} ${t("DashTab.MoralePerCamp")}`, bad: true },
      { id: "basic", glyph: "ui-shelter_basic", label: t("DashTab.Basic"), effect: "" },
      { id: "comfortable", glyph: "ui-shelter_comfortable", label: t("DashTab.Comfortable", { place: terrain.comfortableLabel, cost: data.comfortableCostLabel }), effect: "", good: true }
    ].map(tile => ({ ...tile, checked: tile.id === current }));
  }

  /** Dane nagłówka i nawigacji Księgi: herb typu, sylwetka terenu, mierniki zasobów i presji. */
  _ledgerView(gang, terrainId, data) {
    const type = profileOf(gang).id;
    const morale = Math.max(0, Math.min(10, Number(gang.morale) || 0));
    const supplies = Math.max(0, Math.min(30, Number(gang.supplies) || 0));
    const pressure = Math.max(0, Math.min(5, Number(gang.notoriety) || 0));
    const treasury = gang.treasury || {};
    return {
      type,
      crest: `her-crest_${type}`,
      skyline: `her-skyline_${terrainId}`,
      terrainIcon: `ui-terrain_${terrainId}`,
      pressureIcon: `ui-pressure_${type}`,
      morale: { value: morale, pips: Array.from({ length: 10 }, (_, i) => ({ on: i < morale })) },
      supplies: { value: supplies, max: 30, pct: Math.round(supplies / 30 * 100) },
      pressure: {
        value: pressure,
        label: t("Mod.Heat", { value: "" }).trim(),
        level: t(`Notoriety.${pressure}.Name`),
        desc: t(`Notoriety.${pressure}.Desc`),
        pips: Array.from({ length: 5 }, (_, i) => ({ on: i < pressure }))
      },
      treasury: { gc: Number(treasury.gc) || 0, ss: Number(treasury.ss) || 0, d: Number(treasury.d) || 0 },
      retinueSlots: Array.from({ length: data.maxRetinue }, (_, i) => ({ npc: data.activeRetinue?.[i] ?? null })),
      shelters: this._shelterTiles(gang, data),
      orders: (() => {
        const all = (data.tacticGroups ?? []).flatMap(group => group.orders.map(order => ({ ...order, groupTitle: group.title })));
        return { unlocked: all.filter(o => o.isUnlocked), locked: all.filter(o => !o.isUnlocked) };
      })(),
      moraleTier: morale >= 8 ? { cls: "high", label: t("DashTab.TierFanatic"), text: t("DashTab.FlavorHigh") }
        : morale >= 5 ? { cls: "mid", label: t("DashTab.TierDiscipline"), text: t("DashTab.FlavorMid") }
          : morale >= 3 ? { cls: "low", label: t("DashTab.TierGrumbling"), text: t("DashTab.FlavorLow") }
            : { cls: "critical", label: t("DashTab.TierMutiny"), text: t("DashTab.FlavorCritical") },
      pressureLevels: Array.from({ length: 6 }, (_, i) => ({
        n: i,
        name: t(`Notoriety.${i}.Name`),
        short: t(`InfoTab.HeatShort.${i}`),
        active: i === pressure,
        passed: i < pressure
      })),
      relation: ["favorite", "trusted", "neutral", "strained", "hostile"].includes(gang.patron?.relation) ? gang.patron.relation : "neutral",
      pool: gang.roster.filter(n => n.status !== "dead"),
      tabs: [
        { id: "info", icon: "ui-tab_chronicle", label: t("Tabs.Info") },
        { id: "dashboard", icon: "ui-tab_camp", label: t("Tabs.Camp") },
        { id: "roster", icon: "ui-tab_roster", label: t("Tabs.Roster"), count: gang.roster.length },
        { id: "tasks", icon: "ui-tab_plan", label: t("Tabs.Tasks"), count: data.availableOutlaws?.length ?? 0 },
        { id: "loot", icon: "ui-tab_chest", label: t("Tabs.Loot"), count: data.lootCount },
        { id: "tactics", icon: "ui-tab_orders", label: t("Tabs.Tactics"), count: `${data.retinueCount}/${data.maxRetinue}` },
        ...(data.isGM ? [{ id: "gm", icon: "ui-patron", label: t("Tabs.GM") }] : [])
      ].filter(tab => tab.id === "gm" || data.tabsVisible[tab.id])
    };
  }

  // ════════════════════════════════════════════
  // DRAG & DROP
  // ════════════════════════════════════════════

  async _handleActorDrop(event) {
    let dropData;
    try {
      const raw = event.dataTransfer ? event.dataTransfer.getData("text/plain") : null;
      dropData = JSON.parse(raw);
    } catch (err) {
      return false;
    }
    if (!dropData || dropData.type !== "Actor") return false;

    let droppedActor = null;
    if (dropData.uuid) droppedActor = await fromUuid(dropData.uuid);
    else if (dropData.id) droppedActor = game.actors.get(dropData.id);
    if (!droppedActor) return false;

    const gang = GangData.getGang(this.actor);
    const targetCard = event.target.closest?.(".npc-card");

    if (targetCard) {
      const npcId = targetCard.dataset.npcId;
      const npc = gang.roster.find(n => n.id === npcId);
      if (npc) {
        npc.actorId = droppedActor.id;
        npc.img = droppedActor.img;
        if (!npc.name || ["Nowy Podwładny", "New Follower", t("Roster.NewFollower")].includes(npc.name)) npc.name = droppedActor.name;
        ui.notifications.info(t("Roster.Linked", { actor: droppedActor.name, name: npc.name }));
      }
    } else {
      const careerName = droppedActor.system?.details?.career?.value
        || (droppedActor.itemTypes?.career?.[0]?.name)
        || (droppedActor.type === "character" ? "Awanturnik" : "Poplecznik");

      gang.roster.push({
        id: foundry.utils.randomID(),
        actorId: droppedActor.id,
        img: droppedActor.img || "icons/svg/mystery-man.svg",
        name: droppedActor.name,
        role: careerName,
        strength: "",
        flaw: "",
        status: "ready",
        assignment: "none"
      });
      ui.notifications.info(t("Roster.Added", { actor: droppedActor.name }));
    }

    await GangData.saveGang(this.actor, gang);
    this.render();
    return true;
  }

  // ════════════════════════════════════════════
  // LISTENERY
  // ════════════════════════════════════════════

  /** Listenery na samym elemencie okna – element przetrwa kolejne rendery, więc dodajemy je raz. */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.element.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
    });
    this.element.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      await this._handleActorDrop(ev);
    });
  }

  /**
   * Dostępność: zakładki jako tablist, klawiatura dla klikalnych elementów niebędących przyciskami
   * i etykiety dla przycisków z samą ikoną (czytniki ekranu nie czytają atrybutu title).
   */
  changeTab(tab, group, options) {
    super.changeTab(tab, group, options);
    if (group === "primary" && this.element) this._applyAccessibility(this.element);
  }

  _applyAccessibility(html) {
    const nav = html.querySelector("nav.sheet-tabs[data-group='primary']");
    if (nav) {
      nav.setAttribute("role", "tablist");
      for (const tab of nav.querySelectorAll("[data-tab]")) {
        tab.setAttribute("role", "tab");
        const active = tab.classList.contains("active");
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      }
      if (!nav.dataset.uwKeys) {
        nav.dataset.uwKeys = "1";
        // Strzałki przełączają zakładki, jak w zwykłej liście kart
        nav.addEventListener("keydown", ev => {
          const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"];
          if (!keys.includes(ev.key)) return;
          const tabs = Array.from(nav.querySelectorAll("[data-tab]"));
          const i = tabs.indexOf(document.activeElement);
          if (i < 0) return;
          ev.preventDefault();
          let next = i + (["ArrowDown", "ArrowRight"].includes(ev.key) ? 1 : -1);
          if (ev.key === "Home") next = 0;
          if (ev.key === "End") next = tabs.length - 1;
          const target = tabs[(next + tabs.length) % tabs.length];
          this.changeTab(target.dataset.tab, "primary");
          target.focus();
        });
      }
    }
    for (const el of html.querySelectorAll("[data-action]:not(button, input, select, textarea, [data-tab])")) {
      if (el.tabIndex < 0 && !el.hasAttribute("tabindex")) el.tabIndex = 0;
      if (!el.hasAttribute("role")) el.setAttribute("role", "button");
      if (el.dataset.uwKeys) continue;
      el.dataset.uwKeys = "1";
      el.addEventListener("keydown", ev => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        el.click();
      });
    }
    for (const el of html.querySelectorAll("button, [role='button']")) {
      if (el.hasAttribute("aria-label") || el.textContent.trim()) continue;
      const label = el.getAttribute("title") || el.dataset.tooltip;
      if (label) el.setAttribute("aria-label", label);
    }
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;
    // Księga Kompanii: klasa okna i typ kompanii dla motywu w CSS (także pasek tytułu)
    html.classList.toggle("uw-ledger", !!context.ledger);
    html.dataset.companyType = context.ledgerView?.type ?? "";
    if (context.ledger) this._bindLedgerDragDrop(html);
    const all = (selector) => Array.from(html.querySelectorAll(selector));
    const on = (selector, type, handler) => all(selector).forEach(el => el.addEventListener(type, handler));

    // Przywrócenie aktywnej zakładki po każdym renderze
    // (changeTab nakłada też atrybuty dostępności, patrz _applyAccessibility)
    this._hasTimers = !!context.hasTimedMissions;
    const visible = context.tabsVisible ?? {};
    if (this.tabGroups.primary === "gm" ? !context.isGM : visible[this.tabGroups.primary] === false) this.tabGroups.primary = "info";
    this.changeTab(this.tabGroups.primary, "primary", { force: true, updatePosition: false });

    // Zwijanie i rozwijanie świty bez utraty stanu przy odświeżeniu karty.
    if (this._retinueCollapsed === undefined) this._retinueCollapsed = false;
    this._syncRetinueButton();

    // Zwijanie opisów taktyk; stan pozostaje zachowany po odświeżeniu karty.
    if (!this._collapsedTacticIds) this._collapsedTacticIds = new Set();
    if (this._showRetinueTacticsOnly === undefined) this._showRetinueTacticsOnly = true;
    this._syncRetinueTacticsFilter();
    all(".tactic-card").forEach((card, index) => {
      const tacticId = `tactic-${index}`;
      const isCollapsed = this._collapsedTacticIds.has(tacticId);
      card.classList.toggle("collapsed", isCollapsed);
      const header = card.querySelector(".tactic-card-header");
      const orderId = card.dataset.orderId;
      if (header && orderId && OrderEffects.isAutomated(orderId) && !header.querySelector(".tactic-auto-badge")) {
        header.insertAdjacentHTML("beforeend", `<span class="tactic-auto-badge" data-tooltip="${t("Tactics.AutoHint")}"><i class="fas fa-crosshairs"></i></span>`);
      }
      if (header && !header.querySelector(".btn-toggle-tactic")) {
        header.insertAdjacentHTML("beforeend", `<button type="button" class="btn-toggle-tactic" data-action="toggle-tactic" data-tactic-id="${tacticId}" aria-expanded="${!isCollapsed}" title="${isCollapsed ? t("Tactics.ExpandOne") : t("Tactics.CollapseOne")}"><i class="fas ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i></button>`);
      }
    });
    this._syncAllTacticsButton();

    // Natychmiastowa aktualizacja rozgłosu i relacji z patronem
    on('select[name="notoriety"], select[name="patron.relation"]', "change", async (ev) => {
      const name = ev.currentTarget.name;
      const val = ev.currentTarget.value;
      const gang = GangData.getGang(this.actor);
      if (name === "notoriety") gang.notoriety = parseInt(val, 10) || 0;
      if (name === "patron.relation") {
        if (!gang.patron) gang.patron = {};
        gang.patron.relation = val;
      }
      await GangData.saveGang(this.actor, gang);
      this.render();
    });

    // Natychmiastowa zmiana nazwy i motta na blur / Enter
    on(".master-gang-name, .master-gang-motto", "keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        ev.currentTarget.blur();
      }
    });

    on(".master-gang-name", "change", async (ev) => {
      const val = ev.currentTarget.value.trim();
      const gang = GangData.getGang(this.actor);
      if (val && gang.name !== val) {
        gang.name = val;
        await GangData.saveGang(this.actor, gang);
        this.render();
      }
    });

    on(".master-gang-motto", "change", async (ev) => {
      const val = ev.currentTarget.value.trim();
      const gang = GangData.getGang(this.actor);
      if (gang.motto !== val) {
        gang.motto = val;
        await GangData.saveGang(this.actor, gang);
        this.render();
      }
    });

    // ─── WARTY OBOZOWE ───
    on(".guard-checkbox", "change", async (ev) => {
      const npcId = ev.currentTarget.dataset.npcId;
      const isGuarding = ev.currentTarget.checked;
      const gang = GangData.getGang(this.actor);
      const npc = gang.roster.find(n => n.id === npcId);
      if (npc) {
        if (isGuarding) {
          // Sprawdź czy nie jest już na misji
          if (npc.status === "busy") {
            ui.notifications.warn(t("Roster.Busy", { name: npc.name }));
            ev.currentTarget.checked = false;
            return;
          }
          npc.assignment = "guard";
          npc.status = "busy";
        } else {
          npc.assignment = "none";
          npc.status = "ready";
        }
        await GangData.saveGang(this.actor, gang);
        this.render();
      }
    });

    // ─── ROSTER: Zmiana statusu z selecta ───
    on(".npc-status", "change", async (ev) => {
      const npcId = ev.currentTarget.closest(".npc-card")?.dataset.npcId;
      const newStatus = ev.currentTarget.value;
      const gang = GangData.getGang(this.actor);
      const npc = gang.roster.find(n => n.id === npcId);
      if (npc) {
        npc.status = newStatus;
        if (newStatus === "ready") npc.assignment = "none";
        await GangData.saveGang(this.actor, gang);
        this.render();
      }
    });

    on(".retinue-checkbox", "change", async (ev) => {
      const npcId = ev.currentTarget.dataset.npcId;
      const isChecked = ev.currentTarget.checked;
      const gang = GangData.getGang(this.actor);
      const npc = gang.roster.find(n => n.id === npcId);
      if (!npc) return;

      if (!isChecked) {
        npc.assignment = "none";
        await GangData.saveGang(this.actor, gang);
        ui.notifications.info(t("Retinue.Left", { name: npc.name }));
        this.render();
      } else {
        const activeCount = gang.roster.filter(n => n.assignment === "retinue").length;
        if (activeCount >= 3) {
          ui.notifications.warn(t("Retinue.Full"));
          ev.currentTarget.checked = false;
          return;
        }
        npc.assignment = "retinue";
        await GangData.saveGang(this.actor, gang);
        ui.notifications.info(t("Retinue.Joined", { name: npc.name }));
        this.render();
      }
    });
  }

  _syncRetinueButton() {
    const collapsed = this._retinueCollapsed;
    this.element.querySelectorAll('[data-action="toggle-retinue-section"]').forEach(button => {
      button.setAttribute("aria-expanded", String(!collapsed));
      button.title = collapsed ? t("Retinue.Expand") : t("Retinue.Collapse");
      button.innerHTML = `<i class="fas ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i> <span>${collapsed ? t("Expand") : t("Collapse")}</span>`;
    });
    this.element.querySelectorAll(".retinue-section").forEach(section => section.classList.toggle("collapsed", collapsed));
  }

  _syncRetinueTacticsFilter() {
    const filtered = this._showRetinueTacticsOnly;
    const tacticCards = Array.from(this.element.querySelectorAll(".tactic-card"));
    const eligibleCards = tacticCards.filter(card => card.classList.contains("tactic-has-retinue"));
    for (const card of tacticCards) {
      card.classList.toggle("filter-hidden", filtered && !card.classList.contains("tactic-has-retinue"));
    }
    this.element.querySelectorAll(".tactic-group").forEach(group => {
      group.classList.toggle("filter-empty", filtered && !group.querySelector(".tactic-card:not(.filter-hidden)"));
    });
    this.element.querySelectorAll('[data-action="toggle-retinue-tactics"]').forEach(button => {
      button.setAttribute("aria-pressed", String(filtered));
      button.title = filtered ? t("Tactics.ShowAllHint") : t("Tactics.ShowActiveHint");
      button.innerHTML = `<i class="fas ${filtered ? 'fa-users' : 'fa-user-check'}"></i> ${filtered ? t("Tactics.ShowAll") : t("Tactics.ActiveOnly")} <span class="tactic-filter-count">${filtered ? eligibleCards.length : ''}</span>`;
    });
    this.element.querySelectorAll(".tactics-filter-empty").forEach(el => {
      el.hidden = filtered && eligibleCards.length > 0;
    });
  }

  _syncAllTacticsButton() {
    const tacticCards = this.element.querySelectorAll(".tactic-card");
    const collapsedCount = this.element.querySelectorAll(".tactic-card.collapsed").length;
    const allCollapsed = tacticCards.length > 0 && collapsedCount === tacticCards.length;
    this.element.querySelectorAll('[data-action="toggle-all-tactics"]').forEach(button => {
      button.setAttribute("aria-expanded", String(!allCollapsed));
      button.title = allCollapsed ? t("Tactics.ExpandAllHint") : t("Tactics.CollapseAllHint");
      button.innerHTML = `<i class="fas ${allCollapsed ? 'fa-expand-alt' : 'fa-compress-alt'}"></i> ${allCollapsed ? t("Tactics.ExpandAll") : t("Tactics.CollapseAll")}`;
    });
  }

  _syncTacticButton(button, collapsed) {
    if (!button) return;
    button.setAttribute("aria-expanded", String(!collapsed));
    button.title = collapsed ? t("Tactics.ExpandOne") : t("Tactics.CollapseOne");
    button.innerHTML = `<i class="fas ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i>`;
  }

  /**
   * Obsługa kliknięć w elementy z [data-action] (ApplicationV2 przekazuje tu wszystkie akcje
   * bez własnego handlera w DEFAULT_OPTIONS.actions).
   */
  async _onClickAction(event, target) {
    event.preventDefault();
    const action = target.dataset.action;

    switch (action) {
      case "toggle-retinue-section":
        event.stopPropagation();
        this._retinueCollapsed = !this._retinueCollapsed;
        this._syncRetinueButton();
        return;

      case "toggle-retinue-tactics":
        event.stopPropagation();
        this._showRetinueTacticsOnly = !this._showRetinueTacticsOnly;
        this._syncRetinueTacticsFilter();
        return;

      case "toggle-tactic": {
        event.stopPropagation();
        const card = target.closest(".tactic-card");
        const tacticId = target.dataset.tacticId;
        const collapsed = !card.classList.contains("collapsed");
        card.classList.toggle("collapsed", collapsed);
        if (collapsed) this._collapsedTacticIds.add(tacticId);
        else this._collapsedTacticIds.delete(tacticId);
        this._syncTacticButton(target, collapsed);
        this._syncAllTacticsButton();
        return;
      }

      case "toggle-all-tactics": {
        const tacticCards = Array.from(this.element.querySelectorAll(".tactic-card"));
        const collapse = tacticCards.some(card => !card.classList.contains("collapsed"));
        tacticCards.forEach((card, index) => {
          const tacticId = `tactic-${index}`;
          card.classList.toggle("collapsed", collapse);
          if (collapse) this._collapsedTacticIds.add(tacticId);
          else this._collapsedTacticIds.delete(tacticId);
          this._syncTacticButton(card.querySelector(".btn-toggle-tactic"), collapse);
        });
        this._syncAllTacticsButton();
        return;
      }

      // ─── ZWIJANIE / ROZWIJANIE BANITY W ROSTERZE ───
      case "toggle-npc-collapse": {
        event.stopPropagation();
        const card = target.closest(".npc-card-box");
        const npcId = card?.dataset.npcId;
        if (!card || !npcId) return;
        if (!this._collapsedNpcIds) this._collapsedNpcIds = new Set();
        if (this._collapsedNpcIds.has(npcId)) {
          this._collapsedNpcIds.delete(npcId);
          card.classList.remove("collapsed");
        } else {
          this._collapsedNpcIds.add(npcId);
          card.classList.add("collapsed");
        }
        return;
      }

      case "toggle-all-roster": {
        const allCards = Array.from(this.element.querySelectorAll(".npc-card-box"));
        if (!this._collapsedNpcIds) this._collapsedNpcIds = new Set();
        const anyExpanded = allCards.some(card => !card.classList.contains("collapsed"));
        if (anyExpanded) {
          for (const card of allCards) {
            card.classList.add("collapsed");
            if (card.dataset.npcId) this._collapsedNpcIds.add(card.dataset.npcId);
          }
        } else {
          allCards.forEach(card => card.classList.remove("collapsed"));
          this._collapsedNpcIds.clear();
        }
        return;
      }

      // ─── AKORDEONY (zwijanie/rozwijanie kategorii) ───
      case "toggle-category": {
        const category = target.closest(".mission-category");
        if (!category) return;
        const collapsed = category.classList.toggle("collapsed");
        this._categoryCollapsed ??= {};
        this._categoryCollapsed[category.dataset.category] = collapsed;
        return;
      }

      // ─── TEREN I ŁUPY ───
      case "set-terrain":
        return this._onSetTerrain(target.dataset.terrain);
      case "loot-sell":
        return this._onSendMission("fence");
      case "loot-transfer":
        await UnderworldOperations.transferLootToActor(this.actor, target.dataset.lootId);
        this.render();
        return;
      case "loot-discard": {
        const gang = GangData.getGang(this.actor);
        const item = (gang.loot || []).find(l => l.id === target.dataset.lootId);
        if (!item) return;
        const confirmed = await DialogV2.confirm({
          window: { title: t("Loot.DiscardTitle") },
          content: `<p>${t("Loot.DiscardText", { name: escapeHTML(item.name), value: item.valueSS })}</p>`
        });
        if (!confirmed) return;
        await UnderworldOperations.discardLoot(this.actor, item.id);
        this.render();
        return;
      }

      // ─── WYSYŁANIE MISJI (generyczny handler) ───
      case "send-mission":
        return this._onSendMission(target.dataset.type);

      // ─── NOCNY POSTÓJ ───
      case "camp-rest":
        return this._onCampRestDialog();

      // ─── ROSTER: Rekrutacja przez MG na Czat ───
      case "open-recruitment":
        return this._onOpenRecruitmentDialog();

      // ─── ROSTER: Dodaj NPC ───
      case "add-npc": {
        const gang = GangData.getGang(this.actor);
        gang.roster.push({
          id: foundry.utils.randomID(),
          actorId: null,
          img: "icons/svg/mystery-man.svg",
          name: t("Roster.NewFollower"),
          role: "Rola",
          strength: "",
          flaw: "",
          status: "ready",
          assignment: "none"
        });
        await GangData.saveGang(this.actor, gang);
        this.render();
        return;
      }

      // ─── ROSTER: Usuń NPC ───
      case "delete-npc": {
        if (!game.user.isGM) {
          ui.notifications.warn(t("Roster.GMOnlyDelete"));
          return;
        }
        const npcId = String(target.closest(".npc-card-box")?.dataset.npcId || "");
        const gang = GangData.getGang(this.actor);
        const npc = gang.roster.find(n => n.id === npcId);
        if (!npc) return;
        const confirmed = await DialogV2.confirm({
          window: { title: t("Roster.DeleteTitle") },
          content: `<p>${t("Roster.DeleteText", { name: Handlebars.escapeExpression(npc.name) })}</p><p>${t("Roster.DeleteNote")}</p>`
        });
        if (!confirmed) return;
        gang.roster = gang.roster.filter(n => n.id !== npcId);
        this._collapsedNpcIds?.delete(npcId);
        await GangData.saveGang(this.actor, gang);
        this.render();
        return;
      }

      // ─── ROSTER: Rozwój i Zbrojownia NPC ───
      case "upgrade-npc":
        return this._onUpgradeNpcDialog(target.dataset.npcId);

      // ─── ROSTER: Uwolnij z zadania ───
      case "free-npc": {
        const gang = GangData.getGang(this.actor);
        const npc = gang.roster.find(n => n.id === target.dataset.npcId);
        if (npc) {
          npc.status = "ready";
          npc.assignment = "none";
          delete npc.plannedMission;
          await GangData.saveGang(this.actor, gang);
          ui.notifications.info(t("Roster.ReadyAgain", { name: npc.name }));
          this.render();
        }
        return;
      }

      // ─── ROSTER: Otwórz kartę aktora ───
      case "open-actor": {
        const actor = game.actors.get(target.dataset.actorId);
        if (actor) actor.sheet.render({ force: true });
        else ui.notifications.warn(t("Roster.LinkedMissing"));
        return;
      }

      // ─── ROSTER: Odłącz aktora ───
      case "unlink-actor": {
        const npcId = target.closest(".npc-card")?.dataset.npcId;
        const gang = GangData.getGang(this.actor);
        const npc = gang.roster.find(n => n.id === npcId);
        if (npc) {
          npc.actorId = null;
          await GangData.saveGang(this.actor, gang);
          ui.notifications.info(t("Roster.Unlinked", { name: npc.name }));
          this.render();
        }
        return;
      }

      // ─── ROSTER: Wybierz aktora z dialogu ───
      case "select-actor":
        return this._onSelectActorDialog(target.closest(".npc-card")?.dataset.npcId);

      // ─── ROSTER / PRZYDZIAŁY: Przełącz Świtę Herszta ───
      case "toggle-retinue": {
        const gang = GangData.getGang(this.actor);
        const npc = gang.roster.find(n => n.id === target.dataset.npcId);
        if (!npc) return;

        if (npc.assignment === "retinue") {
          npc.assignment = "none";
          await GangData.saveGang(this.actor, gang);
          ui.notifications.info(t("Retinue.Left", { name: npc.name }));
          this.render();
        } else {
          if (["dead", "wounded", "arrested"].includes(npc.status)) {
            ui.notifications.warn(t("Retinue.CannotJoin", { name: npc.name, status: statusLabel(npc.status) }));
            return;
          }
          const activeCount = gang.roster.filter(n => n.assignment === "retinue").length;
          if (activeCount >= 3) {
            ui.notifications.warn(t("Retinue.Full"));
            return;
          }
          npc.assignment = "retinue";
          if (npc.status === "busy") npc.status = "ready";
          await GangData.saveGang(this.actor, gang);
          ui.notifications.info(t("Retinue.Joined", { name: npc.name }));
          this.render();
        }
        return;
      }

      // ─── SKARBIEC / ZAPASY / EDYTOR ŚWIATA ───
      case "deposit-treasury":
        return this._onDepositTreasuryDialog();
      case "withdraw-treasury":
        return this._onWithdrawTreasuryDialog();
      case "buy-supplies":
        return this._onBuySuppliesDialog();
      case "set-supply-price":
        return this._onSetSupplyPriceDialog();
      case "resolve-queue":
        await UnderworldOperations.resolveQueue(this.actor);
        this.render();
        return;

      // ─── ZAKŁADKA MG ───
      case "gm-finish-now":
        if (!game.user.isGM) return;
        await UnderworldOperations.finishMissionNow(this.actor, target.dataset.npcId);
        this.render();
        return;
      case "gm-finish-all":
        if (!game.user.isGM) return;
        await UnderworldOperations.finishAllMissionsNow(this.actor);
        this.render();
        return;
      case "gm-save":
        return this._onGmSave();
      case "gm-advance": {
        const d = target.dataset;
        return this._advanceGameTime({ hours: Number(d.hours) || 0, days: Number(d.days) || 0, turns: Number(d.turn) || 0 });
      }
      case "gm-advance-custom": {
        const amount = Math.max(0, Number(this.element.querySelector("[data-gm-time-amount]")?.value) || 0);
        const unit = this.element.querySelector("[data-gm-time-unit]")?.value;
        return this._advanceGameTime({ minutes: unit === "minutes" ? amount : 0, hours: unit === "hours" ? amount : 0, days: unit === "days" ? amount : 0, turns: unit === "turns" ? amount : 0 });
      }
      case "gm-reset-rest": {
        if (!game.user.isGM) return;
        const gang = GangData.getGang(this.actor);
        delete gang.lastCampRestDay;
        delete gang.campRestInProgress;
        await GangData.saveGang(this.actor, gang);
        ui.notifications.info(t("GM.RestUnlocked"));
        this.render();
        return;
      }

      case "open-world-editor":
        if (!game.user.isGM) return;
        return UnderworldRollTables.openTables(UnderworldOperations.getTerrain(GangData.getGang(this.actor)), GangData.getGang(this.actor).type);

      // ─── TAKTYKA: Rozkazy taktyczne ───
      case "order-tactic":
        return this._onOrderTacticDialog(target.dataset.order);
    }
  }

  /**
   * Dialog wyboru sposobu wydania rozkazu taktycznego (Dowodzenie vs Przewaga)
   */
  async _onOrderTacticDialog(orderId) {
    const orderConfig = UnderworldOperations.TACTICAL_ORDERS[orderId];
    if (!orderConfig) return;

    const gang = GangData.getGang(this.actor);
    const activeRetinue = gang.roster.filter(n =>
      n.assignment === "retinue" && !["dead", "wounded", "arrested"].includes(n.status)
    );
    const reqRoles = Array.isArray(orderConfig.requiredRoles) ? orderConfig.requiredRoles : [];
    let executor = null;

    if (reqRoles.length > 0) {
      executor = activeRetinue.find(n => UnderworldTables.canGiveOrder(n, orderId, orderConfig));
      if (!executor) {
        const reqNames = UnderworldTables.orderRoleNames(orderId, orderConfig, gang).join(` ${t("Or")} `);
        ui.notifications.warn(t("Orders.Dialog.NeedRoles", { order: orderConfig.name, roles: reqNames }));
        return;
      }
    } else {
      executor = activeRetinue.find(n => Number(n.rank) >= 3) || null;
    }

    const executorRoleCfg = executor ? UnderworldTables.ROLES_CONFIG[UnderworldTables.normalizeRole(executor.role)] : null;
    const executorHtml = `
      <div style="background: rgba(46, 125, 50, 0.08); border: 1px solid #2e7d32; border-radius: 4px; padding: 6px 10px; margin-bottom: 10px; display: flex; align-items: center; gap: 10px;">
        <img src="${executor ? executor.img : (this.actor.img || 'icons/svg/mystery-man.svg')}" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover; border: 1px solid #2e7d32;" />
        <div>
          <div style="font-weight: bold; font-size: 0.88rem; color: #1b5e20;">
            ${t("Orders.Dialog.Executor")}: ${executor ? executor.name : t("Orders.Dialog.ChiefHimself")}
          </div>
          <div style="font-size: 0.75rem; color: #444;">
            ${executorRoleCfg ? `<i class="${executorRoleCfg.icon}"></i> ${executorRoleCfg.name}` : t("Orders.Dialog.PersonalOrder")}
          </div>
        </div>
      </div>
    `;

    // Specjalna obsługa Żywej Tarczy (bez testu, wybór ofiary)
    if (orderId === "meatshield") {
      await DialogV2.wait({
        window: { title: `Rozkaz: ${orderConfig.name}` },
        content: dialogContent(`
          <div class="underworld-dialog" style="font-size: 0.9rem;">
            ${executorHtml}
            <p><strong>${orderConfig.desc}</strong></p>
            <div style="background: rgba(183, 28, 28, 0.1); border: 1px solid #b71c1c; padding: 8px; border-radius: 4px; margin-bottom: 8px; color: #b71c1c;">
              <i class="fas fa-exclamation-triangle"></i> ${t("Orders.Dialog.MeatShieldWarning", { name: executor ? executor.name : t("Orders.Dialog.Follower") })}
            </div>
          </div>
        `),
        buttons: [
          {
            action: "confirm",
            icon: "fas fa-shield-virus",
            label: t("Orders.Dialog.MeatShieldButton"),
            default: true,
            callback: async () => {
              await UnderworldOperations.postTacticalOrder(this.actor, orderId, { method: "direct", executorNpc: executor });
              this.render();
            }
          },
          { action: "cancel", label: "WFRP4E_COMPANION.Cancel" }
        ],
        rejectClose: false
      });
      return;
    }

    const curAdvantage = this.actor.status?.advantage?.value 
      ?? this.actor.system?.status?.advantage?.value 
      ?? 0;
    const cost = orderConfig.advantageCost || 1;
    const canSpendAdvantage = curAdvantage >= cost;

    await DialogV2.wait({
      window: { title: `${t("Orders.Flavor")}: ${orderConfig.name}` },
      content: dialogContent(`
        <div class="underworld-dialog" style="font-size: 0.9rem;">
          ${executorHtml}
          <p style="margin-bottom: 6px;"><em>${orderConfig.desc}</em></p>
          <div style="background: rgba(255, 255, 255, 0.7); padding: 8px; border-radius: 4px; border: 1px solid #c9bca9; margin-bottom: 10px;">
            <strong style="color: #5a3d28;"><i class="fas fa-gavel"></i> Efekt:</strong> ${orderConfig.effect}
            ${OrderEffects.isAutomated(orderId) ? `<div style="margin-top: 4px; font-size: 0.78rem; color: #1b5e20;"><i class="fas fa-crosshairs"></i> ${t("Orders.Dialog.TargetHint")}</div>` : ""}
          </div>
          <div class="form-group" style="background: rgba(0,0,0,0.03); padding: 8px; border-radius: 4px; border: 1px dashed #8e735b;">
            <label style="font-weight: bold; display: block; margin-bottom: 6px; color: #3b2616;">${t("Orders.Dialog.ChooseMethod")}</label>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="radio" name="tactic_method" value="leadership" checked />
                <div>
                  <strong>🎲 ${t("Orders.Dialog.Leadership")}</strong>
                  <div style="font-size: 0.78rem; color: #554433;">${t("Orders.Dialog.LeadershipHint")}</div>
                </div>
              </label>

              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; ${canSpendAdvantage ? '' : 'opacity: 0.45;'}">
                <input type="radio" name="tactic_method" value="advantage" ${canSpendAdvantage ? '' : 'disabled'} />
                <div>
                  <strong>⚡ ${t("Orders.Dialog.Advantage")}</strong>
                  <div style="font-size: 0.78rem; color: #554433;">${t("Orders.Dialog.AdvantageHint", { cost, current: curAdvantage })}</div>
                </div>
              </label>

              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="radio" name="tactic_method" value="direct" />
                <div>
                  <strong>📢 ${t("Orders.Dialog.Direct")}</strong>
                  <div style="font-size: 0.78rem; color: #554433;">${t("Orders.Dialog.DirectHint")}</div>
                </div>
              </label>
            </div>
          </div>
        </div>
      `),
      buttons: [
        {
          action: "confirm",
          icon: "fas fa-bullhorn",
          label: t("Orders.Dialog.Issue"),
          default: true,
          callback: async (event, button, dialog) => {
            const method = dialog.element.querySelector('input[name="tactic_method"]:checked')?.value || "leadership";
            await UnderworldOperations.postTacticalOrder(this.actor, orderId, { method, executorNpc: executor });
            ui.notifications.info(t("Orders.Dialog.Issued", { order: orderConfig.name }));
            this.render();
          }
        },
        { action: "cancel", label: "WFRP4E_COMPANION.Cancel" }
      ],
      rejectClose: false
    });
  }

  // ════════════════════════════════════════════
  // GENERYCZNY DIALOG MISJI
  // ════════════════════════════════════════════

  /**
   * Otwiera dialog wyboru NPC (i opcjonalnie input celu) dla danego typu misji
   */
  /**
   * Wysyła członka na zlecenie. Bez npcId otwiera okno wyboru; z npcId (portret upuszczony na kartę
   * zlecenia) wysyła od razu, a okno pokazuje tylko wtedy, gdy zlecenie wymaga wyborów (cel, poziom, łupy).
   */
  /** MG: przesuwa czas gry do przodu; po drodze rozpatrują się zlecenia, którym minął licznik. */
  async _advanceGameTime({ minutes = 0, hours = 0, days = 0, turns = 0 }) {
    if (!game.user.isGM) return;
    const spd = UnderworldOperations.secondsPerDay();
    const seconds = Math.round(minutes * 60 + hours * 3600 + (days + turns * UnderworldOperations.turnDays()) * spd);
    if (seconds <= 0) return;
    await game.time.advance(seconds);
    await UnderworldOperations.resolveDueMissions();
    ui.notifications.info(t("GM.Advanced", { now: UnderworldOperations.formatDateTime(game.time.worldTime) }));
    this.render();
  }

  /** MG: zapis zakładki MG (zasady świata i widoczność zakładek tej kompanii). */
  async _onGmSave() {
    if (!game.user.isGM) return;
    const root = this.element;
    const read = (name) => root.querySelector(`[data-gm-field="${name}"]`);
    const num = (name, min, max, fallback) => {
      const value = Number(read(name)?.value);
      return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
    };
    const MODULE_ID = "wfrp4e-underworld";
    await game.settings.set(MODULE_ID, "turnDays", Math.round(num("turnDays", 0, 60, 0)));
    await game.settings.set(MODULE_ID, "goldMultiplier", Math.round(num("goldMultiplier", 0, 1000, 100)));
    await game.settings.set(MODULE_ID, "missionTempo", Math.round(num("missionTempo", 0, 400, 100)));
    const overrides = {};
    for (const input of root.querySelectorAll("[data-gm-mission-hours]")) {
      const raw = input.value.trim();
      if (raw === "") continue;
      const value = Number(raw);
      if (Number.isFinite(value) && value >= 0) overrides[input.dataset.gmMissionHours] = Math.min(720, value);
    }
    await game.settings.set(MODULE_ID, "missionHoursById", overrides);

    const gang = GangData.getGang(this.actor);
    gang.hiddenTabs = Array.from(root.querySelectorAll("[data-gm-tab]")).filter(el => !el.checked).map(el => el.dataset.gmTab);
    await GangData.saveGang(this.actor, gang);
    ui.notifications.info(t("GM.Saved"));
    this.render();
  }

  async _onSendMission(missionType, { npcId: chosenId = null } = {}) {
    const mission = MISSIONS[missionType];
    if (!mission) {
      ui.notifications.error(t("Mission.Unknown", { type: missionType }));
      return;
    }
    const gang = GangData.getGang(this.actor);
    if (!profileHasMission(gang, mission)) return;
    const terrainId = UnderworldOperations.getTerrain(gang);
    const label = missionName(mission, terrainId);
    if (!missionAvailable(mission, terrainId)) {
      ui.notifications.warn(t("Mission.NotInTerrain", { label, terrain: TERRAINS[terrainId].name }));
      return;
    }

    // Specjalny przypadek: Siatka Człowieka (bez NPC)
    if (mission.noNpc) {
      await UnderworldOperations[mission.fn](this.actor);
      ui.notifications.info(t("Mission.Done", { label }));
      this.render();
      return;
    }

    // Dla Opieki nad Rannymi – specjalny dialog
    if (mission.targetWounded) {
      await this._onTendWoundedDialog(gang);
      return;
    }

    // Dostępni poplecznicy
    const available = gang.roster.filter(n => n.status === "ready" && (!n.assignment || n.assignment === "none"));
    if (available.length === 0) {
      ui.notifications.warn(t("Mission.NobodyFree"));
      return;
    }
    if (chosenId && !available.some(n => n.id === chosenId)) {
      const npc = gang.roster.find(n => n.id === chosenId);
      ui.notifications.warn(t("Notify.NotReadyForAssignment", { name: npc?.name || t("ThisMember") }));
      return;
    }
    const needsChoices = mission.fencePicker || mission.bribePicker || mission.needsInput || mission.tiered;
    if (chosenId && !needsChoices) {
      await this._dispatchMission(mission, chosenId, "", null, label);
      return;
    }

    const npcOptions = available.map(n =>
      `<option value="${n.id}" ${n.id === chosenId ? "selected" : ""}>${escapeHTML(n.name)} (${escapeHTML(UnderworldOperations.roleName(n.role))})</option>`
    ).join("");

    // Dodatkowe pola zależne od zlecenia
    let extraHtml = "";
    if (mission.fencePicker) {
      extraHtml = this._fencePickerHtml(gang, terrainId);
      if (!extraHtml) return;
    } else if (mission.bribePicker) {
      extraHtml = this._bribePickerHtml(gang);
    } else if (mission.needsInput) {
      extraHtml = `
        <div class="form-group uw-dialog-field">
          <label>${escapeHTML(mission.inputLabel)}</label>
          <input type="text" id="mission-target-input" placeholder="${escapeHTML(mission.inputPlaceholder || "")}" />
        </div>`;
    }
    if (mission.tiered) extraHtml = this._tierPickerHtml(gang, mission, terrainId) + extraHtml;
    if (mission.target && UnderworldOperations.getToken(gang, "commotion")) {
      extraHtml += `<p class="uw-dialog-note is-gain"><i class="${TOKENS.commotion.icon}"></i> ${t("Mission.CommotionNote", { name: TOKENS.commotion.name, bonus: TOKENS.commotion.bonus })}</p>`;
    }

    await DialogV2.wait({
      window: { title: `${t("Mission.Title")}: ${label}` },
      position: { width: mission.tiered || mission.fencePicker ? 520 : 440 },
      content: dialogContent(`
        <div class="underworld-dialog uw-mission-dialog">
          <p class="uw-dialog-note">${escapeHTML(missionDesc(mission, terrainId))}</p>
          <div class="form-group uw-dialog-field">
            <label>${t("Mission.Who")}</label>
            <select id="mission-npc-select">${npcOptions}</select>
          </div>
          ${extraHtml}
        </div>
      `),
      render: (event, dialog) => this._bindMissionDialog(dialog.element ?? dialog),
      buttons: [
        {
          action: "send",
          icon: "fas fa-paper-plane",
          label: t("Mission.Send"),
          default: true,
          callback: async (event, button, dialog) => {
            const npcId = dialogValue(dialog, "#mission-npc-select");
            if (!npcId) {
              ui.notifications.warn(t("Mission.NoFollower"));
              return;
            }
            const root = dialog.element ?? dialog;
            const tier = mission.tiered ? (root.querySelector('input[name="mission-tier"]:checked')?.value || "normal") : null;

            let input = "";
            if (mission.fencePicker) {
              input = Array.from(root.querySelectorAll('input[name="fence-loot"]:checked')).map(el => el.value).join(",");
              if (!input) {
                ui.notifications.warn(t("Fence.NothingChosen"));
                return;
              }
            } else if (mission.bribePicker) {
              const mode = dialogValue(dialog, "#bribe-mode");
              if (mode === "release") input = `release:${dialogValue(dialog, "#bribe-prisoner")}`;
              else if (mode === "notoriety") input = "notoriety";
              else input = `favor:${dialogValue(dialog, "#bribe-favor")}`;
            } else if (mission.needsInput) {
              input = dialogValue(dialog, "#mission-target-input");
            }
            await this._dispatchMission(mission, npcId, input, tier, label);
          }
        },
        { action: "cancel", icon: "fas fa-times", label: "WFRP4E_COMPANION.Cancel" }
      ],
      rejectClose: false
    });
  }

  /** Wykonuje zlecenie albo, w trybie tygodnia lub kolejki MG, tylko je planuje. */
  async _dispatchMission(mission, npcId, input, tier, label) {
    // Licznik czasu: zlecenie z czasem trwania kończy się o wskazanej porze świata (MG może je zakończyć od razu)
    const terrain = UnderworldOperations.getTerrain(GangData.getGang(this.actor));
    const hours = UnderworldOperations.usesTimers()
      ? UnderworldOperations.missionHours(UnderworldOperations.PLANNABLE_MISSIONS[mission.fn], { tier: mission.tiered ? (tier || "normal") : null, terrain })
      : 0;
    if (hours > 0 || UnderworldOperations.usesPlanning()) {
      if (await UnderworldOperations.planMission(this.actor, npcId, mission.fn, input, tier, { hours })) {
        if (hours > 0) {
          const end = UnderworldOperations.formatDateTime(game.time.worldTime + Math.round(hours * 3600));
          ui.notifications.info(t("Mission.Timed", { label, end }));
        } else {
          ui.notifications.info(UnderworldOperations.isWeekly()
            ? t("Mission.PlannedWeek", { label })
            : t("Mission.Queued", { label }));
        }
      }
      this.render();
      return;
    }
    await UnderworldOperations[mission.fn](this.actor, npcId, input, { tier });
    ui.notifications.info(t("Mission.DoneCheckChat", { label }));
    this.render();
  }

  /** Czas zlecenia do pokazania graczowi („~6 godz.”); pusty, gdy zlecenie kończy się od razu. */
  _durationLabel(missionId, terrainId, tier = null) {
    const mission = MISSIONS[missionId];
    if (!mission || mission.noNpc || !UnderworldOperations.usesTimers()) return "";
    const hours = UnderworldOperations.missionHours(missionId, { tier, terrain: terrainId });
    return hours > 0 ? UnderworldOperations.formatRemaining(hours * 3600) : "";
  }

  /** Wybór celu (łatwy / zwykły / bogaty) z podglądem żetonów przygotowania. */
  _tierPickerHtml(gang, mission = null, terrainId = null) {
    const recon = UnderworldOperations.getToken(gang, "recon");
    const lead = UnderworldOperations.getToken(gang, "lead");
    const durationNote = (tierId) => {
      const label = mission ? this._durationLabel(mission.id, terrainId, tierId) : "";
      return label ? ` <span class="uw-tier-time"><i class="fas fa-hourglass-half"></i> ${label}</span>` : "";
    };
    const options = Object.entries(TARGET_TIERS).map(([id, tier]) => {
      const leadApplies = id === "rich" && lead;
      const modifier = leadApplies ? 0 : tier.modifier;
      const modText = modifier > 0 ? `+${modifier}` : modifier < 0 ? `−${Math.abs(modifier)}` : "±0";
      return `
        <label class="uw-tier-option tier-${id}">
          <input type="radio" name="mission-tier" value="${id}" ${id === "normal" ? "checked" : ""} />
          <span class="uw-tier-name">${tier.name}</span>
          <span class="uw-tier-mod">${modText}</span>
          <span class="uw-tier-desc">${leadApplies ? t("Tier.LeadApplies", { name: TOKENS.lead.name }) : tier.desc}${durationNote(id)}</span>
        </label>`;
    }).join("");
    const notes = [];
    if (recon) notes.push(`<i class="${TOKENS.recon.icon}"></i> ${t("Tier.ReconNote", { name: TOKENS.recon.name, bonus: TOKENS.recon.bonus })}`);
    if (lead) notes.push(`<i class="${TOKENS.lead.icon}"></i> ${t("Tier.LeadNote", { name: TOKENS.lead.name })}`);
    return `
      <div class="form-group uw-dialog-field">
        <label>${t("Tier.Which")}</label>
        <div class="uw-tier-picker">${options}</div>
        ${notes.length ? `<p class="uw-dialog-note is-gain">${notes.join("<br>")}</p>` : ""}
      </div>`;
  }

  /** Lista łupów do sprzedaży u pasera bieżącego terenu (null, gdy nie ma czego sprzedać). */
  _fencePickerHtml(gang, terrainId) {
    const fence = TERRAINS[terrainId].fence;
    const loot = Array.isArray(gang.loot) ? gang.loot : [];
    if (!loot.length) {
      ui.notifications.warn(t("Fence.NoLoot"));
      return null;
    }
    const rows = loot.map(item => {
      const refused = fence.refuses.includes(item.category);
      const rate = UnderworldOperations.fenceRate(terrainId, item, 0);
      const estimate = Math.max(1, Math.floor(item.valueSS * rate / 100));
      const cat = LOOT_CATEGORIES[item.category];
      return `
        <label class="uw-loot-option ${refused ? "is-refused" : ""}">
          <input type="checkbox" name="fence-loot" value="${item.id}" ${refused ? "disabled" : "checked"} />
          <i class="${cat?.icon || "fas fa-box"}"></i>
          <span class="uw-loot-name">${escapeHTML(item.name)}${item.hot ? ` <span class="uw-hot-badge"><i class="fas fa-fire"></i> ${t("Fence.Hot")}</span>` : ""}</span>
          <span class="uw-loot-price">${refused ? t("Fence.Refuses") : `~${estimate} ${t("Units.SS")} <small>${t("Fence.RateOf", { rate, value: item.valueSS })}</small>`}</span>
        </label>`;
    }).join("");
    return `
      <div class="form-group uw-dialog-field">
        <label>${t("Fence.WhatToSell")} <small>${t("Fence.Rate", { fence: escapeHTML(fence.name), rate: fence.rate })}</small></label>
        <div class="uw-loot-picker">${rows}</div>
        <p class="uw-dialog-note">${t("Fence.Hint")}</p>
      </div>`;
  }

  /** Wybór celu łapówki: uwolnienie aresztowanego, uciszenie sprawy (Rozgłos) lub przysługa. */
  _bribePickerHtml(gang) {
    const prisoners = gang.roster.filter(n => n.status === "arrested");
    const notoriety = Number(gang.notoriety) || 0;
    const prisonerOptions = prisoners.map(n => `<option value="${n.id}">${escapeHTML(n.name)}</option>`).join("");
    return `
      <div class="form-group uw-dialog-field">
        <label>${t("Bribe.WhatFor")}</label>
        <select id="bribe-mode">
          ${prisoners.length ? `<option value="release">${t("Bribe.Release")}</option>` : ""}
          ${notoriety > 0 ? `<option value="notoriety">${t("Bribe.Hush")}</option>` : ""}
          <option value="favor">${t("Bribe.Favor")}</option>
        </select>
      </div>
      ${prisoners.length ? `
      <div class="form-group uw-dialog-field" data-bribe-mode="release">
        <label>${t("Bribe.WhoToFree")}</label>
        <select id="bribe-prisoner">${prisonerOptions}</select>
      </div>` : ""}
      <div class="form-group uw-dialog-field" data-bribe-mode="favor">
        <label>${t("Bribe.WhatFavor")}</label>
        <input type="text" id="bribe-favor" placeholder="${t("Bribe.FavorPlaceholder")}" />
      </div>
      <p class="uw-dialog-note">${t("Bribe.LostOnFail")}</p>`;
  }

  /** Pokazuje tylko pola pasujące do wybranego rodzaju łapówki. */
  _bindMissionDialog(root) {
    const mode = root?.querySelector?.("#bribe-mode");
    if (!mode) return;
    const sync = () => {
      for (const field of root.querySelectorAll("[data-bribe-mode]")) {
        field.hidden = field.dataset.bribeMode !== mode.value;
      }
    };
    mode.addEventListener("change", sync);
    sync();
  }

  /** MG zmienia teren szajki (miasto / wieś / las / góry). */
  async _onSetTerrain(terrainId) {
    if (!game.user.isGM || !TERRAINS[terrainId]) return;
    const gang = GangData.getGang(this.actor);
    if (UnderworldOperations.getTerrain(gang) === terrainId) return;
    gang.terrain = terrainId;
    await GangData.saveGang(this.actor, gang);
    const terrain = TERRAINS[terrainId];
    const racketNote = gang.racket && terrainId !== "city" ? ` ${t("Terrain.RacketWaits")}` : "";
    ui.notifications.info(t("Terrain.Changed", { terrain: terrain.name, fence: terrain.fence.name }) + racketNote);
    this.render();
  }

  /**
   * Specjalny dialog dla Opieki nad Rannymi – wybór opiekuna I rannego
   */
  async _onTendWoundedDialog(gang) {
    const available = gang.roster.filter(n => n.status === "ready" && (!n.assignment || n.assignment === "none"));
    const wounded = gang.roster.filter(n => n.status === "wounded");

    if (available.length === 0) {
      ui.notifications.warn(t("Tend.NobodyFree"));
      return;
    }
    if (wounded.length === 0) {
      ui.notifications.info(t("Tend.NoWounded"));
      return;
    }

    const npcOptions = available.map(n =>
      `<option value="${n.id}">${n.name} (${n.role})</option>`
    ).join("");

    const woundedOptions = wounded.map(n =>
      `<option value="${n.id}">${n.name} (${UnderworldOperations.roleName(n.role)}) – ${t("Status.Wounded")}</option>`
    ).join("");

    await DialogV2.wait({
      window: { title: missionName(MISSIONS.tend_wounded, UnderworldOperations.getTerrain(GangData.getGang(this.actor))) },
      content: dialogContent(`
        <div class="underworld-dialog" style="font-size: 0.9rem;">
          <div class="form-group">
            <label style="font-weight: bold; display: block; margin-bottom: 4px;">${t("Tend.Who")}</label>
            <select id="tender-npc-select" style="width: 100%; padding: 4px;">
              ${npcOptions}
            </select>
          </div>
          <div class="form-group" style="margin-top: 8px;">
            <label style="font-weight: bold; display: block; margin-bottom: 4px;">${t("Tend.Whom")}</label>
            <select id="wounded-npc-select" style="width: 100%; padding: 4px;">
              ${woundedOptions}
            </select>
          </div>
        </div>
      `),
      buttons: [
        {
          action: "send",
          icon: "fas fa-medkit",
          label: t("Tend.Start"),
          default: true,
          callback: async (event, button, dialog) => {
            const tenderId = dialogValue(dialog, "#tender-npc-select");
            const woundedId = dialogValue(dialog, "#wounded-npc-select");
            if (UnderworldOperations.usesPlanning()) {
              if (await UnderworldOperations.planMission(this.actor, tenderId, "executeTendWoundedMission", woundedId)) {
                ui.notifications.info(t("Tend.Planned"));
              }
              this.render();
              return;
            }
            await UnderworldOperations.executeTendWoundedMission(this.actor, tenderId, woundedId);
            ui.notifications.info(t("Tend.Started"));
            this.render();
          }
        },
        { action: "cancel", icon: "fas fa-times", label: "WFRP4E_COMPANION.Cancel" }
      ],
      rejectClose: false
    });
  }

  // ════════════════════════════════════════════
  // DIALOG NOCNEGO POSTOJU
  // ════════════════════════════════════════════

  async _onCampRestDialog() {
    const weekly = UnderworldOperations.isWeekly();
    if (weekly && !game.user.isGM) {
      ui.notifications.info(t("Camp.GMResolvesWeekHint"));
      return;
    }
    const gang = GangData.getGang(this.actor);
    const terrain = TERRAINS[UnderworldOperations.getTerrain(gang)];
    const comfortableCost = terrain.comfortableCostSS
      ? (weekly ? t("Camp.CostPerWeek", { cost: terrain.comfortableCostSS * 7 }) : `${terrain.comfortableCostSS} ${t("Units.SS")}`)
      : t("Free");
    const plannedCount = gang.roster.filter(n => n.plannedMission && !n.plannedMission.endsAt).length;
    // „Noc mija” (MG, tryb dzienny): czas świata przesuwa się do rana i postój rozlicza zlecenia zakończone w nocy
    const nightOption = !weekly && game.user.isGM;
    let nightHtml = "";
    if (nightOption) {
      const nightSeconds = UnderworldOperations.nightSeconds();
      const morning = game.time.worldTime + nightSeconds;
      const timed = gang.roster.filter(n => n.status === "busy" && n.plannedMission?.endsAt);
      const endingTonight = timed.filter(n => Number(n.plannedMission.endsAt) <= morning).length;
      const custom = UnderworldOperations.customTurnDays();
      nightHtml = `
        <div class="dialog-section" style="margin-bottom: 12px; border-bottom: 1px dashed #9e856f; padding-bottom: 10px;">
          <label style="cursor: pointer; display: flex; align-items: center; gap: 8px; margin: 0;">
            <input type="checkbox" id="rest-night-passes" checked style="margin: 0; width: 16px; height: 16px;" />
            <span><strong>${custom ? t("CampDialog.TurnPasses", { days: custom }) : t("CampDialog.NightPasses")}</strong>
              <span style="color: #554433;">${t("CampDialog.NightPassesHint", { time: UnderworldOperations.formatDateTime(morning) })}</span></span>
          </label>
          ${timed.length ? `<p style="margin: 6px 0 0; font-size: 0.82rem; color: #554433;"><i class="fas fa-hourglass-half"></i> ${t("CampDialog.NightPassesJobs", { done: endingTonight, total: timed.length })}</p>` : ""}
        </div>`;
    }
    const availableWatchmen = gang.roster.filter(n => !["dead", "wounded", "arrested"].includes(n.status));

    let watchmenHtml = availableWatchmen.map(n => {
      const isChecked = n.assignment === "guard" ? "checked" : "";
      const normRole = UnderworldTables.normalizeRole(n.role);
      const roleCfg = UnderworldTables.ROLES_CONFIG[normRole] || { name: n.role, icon: "fas fa-user" };
      return `
        <label class="watchman-choice-card" style="display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid #c8b9a6; background: rgba(255,255,255,0.7); border-radius: 4px; cursor: pointer; flex: 1 1 calc(50% - 6px); min-width: 190px;">
          <input type="checkbox" name="watchmen" value="${n.id}" ${isChecked} style="margin: 0; width: 16px; height: 16px; cursor: pointer; flex-shrink: 0;" />
          <img src="${n.img || 'icons/svg/mystery-man.svg'}" style="width: 26px; height: 26px; border-radius: 3px; object-fit: cover; border: 1px solid #7c5838; flex-shrink: 0;" />
          <div style="min-width: 0; flex: 1;">
            <div style="font-weight: bold; font-size: 0.85rem; color: #2b1f15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${n.name}</div>
            <div style="font-size: 0.72rem; color: #665544;"><i class="${roleCfg.icon}"></i> ${roleCfg.name}</div>
          </div>
        </label>
      `;
    }).join("");

    if (!watchmenHtml) {
      watchmenHtml = `<p style='color: #c62828; font-style: italic; margin: 4px 0;'>${t("Camp.NoHealthy")}</p>`;
    }

    const contentHtml = `
      <div class="underworld-dialog camp-rest-dialog" style="font-size: 0.9rem; padding: 2px 4px;">
        ${nightHtml}
        ${weekly ? `
        <div class="dialog-section" style="margin-bottom: 12px; border-bottom: 1px dashed #9e856f; padding-bottom: 10px;">
          <p style="margin: 0 0 6px;"><i class="fas fa-tasks"></i> ${t("CampDialog.Planned", { count: plannedCount })}</p>
          <label style="cursor: pointer; display: flex; align-items: center; gap: 8px; margin: 0;">
            <input type="checkbox" id="week-advance-time" style="margin: 0; width: 16px; height: 16px;" />
            <span>${t("CampDialog.AdvanceTime")}</span>
          </label>
        </div>` : ""}        
        <!-- 1. MIEJSCE NOCLEGU -->
        <div class="dialog-section" style="margin-bottom: 12px; border-bottom: 1px dashed #9e856f; padding-bottom: 10px;">
          <label style="font-weight: bold; display: block; margin-bottom: 5px; color: #3b2616; font-size: 0.92rem;">
            <i class="fas fa-campground"></i> ${t("CampDialog.Shelter")}
          </label>
          <select id="rest-shelter" style="width: 100%; padding: 5px 8px; font-size: 0.88rem; border-radius: 4px; border: 1px solid #7c5e44;">
            <option value="makeshift" ${gang.camp.type === "makeshift" ? "selected" : ""}>⛺ ${t("CampDialog.Makeshift", { place: terrain.makeshiftLabel, effect: terrain.coldMakeshift ? t("CampDialog.MoraleFrost") : "-1 Morale" })}</option>
            <option value="basic" ${gang.camp.type === "basic" ? "selected" : ""}>🏕️ ${t("CampDialog.Basic")}</option>
            <option value="comfortable" ${gang.camp.type === "comfortable" ? "selected" : ""}>🛏️ ${t("CampDialog.Comfortable", { place: terrain.comfortableLabel, cost: comfortableCost })}</option>
          </select>
        </div>

        <!-- 2. WARTOWNICY -->
        <div class="dialog-section" style="margin-bottom: 12px; border-bottom: 1px dashed #9e856f; padding-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <label style="font-weight: bold; margin: 0; color: #3b2616; font-size: 0.92rem;">
              <i class="fas fa-shield-alt"></i> ${t("CampDialog.Watch")}
            </label>
            <span style="font-size: 0.75rem; color: #775533;">${t("CampDialog.WatchHint")}</span>
          </div>
          <div class="watchmen-grid" style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 160px; overflow-y: auto; padding: 2px;">
            ${watchmenHtml}
          </div>
          <p style="font-size: 0.76rem; color: #775544; margin: 6px 0 0 0; font-style: italic;">
            <i class="fas fa-info-circle"></i> ${t("CampDialog.NoWatchWarning")}
          </p>
        </div>

        <!-- 3. WYŻYWIENIE -->
        <div class="dialog-section" style="margin-bottom: 6px;">
          <label style="font-weight: bold; display: block; margin-bottom: 6px; color: #3b2616; font-size: 0.92rem;">
            <i class="fas fa-bread-slice"></i> ${t("CampDialog.Food")}
          </label>
          
          <div style="background: rgba(0,0,0,0.03); border: 1px solid #c0b0a0; border-radius: 4px; padding: 8px 10px; display: flex; flex-direction: column; gap: 8px;">
            
            <!-- Standardowy posiłek ze spiżarni -->
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
              <label style="font-size: 0.88rem; font-weight: bold; color: #2b1f15; display: flex; align-items: center; gap: 6px; margin: 0;">
                <i class="fas fa-box-open"></i> ${t("CampDialog.UseSupplies")}
              </label>
              <div style="display: flex; align-items: center; gap: 6px;">
                <input type="number" id="rest-supplies-count" value="${weekly ? Math.min(7, gang.supplies) : 1}" min="0" max="${gang.supplies}" style="width: 55px; text-align: center; font-weight: bold; padding: 3px;" />
                <span style="font-size: 0.8rem; color: #665544;">${t("CampDialog.Available", { value: gang.supplies })}</span>
              </div>
            </div>

            <div style="border-top: 1px dashed #d0c0b0; padding-top: 6px; display: flex; flex-direction: column; gap: 6px;">
              <!-- Opcja: ludzie nie jedzą -->
              <label style="cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 0.85rem; margin: 0;">
                <input type="checkbox" id="rest-fasting" style="margin: 0; width: 16px; height: 16px;" />
                <span><strong>${t("CampDialog.Fasting")}</strong> <span style="color: #c62828;">${t("CampDialog.FastingHint")}</span></span>
              </label>

              <!-- Opcja: inne źródło -->
              <label style="cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 0.85rem; margin: 0;">
                <input type="checkbox" id="rest-external" style="margin: 0; width: 16px; height: 16px;" />
                <span><strong>${t("CampDialog.External")}</strong> <span style="color: #554433;">${t("CampDialog.ExternalHint")}</span></span>
              </label>
            </div>

          </div>
        </div>

      </div>
    `;

    await DialogV2.wait({
      window: { title: weekly ? t("CampDialog.TitleWeek") : t("CampDialog.TitleNight") },
      position: { width: 540 },
      classes: ["wfrp4e", "underworld-dialog-window"],
      content: dialogContent(contentHtml),
      buttons: [
        {
          action: "rest",
          icon: weekly ? "fas fa-calendar-week" : "fas fa-moon",
          label: weekly ? t("CampDialog.ResolveWeek") : t("CampDialog.StartRest"),
          default: true,
          callback: async (event, button, dialog) => {
            const el = dialog.element;
            const shelterType = el.querySelector("#rest-shelter")?.value;
            const fasting = !!el.querySelector("#rest-fasting")?.checked;
            const externalSupplies = !!el.querySelector("#rest-external")?.checked;
            const suppliesCount = parseInt(el.querySelector("#rest-supplies-count")?.value, 10) || 0;

            const watchmenIds = Array.from(el.querySelectorAll('input[name="watchmen"]:checked'), input => input.value);

            const campOptions = { shelterType, watchmenIds, fasting, externalSupplies, suppliesCount };
            if (weekly) {
              const advanceTime = !!el.querySelector("#week-advance-time")?.checked;
              const result = await UnderworldOperations.executeWeek(this.actor, { ...campOptions, advanceTime });
              if (result !== false) ui.notifications.info(t("CampDialog.WeekDone"));
            } else {
              const nightPasses = nightOption && !!el.querySelector("#rest-night-passes")?.checked;
              await UnderworldOperations.executeCampRest(this.actor, { ...campOptions, nightPasses });
              ui.notifications.info(t("CampDialog.NightDone"));
            }
            this.render();
          }
        },
        { action: "cancel", icon: "fas fa-times", label: "WFRP4E_COMPANION.Cancel" }
      ],
      rejectClose: false
    });
  }

  // ════════════════════════════════════════════
  // DIALOG WYBORU AKTORA
  // ════════════════════════════════════════════

  async _onSelectActorDialog(npcId) {
    const actors = game.actors.filter(a => a.id !== this.actor.id);
    if (!actors.length) {
      ui.notifications.warn(t("LinkDialog.NoActors"));
      return;
    }

    const optionsHtml = actors
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(a => `<option value="${a.id}">${a.name} [${a.type}]</option>`)
      .join("");

    await DialogV2.wait({
      window: { title: t("LinkDialog.Title") },
      content: dialogContent(`
        <div class="underworld-dialog" style="margin-bottom: 10px;">
          <p>${t("LinkDialog.Choose")}</p>
          <div class="form-group" style="margin-top: 8px;">
            <label style="font-weight: bold; margin-bottom: 4px; display: block;">${t("LinkDialog.Available")}</label>
            <select id="actor-select" style="width: 100%; padding: 4px;">
              ${optionsHtml}
            </select>
          </div>
        </div>
      `),
      buttons: [
        {
          action: "link",
          icon: "fas fa-link",
          label: t("LinkDialog.Link"),
          default: true,
          callback: async (event, button, dialog) => {
            const selectedActorId = dialogValue(dialog, "#actor-select");
            const selectedActor = game.actors.get(selectedActorId);
            if (!selectedActor) return;

            const gang = GangData.getGang(this.actor);
            const npc = gang.roster.find(n => n.id === npcId);
            if (npc) {
              npc.actorId = selectedActor.id;
              npc.img = selectedActor.img;
              if (!npc.name || ["Nowy Podwładny", "New Follower", t("Roster.NewFollower")].includes(npc.name)) npc.name = selectedActor.name;
              await GangData.saveGang(this.actor, gang);
              ui.notifications.info(t("Roster.Linked", { actor: selectedActor.name, name: npc.name }));
              this.render();
            }
          }
        },
        { action: "cancel", icon: "fas fa-times", label: "WFRP4E_COMPANION.Cancel" }
      ],
      rejectClose: false
    });
  }

  /**
   * Dialog Rekrutacji dla MG: wybór liczby kandydatów i wysłanie na czat
   */
  async _onOpenRecruitmentDialog() {
    if (!game.user.isGM) return;

    const recruitmentHtml = `
      <div class="underworld-dialog" style="display: flex; flex-direction: column; gap: 10px; font-size: 0.9rem;">
        <p style="margin: 0; color: #4a2810;">
          ${t("RecruitDialog.Intro")}
        </p>
        <div class="form-group" style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-weight: bold; color: #2b231d;">${t("RecruitDialog.Count")}</label>
          <select id="recruit-count-select" style="padding: 4px; font-size: 0.9rem;">
            <option value="2">${t("RecruitDialog.Candidates", { count: 2 })}</option>
            <option value="3" selected>${t("RecruitDialog.Candidates", { count: 3 })} (${t("RecruitDialog.Standard")})</option>
            <option value="4">${t("RecruitDialog.Candidates", { count: 4 })}</option>
            <option value="5">${t("RecruitDialog.Candidates", { count: 5 })} (${t("RecruitDialog.Wide")})</option>
          </select>
        </div>
        <div class="form-group" style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-weight: bold; color: #2b231d;">${t("RecruitDialog.Note")}</label>
          <textarea id="recruit-gm-note" rows="2" placeholder="${t("RecruitDialog.NotePlaceholder")}" style="font-size: 0.85rem; padding: 4px; resize: vertical;"></textarea>
        </div>
      </div>
    `;

    await DialogV2.wait({
      window: { title: t("RecruitDialog.Title") },
      position: { width: 440 },
      classes: ["wfrp4e", "underworld-dialog-window"],
      content: dialogContent(recruitmentHtml),
      buttons: [
        {
          action: "send",
          icon: "fas fa-paper-plane",
          label: t("RecruitDialog.Send"),
          default: true,
          callback: async (event, button, dialog) => {
            const count = parseInt(dialogValue(dialog, "#recruit-count-select"), 10) || 3;
            const gmNote = dialogValue(dialog, "#recruit-gm-note")?.trim() || "";

            const candidates = UnderworldTables.generateRecruitCandidates(count, GangData.getGang(this.actor));

            const templateData = {
              actorId: this.actor.id,
              gmNote,
              candidates,
              chosen: null
            };

            const template = "modules/wfrp4e-underworld/templates/chat/recruit-proposals.hbs";
            const chatHtml = await foundry.applications.handlebars.renderTemplate(template, templateData);

            await ChatMessage.create({
              user: game.user.id,
              speaker: ChatMessage.getSpeaker({ actor: this.actor }),
              content: chatHtml,
              flavor: t("Recruit.Flavor"),
              flags: {
                "wfrp4e-underworld": {
                  isRecruitment: true,
                  actorId: this.actor.id,
                  candidates,
                  gmNote,
                  chosen: null
                }
              }
            });

            ui.notifications.info(t("RecruitDialog.Sent", { count: candidates.length }));
          }
        },
        { action: "cancel", icon: "fas fa-times", label: "WFRP4E_COMPANION.Cancel" }
      ],
      rejectClose: false
    });
  }

  /**
   * Dialog Zbrojowni i Fabularnego Rozwoju Poplecznika (Rangi, Ekwipunek, Fabularne Atuty za DO oraz Cechy MG)
   */
  async _onUpgradeNpcDialog(npcId) {
    const gang = GangData.getGang(this.actor);
    const npc = gang.roster.find(n => n.id === npcId);
    if (!npc) return;

    if (!Array.isArray(npc.gear)) npc.gear = [];
    if (!Array.isArray(npc.strengths)) npc.strengths = [npc.strength].filter(Boolean);
    if (!Array.isArray(npc.flaws)) npc.flaws = [npc.flaw].filter(Boolean);
    if (!Array.isArray(npc.narrativePerks)) npc.narrativePerks = [];

    npc.rank = Number(npc.rank) || 0;
    npc.operationalXP = Number(npc.operationalXP) || 0;
    npc.customBonus = Number(npc.customBonus) || 0;

    const ranks = UnderworldTables.RANKS_CONFIG || [];
    const gearConfig = UnderworldTables.GEAR_CONFIG || {};
    const totalPennies = GangData.treasuryToPennies(gang.treasury);
    const isGM = game.user.isGM;
    const gearCount = npc.gear.length;
    const gearMax = 2;
    const oxp = t("Units.OXP");

    // Sprawdź czy ktoś inny w szajce jest już Prawą Ręką
    const otherLt = gang.roster.find(n => n.id !== npc.id && (Number(n.rank) || 0) >= 3);

    // 1. Rangi i Awans (Kupowane za DO)
    let ranksHtml = ranks.map(r => {
      const isCurrent = npc.rank === r.level;
      const isAchieved = npc.rank > r.level;
      const isNext = r.level === npc.rank + 1;

      let actionHtml = '';
      if (isCurrent) {
        actionHtml = '<span class="badge-mission ready" style="font-size: 0.72rem;"><i class="fas fa-check-circle"></i> ' + t("Upgrade.CurrentRank") + '</span>';
      } else if (isAchieved) {
        actionHtml = '<span class="badge-mission busy" style="font-size: 0.72rem;"><i class="fas fa-check"></i> ' + t("Upgrade.Achieved") + '</span>';
      } else if (isNext) {
        if (r.unique && otherLt) {
          actionHtml = `<span style="color: #c62828; font-size: 0.74rem;" title="${t("Upgrade.Appointed", { name: otherLt.name })}"><i class="fas fa-ban"></i> ${t("Upgrade.Appointed", { name: otherLt.name })}</span>`;
        } else {
          const canAfford = npc.operationalXP >= r.costOperationalXP;
          actionHtml = `
            <button type="button" class="btn-buy-rank btn-actor-action" data-target-rank="${r.level}" data-cost-xp="${r.costOperationalXP}" ${canAfford ? '' : 'disabled style="opacity: 0.5;"'} title="${canAfford ? t("Upgrade.PromoteFor", { cost: r.costOperationalXP, unit: oxp }) : t("Upgrade.Requires", { cost: r.costOperationalXP, unit: oxp, have: npc.operationalXP })}">
              <i class="fas fa-arrow-up"></i> ${r.level === 3 ? t("Upgrade.AppointLt") : t("Upgrade.Promote")} (${r.costOperationalXP} ${oxp})
            </button>
          `;
        }
      } else {
        actionHtml = `<span style="color: #999; font-size: 0.74rem;">🔒 ${t("Upgrade.NeedsPrevious")}</span>`;
      }

      return `
        <div class="upgrade-rank-row" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; margin-bottom: 4px; border: 1px solid ${isCurrent ? '#2e7d32' : isAchieved ? '#1565c0' : '#c8b8a6'}; background: ${isCurrent ? 'rgba(46,125,50,0.1)' : isAchieved ? 'rgba(21,101,192,0.06)' : 'rgba(0,0,0,0.02)'}; border-radius: 4px;">
          <div>
            <div style="font-weight: bold; font-size: 0.88rem; color: #2b231d;">
              <i class="${r.icon}"></i> ${r.name}
            </div>
            <div style="font-size: 0.76rem; color: #554433;">${r.desc}</div>
          </div>
          <div>${actionHtml}</div>
        </div>
      `;
    }).join("");

    // 2. Fabularne Atuty za DO (Narrative Perks) & Dawny Fach
    const allPerks = Object.values(UnderworldTables.NARRATIVE_PERKS || {});
    const craftPerks = allPerks.filter(p => p.isCraft);
    const grimdarkPerks = allPerks.filter(p => !p.isCraft);

    const currentCraft = craftPerks.find(p => npc.narrativePerks.includes(p.id));

    // A: Dawny Fach (Limit 1 na postać)
    const craftPerksHtml = craftPerks.map(perk => {
      const isOwned = npc.narrativePerks.includes(perk.id);
      const canAfford = npc.operationalXP >= perk.costOperationalXP;

      let actionHtml = '';
      if (isOwned) {
        actionHtml = '<span class="badge-mission ready" style="font-size: 0.72rem;"><i class="fas fa-check-circle"></i> ' + t("Upgrade.ChosenCraft") + '</span>';
      } else if (currentCraft) {
        actionHtml = `<span style="color: #888; font-size: 0.74rem;" title="${t("Upgrade.OneCraftHint")}"><i class="fas fa-lock"></i> ${t("Upgrade.Chosen", { name: currentCraft.name.split(": ").pop() })}</span>`;
      } else {
        actionHtml = `
          <button type="button" class="btn-buy-narrative-perk btn-actor-action" data-perk-id="${perk.id}" data-cost-xp="${perk.costOperationalXP}" ${canAfford ? '' : 'disabled style="opacity: 0.5;"'} title="${canAfford ? t("Upgrade.ChooseCraftFor", { cost: perk.costOperationalXP, unit: oxp }) : t("Upgrade.Requires", { cost: perk.costOperationalXP, unit: oxp, have: npc.operationalXP })}">
            <i class="fas fa-tools"></i> ${t("Upgrade.Choose")} (${perk.costOperationalXP} ${oxp})
          </button>
        `;
      }

      return `
        <div class="upgrade-trait-row" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; margin-bottom: 4px; border: 1px solid ${isOwned ? '#2e7d32' : '#c8b8a6'}; background: ${isOwned ? 'rgba(46,125,50,0.08)' : 'rgba(255,255,255,0.4)'}; border-radius: 4px;">
          <div style="flex: 1; padding-right: 8px;">
            <div style="font-weight: bold; font-size: 0.86rem; color: #2e7d32;">
              <i class="${perk.icon}"></i> ${perk.name}
              ${isOwned ? `<span class="badge-mission ready" style="font-size: 0.72rem; margin-left: 4px;">✓ ${t("Upgrade.Selected")}</span>` : `<span style="font-size: 0.75rem; color: #775533; margin-left: 4px;">(${perk.costOperationalXP} ${oxp})</span>`}
            </div>
            <div style="font-size: 0.75rem; color: #554433;">${perk.desc}</div>
          </div>
          <div>${actionHtml}</div>
        </div>
      `;
    }).join("");

    // B: Grimdark Ulepszenia i Cechy Bojowe
    const grimdarkPerksHtml = grimdarkPerks.map(perk => {
      const isOwned = npc.narrativePerks.includes(perk.id);
      const canAfford = npc.operationalXP >= perk.costOperationalXP;

      return `
        <div class="upgrade-trait-row" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; margin-bottom: 4px; border: 1px solid ${isOwned ? '#512da8' : '#c8b8a6'}; background: ${isOwned ? 'rgba(81,45,168,0.08)' : 'rgba(255,255,255,0.4)'}; border-radius: 4px;">
          <div style="flex: 1; padding-right: 8px;">
            <div style="font-weight: bold; font-size: 0.86rem; color: #311b92;">
              <i class="${perk.icon}"></i> ${perk.name}
              ${isOwned ? `<span class="badge-mission ready" style="font-size: 0.72rem; margin-left: 4px;">✓ ${t("Upgrade.Bought")}</span>` : `<span style="font-size: 0.75rem; color: #775533; margin-left: 4px;">(${perk.costOperationalXP} ${oxp})</span>`}
            </div>
            <div style="font-size: 0.75rem; color: #554433;">${perk.desc}</div>
          </div>
          <div>
            ${isOwned ? `
              <span style="color: #2e7d32; font-weight: bold; font-size: 0.75rem;"><i class="fas fa-check-circle"></i> ${t("Upgrade.Owned")}</span>
            ` : `
              <button type="button" class="btn-buy-narrative-perk btn-actor-action" data-perk-id="${perk.id}" data-cost-xp="${perk.costOperationalXP}" ${canAfford ? '' : 'disabled style="opacity: 0.5;"'} title="${canAfford ? t("Upgrade.BuyFor", { cost: perk.costOperationalXP, unit: oxp }) : t("Upgrade.Requires", { cost: perk.costOperationalXP, unit: oxp, have: npc.operationalXP })}">
                <i class="fas fa-feather-alt"></i> ${t("Upgrade.Buy")} (${perk.costOperationalXP} ${oxp})
              </button>
            `}
          </div>
        </div>
      `;
    }).join("");

    // 3. Widok Zalet i Wad (Wszyscy widzą, tylko MG może edytować)
    const allStrengths = UnderworldTables.TRAITS_CONFIG?.strengths || {};
    const allFlaws = UnderworldTables.TRAITS_CONFIG?.flaws || {};

    const strengthsListHtml = npc.strengths.length > 0 ? npc.strengths.map(sid => {
      const cfg = allStrengths[sid] || { name: sid, desc: "" };
      const escapedName = Handlebars.escapeExpression(cfg.name || sid);
      const escapedDesc = Handlebars.escapeExpression(cfg.desc || "");
      const tooltip = `<strong>${escapedName}</strong><br>${escapedDesc}`;
      return `
        <div class="trait-badge trait-strength" data-tooltip="${tooltip}" style="display: inline-flex; align-items: center; gap: 4px; background: rgba(46,125,50,0.12); border: 1px solid #2e7d32; border-radius: 4px; padding: 2px 6px; margin: 2px; font-size: 0.8rem; color: #1b5e20; cursor: help;">
          <i class="${cfg.icon || 'fas fa-star'}"></i> <strong>${escapedName}</strong>
          ${isGM ? `<button type="button" class="btn-remove-strength btn-unlink" data-trait-id="${sid}" style="border: none; background: none; color: #c62828; cursor: pointer; padding: 0 2px;" title="${t("Upgrade.RemoveStrength")}"><i class="fas fa-times"></i></button>` : ''}
        </div>
      `;
    }).join("") : `<em style="color: #888; font-size: 0.8rem;">${t("Upgrade.NoStrengths")}</em>`;

    const flawsListHtml = npc.flaws.length > 0 ? npc.flaws.map(fid => {
      const cfg = allFlaws[fid] || { name: fid, desc: "" };
      const escapedName = Handlebars.escapeExpression(cfg.name || fid);
      const escapedDesc = Handlebars.escapeExpression(cfg.desc || "");
      const tooltip = `<strong>${escapedName}</strong><br>${escapedDesc}`;
      return `
        <div class="trait-badge trait-flaw" data-tooltip="${tooltip}" style="display: inline-flex; align-items: center; gap: 4px; background: rgba(183,28,28,0.1); border: 1px solid #c62828; border-radius: 4px; padding: 2px 6px; margin: 2px; font-size: 0.8rem; color: #b71c1c; cursor: help;">
          <i class="${cfg.icon || 'fas fa-exclamation-triangle'}"></i> <strong>${escapedName}</strong>
          ${isGM ? `<button type="button" class="btn-remove-flaw btn-unlink" data-trait-id="${fid}" style="border: none; background: none; color: #c62828; cursor: pointer; padding: 0 2px;" title="${t("Upgrade.RemoveFlaw")}"><i class="fas fa-times"></i></button>` : ''}
        </div>
      `;
    }).join("") : `<em style="color: #888; font-size: 0.8rem;">${t("Upgrade.NoFlaws")}</em>`;

    // Opcje wyboru dla MG do dodania
    const strengthOptions = Object.entries(allStrengths)
      .filter(([id]) => !npc.strengths.includes(id))
      .map(([id, cfg]) => `<option value="${id}">${cfg.name} (${cfg.desc})</option>`).join("");

    const flawOptions = Object.entries(allFlaws)
      .filter(([id]) => !npc.flaws.includes(id))
      .map(([id, cfg]) => `<option value="${id}">${cfg.name} (${cfg.desc})</option>`).join("");

    const gmTraitManagement = isGM ? `
      <div style="background: rgba(0,0,0,0.03); border: 1px dashed #8d6e63; border-radius: 4px; padding: 6px 8px; margin-top: 6px;">
        <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 4px;">
          <select id="select-add-strength" style="flex: 1; font-size: 0.78rem; padding: 2px;">
            <option value="">-- ${t("Upgrade.PickStrength")} --</option>
            ${strengthOptions}
          </select>
          <button type="button" class="btn-add-strength btn-actor-action" style="padding: 2px 8px; font-size: 0.76rem;">
            <i class="fas fa-plus"></i> ${t("Upgrade.AddStrength")}
          </button>
        </div>
        <div style="display: flex; gap: 6px; align-items: center;">
          <select id="select-add-flaw" style="flex: 1; font-size: 0.78rem; padding: 2px;">
            <option value="">-- ${t("Upgrade.PickFlaw")} --</option>
            ${flawOptions}
          </select>
          <button type="button" class="btn-add-flaw btn-actor-action" style="padding: 2px 8px; font-size: 0.76rem;">
            <i class="fas fa-plus"></i> ${t("Upgrade.AddFlaw")}
          </button>
        </div>
      </div>
    ` : '';

    // 4. Ekwipunek
    const otherNpcs = gang.roster.filter(n => n.id !== npc.id && n.status !== "dead");

    let gearHtml = Object.values(gearConfig).map(g => {
      const isOwned = npc.gear.includes(g.id);
      const canAfford = totalPennies >= g.costPennies;
      const atLimit = gearCount >= gearMax;

      if (isOwned) {
        let transferBtn = '';
        if (otherNpcs.length > 0) {
          transferBtn = `
            <button type="button" class="btn-transfer-gear btn-actor-action" data-gear-id="${g.id}" title="${t("Upgrade.TransferHint")}">
              <i class="fas fa-exchange-alt"></i> ${t("Upgrade.Transfer")}
            </button>`;
        }
        return `
          <div class="upgrade-gear-row" style="display: flex; align-items: center; justify-content: space-between; padding: 5px 8px; margin-bottom: 4px; border: 1px solid #2e7d32; background: rgba(232, 245, 233, 0.6); border-radius: 4px;">
            <div style="flex: 1;">
              <div style="font-weight: bold; font-size: 0.85rem; color: #2b231d;">
                <i class="${g.icon}"></i> ${g.name}
                <span style="color: #2e7d32; font-size: 0.72rem; margin-left: 4px;">✓ ${t("Upgrade.Owned")}</span>
              </div>
              <div style="font-size: 0.74rem; color: #5c4431;">${g.bonusDesc}</div>
            </div>
            <div style="display: flex; gap: 4px;">
              ${transferBtn}
              <button type="button" class="btn-sell-gear btn-actor-action btn-unlink" data-gear-id="${g.id}" title="${t("Upgrade.SellHint")}">
                <i class="fas fa-coins"></i> ${t("Upgrade.Sell")}
              </button>
            </div>
          </div>
        `;
      } else {
        const disabled = (atLimit || !canAfford) ? 'disabled style="opacity: 0.5;"' : '';
        let disabledTitle = '';
        if (atLimit) disabledTitle = t("Upgrade.GearLimit", { max: gearMax });
        else if (!canAfford) disabledTitle = t("Upgrade.NotEnoughCoin");
        else disabledTitle = t("Upgrade.BuyFromStash");

        return `
          <div class="upgrade-gear-row" style="display: flex; align-items: center; justify-content: space-between; padding: 5px 8px; margin-bottom: 4px; border: 1px solid #c8b8a6; background: rgba(255,255,255,0.4); border-radius: 4px;">
            <div style="flex: 1;">
              <div style="font-weight: bold; font-size: 0.85rem; color: #2b231d;">
                <i class="${g.icon}"></i> ${g.name}
                <span style="font-weight: normal; font-size: 0.75rem; color: #7c5832; margin-left: 6px;">[${g.costLabel}]</span>
              </div>
              <div style="font-size: 0.74rem; color: #5c4431;">${g.bonusDesc}</div>
            </div>
            <div>
              <button type="button" class="btn-buy-gear btn-actor-action" data-gear-id="${g.id}" data-cost-pennies="${g.costPennies}" ${disabled} title="${disabledTitle}">
                <i class="fas fa-shopping-cart"></i> ${t("Upgrade.BuyGear")}
              </button>
            </div>
          </div>
        `;
      }
    }).join("");

    const treasurySummary = UnderworldOperations.formatPennies(totalPennies);

    // Sekcja DO i Treningu
    const operationalXPSection = isGM ? `
      <div style="border-top: 1px dashed #9e856f; padding-top: 8px; margin-top: 4px;">
        <h4 style="margin: 0 0 6px 0; color: #4a2810; font-size: 0.95rem; border-bottom: 1px dashed #9e856f; padding-bottom: 3px;">
          <i class="fas fa-user-cog"></i> ${t("Upgrade.GMPanel")}
        </h4>
        <div style="display: flex; gap: 12px; align-items: flex-end;">
          <div style="flex: 1;">
            <label style="font-size: 0.8rem; font-weight: bold; display: block; margin-bottom: 3px;">
              <i class="fas fa-star" style="color: #b78103;"></i> ${t("Upgrade.GrantXP", { unit: oxp })}
            </label>
            <div style="display: flex; gap: 6px; align-items: center;">
              <input type="number" id="dialog-npc-operational-xp" value="${npc.operationalXP}" min="0" style="width: 70px; text-align: center; font-weight: bold; font-size: 1rem; padding: 4px;" />
              <button type="button" class="btn-add-xp btn-actor-action" data-amount="5" title="+5 ${oxp}" style="padding: 4px 8px;">
                <i class="fas fa-plus"></i> +5
              </button>
              <button type="button" class="btn-add-xp btn-actor-action" data-amount="10" title="+10 ${oxp}" style="padding: 4px 8px;">
                <i class="fas fa-plus"></i> +10
              </button>
              <button type="button" class="btn-add-xp btn-actor-action" data-amount="25" title="+25 ${oxp}" style="padding: 4px 8px;">
                <i class="fas fa-plus"></i> +25
              </button>
            </div>
          </div>
          <div style="flex: 1;">
            <label style="font-size: 0.8rem; font-weight: bold; display: block; margin-bottom: 3px;">${t("Upgrade.ManualBonus")}</label>
            <input type="number" id="dialog-npc-bonus" value="${npc.customBonus}" style="width: 70px; text-align: center;" />
          </div>
        </div>
      </div>
    ` : '';

    // Druga rola za DO
    const secondRoleDef = UnderworldTables.SECOND_ROLE;
    let secondRoleBody;
    if (npc.role2 && UnderworldTables.ROLES_CONFIG[npc.role2]) {
      const cfg2 = UnderworldTables.ROLES_CONFIG[npc.role2];
      secondRoleBody = `<span class="badge-mission ready" style="font-size: 0.78rem;"><i class="${cfg2.icon}"></i> ${cfg2.name}</span>`;
    } else if ((Number(npc.rank) || 0) < secondRoleDef.minRank) {
      secondRoleBody = `<span style="color: #999; font-size: 0.78rem;">🔒 ${t("Upgrade.SecondRoleNeedsRank")}</span>`;
    } else {
      const ownRoles = UnderworldTables.rolesOf(npc);
      const options = UnderworldTables.rolesFor(gang)
        .filter(([key]) => !ownRoles.includes(key))
        .map(([key, cfg]) => `<option value="${key}">${cfg.name}</option>`).join("");
      const canAffordRole = npc.operationalXP >= secondRoleDef.costOperationalXP;
      secondRoleBody = `
        <div style="display: flex; gap: 6px; align-items: center;">
          <select id="select-second-role" style="flex: 1;">${options}</select>
          <button type="button" class="btn-buy-second-role btn-actor-action" data-cost-xp="${secondRoleDef.costOperationalXP}" ${canAffordRole ? '' : 'disabled style="opacity: 0.5;"'} title="${canAffordRole ? t("Upgrade.BuyFor", { cost: secondRoleDef.costOperationalXP, unit: oxp }) : t("Upgrade.Requires", { cost: secondRoleDef.costOperationalXP, unit: oxp, have: npc.operationalXP })}">
            <i class="fas fa-id-badge"></i> ${t("Upgrade.Buy")} (${secondRoleDef.costOperationalXP} ${oxp})
          </button>
        </div>`;
    }

    const upgradeHtml = `
      <div class="underworld-dialog upgrade-dialog" style="font-size: 0.9rem; max-height: 540px; overflow-y: auto; padding-right: 4px;">
        <div style="display: flex; gap: 10px; align-items: center; border-bottom: 2px solid #5a3d28; padding-bottom: 8px; margin-bottom: 10px;">
          <img src="${npc.img || 'icons/svg/mystery-man.svg'}" style="width: 44px; height: 44px; object-fit: cover; border-radius: 4px; border: 1px solid #7c5e44;" />
          <div style="flex: 1;">
            <div style="font-size: 1.1rem; font-weight: bold; color: #3b2a1a;">
              ${npc.name} ${npc.rank === 3 ? `<span class="boss-badge" style="font-size: 0.7rem; margin-left: 6px;"><i class="fas fa-crown"></i> ${t("Ranks.lieutenant.Name")}</span>` : ''}
            </div>
            <div style="font-size: 0.8rem; color: #665544;">${t("Upgrade.Role")}: <strong>${UnderworldTables.ROLES_CONFIG[UnderworldTables.normalizeRole(npc.role)]?.name || npc.role}</strong> | ${t("Upgrade.AvailableXP", { unit: oxp })}: <strong style="color: #1b5e20; font-size: 0.95rem;">${npc.operationalXP} ${oxp}</strong></div>
            <div style="font-size: 0.78rem; color: #775533;"><i class="fas fa-coins"></i> ${t("Upgrade.Stash")}: <strong>${treasurySummary}</strong></div>
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          <h4 style="margin: 0 0 6px 0; color: #4a2810; font-size: 0.95rem; border-bottom: 1px dashed #9e856f; padding-bottom: 3px;">
            <i class="fas fa-medal"></i> ${t("Upgrade.RankSection")} <span style="font-size: 0.78rem; font-weight: normal; color: #776633;">${t("Upgrade.RankSectionHint", { unit: oxp })}</span>
          </h4>
          ${ranksHtml}
        </div>

        <div style="margin-bottom: 12px;">
          <h4 style="margin: 0 0 6px 0; color: #4a2810; font-size: 0.95rem; border-bottom: 1px dashed #9e856f; padding-bottom: 3px;">
            <i class="fas fa-id-badge"></i> ${t("Upgrade.SecondRole")}
            <span style="font-size: 0.76rem; font-weight: normal; color: #776633;">${t("Upgrade.SecondRoleHint")}</span>
          </h4>
          <div style="font-size: 0.78rem; color: #554433; margin-bottom: 6px; font-style: italic;">${t("Upgrade.SecondRoleIntro")}</div>
          ${secondRoleBody}
        </div>

        <div style="margin-bottom: 12px;">
          <h4 style="margin: 0 0 6px 0; color: #4a2810; font-size: 0.95rem; border-bottom: 1px dashed #9e856f; padding-bottom: 3px;">
            <i class="fas fa-tools"></i> ${t("Upgrade.CraftSection")}
            <span style="font-size: 0.76rem; font-weight: normal; color: #776633;">${t("Upgrade.CraftSectionHint")}</span>
          </h4>
          <div style="font-size: 0.78rem; color: #554433; margin-bottom: 6px; font-style: italic;">
            ${t("Upgrade.CraftIntro")}
          </div>
          ${craftPerksHtml}
        </div>

        <div style="margin-bottom: 12px;">
          <h4 style="margin: 0 0 6px 0; color: #4a2810; font-size: 0.95rem; border-bottom: 1px dashed #9e856f; padding-bottom: 3px;">
            <i class="fas fa-feather-alt"></i> ${t("Upgrade.PerkSection")}
          </h4>
          ${grimdarkPerksHtml}
        </div>

        <div style="margin-bottom: 12px;">
          <h4 style="margin: 0 0 6px 0; color: #4a2810; font-size: 0.95rem; border-bottom: 1px dashed #9e856f; padding-bottom: 3px;">
            <i class="fas fa-theater-masks"></i> ${t("Upgrade.TraitSection")}
          </h4>
          <div style="margin-bottom: 4px;">
            <strong style="font-size: 0.8rem; color: #1b5e20;"><i class="fas fa-plus-circle"></i> ${t("Mod.Strengths")}:</strong>
            <div class="strengths-wrapper" style="margin-top: 2px;">${strengthsListHtml}</div>
          </div>
          <div>
            <strong style="font-size: 0.8rem; color: #b71c1c;"><i class="fas fa-minus-circle"></i> ${t("Mod.Flaws")}:</strong>
            <div class="flaws-wrapper" style="margin-top: 2px;">${flawsListHtml}</div>
          </div>
          ${gmTraitManagement}
        </div>

        <div style="margin-bottom: 12px;">
          <h4 style="margin: 0 0 6px 0; color: #4a2810; font-size: 0.95rem; border-bottom: 1px dashed #9e856f; padding-bottom: 3px;">
            <i class="fas fa-shield-alt"></i> ${t("Upgrade.GearSection")}
            <span style="font-size: 0.78rem; font-weight: normal; color: ${gearCount >= gearMax ? '#c62828' : '#776633'};">
              ${t("Upgrade.Slots", { count: gearCount, max: gearMax })}
            </span>
          </h4>
          ${gearHtml}
        </div>

        ${operationalXPSection}
      </div>
    `;

    // Listenery przycisków wewnątrz dialogu (podpinane po wyrenderowaniu DialogV2)
    const bindUpgradeListeners = (dlg) => {
      const dlgElement = dlg.element;
      const on = (selector, handler) => dlgElement.querySelectorAll(selector).forEach(el => el.addEventListener("click", handler));

      // 1. Awans Rangi za DO
      on(".btn-buy-rank", async (ev) => {
        ev.preventDefault();
        const targetRank = parseInt(ev.currentTarget.dataset.targetRank, 10);
        const costXp = parseInt(ev.currentTarget.dataset.costXp, 10);

        if (targetRank === 3) {
          const checkOther = gang.roster.find(n => n.id !== npc.id && (Number(n.rank) || 0) >= 3);
          if (checkOther) {
            ui.notifications.warn(t("Upgrade.OneLieutenant", { name: checkOther.name }));
            return;
          }
        }

        if (npc.operationalXP >= costXp) {
          npc.operationalXP -= costXp;
          npc.rank = targetRank;
          await GangData.saveGang(this.actor, gang);
          ui.notifications.info(t("Upgrade.Promoted", { name: npc.name }));
          dlg.close();
          this._onUpgradeNpcDialog(npcId);
          this.render();
        } else {
          ui.notifications.warn(t("Upgrade.NotEnoughXPRank", { unit: oxp }));
        }
      });

      // 1b. Druga rola za DO
      on(".btn-buy-second-role", async (ev) => {
        ev.preventDefault();
        const costXp = UnderworldTables.SECOND_ROLE.costOperationalXP;
        const chosen = dlgElement.querySelector("#select-second-role")?.value;
        if (!chosen || !UnderworldTables.ROLES_CONFIG[chosen] || UnderworldTables.rolesOf(npc).includes(chosen)) return;
        if ((Number(npc.rank) || 0) < UnderworldTables.SECOND_ROLE.minRank) return;
        if (npc.operationalXP < costXp) {
          ui.notifications.warn(t("Upgrade.NotEnoughXP", { cost: costXp, unit: oxp, have: npc.operationalXP }));
          return;
        }
        npc.operationalXP -= costXp;
        npc.role2 = chosen;
        await GangData.saveGang(this.actor, gang);
        ui.notifications.info(t("Upgrade.SecondRoleGained", { name: npc.name, role: UnderworldTables.ROLES_CONFIG[chosen].name }));
        dlg.close();
        this._onUpgradeNpcDialog(npcId);
        this.render();
      });

      // 2. Wykupienie Fabularnego Atutu za DO
      on(".btn-buy-narrative-perk", async (ev) => {
        ev.preventDefault();
        const perkId = ev.currentTarget.dataset.perkId;
        const costXp = parseInt(ev.currentTarget.dataset.costXp, 10);
        if (!perkId) return;

        const perkDef = UnderworldTables.NARRATIVE_PERKS[perkId];
        if (!perkDef) return;

        // Jeśli to Dawny Fach, banita może mieć tylko 1 wybrany zawód
        if (perkDef.isCraft) {
          const existingCraft = Object.values(UnderworldTables.NARRATIVE_PERKS).find(p => p.isCraft && npc.narrativePerks.includes(p.id));
          if (existingCraft) {
            ui.notifications.warn(t("Upgrade.HasCraft", { name: existingCraft.name }));
            return;
          }
        }

        if (npc.operationalXP >= costXp) {
          npc.operationalXP -= costXp;
          if (!npc.narrativePerks.includes(perkId)) {
            npc.narrativePerks.push(perkId);
          }
          await GangData.saveGang(this.actor, gang);
          const perkName = perkDef.name || perkId;
          ui.notifications.info(t("Upgrade.PerkGained", { name: npc.name, perk: perkName }));
          dlg.close();
          this._onUpgradeNpcDialog(npcId);
          this.render();
        } else {
          ui.notifications.warn(t("Upgrade.NotEnoughXP", { cost: costXp, unit: oxp, have: npc.operationalXP }));
        }
      });

      // 3. Dodawanie/Usuwanie Zalet i Wad przez MG
      if (isGM) {
        on(".btn-add-strength", async (ev) => {
          ev.preventDefault();
          const selected = dlgElement.querySelector("#select-add-strength")?.value;
          if (!selected) return;
          if (!npc.strengths.includes(selected)) {
            npc.strengths.push(selected);
            npc.strength = npc.strengths[0] || "";
            await GangData.saveGang(this.actor, gang);
            ui.notifications.info(t("Upgrade.StrengthAdded", { name: npc.name }));
            dlg.close();
            this._onUpgradeNpcDialog(npcId);
            this.render();
          }
        });

        on(".btn-remove-strength", async (ev) => {
          ev.preventDefault();
          const tid = ev.currentTarget.dataset.traitId;
          npc.strengths = npc.strengths.filter(t => t !== tid);
          npc.strength = npc.strengths[0] || "";
          await GangData.saveGang(this.actor, gang);
          ui.notifications.info(t("Upgrade.StrengthRemoved", { name: npc.name }));
          dlg.close();
          this._onUpgradeNpcDialog(npcId);
          this.render();
        });

        on(".btn-add-flaw", async (ev) => {
          ev.preventDefault();
          const selected = dlgElement.querySelector("#select-add-flaw")?.value;
          if (!selected) return;
          if (!npc.flaws.includes(selected)) {
            npc.flaws.push(selected);
            npc.flaw = npc.flaws[0] || "";
            await GangData.saveGang(this.actor, gang);
            ui.notifications.info(t("Upgrade.FlawAdded", { name: npc.name }));
            dlg.close();
            this._onUpgradeNpcDialog(npcId);
            this.render();
          }
        });

        on(".btn-remove-flaw", async (ev) => {
          ev.preventDefault();
          const tid = ev.currentTarget.dataset.traitId;
          npc.flaws = npc.flaws.filter(t => t !== tid);
          npc.flaw = npc.flaws[0] || "";
          await GangData.saveGang(this.actor, gang);
          ui.notifications.info(t("Upgrade.FlawRemoved", { name: npc.name }));
          dlg.close();
          this._onUpgradeNpcDialog(npcId);
          this.render();
        });
      }

      // 4. Kupowanie Ekwipunku
      on(".btn-buy-gear", async (ev) => {
        ev.preventDefault();
        const gearId = ev.currentTarget.dataset.gearId;
        const costPennies = parseInt(ev.currentTarget.dataset.costPennies, 10);

        if (totalPennies < costPennies) {
          ui.notifications.warn(t("Upgrade.NotEnoughCoin"));
          return;
        }

        const newTotal = totalPennies - costPennies;
        gang.treasury = GangData.penniesToTreasury(newTotal);
        if (!npc.gear.includes(gearId)) npc.gear.push(gearId);

        await GangData.saveGang(this.actor, gang);
        ui.notifications.info(t("Upgrade.GearBought", { gear: gearConfig[gearId]?.name, name: npc.name }));
        dlg.close();
        this._onUpgradeNpcDialog(npcId);
        this.render();
      });

      // 5. Sprzedaż Ekwipunku
      on(".btn-sell-gear", async (ev) => {
        ev.preventDefault();
        const gearId = ev.currentTarget.dataset.gearId;
        const refundPennies = Math.floor((gearConfig[gearId]?.costPennies || 0) / 2);

        npc.gear = npc.gear.filter(g => g !== gearId);
        const newTotal = totalPennies + refundPennies;
        gang.treasury = GangData.penniesToTreasury(newTotal);

        await GangData.saveGang(this.actor, gang);
        ui.notifications.info(t("Upgrade.GearSold", { gear: gearConfig[gearId]?.name, refund: UnderworldOperations.formatPennies(refundPennies) }));
        dlg.close();
        this._onUpgradeNpcDialog(npcId);
        this.render();
      });

      // 6. Przenoszenie Ekwipunku
      on(".btn-transfer-gear", async (ev) => {
        ev.preventDefault();
        const gearId = ev.currentTarget.dataset.gearId;
        const gearName = gearConfig[gearId]?.name || gearId;
        const targets = otherNpcs.filter(n => (n.gear?.length || 0) < gearMax);

        if (targets.length === 0) {
          ui.notifications.warn(t("Upgrade.NoFreeSlot"));
          return;
        }

        const targetOptions = targets.map(t => `<option value="${t.id}">${t.name} (${t.gear?.length || 0}/${gearMax})</option>`).join("");

        await DialogV2.wait({
          window: { title: `${t("Upgrade.Give")}: ${gearName}` },
          position: { width: 380 },
          classes: ["wfrp4e", "underworld-dialog-window"],
          content: dialogContent(`
            <div class="underworld-dialog" style="margin-bottom: 10px;">
              <p>${t("Upgrade.GiveText", { gear: gearName, name: npc.name })}</p>
              <select id="transfer-target" style="width: 100%; padding: 4px; font-size: 0.88rem;">
                ${targetOptions}
              </select>
            </div>
          `),
          buttons: [
            {
              action: "transfer",
              icon: "fas fa-exchange-alt",
              label: t("Upgrade.Give"),
              default: true,
              callback: async (event, button, dlg2) => {
                const targetId = dialogValue(dlg2, "#transfer-target");
                const target = gang.roster.find(n => n.id === targetId);
                if (!target) return;
                if (!Array.isArray(target.gear)) target.gear = [];

                npc.gear = npc.gear.filter(g => g !== gearId);
                if (!target.gear.includes(gearId)) target.gear.push(gearId);

                await GangData.saveGang(this.actor, gang);
                ui.notifications.info(t("Upgrade.GearGiven", { gear: gearName, from: npc.name, to: target.name }));
                dlg.close();
                this._onUpgradeNpcDialog(npcId);
                this.render();
              }
            },
            { action: "cancel", icon: "fas fa-times", label: "WFRP4E_COMPANION.Cancel" }
          ],
          rejectClose: false
        });
      });

      // 7. Szybkie dodawanie DO (tylko MG)
      on(".btn-add-xp", async (ev) => {
        ev.preventDefault();
        const amount = parseInt(ev.currentTarget.dataset.amount, 10) || 1;
        const operationalXPInput = dlgElement.querySelector("#dialog-npc-operational-xp");
        if (!operationalXPInput) return;
        const currentVal = parseInt(operationalXPInput.value, 10) || 0;
        operationalXPInput.value = currentVal + amount;
        ui.notifications.info(t("Upgrade.XPAdded", { amount, unit: oxp, name: npc.name }));
      });
    };

    await DialogV2.wait({
      window: { title: t("Upgrade.Title", { name: npc.name }) },
      position: { width: 540 },
      classes: ["wfrp4e", "underworld-dialog-window"],
      content: dialogContent(upgradeHtml),
      render: (event, dlg) => bindUpgradeListeners(dlg),
      buttons: [
        {
          action: "save",
          icon: "fas fa-save",
          label: t("Upgrade.Save"),
          default: true,
          callback: async (event, button, dlg) => {
            if (isGM) {
              const newOperationalXP = Math.max(0, parseInt(dialogValue(dlg, "#dialog-npc-operational-xp"), 10) || 0);
              const newBonus = parseInt(dialogValue(dlg, "#dialog-npc-bonus"), 10) || 0;
              npc.operationalXP = newOperationalXP;
              npc.customBonus = newBonus;
            }
            await GangData.saveGang(this.actor, gang);
            this.render();
          }
        },
        { action: "close", icon: "fas fa-times", label: t("Close") }
      ],
      rejectClose: false
    });
  }

  /**
   * Dialog wpłaty monet z sakwy gracza do skarbca szajki
   */
  async _onDepositTreasuryDialog() {
    const actorPennies = UnderworldOperations.getActorPennies(this.actor);
    const actorMoneyFormatted = UnderworldOperations.formatPennies(actorPennies);

    const depositHtml = `
      <div class="underworld-dialog" style="font-size: 0.9rem;">
        <div style="margin-bottom: 8px; background: rgba(46,125,50,0.08); padding: 8px; border-radius: 4px; border: 1px solid #2e7d32;">
          <i class="fas fa-wallet text-green"></i> ${t("TreasuryDialog.YourPurse")}: <strong>${actorMoneyFormatted}</strong>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="font-weight: bold; display: block; margin-bottom: 4px;">${t("TreasuryDialog.DepositHow")}</label>
          <div style="display: flex; gap: 8px; align-items: center;">
            <label style="font-size: 0.8rem;">${t("Units.GC")}: <input type="number" id="deposit-gc" min="0" value="0" style="width: 50px; text-align: center;" /></label>
            <label style="font-size: 0.8rem;">${t("Units.SS")}: <input type="number" id="deposit-ss" min="0" value="0" style="width: 50px; text-align: center;" /></label>
            <label style="font-size: 0.8rem;">${t("Units.BP")}: <input type="number" id="deposit-d" min="0" value="0" style="width: 50px; text-align: center;" /></label>
          </div>
        </div>
        <div style="font-size: 0.78rem; color: #555;">
          <i class="fas fa-info-circle text-gold"></i> ${t("TreasuryDialog.DepositHint")}
        </div>
      </div>
    `;

    await DialogV2.wait({
      window: { title: t("Treasury.DepositTitle") },
      content: dialogContent(depositHtml),
      buttons: [
        {
          action: "confirm",
          icon: "fas fa-coins",
          label: t("TreasuryDialog.Deposit"),
          default: true,
          callback: async (event, button, dialog) => {
            const gc = Math.max(0, parseInt(dialogValue(dialog, "#deposit-gc"), 10) || 0);
            const ss = Math.max(0, parseInt(dialogValue(dialog, "#deposit-ss"), 10) || 0);
            const d = Math.max(0, parseInt(dialogValue(dialog, "#deposit-d"), 10) || 0);
            const totalPennies = (gc * 240) + (ss * 12) + d;

            if (totalPennies <= 0) {
              ui.notifications.warn(t("TreasuryDialog.AmountZero"));
              return;
            }

            await UnderworldOperations.depositTreasury(this.actor, totalPennies, this.actor);
            this.render();
          }
        },
        { action: "cancel", label: "WFRP4E_COMPANION.Cancel" }
      ],
      rejectClose: false
    });
  }

  /**
   * Dialog pobrania monet ze skarbca szajki do sakwy gracza
   */
  async _onWithdrawTreasuryDialog() {
    const gang = GangData.getGang(this.actor);
    const treasuryPennies = GangData.treasuryToPennies(gang.treasury);
    const treasuryFormatted = UnderworldOperations.formatPennies(treasuryPennies);

    const withdrawHtml = `
      <div class="underworld-dialog" style="font-size: 0.9rem;">
        <div style="margin-bottom: 8px; background: rgba(183,28,28,0.06); padding: 8px; border-radius: 4px; border: 1px solid #b71c1c;">
          <i class="fas fa-coins text-gold"></i> ${t("TreasuryDialog.Balance")}: <strong>${treasuryFormatted}</strong>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="font-weight: bold; display: block; margin-bottom: 4px;">${t("TreasuryDialog.WithdrawHow")}</label>
          <div style="display: flex; gap: 8px; align-items: center;">
            <label style="font-size: 0.8rem;">${t("Units.GC")}: <input type="number" id="withdraw-gc" min="0" value="0" style="width: 50px; text-align: center;" /></label>
            <label style="font-size: 0.8rem;">${t("Units.SS")}: <input type="number" id="withdraw-ss" min="0" value="0" style="width: 50px; text-align: center;" /></label>
            <label style="font-size: 0.8rem;">${t("Units.BP")}: <input type="number" id="withdraw-d" min="0" value="0" style="width: 50px; text-align: center;" /></label>
          </div>
        </div>
        <div style="font-size: 0.78rem; color: #b71c1c; background: rgba(255,235,238,0.6); padding: 6px; border-radius: 4px; border: 1px dashed #e57373;">
          <i class="fas fa-exclamation-triangle"></i> ${t("TreasuryDialog.MutinyRisk")}
        </div>
      </div>
    `;

    await DialogV2.wait({
      window: { title: t("Treasury.WithdrawTitle") },
      content: dialogContent(withdrawHtml),
      buttons: [
        {
          action: "confirm",
          icon: "fas fa-hand-holding-usd",
          label: t("TreasuryDialog.Withdraw"),
          default: true,
          callback: async (event, button, dialog) => {
            const gc = Math.max(0, parseInt(dialogValue(dialog, "#withdraw-gc"), 10) || 0);
            const ss = Math.max(0, parseInt(dialogValue(dialog, "#withdraw-ss"), 10) || 0);
            const d = Math.max(0, parseInt(dialogValue(dialog, "#withdraw-d"), 10) || 0);
            const totalPennies = (gc * 240) + (ss * 12) + d;

            if (totalPennies <= 0) {
              ui.notifications.warn(t("TreasuryDialog.AmountZero"));
              return;
            }

            await UnderworldOperations.withdrawTreasury(this.actor, totalPennies, this.actor);
            this.render();
          }
        },
        { action: "cancel", label: "WFRP4E_COMPANION.Cancel" }
      ],
      rejectClose: false
    });
  }

  /**
   * Dialog zakupu zapasów do obozowiska
   */
  async _onBuySuppliesDialog() {
    const gang = GangData.getGang(this.actor);
    const pricePerUnit = gang.camp?.supplyPricePennies || 12;
    const priceFormatted = UnderworldOperations.formatPennies(pricePerUnit);
    const treasuryPennies = GangData.treasuryToPennies(gang.treasury);
    const pursePennies = UnderworldOperations.getActorPennies(this.actor);

    const maxCanBuy = Math.max(0, 30 - (gang.supplies || 0));
    if (maxCanBuy === 0) {
      ui.notifications.warn(t("Supplies.Full"));
      return;
    }

    const suppliesHtml = `
      <div class="underworld-dialog" style="font-size: 0.9rem;">
        <div style="margin-bottom: 8px; background: rgba(0,0,0,0.03); padding: 8px; border-radius: 4px; border: 1px solid #c8b8a6;">
          <div>${t("SuppliesDialog.Price", { price: priceFormatted })}</div>
          <div>${t("SuppliesDialog.Current", { value: gang.supplies || 0 })}</div>
        </div>

        <div style="margin-bottom: 10px;">
          <label style="font-weight: bold; display: block; margin-bottom: 4px;">${t("SuppliesDialog.HowMany", { max: maxCanBuy })}</label>
          <input type="number" id="buy-supply-count" min="1" max="${maxCanBuy}" value="5" style="width: 80px; padding: 4px; text-align: center; font-size: 1rem; font-weight: bold;" />
        </div>

        <div style="margin-bottom: 10px;">
          <label style="font-weight: bold; display: block; margin-bottom: 4px;">${t("SuppliesDialog.Source")}</label>
          <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.84rem;">
            <label style="display: flex; align-items: center; gap: 6px;">
              <input type="radio" name="supply_source" value="treasury" checked />
              <span>${t("SuppliesDialog.FromStash", { amount: UnderworldOperations.formatPennies(treasuryPennies) })}</span>
            </label>
            <label style="display: flex; align-items: center; gap: 6px;">
              <input type="radio" name="supply_source" value="purse" />
              <span>${t("SuppliesDialog.FromPurse", { amount: UnderworldOperations.formatPennies(pursePennies) })}</span>
            </label>
          </div>
        </div>
      </div>
    `;

    await DialogV2.wait({
      window: { title: t("SuppliesDialog.Title") },
      content: dialogContent(suppliesHtml),
      buttons: [
        {
          action: "buy",
          icon: "fas fa-shopping-cart",
          label: t("SuppliesDialog.Buy"),
          default: true,
          callback: async (event, button, dialog) => {
            const count = Math.max(1, parseInt(dialogValue(dialog, "#buy-supply-count"), 10) || 1);
            const source = dialogValue(dialog, 'input[name="supply_source"]:checked') || "treasury";
            await UnderworldOperations.buySupplies(this.actor, count, source);
            this.render();
          }
        },
        { action: "cancel", label: "WFRP4E_COMPANION.Cancel" }
      ],
      rejectClose: false
    });
  }

  /**
   * Dialog ustalenia ceny jednostkowej zapasów (tylko MG)
   */
  async _onSetSupplyPriceDialog() {
    if (!game.user.isGM) return;
    const gang = GangData.getGang(this.actor);
    const currentPrice = gang.camp?.supplyPricePennies || 12;

    const priceHtml = `
      <div class="underworld-dialog" style="font-size: 0.9rem;">
        <p>${t("PriceDialog.Intro")}</p>
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
          <input type="number" id="supply-price-input" min="1" value="${currentPrice}" style="width: 80px; padding: 4px; text-align: center; font-weight: bold; font-size: 1rem;" />
          <span>${t("PriceDialog.Unit")}</span>
        </div>
        <div style="font-size: 0.78rem; color: #666;">
          ${t("PriceDialog.Hint")}
        </div>
      </div>
    `;

    await DialogV2.wait({
      window: { title: t("PriceDialog.Title") },
      content: dialogContent(priceHtml),
      buttons: [
        {
          action: "save",
          icon: "fas fa-check",
          label: t("PriceDialog.Save"),
          default: true,
          callback: async (event, button, dialog) => {
            const price = Math.max(1, parseInt(dialogValue(dialog, "#supply-price-input"), 10) || 12);
            await UnderworldOperations.setSupplyPrice(this.actor, price);
            this.render();
          }
        },
        { action: "cancel", label: "WFRP4E_COMPANION.Cancel" }
      ],
      rejectClose: false
    });
  }

  // ════════════════════════════════════════════
  // ZAPIS FORMULARZA
  // ════════════════════════════════════════════

  static async #onSubmitForm(event, form, formData) {
    const gang = GangData.getGang(this.actor);
    const expanded = foundry.utils.expandObject(formData.object);

    // Sanityzacja nazwy i motta szajki (zabezpieczenie przed tablicami i duplikatami)
    if (expanded.name !== undefined) {
      if (Array.isArray(expanded.name)) {
        const custom = expanded.name.find(n => typeof n === "string" && n.trim() && n.trim() !== gang.name);
        expanded.name = custom || expanded.name[0] || gang.name || t("DefaultGangName");
      }
      if (typeof expanded.name === "string") {
        expanded.name = expanded.name.trim();
        if (!expanded.name) expanded.name = gang.name || t("DefaultGangName");
      }
    }

    if (expanded.motto !== undefined) {
      if (Array.isArray(expanded.motto)) {
        const custom = expanded.motto.find(m => typeof m === "string" && m.trim() && m.trim() !== gang.motto);
        expanded.motto = custom || expanded.motto[0] || gang.motto || "";
      }
      if (typeof expanded.motto === "string") {
        expanded.motto = expanded.motto.trim();
      }
    }

    // Zabezpieczenie skarbca (Gracz NIE może edytować ręcznie skarbca z pól tekstowych!)
    if (!game.user.isGM) {
      expanded.treasury = gang.treasury;
      expanded.morale = gang.morale;
      expanded.supplies = gang.supplies;
      expanded.notoriety = gang.notoriety;
    } else if (expanded.treasury) {
      if (expanded.treasury.gc !== undefined) expanded.treasury.gc = Math.max(0, parseInt(expanded.treasury.gc, 10) || 0);
      if (expanded.treasury.ss !== undefined) expanded.treasury.ss = Math.max(0, parseInt(expanded.treasury.ss, 10) || 0);
      if (expanded.treasury.d !== undefined) expanded.treasury.d = Math.max(0, parseInt(expanded.treasury.d, 10) || 0);
    }
    if (expanded.morale !== undefined) expanded.morale = Math.max(0, Math.min(10, parseInt(expanded.morale, 10) || 0));
    if (expanded.supplies !== undefined) expanded.supplies = Math.max(0, Math.min(30, parseInt(expanded.supplies, 10) || 0));
    if (expanded.notoriety !== undefined) expanded.notoriety = Math.max(0, Math.min(5, parseInt(expanded.notoriety, 10) || 0));

    // Bezpieczne mapowanie roster
    if (expanded.roster) {
      const newRoster = [];
      for (const idx of Object.keys(expanded.roster)) {
        const item = expanded.roster[idx];
        if (item && item.id) {
          const existing = gang.roster.find(n => n.id === item.id);
          if (existing) {
            if (!item.assignment) item.assignment = existing.assignment;
            if (item.gear === undefined) item.gear = existing.gear || [];
            if (item.rank === undefined) item.rank = existing.rank || 0;
            else item.rank = Number(item.rank) || 0;
            if (item.operationalXP === undefined) item.operationalXP = existing.operationalXP || 0;
            else item.operationalXP = Number(item.operationalXP) || 0;
            if (item.customBonus === undefined) item.customBonus = existing.customBonus || 0;
            else item.customBonus = Number(item.customBonus) || 0;
            if (item.extraStrength === undefined) item.extraStrength = existing.extraStrength || "";
            if (existing.strengths) item.strengths = existing.strengths;
            if (existing.flaws) item.flaws = existing.flaws;
            if (existing.narrativePerks) item.narrativePerks = existing.narrativePerks;

            // Ochrona przed zmianą przez gracza (tylko MG może zmieniać rolę, zalety i wady)
            if (!game.user.isGM) {
              item.role = existing.role || "bodyguard";
              item.strength = existing.strength || "";
              item.flaw = existing.flaw || "";
              item.status = existing.status || "ready";
              item.rank = existing.rank || 0;
              item.operationalXP = existing.operationalXP || 0;
              item.customBonus = existing.customBonus || 0;
              item.gear = existing.gear || [];
            } else {
              if (item.role) item.role = UnderworldTables.roleForCompany(item.role, gang);
              else item.role = existing.role || "bodyguard";
            }
            // Druga rola: gracz jej nie zmienia formularzem (kupuje ją za DO), MG ustawia ją z listy
            const wantedRole2 = game.user.isGM && item.role2 !== undefined ? item.role2 : existing.role2;
            item.role2 = wantedRole2 && UnderworldTables.ROLES_CONFIG[wantedRole2] && wantedRole2 !== item.role ? wantedRole2 : "";
          } else if (item.role) {
            item.role = UnderworldTables.roleForCompany(item.role, gang);
          }
          newRoster.push(item);
        }
      }
      expanded.roster = newRoster;
      if (!game.user.isGM) {
        const submittedById = new Map(newRoster.map(item => [item.id, item]));
        expanded.roster = gang.roster.map(existing => {
          const submitted = submittedById.get(existing.id);
          const name = typeof submitted?.name === "string" ? submitted.name.trim().slice(0, 80) : existing.name;
          return { ...existing, name: name || existing.name };
        });
      }
    }

    // Zmiana typu kompanii z członkami przelicza ich role, więc wymaga potwierdzenia
    const typeChanged = expanded.type !== undefined && expanded.type !== gang.type;
    if (typeChanged && gang.roster.length) {
      const confirmed = await DialogV2.confirm({
        window: { title: t("InfoTab.TypeChangeTitle") },
        content: `<p>${t("InfoTab.TypeChangeText", { count: gang.roster.length })}</p>`,
        rejectClose: false
      });
      if (!confirmed) {
        this.render();
        return;
      }
    }

    const baseGang = foundry.utils.deepClone(gang);
    const merged = foundry.utils.mergeObject(gang, expanded, { inplace: false });
    if (typeChanged) {
      for (const npc of merged.roster) {
        npc.role = UnderworldTables.roleForCompany(npc.role, merged);
        const second = npc.role2 ? UnderworldTables.roleForCompany(npc.role2, merged) : "";
        npc.role2 = second && second !== npc.role ? second : "";
      }
    }
    await GangData.saveGang(this.actor, merged, baseGang);
    this.render();
  }
}
