/**
 * Profile typów kompanii: co odróżnia Szajkę od Zbrojnych, Kultystów itd.
 *
 * Silnik (lista członków, rangi, morale, zapasy, skarbiec, postój, rozkazy) jest wspólny.
 * Profil wybiera role i zlecenia, a teksty nadpisuje sekcja UNDERWORLD.Profiles.<typ> w lang/*.json.
 * Typ bez profilu działa jak Szajka.
 *
 * Nowy typ to: wpis w PROFILES, role w PROFILE_ROLES, zlecenia w DATA_MISSIONS,
 * teksty w lang/*.json i opcjonalnie zdarzenia w data/events/profiles/<typ>.<język>.json.
 */

export const DEFAULT_PROFILE = "underworld";

/**
 * Role dodawane przez profile.
 * - orders: rozkazy taktyczne, które rola może wydać (role Szajki korzystają z requiredRoles rozkazu)
 * - actsAs: role Szajki, którym rola odpowiada; decydują o przeliczeniu ról przy zmianie typu kompanii
 * - bonusAssignments: zlecenia, w których rola daje premię specjalisty
 */
export const PROFILE_ROLES = {
  // ─── ZBROJNI ───
  sergeant: {
    id: "sergeant", icon: "fas fa-chevron-up", badgeClass: "role-bodyguard",
    actsAs: ["bodyguard", "duelist"], orders: ["meatshield", "bodyblock", "circle", "challenge"],
    bonusAssignments: ["escort", "drill", "contract"]
  },
  halberdier: {
    id: "halberdier", icon: "fas fa-staff-snake", badgeClass: "role-duelist",
    actsAs: ["saboteur"], orders: ["trip", "bullrush", "parry", "disarm"],
    bonusAssignments: ["garrison", "escort", "contract"]
  },
  crossbowman: {
    id: "crossbowman", icon: "fas fa-crosshairs", badgeClass: "role-marksman",
    actsAs: ["marksman", "shadow", "scout"], orders: ["volley", "cover", "pindown", "spot"],
    bonusAssignments: ["patrol", "garrison"]
  },
  standard_bearer: {
    id: "standard_bearer", icon: "fas fa-flag", badgeClass: "role-provocateur",
    actsAs: ["provocateur"], orders: ["distract", "evileye", "lure", "circle"],
    bonusAssignments: ["drill", "requisition"]
  },
  surgeon: {
    id: "surgeon", icon: "fas fa-kit-medical", badgeClass: "role-charlatan",
    actsAs: ["charlatan"], orders: ["salve", "draught", "resupply", "getaway"],
    bonusAssignments: ["tend_wounded", "garrison"]
  },
  quartermaster: {
    id: "quartermaster", icon: "fas fa-boxes-stacked", badgeClass: "role-scavenger",
    actsAs: ["scavenger", "smuggler", "fixer"], orders: ["wagonwall", "caltrops", "fireoil", "payoff", "retreat"],
    bonusAssignments: ["requisition", "fence", "contract"]
  },

  // ─── PRZEMYTNICY ───
  helmsman: {
    id: "helmsman", icon: "fas fa-dharmachakra", badgeClass: "role-scout",
    actsAs: ["scout", "marksman"], orders: ["retreat", "getaway", "wagonwall", "spot"],
    bonusAssignments: ["river_run", "scout", "smuggle"]
  },
  boatman: {
    id: "boatman", icon: "fas fa-anchor", badgeClass: "role-bodyguard",
    actsAs: ["bodyguard", "duelist", "saboteur"], orders: ["bullrush", "meatshield", "grapple", "trip"],
    bonusAssignments: ["river_run", "distract"]
  },
  lookout: {
    id: "lookout", icon: "fas fa-eye", badgeClass: "role-shadow",
    actsAs: ["shadow", "provocateur"], orders: ["lure", "flank", "smoke", "sand"],
    bonusAssignments: ["cache", "scout", "cover_tracks"]
  },
  forger: {
    id: "forger", icon: "fas fa-feather-pointed", badgeClass: "role-fixer",
    actsAs: ["fixer", "charlatan"], orders: ["forgedorder", "payoff", "distract"],
    bonusAssignments: ["forge", "bribe"]
  },
  purser: {
    id: "purser", icon: "fas fa-scale-balanced", badgeClass: "role-scavenger",
    actsAs: ["scavenger"], orders: ["resupply", "draught", "salve", "payoff"],
    bonusAssignments: ["contraband", "fence", "procure"]
  },

  // ─── SIATKA INFORMATORÓW ───
  eavesdropper: {
    id: "eavesdropper", icon: "fas fa-ear-listen", badgeClass: "role-provocateur",
    actsAs: ["scout", "provocateur"], orders: ["spot", "lure", "distract", "sand"],
    bonusAssignments: ["buy_secret", "tavern", "scout"]
  },
  courier: {
    id: "courier", icon: "fas fa-envelope", badgeClass: "role-smuggler",
    actsAs: ["smuggler", "scavenger"], orders: ["retreat", "getaway", "resupply", "flank"],
    bonusAssignments: ["letter_swap", "report", "intercept"]
  },
  enforcer: {
    id: "enforcer", icon: "fas fa-hand-fist", badgeClass: "role-duelist",
    actsAs: ["bodyguard", "duelist", "saboteur", "marksman"], orders: ["meatshield", "grapple", "bullrush", "trip"],
    bonusAssignments: ["distract", "bribe", "intercept"]
  },

  // ─── SEKRETNE BRACTWO ───
  acolyte: {
    id: "acolyte", icon: "fas fa-book-skull", badgeClass: "role-scavenger",
    actsAs: ["scavenger", "smuggler"], orders: ["resupply", "draught", "salve", "retreat"],
    bonusAssignments: ["ritual", "tend_wounded", "cover_tracks"]
  },
  zealot: {
    id: "zealot", icon: "fas fa-fire", badgeClass: "role-bodyguard",
    actsAs: ["bodyguard", "duelist"], orders: ["meatshield", "bullrush", "grapple", "challenge"],
    bonusAssignments: ["abduction", "distract"]
  },
  spy: {
    id: "spy", icon: "fas fa-user-secret", badgeClass: "role-shadow",
    actsAs: ["shadow", "scout"], orders: ["flank", "lure", "spot", "kidneystrike"],
    bonusAssignments: ["infiltrate", "tavern", "abduction"]
  },
  assassin: {
    id: "assassin", icon: "fas fa-skull", badgeClass: "role-marksman",
    actsAs: ["marksman", "saboteur"], orders: ["kidneystrike", "disarm", "smoke", "sand"],
    bonusAssignments: ["abduction", "sabotage"]
  },
  orator: {
    id: "orator", icon: "fas fa-bullhorn", badgeClass: "role-provocateur",
    actsAs: ["provocateur", "fixer"], orders: ["distract", "evileye", "payoff", "forgedorder"],
    bonusAssignments: ["rumor_spread", "bribe", "infiltrate"]
  },
  alchemist: {
    id: "alchemist", icon: "fas fa-flask", badgeClass: "role-charlatan",
    actsAs: ["charlatan"], orders: ["fumes", "fireoil", "smoke", "salve", "draught"],
    bonusAssignments: ["ritual", "tend_wounded", "stone_circle"]
  }
};

