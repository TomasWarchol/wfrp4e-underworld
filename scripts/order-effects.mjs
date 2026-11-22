/**
 * WFRP4e - Szajka: automatyczne efekty rozkazów taktycznych na wskazanych tokenach.
 *
 * Gracz wskazuje cele (Foundry: celowanie tokenów), a efekty wykonuje klient MG przez zapytanie:
 * testy obronne celów (okna testów WFRP4e), stany przez actor.addCondition / removeCondition, Przewaga.
 */

import { queryGM } from "../../wfrp4e-companion-lib/scripts/companion-lib.mjs";
import { t } from "./i18n.mjs";

const MODULE_ID = "wfrp4e-underworld";
const QUERY_NAME = `${MODULE_ID}.applyOrder`;
const DIFFICULTY_STEPS = ["average", "challenging", "difficult", "hard", "veryHard"];

/**
 * Zwraca aktualną Przewagę postaci, obsługując zarówno Przewagę Osobistą z podstawki WFRP4e,
 * jak i Przewagę Grupową z Up in Arms (`wfrp4e.useGroupAdvantage`).
 */
export function getAdvantage(actor) {
  if (!actor) return 0;
  try {
    if (game.settings?.get("wfrp4e", "useGroupAdvantage")) {
      const group = game.settings?.get("wfrp4e", "groupAdvantageValues");
      const side = (actor.hasPlayerOwner || actor.type === "character") ? "players" : "enemies";
      if (group && group[side] !== undefined) return Number(group[side]) || 0;
    }
  } catch (_) {}
  return Number(actor.status?.advantage?.value ?? actor.system?.status?.advantage?.value ?? actor.system?.status?.advantage ?? 0);
}

/**
 * Modyfikuje Przewagę postaci (WFRP4e obsłuży pulę osobistą lub grupową).
 */
export async function modifyAdvantage(actor, delta) {
  const change = Math.trunc(Number(delta) || 0);
  if (!actor || !change) return;
  if (typeof actor.modifyAdvantage === "function") {
    await actor.modifyAdvantage(change);
    return;
  }
  try {
    if (game.settings?.get("wfrp4e", "useGroupAdvantage") && typeof game.wfrp4e?.utility?.updateGroupAdvantage === "function") {
      const side = (actor.hasPlayerOwner || actor.type === "character") ? "players" : "enemies";
      await game.wfrp4e.utility.updateGroupAdvantage({ [side]: Math.max(0, getAdvantage(actor) + change) });
      return;
    }
  } catch (_) {}
  if (change < 0 && typeof actor.spend === "function") {
    await actor.spend("system.status.advantage.value", Math.abs(change));
    return;
  }
  const cur = Number(actor.system?.status?.advantage?.value ?? actor.system?.status?.advantage ?? 0);
  await actor.update?.({ "system.status.advantage.value": Math.max(0, cur + change) });
}

function stepDifficulty(base, rank = 0) {
  const idx = DIFFICULTY_STEPS.indexOf(base);
  const start = idx >= 0 ? idx : 1;
  const shift = Math.max(0, Math.min(3, Math.trunc(Number(rank) || 0)));
  return DIFFICULTY_STEPS[Math.min(DIFFICULTY_STEPS.length - 1, start + shift)];
}

/**
 * Automatyzacja rozkazów. Rozkazy bez wpisu (np. Salwa, Taran, Żywa Tarcza) rozstrzyga MG z karty.
 * - test: test cechy celu; skutki z onFail stosowane tylko przy porażce celu (trudność rośnie z rangą wykonawcy)
 * - apply: skutki stosowane od razu
 * - ally: cele to sojusznicy (gdy brak celów – Herszt)
 * - maxTargets: limit celów (domyślnie 1 dla rozkazów jednotargetowych)
 * Skutek: { add: "prone" } | { remove: "fatigued" } | { advantage: -1 } | { note: "klucz tłumaczenia" }
 */
