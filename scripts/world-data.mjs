/**
 * WFRP4e - Szajka: dane terenów, katalog zleceń, łupy i treści terenowe.
 * Jedno źródło dla mechaniki (operations.mjs), panelu (gang-sheet.mjs) i tabel RollTable.
 * Teksty (nazwy, opisy, plotki) leżą w lang/*.json pod UNDERWORLD.*; tu zostaje mechanika.
 */

import { t, content, textConfig, withText } from "./i18n.mjs";

export const TERRAIN_IDS = ["city", "village", "forest", "mountains"];

/**
 * Tereny: paser (stawka w % wartości łupu), postój i obława.
 * likes: kategorie, za które paser płaci +10 pkt stawki; refuses: kategorie, których nie kupi.
 */
const TERRAIN_DATA = {
  city: {
    icon: "fas fa-city",
    fence: { rate: 50, likes: ["valuables", "documents"], refuses: [] },
    comfortableCostSS: 10,
    raidMinNotoriety: 4,
    eventChance: { unguarded: 60, guarded: 40 },
    coldMakeshift: false
  },
  village: {
    icon: "fas fa-wheat-awn",
    fence: { rate: 35, likes: ["goods"], refuses: ["weapons", "documents"] },
    comfortableCostSS: 5,
    raidMinNotoriety: 3,
    eventChance: { unguarded: 55, guarded: 35 },
    coldMakeshift: false
  },
  forest: {
    icon: "fas fa-tree",
    fence: { rate: 40, likes: ["weapons", "goods"], refuses: ["documents"] },
    comfortableCostSS: 0,
    raidMinNotoriety: 4,
    eventChance: { unguarded: 70, guarded: 40 },
    coldMakeshift: false
  },
  mountains: {
    icon: "fas fa-mountain",
    fence: { rate: 45, likes: ["metal", "weapons"], refuses: [] },
    comfortableCostSS: 8,
    raidMinNotoriety: 4,
    eventChance: { unguarded: 60, guarded: 40 },
    coldMakeshift: true
  }
};

export const TERRAINS = textConfig(TERRAIN_DATA, "Terrains", { name: "Name", comfortableLabel: "Comfortable", makeshiftLabel: "Makeshift", raidTitle: "Raid" });
for (const [id, terrain] of Object.entries(TERRAINS)) terrain.fence = withText({ ...terrain.fence }, `Terrains.${id}`, { name: "Fence" });

/** Poziomy celu kradzieży: modyfikator testu, mnożnik łupu, ryzyko każdej porażki. */
export const TARGET_TIERS = textConfig({
  easy: { modifier: 20, multiplier: 0.5 },
  normal: { modifier: 0, multiplier: 1 },
  rich: { modifier: -20, multiplier: 2, riskOnAnyFailure: true }
}, "Tiers", { name: "Name", desc: "Desc" });

/** Wartość jednego łupu (ss) zależnie od poziomu celu. */
export const LOOT_VALUE = { easy: "1d6+2", normal: "2d6+4", rich: "3d10+10" };

/** Żetony przygotowania: premia, do czego się stosuje i ile nocy trwa. */
export const TOKENS = textConfig({
  recon: { icon: "fas fa-binoculars", bonus: 20, appliesTo: "tiered", nights: 2 },
  commotion: { icon: "fas fa-fire", bonus: 20, appliesTo: "tested", nights: 1 },
  lead: { icon: "fas fa-map-signs", bonus: 0, appliesTo: "rich", nights: 2 }
}, "Tokens", { name: "Name", desc: "Desc" });

export const LOOT_CATEGORIES = {};
for (const [id, icon] of Object.entries({
  valuables: "fas fa-gem", goods: "fas fa-box", weapons: "fas fa-khanda",
  documents: "fas fa-scroll", contraband: "fas fa-flask", metal: "fas fa-cubes"
})) LOOT_CATEGORIES[id] = withText({ id, icon }, "LootCategories", { name: id });

/** Nazwy łupów według kategorii (losowane przy kradzieży), w bieżącym języku. */
export const LOOT_NAMES = {};
for (const id of Object.keys(LOOT_CATEGORIES)) {
  Object.defineProperty(LOOT_NAMES, id, { get: () => content(`LootNames.${id}`) ?? [], enumerable: true });
}

/**
 * Katalog zleceń (sama mechanika; nazwy i opisy w UNDERWORLD.Missions.<id>).
 * terrains: "all" albo lista terenów, w których zlecenie jest dostępne.
 * tiered: wybór celu (łatwy/zwykły/bogaty); loot: kategorie łupu (pierwsza dla miasta itd. przez lootByTerrain).
 * produces: żeton przygotowania przy sukcesie; leadOnGreat: Trop przy SL 3+.
 */