/**
 * Zlecenia opisane samymi danymi; wykonuje je UnderworldOperations.executeDataMission.
 * - success / failure: skutek testu; great: dodatkowo przy SL 3 lub lepszym
 *   (coins: formuła w ss, supplies: formuła, morale, notoriety, xp, loot: poziom trofeum)
 * - like: zlecenie Szajki, którego premie (zalety, atuty, rynsztunek) mają obowiązywać
 * - badge: klasa koloru plakietki przydziału na liście członków
 * - consumes: zlecenie zużywa najcenniejszy pasujący łup (categories); zapłata to jego wartość razy multiplier
 *   (i razy poziom celu); always: łup przepada także przy porażce
 * - teksty: UNDERWORLD.Missions.<id>.{Name, Desc, Reward, Success, Fail} i UNDERWORLD.Badges.<id>
 */
export const DATA_MISSIONS = {
  // ─── ZBROJNI ───
  patrol: {
    category: "intel", icon: "fas fa-person-hiking", badge: "scout", terrains: "all", target: 55, skill: "NAME.OutdoorSurvival",
    risk: "violent", like: "scout", produces: "recon", leadOnGreat: true,
    loot: ["weapons", "metal"], success: {}, great: { loot: "easy" }, failure: {}
  },
  garrison: {
    category: "resources", icon: "fas fa-chess-rook", badge: "guard", terrains: "all", target: 60, skill: "NAME.Perception",
    risk: "low", like: "scout", success: { coins: "1d8+4" }, great: { coins: "1d6" }, failure: {}
  },
  requisition: {
    category: "resources", icon: "fas fa-wheat-awn", badge: "procure", terrains: "all", target: 50, skill: "NAME.Intimidate",
    risk: "low", like: "intimidate", success: { supplies: "1d3+1" }, great: { supplies: "1" }, failure: { notoriety: 1 }
  },
  escort: {
    category: "operations", icon: "fas fa-shield-halved", badge: "guard", terrains: "all", target: 50, skill: "NAME.Perception",
    risk: "violent", like: "distract", needsInput: true,
    success: { coins: "2d10+5" }, great: { notoriety: -1 }, failure: { morale: -1 }
  },
  contract: {
    category: "operations", icon: "fas fa-file-contract", badge: "intimidate", terrains: "all", target: 45, skill: "NAME.Leadership",
    risk: "violent", like: "intimidate", tiered: true, needsInput: true,
    loot: ["weapons", "metal", "valuables"],
    success: { coins: "3d10+10" }, great: { loot: "normal" }, failure: { morale: -1, notoriety: 1 }
  },
  drill: {
    category: "camp", icon: "fas fa-person-military-rifle", badge: "tend-wounded", terrains: "all", target: 55, skill: "NAME.Leadership",
    risk: null, produces: "commotion", success: { xp: 5 }, great: { morale: 1 }, failure: {}
  },

  // ─── BANICI ───
  ambush: {
    category: "operations", icon: "fas fa-tree", badge: "intimidate", terrains: ["forest", "mountains", "village"], target: 40, skill: "NAME.Stealth",
    risk: "violent", like: "highway_robbery", loot: ["weapons", "metal"],
    success: { notoriety: -1, loot: "easy" }, great: { morale: 1 }, failure: { morale: -1 }
  },
  ransom: {
    category: "resources", icon: "fas fa-people-robbery", badge: "intimidate", terrains: "all", target: 45, skill: "NAME.Intimidate",
    risk: "violent", like: "intimidate", needsInput: true,
    success: { coins: "3d10+5", notoriety: 1 }, great: { coins: "2d10" }, failure: { notoriety: 1, morale: -1 }
  },
  toll: {
    category: "resources", icon: "fas fa-bridge", badge: "intimidate", terrains: ["forest", "mountains", "village"], target: 50, skill: "NAME.Intimidate",
    risk: "violent", like: "highway_robbery", success: { coins: "1d10+3" }, great: { supplies: "1" }, failure: { notoriety: 1 }
  },

  // ─── PRZEMYTNICY ───
  river_run: {
    category: "operations", icon: "fas fa-ship", badge: "smuggle", terrains: "all", target: 45, skill: "NAME.Stealth",
    risk: "stealth", like: "smuggle", tiered: true,
    consumes: { categories: ["contraband", "goods", "valuables"], multiplier: 2.5, always: true },
    success: {}, great: { notoriety: -1 }, failure: { notoriety: 1 }
  },
  cache: {
    category: "camp", icon: "fas fa-box-archive", badge: "cover-tracks", terrains: "all", target: 50, skill: "NAME.Stealth",
    risk: "low", like: "cover_tracks", success: { notoriety: -1 }, great: { supplies: "1" }, failure: {}
  },
  contraband: {
    category: "resources", icon: "fas fa-wine-bottle", badge: "smuggle", terrains: "all", target: 50, skill: "NAME.Haggle",
    risk: "stealth", like: "procure", loot: ["contraband", "goods"],
    success: { loot: "normal" }, great: { loot: "easy" }, failure: { notoriety: 1 }
  },

  // ─── SIATKA INFORMATORÓW ───
  buy_secret: {
    category: "intel", icon: "fas fa-envelope-open-text", badge: "tavern", terrains: ["city", "village"], target: 50, skill: "NAME.Gossip",
    risk: "stealth", like: "tavern", leadOnGreat: true, loot: ["documents"],
    success: { loot: "normal" }, great: {}, failure: { notoriety: 1 }
  },
  intercept: {
    category: "intel", icon: "fas fa-horse", badge: "shadow", terrains: ["village", "forest", "mountains"], target: 45, skill: "NAME.Stealth",
    risk: "stealth", like: "shadow", loot: ["documents"],
    success: { loot: "normal" }, great: { notoriety: -1 }, failure: { notoriety: 1 }
  },
  letter_swap: {
    category: "operations", icon: "fas fa-envelopes-bulk", badge: "forge", terrains: ["city", "village"], target: 40, skill: "NAME.SleightOfHand",
    risk: "stealth", like: "forge", tiered: true, needsInput: true, loot: ["documents"],
    success: { coins: "2d10+5", xp: 5 }, great: { loot: "normal" }, failure: { notoriety: 1 }
  },
  report: {
    category: "resources", icon: "fas fa-file-lines", badge: "rumor", terrains: "all", target: 50, skill: "NAME.Intuition",
    risk: null, like: "tavern", consumes: { categories: ["documents"], multiplier: 1.25 },
    success: {}, great: { coins: "1d10" }, failure: { morale: -1 }
  },

  // ─── SEKRETNE BRACTWO ───
  ritual: {
    category: "camp", icon: "fas fa-fire-flame-curved", badge: "tend-wounded", terrains: "all", target: 50, skill: "NAME.Cool",
    risk: null, produces: "commotion", success: { morale: 1 }, great: { xp: 5 }, failure: { morale: -1 }
  },
  infiltrate: {
    category: "intel", icon: "fas fa-masks-theater", badge: "shadow", terrains: ["city", "village"], target: 45, skill: "NAME.Charm",
    risk: "stealth", like: "shadow", produces: "recon", leadOnGreat: true, success: {}, great: {}, failure: {}
  },
  stone_circle: {
    category: "camp", icon: "fas fa-circle-notch", badge: "rumor", terrains: ["forest", "mountains"], target: 50, skill: "NAME.Cool",
    risk: "low", like: "scout", loot: ["contraband", "valuables"],
    success: { morale: 1, xp: 5 }, great: { loot: "normal" }, failure: { morale: -1 }
  },
  abduction: {
    category: "operations", icon: "fas fa-user-lock", badge: "intimidate", terrains: "all", target: 40, skill: "NAME.Stealth",
    risk: "violent", like: "intimidate", tiered: true, needsInput: true, loot: ["valuables", "documents"],
    success: { coins: "2d10+5", morale: 1 }, great: { xp: 5, loot: "easy" }, failure: { notoriety: 2 }
  }
};
for (const [id, mission] of Object.entries(DATA_MISSIONS)) Object.assign(mission, { id, data: true, fn: `executeData_${id}` });