export const ORDER_AUTOMATION = {
  trip: { test: { characteristic: "ag", difficulty: "challenging" }, onFail: [{ add: "prone" }] },
  kidneystrike: { test: { characteristic: "ag", difficulty: "challenging" }, onFail: [{ add: "bleeding" }, { advantage: -1 }] },
  sand: { test: { characteristic: "ag", difficulty: "challenging" }, onFail: [{ add: "blinded" }] },
  cover: { apply: [{ advantage: -1 }] },
  bullrush: { apply: [{ advantage: -1 }] },
  distract: { apply: [{ advantage: -1 }] },
  disarm: { test: { characteristic: "s", difficulty: "difficult" }, onFail: [{ note: "Orders.Effects.DropsWeapon" }] },
  rally: { ally: true, apply: [{ remove: "broken" }] },
  draught: { ally: true, apply: [{ remove: "fatigued" }] },
  bodyblock: { ally: true, apply: [{ advantage: 1 }] },
  grapple: { test: { characteristic: "s", difficulty: "challenging" }, onFail: [{ add: "entangled" }] },
  circle: { ally: true, maxTargets: 4, apply: [{ remove: "surprised" }, { advantage: 1 }] },
  parry: { ally: true, apply: [{ advantage: 1 }] },
  riposte: { apply: [{ advantage: -1 }] },
  challenge: { test: { characteristic: "wp", difficulty: "challenging" }, onFail: [{ note: "Orders.Effects.MustFace" }] },
  pindown: { maxTargets: 3, test: { characteristic: "wp", difficulty: "challenging" }, onFail: [{ add: "surprised" }] },
  fireoil: { maxTargets: 4, test: { characteristic: "ag", difficulty: "challenging" }, onFail: [{ add: "ablaze" }] },
  caltrops: { maxTargets: 4, test: { characteristic: "ag", difficulty: "challenging" }, onFail: [{ add: "prone" }] },
  collapse: { maxTargets: 3, test: { characteristic: "ag", difficulty: "difficult" }, onFail: [{ add: "stunned" }] },
  wagonwall: { ally: true, apply: [{ advantage: 1 }] },
  spooked: { apply: [{ advantage: -1 }] },
  getaway: { ally: true, apply: [{ remove: "prone" }] },
  spot: { ally: true, apply: [{ advantage: 1 }] },
  lure: { test: { characteristic: "int", difficulty: "challenging" }, onFail: [{ advantage: -1 }, { note: "Orders.Effects.Lured" }] },
  snare: { test: { characteristic: "ag", difficulty: "challenging" }, onFail: [{ add: "entangled" }] },
  forgedorder: { test: { characteristic: "int", difficulty: "challenging" }, onFail: [{ add: "surprised" }] },
  payoff: { test: { characteristic: "wp", difficulty: "challenging" }, onFail: [{ note: "Orders.Effects.StandsDown" }] },
  salve: { ally: true, apply: [{ remove: "bleeding" }] },
  fumes: { maxTargets: 4, test: { characteristic: "t", difficulty: "challenging" }, onFail: [{ add: "fatigued" }] },
  evileye: { test: { characteristic: "wp", difficulty: "challenging" }, onFail: [{ advantage: -1 }, { note: "Orders.Effects.EvilEye" }] },
  regroup: { ally: true, maxTargets: 4, apply: [{ remove: "surprised" }, { advantage: 1 }] }
};

export class OrderEffects {
  static QUERY_NAME = QUERY_NAME;

  /** Czy rozkaz ma automatyczne efekty. */
  static isAutomated(orderId) {
    return !!ORDER_AUTOMATION[orderId];
  }

  /**
   * Wywoływane po stronie wydającego rozkaz: zbiera wskazane cele i prosi MG o zastosowanie efektów.
   * @returns {Promise<string[]>} opisy zastosowanych efektów do karty rozkazu
   */
  static async applyFromIssuer(actor, orderId, { method = "leadership", executorRank = 0 } = {}) {
    const automation = ORDER_AUTOMATION[orderId];
    if (!automation) return [];

    let targetUuids = Array.from(game.user.targets ?? [])
      .map(token => token.actor?.uuid)
      .filter(Boolean);
    if (!targetUuids.length && automation.ally) targetUuids = [actor.uuid];
    if (!targetUuids.length) {
      return [t("Orders.Effects.NoTarget")];
    }

    const result = await queryGM(QUERY_NAME, {
      orderId,
      issuerUuid: actor.uuid,
      targetUuids,
      method,
      executorRank: Math.max(0, Math.min(3, Math.trunc(Number(executorRank) || 0)))
    });
    return Array.isArray(result) ? result : [t("Orders.Effects.GMFailed")];
  }

