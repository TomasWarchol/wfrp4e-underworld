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

/**
 * Automatyzacja rozkazów. Rozkazy bez wpisu (np. Salwa, Taran, Żywa Tarcza) rozstrzyga MG z karty.
 * - test: test cechy celu; skutki z onFail stosowane tylko przy porażce celu
 * - apply: skutki stosowane od razu
 * - ally: cele to sojusznicy (gdy brak celów – Herszt)
 * Skutek: { add: "prone" } | { remove: "fatigued" } | { advantage: -1 } | { note: "klucz tłumaczenia" }
 */
export const ORDER_AUTOMATION = {
  trip: { test: { characteristic: "ag", difficulty: "challenging" }, onFail: [{ add: "prone" }] },
  kidneystrike: { apply: [{ add: "bleeding" }, { advantage: -1 }] },
  sand: { apply: [{ add: "blinded" }] },
  cover: { apply: [{ advantage: -1 }] },
  bullrush: { apply: [{ advantage: -1 }] },
  distract: { apply: [{ advantage: -1 }] },
  disarm: { test: { characteristic: "s", difficulty: "difficult" }, onFail: [{ note: "Orders.Effects.DropsWeapon" }] },
  rally: { ally: true, apply: [{ remove: "broken" }] },
  draught: { ally: true, apply: [{ remove: "fatigued" }] },
  bodyblock: { ally: true, apply: [{ advantage: 1 }] },
  grapple: { test: { characteristic: "s", difficulty: "challenging" }, onFail: [{ add: "entangled" }] },
  circle: { ally: true, apply: [{ remove: "surprised" }, { advantage: 1 }] },
  parry: { ally: true, apply: [{ advantage: 1 }] },
  riposte: { apply: [{ advantage: -1 }] },
  challenge: { test: { characteristic: "wp", difficulty: "challenging" }, onFail: [{ note: "Orders.Effects.MustFace" }] },
  pindown: { test: { characteristic: "wp", difficulty: "challenging" }, onFail: [{ add: "surprised" }] },
  fireoil: { test: { characteristic: "ag", difficulty: "challenging" }, onFail: [{ add: "ablaze" }] },
  caltrops: { test: { characteristic: "ag", difficulty: "average" }, onFail: [{ add: "prone" }] },
  collapse: { test: { characteristic: "ag", difficulty: "difficult" }, onFail: [{ add: "stunned" }] },
  wagonwall: { ally: true, apply: [{ advantage: 1 }] },
  spooked: { apply: [{ advantage: -1 }] },
  getaway: { ally: true, apply: [{ remove: "prone" }] },
  spot: { ally: true, apply: [{ advantage: 1 }] },
  lure: { test: { characteristic: "int", difficulty: "challenging" }, onFail: [{ advantage: -1 }, { note: "Orders.Effects.Lured" }] },
  snare: { test: { characteristic: "ag", difficulty: "average" }, onFail: [{ add: "entangled" }] },
  forgedorder: { test: { characteristic: "int", difficulty: "challenging" }, onFail: [{ add: "surprised" }] },
  payoff: { test: { characteristic: "wp", difficulty: "challenging" }, onFail: [{ note: "Orders.Effects.StandsDown" }] },
  salve: { ally: true, apply: [{ remove: "bleeding" }] },
  fumes: { test: { characteristic: "t", difficulty: "challenging" }, onFail: [{ add: "fatigued" }] },
  evileye: { test: { characteristic: "wp", difficulty: "challenging" }, onFail: [{ advantage: -1 }, { note: "Orders.Effects.EvilEye" }] },
  regroup: { ally: true, apply: [{ remove: "surprised" }, { advantage: 1 }] }
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
  static async applyFromIssuer(actor, orderId) {
    const automation = ORDER_AUTOMATION[orderId];
    if (!automation) return [];

    let targetUuids = Array.from(game.user.targets ?? [])
      .map(token => token.actor?.uuid)
      .filter(Boolean);
    if (!targetUuids.length && automation.ally) targetUuids = [actor.uuid];
    if (!targetUuids.length) {
      return [t("Orders.Effects.NoTarget")];
    }

    const result = await queryGM(QUERY_NAME, { orderId, issuerUuid: actor.uuid, targetUuids });
    return Array.isArray(result) ? result : [t("Orders.Effects.GMFailed")];
  }

  /**
   * Handler zapytania wykonywany u MG. Wydający musi być właścicielem Herszta.
   */
  static async onQuery({ orderId, issuerUuid, targetUuids } = {}, { user } = {}) {
    const automation = ORDER_AUTOMATION[orderId];
    if (!automation || !Array.isArray(targetUuids)) return [];
    const issuer = issuerUuid ? await fromUuid(issuerUuid) : null;
    if (!user || !issuer || (!user.isGM && !issuer.testUserPermission(user, "OWNER"))) return [];

    const lines = [];
    for (const uuid of targetUuids.slice(0, 6)) {
      const target = await fromUuid(uuid);
      if (!target) continue;
      lines.push(...await this._applyToTarget(target, automation));
    }
    return lines;
  }

  static async _applyToTarget(target, automation) {
    const name = Handlebars.escapeExpression(target.name ?? "");
    const lines = [];
    let effects = automation.apply ?? [];

    if (automation.test) {
      const { characteristic, difficulty } = automation.test;
      const label = game.i18n.localize(game.wfrp4e?.config?.characteristics?.[characteristic] ?? characteristic);
      let failed = true;
      try {
        const test = await target.setupCharacteristic?.(characteristic, {
          appendTitle: ` – ${t("Orders.Effects.DefenceTitle")}`,
          skipTargets: true,
          fields: { difficulty }
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
        const current = Number(target.system?.status?.advantage?.value) || 0;
        if (current > 0 || effect.advantage > 0) {
          if (typeof target.modifyAdvantage === "function") await target.modifyAdvantage(effect.advantage);
          else await target.update({ "system.status.advantage.value": Math.max(0, current + effect.advantage) });
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