export const MISSIONS = {
  // ─── WYWIAD ───
  scout: {
    id: "scout", category: "intel", icon: "fas fa-binoculars", terrains: "all", fn: "executeScoutMission",
    target: 55, skill: "NAME.Perception", risk: "low",
    produces: "recon", leadOnGreat: true
  },
  shadow: {
    id: "shadow", category: "intel", icon: "fas fa-user-secret", terrains: ["city", "village"], fn: "executeShadowMission",
    target: 50, skill: "NAME.Stealth", risk: "stealth",
    produces: "recon", needsInput: true
  },
  tavern: {
    id: "tavern", category: "intel", icon: "fas fa-beer-mug-empty", terrains: ["city", "village"], fn: "executeTavernMission",
    target: 55, skill: "NAME.Gossip", risk: "low",
    leadOnGreat: true
  },
  outlaw_contact: {
    id: "outlaw_contact", category: "intel", icon: "fas fa-people-group", terrains: ["forest"], fn: "executeOutlawContactMission",
    target: 45, skill: "NAME.Gossip", risk: "low"
  },

  // ─── ZASOBY I ŁUPY ───
  procure: {
    id: "procure", category: "resources", icon: "fas fa-basket-shopping", terrains: "all", fn: "executeProcureMission",
    target: 50, skill: "NAME.Stealth", risk: "stealth"
  },
  pickpocket: {
    id: "pickpocket", category: "resources", icon: "fas fa-hand-holding-dollar", terrains: ["city", "village"], fn: "executePickpocketMission",
    target: 45, skill: "NAME.SleightOfHand", risk: "stealth",
    tiered: true, loot: ["valuables"]
  },
  burglary: {
    id: "burglary", category: "resources", icon: "fas fa-key", terrains: ["city"], fn: "executeBurglaryMission",
    target: 40, skill: "NAME.PickLock", risk: "stealth",
    tiered: true, loot: ["valuables", "documents", "goods"], needsInput: true
  },
  farm_theft: {
    id: "farm_theft", category: "resources", icon: "fas fa-horse", terrains: ["village"], fn: "executeFarmTheftMission",
    target: 50, skill: "NAME.Stealth", risk: "stealth",
    tiered: true, loot: ["goods"]
  },
  poaching: {
    id: "poaching", category: "resources", icon: "fas fa-paw", terrains: ["forest", "mountains"], fn: "executePoachingMission",
    target: 50, skill: "NAME.OutdoorSurvival", risk: "low"
  },
  highway_robbery: {
    id: "highway_robbery", category: "resources", icon: "fas fa-road", terrains: ["forest", "mountains"], fn: "executeHighwayRobberyMission",
    target: 45, skill: "NAME.Intimidate", risk: "violent",
    tiered: true, loot: ["goods", "weapons", "valuables"], lootByTerrain: { mountains: ["metal", "goods", "weapons"] }
  },
  mine_raid: {
    id: "mine_raid", category: "resources", icon: "fas fa-hammer", terrains: ["mountains"], fn: "executeMineRaidMission",
    target: 40, skill: "NAME.Stealth", risk: "violent",
    tiered: true, loot: ["metal"]
  },
  fence: {
    id: "fence", category: "resources", icon: "fas fa-scale-balanced", terrains: "all", fn: "executeFenceMission",
    target: 45, skill: "NAME.Haggle", risk: "stealth",
    fencePicker: true
  },

  // ─── WPŁYWY ───
  intimidate: {
    id: "intimidate", category: "influence", icon: "fas fa-hand-fist", terrains: ["city", "village"], fn: "executeIntimidateMission",
    target: 45, skill: "NAME.Intimidate", risk: "violent"
  },
  racket: {
    id: "racket", category: "influence", icon: "fas fa-store", terrains: ["city"], fn: "executeRacketMission",
    target: 45, skill: "NAME.Intimidate", risk: "violent",
    needsInput: true
  },
  rumor_spread: {
    id: "rumor_spread", category: "influence", icon: "fas fa-bullhorn", terrains: ["city", "village"], fn: "executeRumorSpreadMission",
    target: null, skill: null, risk: null,
    needsInput: true
  },
  bribe: {
    id: "bribe", category: "influence", icon: "fas fa-coins", terrains: ["city", "village", "mountains"], fn: "executeBribeMission",
    target: 45, skill: "NAME.Gossip", risk: "stealth",
    bribePicker: true
  },
  theman: {
    id: "theman", category: "influence", icon: "fas fa-envelope", terrains: ["city"], fn: "executeTheManContact",
    target: null, skill: null, risk: null, noNpc: true
  },

  // ─── OPERACJE ───
  distract: {
    id: "distract", category: "operations", icon: "fas fa-fire", terrains: "all", fn: "executeDiversionMission",
    target: 45, skill: "NAME.Gossip", risk: "violent",
    produces: "commotion"
  },
  sabotage: {
    id: "sabotage", category: "operations", icon: "fas fa-bomb", terrains: "all", fn: "executeSabotageMission",
    target: 40, skill: "NAME.Trade", risk: "violent",
    needsInput: true
  },
  smuggle: {
    id: "smuggle", category: "operations", icon: "fas fa-box-open", terrains: "all", fn: "executeSmuggleMission",
    target: 45, skill: "NAME.Stealth", risk: "stealth",
    needsInput: true
  },
  forge: {
    id: "forge", category: "operations", icon: "fas fa-file-signature", terrains: ["city"], fn: "executeForgeMission",
    target: 40, skill: "NAME.Trade", risk: "stealth",
    needsInput: true
  },

  // ─── OBÓZ ───
  cover_tracks: {
    id: "cover_tracks", category: "camp", icon: "fas fa-shoe-prints", terrains: "all", fn: "executeCoverTracksMission",
    target: 45, skill: "NAME.Stealth", risk: "low"
  },
  tend_wounded: {
    id: "tend_wounded", category: "camp", icon: "fas fa-kit-medical", terrains: "all", fn: "executeTendWoundedMission",
    target: null, skill: null, risk: null, targetWounded: true
  }
};



