import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHuntSession, extractSessionDuration, extractKilledMonsters } from "../src/app/features/session-parser.js";

const log = readFileSync(new URL("fixtures/full-hunt.txt", import.meta.url), "utf8");

test("full Hunt Analyzer log: metrics, drops and no derivation when everything is reported", () => {
    const session = parseHuntSession(log);
    assert.equal(session.sessionDuration, 150);
    assert.deepEqual(session.monsters, [
        { name: "makara", killsThisSession: 450 },
        { name: "rotten golem", killsThisSession: 75 }
    ]);
    assert.deepEqual(session.issues, []);
    assert.deepEqual(session.metricIssues, []);
    assert.deepEqual(session.metrics, {
        experience: 11000000,
        rawExperience: 12345678,
        xpPerHour: 4400000,
        rawXpPerHour: 4938271,
        loot: 250000,
        supplies: 40000,
        balance: 210000,
        damage: 900000,
        damagePerHour: 360000,
        healing: 300000,
        healingPerHour: 120000
    });
    assert.deepEqual(session.derivedMetrics, []);
    assert.deepEqual(session.drops, [
        { name: "Gold Coin", count: 750 },
        { name: "Small Amethyst", count: 3 }
    ]);
});

test("missing measurements are null, never zero", () => {
    const session = parseHuntSession("Session: 01:00h\nKilled Monsters:\n1x Makara\nLooted Items:\n");
    assert.deepEqual(session.metrics, {
        experience: null, rawExperience: null, xpPerHour: null, rawXpPerHour: null,
        loot: null, supplies: null, balance: null,
        damage: null, damagePerHour: null, healing: null, healingPerHour: null
    });
    assert.deepEqual(session.derivedMetrics, []);
    assert.deepEqual(session.drops, []);
    assert.deepEqual(session.metricIssues, []);
});

test("balance and hourly rates are derived only when the underlying totals and a positive duration exist", () => {
    const withDuration = parseHuntSession(
        "Session: 01:00h\nXP Gain: 1,000,000\nRaw XP Gain: 2,000,000\nLoot: 500,000\nSupplies: 100,000\n"
        + "Damage: 600,000\nHealing: 300,000\nKilled Monsters:\n1x Makara\nLooted Items:\n"
    );
    assert.equal(withDuration.metrics.balance, 400000);
    assert.equal(withDuration.metrics.xpPerHour, 1000000);
    assert.equal(withDuration.metrics.rawXpPerHour, 2000000);
    assert.equal(withDuration.metrics.damagePerHour, 600000);
    assert.equal(withDuration.metrics.healingPerHour, 300000);
    assert.deepEqual([...withDuration.derivedMetrics].sort(),
        ["balance", "damagePerHour", "healingPerHour", "rawXpPerHour", "xpPerHour"]);

    const withoutDuration = parseHuntSession("XP Gain: 1,000,000\nLoot: 500,000\nSupplies: 100,000\nKilled Monsters:\n1x Makara\nLooted Items:\n");
    assert.equal(withoutDuration.sessionDuration, 0);
    assert.equal(withoutDuration.metrics.xpPerHour, null);
    assert.equal(withoutDuration.metrics.balance, 400000);
    assert.deepEqual(withoutDuration.derivedMetrics, ["balance"]);
});

test("signed Balance, English comma-grouped totals, and unsafe/malformed values", () => {
    const negative = parseHuntSession("Balance: -1,234\nKilled Monsters:\n1x Makara\nLooted Items:\n");
    assert.equal(negative.metrics.balance, -1234);

    const malformed = parseHuntSession(
        "XP Gain: 12.345\nLoot: -500\nSupplies: 12,3,4\nDamage: 99999999999999999999999\n"
        + "Killed Monsters:\n1x Makara\nLooted Items:\n"
    );
    assert.equal(malformed.metrics.experience, null);
    assert.equal(malformed.metrics.loot, null);
    assert.equal(malformed.metrics.supplies, null);
    assert.equal(malformed.metrics.damage, null);
    assert.equal(malformed.metricIssues.length, 4);
    assert.deepEqual(malformed.issues, []);
    assert.deepEqual(malformed.monsters, [{ name: "makara", killsThisSession: 1 }]);
});

test("malformed loot rows and malformed duration are metric issues, never kill issues; kills survive for proficiency", () => {
    const session = parseHuntSession("Session: 01:99h\nKilled Monsters:\n5x Makara\nLooted Items:\nnot a valid drop line\n2x Gold Coin\n");
    assert.equal(session.sessionDuration, 0);
    assert.equal(session.issues.length, 0);
    assert.ok(session.metricIssues.some((issue) => /duration/i.test(issue)));
    assert.ok(session.metricIssues.some((issue) => /loot entry/i.test(issue)));
    assert.deepEqual(session.monsters, [{ name: "makara", killsThisSession: 5 }]);
    assert.deepEqual(session.drops, [{ name: "Gold Coin", count: 2 }]);
});

test("duplicate looted rows accumulate like duplicate killed rows", () => {
    const session = parseHuntSession("Killed Monsters:\n1x Makara\nLooted Items:\n10x Gold Coin\n5x Gold Coin\n");
    assert.deepEqual(session.drops, [{ name: "Gold Coin", count: 15 }]);
});

test("existing exports are preserved", () => {
    assert.equal(typeof extractSessionDuration, "function");
    assert.equal(typeof extractKilledMonsters, "function");
    assert.deepEqual(extractKilledMonsters("Killed Monsters:\n2x Makara\nLooted Items:\n"), { makara: 2 });
});

test("ungrouped totals and positive balance parse; malformed explicit values are never replaced by derived estimates", () => {
    const session = parseHuntSession("Session: 00:03h\nXP Gain: 1001\nBalance: +1000\nLoot: 2000\nSupplies: 1000\nDamage: 1000\nDamage/h: bad\nKilled Monsters:\n1x Rat\nLooted Items:");
    assert.equal(session.metrics.experience, 1001);
    assert.equal(session.metrics.balance, 1000);
    assert.equal(session.metrics.xpPerHour, 20020);
    assert.equal(session.metrics.damagePerHour, null);
    assert.ok(session.metricIssues.length);
    assert.equal(extractSessionDuration("FakeSession: 01:30h garbage"), 0);
    assert.equal(extractSessionDuration("Session: 01:30h extra"), 0);
});