export const PROFILES = {
  underworld: {
    id: "underworld",
    roles: ["bodyguard", "shadow", "marksman", "provocateur", "scavenger", "smuggler", "saboteur", "scout", "fixer", "charlatan", "duelist"],
    missions: null, // wszystkie zlecenia poza opisanymi danymi
    defaultRole: "bodyguard",
    patronCut: true,
    hotLoot: true,
    worldTables: true,
    ownShare: 0
  },
  mercenaries: {
    id: "mercenaries",
    roles: ["sergeant", "halberdier", "crossbowman", "standard_bearer", "surgeon", "quartermaster"],
    missions: ["patrol", "garrison", "requisition", "fence", "escort", "contract", "drill", "tend_wounded"],
    defaultRole: "sergeant",
    patronCut: false, // Pracodawca płaci, a nie pobiera doli
    hotLoot: false, // trofea wojenne nikogo nie obchodzą
    worldTables: false, // tabele RollTable terenu są pisane pod Szajkę
    ownShare: 0.5 // połowa nocy losuje z tabeli typu, połowa ze wspólnych zdarzeń terenu
  },
  outlaws: {
    id: "outlaws",
    roles: ["bodyguard", "shadow", "marksman", "provocateur", "scavenger", "smuggler", "saboteur", "scout", "fixer", "charlatan", "duelist"],
    missions: ["scout", "tavern", "procure", "farm_theft", "poaching", "highway_robbery", "mine_raid", "fence", "intimidate", "bribe",
      "distract", "sabotage", "cover_tracks", "tend_wounded", "ambush", "ransom", "toll"],
    defaultRole: "bodyguard",
    patronCut: true, // protektor bandy bierze dolę jak Patron Szajki
    hotLoot: true,
    worldTables: true, // zdarzenia Szajki pasują do banitów
    ownShare: 0.25 // co czwarta noc losuje z tabeli typu
  },
  smugglers: {
    id: "smugglers",
    roles: ["smuggler", "helmsman", "boatman", "lookout", "forger", "purser"],
    missions: ["scout", "tavern", "procure", "fence", "bribe", "forge", "distract", "smuggle", "cover_tracks", "tend_wounded",
      "river_run", "cache", "contraband"],
    defaultRole: "boatman",
    patronCut: false, // Odbiorca płaci za dostarczony towar
    hotLoot: true,
    worldTables: false,
    ownShare: 0.5
  },
  investigators: {
    id: "investigators",
    roles: ["shadow", "fixer", "charlatan", "eavesdropper", "courier", "enforcer"],
    missions: ["scout", "shadow", "tavern", "bribe", "forge", "rumor_spread", "fence", "distract", "cover_tracks", "tend_wounded",
      "buy_secret", "letter_swap", "report", "intercept"],
    defaultRole: "shadow",
    patronCut: false, // Mocodawca płaci za raporty
    hotLoot: false,
    worldTables: false,
    ownShare: 0.5
  },
  cult: {
    id: "cult",
    roles: ["acolyte", "zealot", "spy", "assassin", "orator", "alchemist"],
    missions: ["tavern", "bribe", "rumor_spread", "fence", "distract", "sabotage", "forge", "cover_tracks", "tend_wounded",
      "ritual", "infiltrate", "abduction", "stone_circle"],
    defaultRole: "acolyte",
    patronCut: true, // Mroczny Mistrz pobiera dziesięcinę
    hotLoot: true,
    worldTables: false,
    ownShare: 0.5
  }
};

/** Profil kompanii; przyjmuje typ albo dane kompanii. Nieznany typ działa jak Szajka. */
export function profileOf(company) {
  const type = typeof company === "string" ? company : company?.type;
  return PROFILES[type] ?? PROFILES[DEFAULT_PROFILE];
}

/** Czy zlecenie należy do profilu. */
export function profileHasMission(company, mission) {
  const { missions } = profileOf(company);
  return missions ? missions.includes(mission.id) : !mission.data;
}

/** Odpowiednik roli w innym profilu: ta sama rola, jej rola bazowa albo rola, która ją zastępuje. */
export function convertRole(role, company) {
  const profile = profileOf(company);
  for (const family of [role, ...(PROFILE_ROLES[role]?.actsAs ?? [])]) {
    if (profile.roles.includes(family)) return family;
    const replacement = profile.roles.find(id => PROFILE_ROLES[id]?.actsAs.includes(family));
    if (replacement) return replacement;
  }
  return profile.defaultRole;
}