// Teksty zleceń jako gettery: reward, inputLabel, inputPlaceholder (nazwa i opis zależą od terenu, patrz niżej)
for (const mission of Object.values(MISSIONS)) {
  withText(mission, `Missions.${mission.id}`, { reward: "Reward" });
  if (mission.needsInput) withText(mission, `Missions.${mission.id}`, { inputLabel: "InputLabel", inputPlaceholder: "InputPlaceholder" });
}

export const MISSION_CATEGORIES = textConfig({
  intel: { icon: "fas fa-eye" },
  resources: { icon: "fas fa-coins" },
  influence: { icon: "fas fa-comments" },
  operations: { icon: "fas fa-crosshairs" },
  camp: { icon: "fas fa-campground" }
}, "MissionCategories", { name: "Name", hint: "Hint" });

/** Klasa ikony kategorii w panelu (kolory tła z arkusza stylów). */
export const CATEGORY_ICON_CLASS = { intel: "intel", resources: "resources", influence: "influence", operations: "operations", camp: "camp" };

export function missionAvailable(mission, terrain) {
  return mission.terrains === "all" || mission.terrains.includes(terrain);
}

export function missionName(mission, terrain) {
  if (!mission?.id) return t("MissionFallback");
  return content(`Missions.${mission.id}.Names.${terrain}`) || t(`Missions.${mission.id}.Name`);
}

export function missionDesc(mission, terrain) {
  if (!mission?.id) return "";
  return content(`Missions.${mission.id}.Descs.${terrain}`) || t(`Missions.${mission.id}.Desc`);
}

export function missionLootCategories(mission, terrain) {
  return mission.lootByTerrain?.[terrain] || mission.loot || ["goods"];
}

// ─────────────────────────────────────────────
// Plotki i wydarzenia dla wsi, lasu i gór (miasto korzysta z wbudowanej bazy modułu)
// ─────────────────────────────────────────────

/** Plotki terenowe: id → tekst i kategoria z tłumaczeń. */
export const TERRAIN_RUMORS = {};
for (const terrain of ["village", "forest", "mountains"]) {
  Object.defineProperty(TERRAIN_RUMORS, terrain, {
    enumerable: true,
    get: () => Object.entries(content(`TerrainRumors.${terrain}`) ?? {}).map(([id, r]) => ({ id, category: r.Category, text: r.Text }))
  });
}

/** Skutki wydarzeń terenowych; tytuł i tekst z tłumaczeń. */
const TERRAIN_EVENT_EFFECTS = {
  village: {
    "v-e1": { moraleDelta: -1 },
    "v-e2": { suppliesFound: 2, moraleDelta: 1 },
    "v-e3": { moraleDelta: 1 },
    "v-e4": { suppliesFound: -2 },
    "v-e5": { moraleDelta: -1 },
    "v-e6": { coinsFoundSS: 4 },
    "v-e7": { moraleDelta: 1 },
    "v-e8": { moraleDelta: -1 }
  },
  forest: {
    "f-e1": { moraleDelta: -1, suppliesFound: -1 },
    "f-e2": { suppliesFound: 3 },
    "f-e3": { moraleDelta: 1 },
    "f-e4": { moraleDelta: -2 },
    "f-e5": { coinsFoundSS: 6 },
    "f-e6": { moraleDelta: -1, suppliesFound: -1 },
    "f-e7": { suppliesFound: 2 },
    "f-e8": { suppliesFound: 1 }
  },
  mountains: {
    "m-e1": { moraleDelta: -1 },
    "m-e2": { moraleDelta: -1, suppliesFound: -1 },
    "m-e3": { suppliesFound: 2, coinsFoundSS: -2 },
    "m-e4": { suppliesFound: -2 },
    "m-e5": { moraleDelta: 1 },
    "m-e6": { moraleDelta: -1 },
    "m-e7": { moraleDelta: 1, suppliesFound: 1 },
    "m-e8": { coinsFoundSS: 8 }
  }
};

export const TERRAIN_EVENTS = {};
for (const [terrain, effects] of Object.entries(TERRAIN_EVENT_EFFECTS)) {
  Object.defineProperty(TERRAIN_EVENTS, terrain, {
    enumerable: true,
    get: () => Object.entries(effects).map(([id, fx]) => withText({ id, ...fx }, `TerrainEvents.${terrain}.${id}`, { title: "Title", text: "Text" }))
  });
}
