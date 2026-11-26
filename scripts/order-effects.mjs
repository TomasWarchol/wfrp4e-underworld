/**
 * WFRP4e - Szajka: automatyczne efekty rozkazów taktycznych na wskazanych tokenach.
 *
 * Gracz wskazuje cele (Foundry: celowanie tokenów), a efekty wykonuje klient MG przez zapytanie:
 * testy obronne celów (okna testów WFRP4e), stany przez actor.addCondition / removeCondition, Przewaga.
 */

import { queryGM, registry } from "../../wfrp4e-companion-lib/scripts/companion-lib.mjs";
import { t } from "./i18n.mjs";

const MODULE_ID = "wfrp4e-underworld";
const QUERY_NAME = `${MODULE_ID}.applyOrder`;
const DIFFICULTY_STEPS = ["average", "challenging", "difficult", "hard", "vhard"];

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
  static _applying = new Set();

  /** Czy rozkaz ma automatyczne efekty. */
  static isAutomated(orderId) {
    return Object.hasOwn(ORDER_AUTOMATION, orderId);
  }

  static targetUuids(tokens = game.user.targets) {
    return Array.from(tokens ?? []).filter(token => token.actor).map(token => token.document.uuid);
  }

  static async applyFromCard(message, targetUuids) {
    try {
      const result = await queryGM(QUERY_NAME, { messageId: message.id, targetUuids });
      if (result === "noTarget") ui.notifications.warn(t("Orders.Effects.SelectTarget"));
      else if (!result) ui.notifications.warn(t("Orders.Effects.GMFailed"));
      return result;
    } catch (err) {
      console.error(`${MODULE_ID} | Could not apply tactical order:`, err);
      ui.notifications.warn(t("Orders.Effects.GMFailed"));
      return null;
    }
  }

  static async onQuery({ messageId, targetUuids } = {}, { user } = {}) {
    const message = game.messages.get(messageId);
    const effect = message?.getFlag(MODULE_ID, "orderEffect");
    const automation = effect && this.isAutomated(effect.orderId) && ORDER_AUTOMATION[effect.orderId];
    if (!user || !automation || !Array.isArray(targetUuids) || game.settings.get(MODULE_ID, "orderAutomation") !== "full") return null;
    if (!user.isGM && !message.canUserModify(user, "update")) return null;
    if (message.getFlag(MODULE_ID, "orderEffectResult") || this._applying.has(messageId)) return "used";

    this._applying.add(messageId);
    try {
      const issuer = await fromUuid(effect.issuerUuid);
      if (!issuer || (!user.isGM && (!issuer.testUserPermission(user, "OWNER") || !registry.isFeatureUnlocked(issuer, "underworld")))) return null;

      const targets = new Map();
      for (const uuid of new Set(targetUuids)) {
        if (typeof uuid !== "string" || !/^Scene\.[^.]+\.Token\.[^.]+$/.test(uuid)) continue;
        const token = await fromUuid(uuid);
        const actor = token?.actor;
        if (!actor || (!user.isGM && token.parent?.id !== user.viewedScene)) continue;
        if (!["npc", "character"].includes(actor.type)) continue;
        targets.set(actor.uuid, actor);
        if (targets.size >= (automation.maxTargets ?? 1)) break;
      }
      if (!targets.size) return "noTarget";

      const executorRank = Math.max(0, Math.min(3, Math.trunc(Number(effect.executorRank) || 0)));
      const method = effect.method === "advantage" ? "advantage" : "leadership";
      const lines = [];
      let failed = false;
      await message.setFlag(MODULE_ID, "orderEffectResult", { status: "applying" });
      try {
        for (const target of targets.values()) {
          lines.push(...await this._applyToTarget(target, automation, { method, executorRank }));
        }
      } catch (err) {
        failed = true;
        console.error(`${MODULE_ID} | Tactical order effects failed:`, err);
      }
      await message.setFlag(MODULE_ID, "orderEffectResult", { status: failed ? "failed" : "applied", lines });
      return "used";
    } finally {
      this._applying.delete(messageId);
    }
  }

  static async _applyToTarget(target, automation, { method = "leadership", executorRank = 0 } = {}) {
    const name = target.name ?? "";
    const lines = [];
    let effects = automation.apply ?? [];

    if (automation.test) {
      const { characteristic, difficulty } = automation.test;
      const effectiveDifficulty = stepDifficulty(difficulty, executorRank);
      const label = game.i18n.localize(game.wfrp4e?.config?.characteristics?.[characteristic] ?? characteristic);
      const test = await target.setupCharacteristic(characteristic, {
        appendTitle: ` – ${t("Orders.Effects.DefenceTitle")}`,
        skipTargets: true,
        fields: { difficulty: effectiveDifficulty }
      });
      if (!test) return [t("Orders.Effects.CancelledTest", { name })];
      await test.roll();
      const failed = !test.succeeded;
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