  /**
   * Handler zapytania wykonywany u MG. Wydający musi być właścicielem Herszta.
   */
  static async onQuery({ orderId, issuerUuid, targetUuids, method = "leadership", executorRank = 0 } = {}, { user } = {}) {
    const automation = ORDER_AUTOMATION[orderId];
    if (!automation || !Array.isArray(targetUuids)) return [];
    const issuer = issuerUuid ? await fromUuid(issuerUuid) : null;
    if (!user || !issuer || (!user.isGM && !issuer.testUserPermission(user, "OWNER"))) return [];

    const safeMethod = ["leadership", "advantage", "direct"].includes(method) ? method : "leadership";
    let safeRank = Math.max(0, Math.min(3, Math.trunc(Number(executorRank) || 0)));
    const roster = issuer.getFlag?.(MODULE_ID, "gang")?.roster;
    if (Array.isArray(roster)) {
      const activeRetinue = roster.filter(n => n.assignment === "retinue" && !["dead", "wounded", "arrested"].includes(n.status));
      if (activeRetinue.length) {
        const maxRank = activeRetinue.reduce((m, n) => Math.max(m, Math.max(0, Math.min(3, Math.trunc(Number(n.rank) || 0)))), 0);
        safeRank = Math.min(safeRank, maxRank);
      } else {
        safeRank = 0;
      }
    }

    const limit = automation.maxTargets ?? 1;
    const lines = [];
    for (const uuid of targetUuids.slice(0, limit)) {
      const target = await fromUuid(uuid);
      if (!target) continue;
      lines.push(...await this._applyToTarget(target, automation, { method: safeMethod, executorRank: safeRank }));
    }
    return lines;
  }

  static async _applyToTarget(target, automation, { method = "leadership", executorRank = 0 } = {}) {
    const name = Handlebars.escapeExpression(target.name ?? "");
    const lines = [];
    let effects = automation.apply ?? [];

    if (automation.test) {
      const { characteristic, difficulty } = automation.test;
      const effectiveDifficulty = stepDifficulty(difficulty, executorRank);
      const label = game.i18n.localize(game.wfrp4e?.config?.characteristics?.[characteristic] ?? characteristic);
      let failed = true;
      try {
        const test = await target.setupCharacteristic?.(characteristic, {
          appendTitle: ` – ${t("Orders.Effects.DefenceTitle")}`,
          skipTargets: true,
          fields: { difficulty: effectiveDifficulty }
        });
        if (test) {
          await test.roll();
          failed = !test.succeeded;
        }
      } catch (err) {
        console.error(`${MODULE_ID} | Defence test failed:`, err);
      }
      lines.push(t(failed ? "Orders.Effects.TestFailed" : "Orders.Effects.TestPassed", { name, test: label }));
      if (!failed) return lines;
      effects = automation.onFail ?? [];
    }

    for (const effect of effects) {
      if (effect.add && typeof target.addCondition === "function") {
        await target.addCondition(effect.add);
        lines.push(t("Orders.Effects.GainsCondition", { name, condition: this._conditionName(effect.add) }));
      } else if (effect.remove && typeof target.removeCondition === "function") {
        if (target.hasCondition?.(effect.remove)) {
          await target.removeCondition(effect.remove);
          lines.push(t("Orders.Effects.LosesCondition", { name, condition: this._conditionName(effect.remove) }));
        } else {
          lines.push(t("Orders.Effects.NoCondition", { name, condition: this._conditionName(effect.remove) }));
        }
      } else if (effect.advantage) {
        // Przy wydaniu Przewagi na rozkaz sojuszniczy nie oddajemy kosztu z powrotem (blokada pętli 0-kosztowej)
        if (method === "advantage" && automation.ally && effect.advantage > 0) continue;
        const current = getAdvantage(target);
        if (current > 0 || effect.advantage > 0) {
          await modifyAdvantage(target, effect.advantage);
          lines.push(t("Orders.Effects.Advantage", { name, value: `${effect.advantage > 0 ? "+" : ""}${effect.advantage}` }));
        }
      } else if (effect.note) {
        lines.push(`${name}: ${t(effect.note)}.`);
      }
    }
    return lines;
  }

  static _conditionName(key) {
    const label = game.wfrp4e?.config?.conditions?.[key];
    return label ? game.i18n.localize(label) : key;
  }
}
