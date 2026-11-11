/**
 * WFRP4e - Podziemie: Szajka Człowieka
 * Główny punkt startowy modułu Foundry VTT
 */

import { GangData } from "./scripts/gang-data.mjs";
import { GangSheet } from "./scripts/gang-sheet.mjs";
import { UnderworldOperations } from "./scripts/operations.mjs";
import { UnderworldTables } from "./scripts/tables-data.mjs";
import { UnderworldRollTables } from "./scripts/roll-tables.mjs";
import { OrderEffects } from "./scripts/order-effects.mjs";
import { registry, registerSheetButton, addTokenTool, registerQuery, queryGM } from "../wfrp4e-companion-lib/scripts/companion-lib.mjs";
import { t, tFor } from "./scripts/i18n.mjs";
import { MISSIONS } from "./scripts/world-data.mjs";

const MODULE_ID = "wfrp4e-underworld";
const recruitmentLocks = new Set();

/* -------------------------------------------- */
/*  Inicjalizacja Modułu                        */
/* -------------------------------------------- */

Hooks.once("init", async function () {
  console.log(`${MODULE_ID} | Underworld Crew – init`);

  // Rejestracja w Centrum Dodatków dla MG (GM Hub)
  registry.registerFeature({
    id: "underworld",
    name: "WFRP4E_COMPANION.Features.Underworld",
    icon: "fas fa-skull-crossbones",
    description: "WFRP4E_COMPANION.Features.UnderworldDesc",
    module: MODULE_ID,
    open: (actor) => game.underworld.openGangSheet(actor)
  });

  // Wybór rekruta z czatu – gracz pyta MG, a serwer potwierdza, kto pyta
  registerQuery(`${MODULE_ID}.recruit`, onRecruitQuery);

  // 1. Rejestracja ustawień modułu
  game.settings.register(MODULE_ID, "cutPercentage", {
    name: "UNDERWORLD.Settings.Cut.Name",
    hint: "UNDERWORLD.Settings.Cut.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 25
  });

  game.settings.register(MODULE_ID, "cycleMode", {
    name: "UNDERWORLD.Settings.Cycle.Name",
    hint: "UNDERWORLD.Settings.Cycle.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      daily: "UNDERWORLD.Settings.Cycle.Daily",
      weekly: "UNDERWORLD.Settings.Cycle.Weekly"
    },
    default: "daily",
    onChange: () => {
      for (const app of foundry.applications.instances.values()) {
        if (app instanceof GangSheet) app.render();
      }
    }
  });

  game.settings.register(MODULE_ID, "dailyQueue", {
    name: "UNDERWORLD.Settings.Queue.Name",
    hint: "UNDERWORLD.Settings.Queue.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {
      for (const app of foundry.applications.instances.values()) {
        if (app instanceof GangSheet) app.render();
      }
    }
  });

  // Wygląd panelu: nowa „Księga Kompanii” albo dotychczasowy (na czas przebudowy oba działają)
  game.settings.register(MODULE_ID, "sheetStyle", {
    name: "UNDERWORLD.Settings.SheetStyle.Name",
    hint: "UNDERWORLD.Settings.SheetStyle.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      ledger: "UNDERWORLD.Settings.SheetStyle.Ledger",
      classic: "UNDERWORLD.Settings.SheetStyle.Classic"
    },
    default: "ledger",
    onChange: (value) => {
      document.body.classList.toggle("uw-ledger-chat", value !== "classic");
      for (const app of foundry.applications.instances.values()) {
        if (app instanceof GangSheet) app.render();
      }
    }
  });

  game.settings.register(MODULE_ID, "customRumors", {
    name: "Custom rumours",
    hint: "Rumours defined by the GM.",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(MODULE_ID, "customCampEvents", {
    name: "Custom camp events",
    hint: "Night camp events defined by the GM.",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  // Tabele RollTable: wersja wzorców w kompendium i jednorazowe utworzenie tabel świata
  game.settings.register(MODULE_ID, "tablesSeedVersion", { scope: "world", config: false, type: Number, default: 0 });
  game.settings.register(MODULE_ID, "tablesSeedLang", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(MODULE_ID, "worldTablesCreated", { scope: "world", config: false, type: Boolean, default: false });
  game.settings.register(MODULE_ID, "worldTablesCreatedKeys", { scope: "world", config: false, type: Array, default: [] });
  registerQuery(`${MODULE_ID}.drawTable`, data => UnderworldRollTables.onDrawQuery(data));
  registerQuery(OrderEffects.QUERY_NAME, (data, context) => OrderEffects.onQuery(data, context));

  game.settings.register(MODULE_ID, "displayedRumors", {
    name: "Shown rumours (history)",
    hint: "Ids of rumours already shown in play (prevents repeats).",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(MODULE_ID, "displayedEvents", {
    name: "Shown events (history)",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(MODULE_ID, "lastReminderDay", {
    name: "Last camp reminder day",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });


  // 2. Preload szablonów Handlebars
  await foundry.applications.handlebars.loadTemplates([
    `modules/${MODULE_ID}/templates/gang-sheet.hbs`,
    `modules/${MODULE_ID}/templates/parts/ledger-header.hbs`,
    `modules/${MODULE_ID}/templates/parts/ledger-nav.hbs`,
    `modules/${MODULE_ID}/templates/parts/ledger-roster.hbs`,
    `modules/${MODULE_ID}/templates/parts/ledger-plan.hbs`,
    `modules/${MODULE_ID}/templates/parts/ledger-camp.hbs`,
    `modules/${MODULE_ID}/templates/parts/ledger-chest.hbs`,
    `modules/${MODULE_ID}/templates/parts/ledger-chronicle.hbs`,
    `modules/${MODULE_ID}/templates/parts/ledger-orders.hbs`,
    `modules/${MODULE_ID}/templates/parts/info.hbs`,
    `modules/${MODULE_ID}/templates/parts/dashboard.hbs`,
    `modules/${MODULE_ID}/templates/parts/roster.hbs`,
    `modules/${MODULE_ID}/templates/parts/tasks.hbs`,
    `modules/${MODULE_ID}/templates/parts/loot.hbs`,
    `modules/${MODULE_ID}/templates/parts/tactics.hbs`,
    `modules/${MODULE_ID}/templates/chat/mission-card.hbs`,
    `modules/${MODULE_ID}/templates/chat/camp-rest.hbs`,
    `modules/${MODULE_ID}/templates/chat/recruit-proposals.hbs`,
    `modules/${MODULE_ID}/templates/chat/tactic-card.hbs`
  ]);

  // 3. Rejestracja pomocników Handlebars (porównania i select są w wfrp4e-companion-lib)
  Handlebars.registerHelper("underworldAssignmentBadge", function (assignment, status) {
    const map = {
      scout: { icon: "fas fa-binoculars", label: "Badges.scout", cls: "scout" },
      shadow: { icon: "fas fa-user-secret", label: "Badges.shadow", cls: "shadow" },
      tavern: { icon: "fas fa-wine-glass-alt", label: "Badges.tavern", cls: "tavern" },
      procure: { icon: "fas fa-bread-slice", label: "Badges.procure", cls: "procure" },
      pickpocket: { icon: "fas fa-mask", label: "Badges.pickpocket", cls: "pickpocket" },
      fence: { icon: "fas fa-balance-scale", label: "Badges.fence", cls: "fence" },
      burglary: { icon: "fas fa-key", label: "Badges.burglary", cls: "pickpocket" },
      farm_theft: { icon: "fas fa-horse", label: "Badges.farm_theft", cls: "procure" },
      poaching: { icon: "fas fa-paw", label: "Badges.poaching", cls: "procure" },
      highway_robbery: { icon: "fas fa-road", label: "Badges.highway_robbery", cls: "intimidate" },
      mine_raid: { icon: "fas fa-hammer", label: "Badges.mine_raid", cls: "intimidate" },
      racket: { icon: "fas fa-store", label: "Badges.racket", cls: "intimidate" },
      intimidate: { icon: "fas fa-fist-raised", label: "Badges.intimidate", cls: "intimidate" },
      rumor_spread: { icon: "fas fa-comment-dots", label: "Badges.rumor_spread", cls: "rumor" },
      bribe: { icon: "fas fa-hand-holding-usd", label: "Badges.bribe", cls: "bribe" },
      distract: { icon: "fas fa-bomb", label: "Badges.distract", cls: "distract" },
      sabotage: { icon: "fas fa-hammer", label: "Badges.sabotage", cls: "sabotage" },
      smuggle: { icon: "fas fa-suitcase", label: "Badges.smuggle", cls: "smuggle" },
      forge: { icon: "fas fa-scroll", label: "Badges.forge", cls: "forge" },
      cover_tracks: { icon: "fas fa-shoe-prints", label: "Badges.cover_tracks", cls: "cover-tracks" },
      tend_wounded: { icon: "fas fa-medkit", label: "Badges.tend_wounded", cls: "tend-wounded" },
      guard: { icon: "fas fa-shield-alt", label: "Badges.guard", cls: "guard" },
      retinue: { icon: "fas fa-user-shield", label: "Badges.retinue", cls: "retinue" }
    };
    // Zlecenia typów kompanii opisane danymi niosą własną ikonę i kolor plakietki
    const dataMission = MISSIONS[assignment]?.data ? MISSIONS[assignment] : null;
    const item = map[assignment] ?? (dataMission && { icon: dataMission.icon, label: `Badges.${assignment}`, cls: dataMission.badge });

    if (item && status !== "arrested") {
      return new Handlebars.SafeString(`<span class="badge-mission ${item.cls}"><i class="${item.icon}"></i> ${t(item.label)}</span>`);
    }

    if (status === "busy") {
      return new Handlebars.SafeString(`<span class="badge-mission busy"><i class="fas fa-hourglass-half"></i> ${t("Status.Busy")}</span>`);
    }
    if (status === "resting") {
      return new Handlebars.SafeString(`<span class="badge-mission resting"><i class="fas fa-bed"></i> ${t("Status.Resting")}</span>`);
    }
    if (status === "wounded") {
      return new Handlebars.SafeString(`<span class="badge-mission wounded"><i class="fas fa-heart-broken"></i> ${t("Status.Wounded")}</span>`);
    }
    if (status === "dead") {
      return new Handlebars.SafeString(`<span class="badge-mission dead"><i class="fas fa-skull"></i> ${t("Status.Dead")}</span>`);
    }
    if (status === "arrested") {
      return new Handlebars.SafeString(`<span class="badge-mission wounded"><i class="fas fa-handcuffs"></i> ${t("Status.Arrested")}</span>`);
    }

    return new Handlebars.SafeString(`<span class="badge-mission ready"><i class="fas fa-check"></i> ${t("Status.Ready")}</span>`);
  });

  Handlebars.registerHelper("underworldRoleBadge", function (role) {
    const norm = UnderworldTables.normalizeRole(role);
    const cfg = UnderworldTables.ROLES_CONFIG[norm] || UnderworldTables.ROLES_CONFIG["bodyguard"];
    return new Handlebars.SafeString(`
      <span class="role-badge ${cfg.badgeClass}" title="${cfg.shortDesc}">
        <i class="${cfg.icon}"></i> ${cfg.name}
      </span>
    `);
  });

  // Ikona ze sprite'a modułu: {{uwIcon "ui-morale" "klasa"}}; kolor dziedziczy z CSS (currentColor)
  const spriteUrl = foundry.utils.getRoute(`modules/${MODULE_ID}/assets/ui/sprite.svg`);
  Handlebars.registerHelper("uwIcon", function (id, cls) {
    const extra = typeof cls === "string" ? ` ${Handlebars.escapeExpression(cls)}` : "";
    return new Handlebars.SafeString(`<svg class="uw-icon${extra}" aria-hidden="true" focusable="false"><use href="${spriteUrl}#${Handlebars.escapeExpression(id)}"></use></svg>`);
  });

  // Tekst modułu dla typu kompanii z danych szablonu (karty czatu: typ ostatnio odczytanej kompanii)
  Handlebars.registerHelper("underworldT", function (key, options) {
    const hash = options.hash ?? {};
    return tFor(options.data?.root?.companyType, key, Object.keys(hash).length ? hash : undefined);
  });

  Handlebars.registerHelper("underworldRoleSelectOptions", function (currentRole, options) {
    const company = options?.data?.root?.companyType;
    const norm = currentRole ? UnderworldTables.roleForCompany(currentRole, company) : null;
    let html = "";
    for (const [key, cfg] of UnderworldTables.rolesFor(company)) {
      const selected = norm === key ? "selected" : "";
      html += `<option value="${key}" ${selected}>${cfg.name}</option>`;
    }
    return new Handlebars.SafeString(html);
  });

  Handlebars.registerHelper("underworldFormatCoins", function (treasury) {
    const coins = treasury ?? {};
    return `${coins.gc || 0} ${t("Units.GC")}, ${coins.ss || 0} ${t("Units.SS")}, ${coins.d || 0} ${t("Units.BP")}`;
  });

  Handlebars.registerHelper("underworldStrengthBadges", function (strengths, legacyStrength) {
    const list = Array.isArray(strengths) && strengths.length > 0 ? strengths : [legacyStrength].filter(Boolean);
    if (list.length === 0) return new Handlebars.SafeString(`<em class="text-muted" style="font-size: 0.78rem;">${t("None")}</em>`);
    const all = UnderworldTables.TRAITS_CONFIG?.strengths || {};
    let html = '';
    for (const sid of list) {
      const cfg = all[sid] || { name: sid, desc: "" };
      const escapedName = Handlebars.escapeExpression(cfg.name);
      const escapedDesc = Handlebars.escapeExpression(cfg.desc || "");
      const tooltip = `<strong>${escapedName}</strong><br>${escapedDesc}`;
      html += `<span class="trait-badge trait-strength" data-tooltip="${tooltip}"><i class="${cfg.icon || 'fas fa-star'}"></i> ${escapedName}</span> `;
    }
    return new Handlebars.SafeString(html);
  });

  Handlebars.registerHelper("underworldFlawBadges", function (flaws, legacyFlaw) {
    const list = Array.isArray(flaws) && flaws.length > 0 ? flaws : [legacyFlaw].filter(Boolean);
    if (list.length === 0) return new Handlebars.SafeString(`<em class="text-muted" style="font-size: 0.78rem;">${t("None")}</em>`);
    const all = UnderworldTables.TRAITS_CONFIG?.flaws || {};
    let html = '';
    for (const fid of list) {
      const cfg = all[fid] || { name: fid, desc: "" };
      const escapedName = Handlebars.escapeExpression(cfg.name);
      const escapedDesc = Handlebars.escapeExpression(cfg.desc || "");
      const tooltip = `<strong>${escapedName}</strong><br>${escapedDesc}`;
      html += `<span class="trait-badge trait-flaw" data-tooltip="${tooltip}"><i class="${cfg.icon || 'fas fa-exclamation-triangle'}"></i> ${escapedName}</span> `;
    }
    return new Handlebars.SafeString(html);
  });

  Handlebars.registerHelper("underworldPerkBadges", function (perks) {
    if (!Array.isArray(perks) || perks.length === 0) return "";
    const all = UnderworldTables.NARRATIVE_PERKS || {};
    let html = '';
    for (const pid of perks) {
      const cfg = all[pid] || { name: pid, desc: "" };
      const escapedName = Handlebars.escapeExpression(cfg.name);
      const escapedDesc = Handlebars.escapeExpression(cfg.desc || "");
      const tooltip = `<strong>${escapedName}</strong><br>${escapedDesc}`;
      html += `<span class="trait-badge trait-perk" data-tooltip="${tooltip}"><i class="${cfg.icon || 'fas fa-feather-alt'}"></i> ${escapedName}</span> `;
    }
    return new Handlebars.SafeString(html);
  });

  Handlebars.registerHelper("underworldRankBadge", function (rank, operationalXP) {
    const level = Number(rank) || 0;
    const currentOperationalXP = Number(operationalXP) || 0;
    const ranks = UnderworldTables.RANKS_CONFIG;
    const r = ranks[level] || ranks[0];
    const escapedName = Handlebars.escapeExpression(r.name);
    const escapedDesc = Handlebars.escapeExpression(r.desc || "");
    return new Handlebars.SafeString(`
      <span class="rank-badge ${r.badgeClass}" data-tooltip="<strong>${escapedName}</strong><br>${escapedDesc}">
        <i class="${r.icon}"></i> ${escapedName} <small class="rank-xp-val">(${currentOperationalXP} ${t("Units.OXP")})</small>
      </span>
    `);
  });

  // Krótka odznaka rangi do nagłówka karty (bez DO); Żółtodziób nie dostaje odznaki
  Handlebars.registerHelper("underworldRankChip", function (rank) {
    const level = Number(rank) || 0;
    const r = UnderworldTables.RANKS_CONFIG?.[level];
    if (!level || !r) return "";
    return new Handlebars.SafeString(
      `<span class="rank-chip rank-level-${level}" data-tooltip="${Handlebars.escapeExpression(r.desc || "")}"><i class="${r.icon}"></i> ${Handlebars.escapeExpression(r.name)}</span>`
    );
  });

  // Parametry zlecenia przy przycisku „Przydziel”: próg, umiejętność, ryzyko porażki, spodziewany efekt
  Handlebars.registerHelper("underworldMissionMeta", function (type) {
    const info = UnderworldOperations.MISSION_INFO?.[type];
    if (!info) return "";
    const riskLabels = {
      low: { cls: "risk-low", text: t("Risk.low") },
      stealth: { cls: "risk-stealth", text: t("Risk.stealth") },
      violent: { cls: "risk-violent", text: t("Risk.violent") }
    };
    const esc = Handlebars.escapeExpression;
    const chips = [];
    if (info.target) chips.push(`<span class="meta-chip meta-target" data-tooltip="${t("Meta.TargetHint")}"><i class="fas fa-bullseye"></i> ${t("Meta.Target", { value: info.target })}</span>`);
    if (info.skill) chips.push(`<span class="meta-chip meta-skill" data-tooltip="${t("Meta.SkillHint")}"><i class="fas fa-dice-d20"></i> ${esc(game.i18n.localize(info.skill))}</span>`);
    if (info.risk) chips.push(`<span class="meta-chip ${riskLabels[info.risk].cls}"><i class="fas fa-triangle-exclamation"></i> ${riskLabels[info.risk].text}</span>`);
    if (info.reward) chips.push(`<span class="meta-chip meta-reward"><i class="fas fa-sack-dollar"></i> ${esc(info.reward)}</span>`);
    return new Handlebars.SafeString(`<div class="mission-meta">${chips.join("")}</div>`);
  });

  Handlebars.registerHelper("underworldGearIcons", function (gear) {
    if (!Array.isArray(gear) || gear.length === 0) return "";
    const config = UnderworldTables.GEAR_CONFIG || {};
    let html = '<span class="npc-gear-tags" style="display: inline-flex; gap: 3px; align-items: center; margin-left: 4px;">';
    for (const g of gear) {
      const item = config[g];
      if (item) {
        html += `<span class="gear-tag" title="${item.name}: ${item.bonusDesc}"><i class="${item.icon}"></i> ${item.name}</span>`;
      }
    }
    html += '</span>';
    return new Handlebars.SafeString(html);
  });

  Handlebars.registerHelper("underworldNotorietyBadge", function (level) {
    const lvl = Number(level) || 0;
    const icons = ["fas fa-ghost", "fas fa-comment-dots", "fas fa-eye", "fas fa-scroll", "fas fa-crosshairs", "fas fa-skull-crossbones"];
    const index = icons[lvl] ? lvl : 0;
    const c = { icon: icons[index], cls: `notoriety-${index}`, name: t(`Notoriety.${index}.Name`), desc: t(`Notoriety.${index}.Desc`) };
    return new Handlebars.SafeString(`
      <span class="notoriety-badge ${c.cls}" title="${c.desc}">
        <i class="${c.icon}"></i> <strong>${lvl}/5: ${c.name}</strong>
      </span>
    `);
  });

  Handlebars.registerHelper("underworldRelationBadge", function (relation) {
    const icons = {
      favorite: "fas fa-star", trusted: "fas fa-handshake", neutral: "fas fa-balance-scale",
      strained: "fas fa-exclamation-triangle", hostile: "fas fa-skull"
    };
    const id = icons[relation] ? relation : "neutral";
    const r = { icon: icons[id], cls: `relation-${id}`, name: t(`Relation.${id}.Name`), desc: t(`Relation.${id}.Desc`) };
    return new Handlebars.SafeString(`
      <span class="relation-badge ${r.cls}" title="${r.desc}">
        <i class="${r.icon}"></i> ${r.name}
      </span>
    `);
  });

  // Helper: opcje selecta dla predefiniowanych Zalet
  Handlebars.registerHelper("underworldStrengthSelectOptions", function (currentStrength) {
    const strengths = UnderworldTables.TRAITS_CONFIG?.strengths || {};
    let html = `<option value="" ${!currentStrength ? 'selected' : ''}>— ${t("None")} —</option>`;
    for (const [key, cfg] of Object.entries(strengths)) {
      const selected = currentStrength === key ? "selected" : "";
      html += `<option value="${key}" ${selected}>${cfg.name} (${cfg.desc})</option>`;
    }
    return new Handlebars.SafeString(html);
  });

  // Helper: opcje selecta dla predefiniowanych Wad
  Handlebars.registerHelper("underworldFlawSelectOptions", function (currentFlaw) {
    const flaws = UnderworldTables.TRAITS_CONFIG?.flaws || {};
    let html = `<option value="" ${!currentFlaw ? 'selected' : ''}>— ${t("None")} —</option>`;
    for (const [key, cfg] of Object.entries(flaws)) {
      const selected = currentFlaw === key ? "selected" : "";
      html += `<option value="${key}" ${selected}>${cfg.name} (${cfg.desc})</option>`;
    }
    return new Handlebars.SafeString(html);
  });

  // Helper: etykieta i opis zalety
  Handlebars.registerHelper("underworldTraitName", function (traitId, type) {
    if (!traitId) return "";
    const pool = type === "flaw" ? UnderworldTables.TRAITS_CONFIG?.flaws : UnderworldTables.TRAITS_CONFIG?.strengths;
    const trait = pool?.[traitId];
    return trait ? trait.name : traitId;
  });
});

/* -------------------------------------------- */
/*  Po załadowaniu świata (Ready)               */
/* -------------------------------------------- */

Hooks.once("ready", function () {
  console.log(`${MODULE_ID} | Ready.`);
  // Karty czatu w wyglądzie Księgi (to samo ustawienie klienta co panel kompanii)
  document.body.classList.toggle("uw-ledger-chat", game.settings.get(MODULE_ID, "sheetStyle") !== "classic");

  // Wczytanie wbudowanej bazy plotek i wydarzeń, potem tabele RollTable (kompendium i świat – tylko MG)
  UnderworldTables.loadWorldContent()
    .then(() => UnderworldRollTables.seedCompendium())
    .then(() => UnderworldRollTables.ensureWorldTables())
    .catch(err => console.error(`${MODULE_ID} | Could not prepare the rumour and event tables:`, err));

  // 2. Eksport API do konsoli i makr
  game.underworld = {
    GangData,
    GangSheet,
    UnderworldOperations,
    UnderworldTables,
    gmHub: registry,
    openHub: () => registry.openHub(),
    openGangSheet: (actor) => {
      try {
        let targetActor = actor || canvas.tokens?.controlled[0]?.actor || game.user.character;
        if (!game.user.isGM && (!targetActor || !targetActor.isOwner)) {
          targetActor = game.actors.find(a => a.type === "character" && a.isOwner);
        }
        if (targetActor?.type !== "character") targetActor = null;
        if (!targetActor) {
          ui.notifications.warn(t("Notify.SelectCharacter"));
          return;
        }

        // Jeśli to gracz, upewnij się, że MG odblokował mu tę funkcję
        if (!game.user.isGM && !targetActor.isOwner) {
          ui.notifications.warn(t("Notify.OwnCharacterOnly"));
          return;
        }
        if (!game.user.isGM && !registry.isFeatureUnlocked(targetActor, "underworld")) {
          ui.notifications.warn(t("Notify.Locked"));
          return;
        }

        openSheetFor(targetActor);
      } catch (err) {
        console.error(`${MODULE_ID} | Could not open the crew sheet:`, err);
        ui.notifications.error(t("Notify.OpenFailed", { error: err.message }));
      }
    }
  };

  // Obsługa przycisku rozpoczęcia postoju bezpośrednio z karty na czacie
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest?.(".btn-chat-open-rest")) return;
    ev.preventDefault();
    const character = canvas.tokens?.controlled[0]?.actor || game.user.character || game.actors.find(a => a.type === "character" && a.isOwner);

    if (character && character.type === "character" && (game.user.isGM || (character.isOwner && registry.isFeatureUnlocked(character, "underworld")))) {
      new GangSheet(character)._onCampRestDialog();
    } else {
      ui.notifications.info(t("Notify.SelectChiefForCamp"));
    }
  });
});

/* -------------------------------------------- */
/*  Komendy na czacie                           */
/* -------------------------------------------- */

Hooks.on("chatMessage", (chatLog, message) => {
  const clean = message.trim().toLowerCase();

  // Komenda dla Szajki
  if (["/szajka", "/gang", "/podziemie", "/crew", "/underworld"].includes(clean)) {
    game.underworld.openGangSheet();
    return false;
  }
});

/* -------------------------------------------- */
/*  Śledzenie czasu w świecie gry (3:00 w nocy) */
/* -------------------------------------------- */

Hooks.on("updateWorldTime", (worldTime, delta) => {
  if (!game.user.isGM) return;
  UnderworldOperations.checkCalendarReminder(worldTime);
});

/* -------------------------------------------- */
/*  Synchronizacja otwartych okien szajki       */
/* -------------------------------------------- */

Hooks.on("updateActor", (actor, diff) => {
  if (diff?.flags?.["wfrp4e-underworld"]) {
    foundry.applications.instances.get(GangSheet.appIdFor(actor))?.render();
  }
});

/** Otwiera (lub przywołuje na wierzch) okno szajki danego aktora. */
function openSheetFor(actor) {
  const existing = foundry.applications.instances.get(GangSheet.appIdFor(actor));
  if (existing) {
    existing.render({ force: true });
    existing.bringToFront();
    return;
  }
  new GangSheet(actor).render({ force: true });
}

/* -------------------------------------------- */
/*  Przycisk na karcie postaci i pasek narzędzi */
/* -------------------------------------------- */

registerSheetButton({
  featureId: "underworld",
  className: "open-underworld-gang",
  icon: "fa-solid fa-skull-crossbones",
  label: "UNDERWORLD.Title",
  action: "underworldGang",
  legacyClasses: ["underworld-sheet-tab"],
  onClick: (actor) => game.underworld.openGangSheet(actor)
});

// Bezpośredni skrót do Szajki dla MG
addTokenTool({
  name: "underworld-manager",
  title: "UNDERWORLD.Title",
  icon: "fas fa-user-secret",
  onClick: () => {
    const controlled = canvas.tokens?.controlled[0]?.actor;
    const character = controlled || game.actors.find(a => a.type === "character" && a.hasPlayerOwner);
    if (character) openSheetFor(character);
    else ui.notifications.info(t("Notify.SelectChief"));
  }
});

/* -------------------------------------------- */
/*  Obsługa Rekrutacji przez Czat               */
/* -------------------------------------------- */

async function executeRecruitChoice({ actorId, messageId, candidateId, userName }) {
  if (!game.user.isGM) return;
  if (recruitmentLocks.has(messageId)) return;
  const message = game.messages.get(messageId);
  if (!message) return;

  const currentChosen = message.getFlag("wfrp4e-underworld", "chosen");
  if (currentChosen) {
    ui.notifications.warn(t("Recruit.AlreadyChosen", { name: currentChosen }));
    return;
  }

  const storedActorId = message.getFlag("wfrp4e-underworld", "actorId");
  if (!storedActorId || (actorId && actorId !== storedActorId)) return;
  const actor = game.actors.get(storedActorId);
  if (!actor) {
    ui.notifications.error(t("Recruit.NoActor"));
    return;
  }

  const candidates = message.getFlag("wfrp4e-underworld", "candidates") || [];
  const chosenCandidate = candidates.find(c => c.id === candidateId);
  if (!chosenCandidate) {
    ui.notifications.error(t("Recruit.NoCandidate"));
    return;
  }

  recruitmentLocks.add(messageId);
  try {
    await message.setFlag("wfrp4e-underworld", "chosen", "__processing__");
  } catch (err) {
    recruitmentLocks.delete(messageId);
    throw err;
  }

  // Dodaj rekruta do szajki
  const gang = GangData.getGang(actor);
  if (!Array.isArray(gang.roster)) gang.roster = [];

  const newNpc = {
    id: foundry.utils.randomID ? foundry.utils.randomID() : Math.random().toString(36).substring(2, 11),
    actorId: null,
    name: chosenCandidate.name,
    img: chosenCandidate.img || "icons/svg/mystery-man.svg",
    role: chosenCandidate.role || "bodyguard",
    strengths: Array.isArray(chosenCandidate.strengths) ? chosenCandidate.strengths : [chosenCandidate.strength].filter(Boolean),
    flaws: Array.isArray(chosenCandidate.flaws) ? chosenCandidate.flaws : [chosenCandidate.flaw].filter(Boolean),
    strength: chosenCandidate.strength || "",
    flaw: chosenCandidate.flaw || "",
    narrativePerks: [],
    rank: 0,
    operationalXP: 0,
    customBonus: 0,
    status: "ready",
    assignment: "none",
    gear: []
  };

  gang.roster.push(newNpc);
  try {
    await GangData.saveGang(actor, gang);
  } catch (err) {
    recruitmentLocks.delete(messageId);
    await message.unsetFlag("wfrp4e-underworld", "chosen");
    throw err;
  }

  // Aktualizuj wiadomość na czacie
  const gmNote = message.getFlag("wfrp4e-underworld", "gmNote") || "";
  const updatedContent = await foundry.applications.handlebars.renderTemplate("modules/wfrp4e-underworld/templates/chat/recruit-proposals.hbs", {
    actorId: actor.id,
    gmNote,
    candidates,
    chosen: chosenCandidate.name,
    chosenBy: userName
  });

  await message.update({
    content: updatedContent,
    flags: {
      "wfrp4e-underworld": {
        chosen: chosenCandidate.name,
        chosenBy: userName
      }
    }
  });

  ui.notifications.info(t("Recruit.Joined", { name: chosenCandidate.name }));

  // Ogłoszenie na czacie
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div style="font-size: 0.9rem; color: #1b5e20;"><strong><i class="fas fa-handshake"></i> ${t("Recruit.ChatTitle")}</strong><br/>${t("Recruit.ChatText", { user: Handlebars.escapeExpression(userName), name: Handlebars.escapeExpression(chosenCandidate.name), role: chosenCandidate.roleName })}</div>`
  });
  return chosenCandidate.name;
}

/** Czy użytkownik może wybrać rekruta z tej propozycji (MG lub właściciel postaci z odblokowaną Szajką). */
function canRecruit(user, message) {
  if (user.isGM) return true;
  const actor = game.actors.get(message?.getFlag(MODULE_ID, "actorId"));
  return !!actor && actor.testUserPermission(user, "OWNER") && registry.isFeatureUnlocked(actor, "underworld");
}

/** Handler zapytania wykonywany u MG; context.user ustala serwer. */
async function onRecruitQuery({ messageId, candidateId } = {}, { user } = {}) {
  const message = game.messages.get(messageId);
  if (!user || !message || !canRecruit(user, message)) return null;
  return executeRecruitChoice({ messageId, candidateId, userName: user.name });
}

// Sanitizer wiadomości czatu wycina <svg>, więc karty niosą tylko data-uw-glyph, a ikonę dokładamy przy renderze
Hooks.on("renderChatMessageHTML", (message, html) => {
  const glyphs = html.querySelectorAll?.(".wfrp4e-underworld [data-uw-glyph]") ?? [];
  if (!glyphs.length) return;
  const spriteUrl = foundry.utils.getRoute(`modules/${MODULE_ID}/assets/ui/sprite.svg`);
  const SVG_NS = "http://www.w3.org/2000/svg";
  for (const el of glyphs) {
    const id = el.dataset.uwGlyph;
    if (!id || el.querySelector("svg")) continue;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "uw-icon");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", `${spriteUrl}#${id}`);
    svg.append(use);
    el.append(svg);
  }
});

Hooks.on("renderChatMessageHTML", (message, html) => {
  const recruitCard = html.querySelector(".recruit-proposals-card");
  if (!recruitCard) return;

  const buttons = recruitCard.querySelectorAll(".btn-recruit-candidate");
  if (!canRecruit(game.user, message)) {
    buttons.forEach(btn => btn.remove());
    return;
  }

  buttons.forEach(btn => btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    const button = ev.currentTarget;
    const candidateId = button.dataset.candidateId;
    const originalLabel = button.innerHTML;

    button.disabled = true;
    button.textContent = t("Recruit.InProgress");

    const recruited = await queryGM(`${MODULE_ID}.recruit`, { messageId: message.id, candidateId });
    if (!recruited) {
      button.disabled = false;
      button.innerHTML = originalLabel;
    } else if (!game.user.isGM) {
      ui.notifications.info(t("Recruit.Joined", { name: recruited }));
    }
  }));
});
