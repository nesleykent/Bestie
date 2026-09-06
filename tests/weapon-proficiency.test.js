import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROFICIENCY_BY_DIFFICULTY, calculateCreatureProficiency, calculateSessionProficiency,
    calculateProficiencyPerHour, calculateWeaponProjection, getHuntProficiency, getProficiencyPerKill } from "../src/app/features/weapon-proficiency.js";
import { parseHuntSession, extractKilledMonsters } from "../src/app/features/session-parser.js";
import { analyzeSession } from "../src/app/features/session-analysis.js";
import { analyzeTaskSession } from "../src/app/features/task-analysis.js";
const data = JSON.parse(readFileSync(new URL("../src/data/bestiary.json", import.meta.url))).data
    .map((entry) => ({ Name: entry.name, Difficulty: entry.difficulty, Charms: entry.charm_details.charm_points, "Kills to Unlock": entry.charm_details.third_stage }));
const log = readFileSync(new URL("fixtures/proficiency-hunt.txt", import.meta.url), "utf8");
const mixed = [{ name: "Makara", killsThisSession: 600 }, { name: "Rotten Golem", killsThisSession: 450 }];

for (const [difficulty, expected] of [["Harmless", 10], ["Trivial", 300], ["Easy", 700], ["Medium", 1000], ["Hard", 1650], ["Challenging", 2400]]) {
    test(`10 ${difficulty} = ${expected}`, () => assert.equal(calculateCreatureProficiency(10, difficulty), expected));
}
test("600 Hard + 450 Challenging = 207,000; 1.5h = 138,000 XP/h", () => {
    const result = calculateSessionProficiency(mixed, data, 90);
    assert.equal(result.rows[0].total, 99000);
    assert.equal(result.rows[1].total, 108000);
    assert.equal(result.total, 207000);
    assert.equal(result.perHour, 138000);
    assert.equal(result.rows.reduce((sum, row) => sum + row.total, 0), result.total);
    assert.ok(Math.abs(result.rows.reduce((sum, row) => sum + row.contribution, 0) - 100) < 1e-10);
});
test("parser → shared session → both domains; normal XP has no effect", () => {
    const session = parseHuntSession(log);
    const bestiary = analyzeSession(log, data, session);
    const tasks = analyzeTaskSession(log, session);
    assert.equal(bestiary.monsters.length, 2);
    assert.equal(tasks.monsters.length, 2);
    assert.equal(getHuntProficiency({ hasProcessedLog: true, taskMonsters: tasks.monsters, sessionDuration: 90 }, data).total, 207000);
    assert.equal(calculateSessionProficiency(session.monsters, data.map((entry) => ({ ...entry, experience: 999999 })), 90).total, 207000);
});
test("all canonical creatures have a supported difficulty; exact matching is case-insensitive", () => {
    assert.equal(data.filter((entry) => getProficiencyPerKill(entry.Difficulty) === null).length, 0);
    assert.equal(calculateSessionProficiency([{ name: "  rOtTen   GOLEM ", killsThisSession: 450 }], data, 90).total, 108000);
    assert.deepEqual(Object.values(PROFICIENCY_BY_DIFFICULTY), [1, 30, 70, 100, 165, 240]);
});
test("unknown and missing difficulty are explicit, excluded from subtotal, never guessed", () => {
    const result = calculateSessionProficiency([...mixed, { name: "Unknown", killsThisSession: 8 }, { name: "No difficulty", killsThisSession: 4 }], [...data, { Name: "No difficulty", experience: 999999 }], 90);
    assert.equal(result.total, 207000);
    assert.equal(result.kills, 1062);
    assert.equal(result.isPartial, true);
    assert.equal(result.rows[2].difficulty, null);
    assert.equal(result.rows[3].perKill, null);
    assert.equal(result.rows[3].total, null);
    assert.equal(result.rows[3].contribution, null);
    assert.equal(calculateWeaponProjection({ currentXP: 0, targetXP: 300000 }, result).hoursRemaining, null);
    assert.equal(getProficiencyPerKill("toString"), null);
});
test("empty session, zero kills, invalid or zero durations", () => {
    assert.equal(calculateSessionProficiency([], data, 90).total, 0);
    assert.equal(calculateCreatureProficiency(0, "Hard"), 0);
    for (const duration of [0, -1, NaN, Infinity, undefined, "90"]) assert.equal(calculateProficiencyPerHour(207000, duration), null);
    assert.equal(calculateProficiencyPerHour(null, 90), null);
    assert.equal(calculateSessionProficiency([{ name: "Makara", killsThisSession: 0 }], data, 90).rows[0].contribution, 0);
});
test("invalid kills and large values never create a false finite total", () => {
    for (const kills of [-1, 1.5, NaN, Infinity, "10", null, undefined, Number.MAX_SAFE_INTEGER]) {
        assert.equal(calculateCreatureProficiency(kills, "Hard"), null);
        assert.equal(calculateSessionProficiency([{ name: "Makara", killsThisSession: kills }], data, 90).isPartial, true);
    }
    assert.equal(calculateCreatureProficiency(1000000000, "Hard"), 165000000000);
    assert.equal(calculateSessionProficiency(null, data).isPartial, true);
    const huge = [{ name: "Northern Pike", killsThisSession: Number.MAX_SAFE_INTEGER }, { name: "Northern Pike", killsThisSession: 1 }];
    assert.equal(calculateSessionProficiency(huge, data, 90).total, null);
    assert.equal(calculateProficiencyPerHour(207000, Number.MIN_VALUE), null);
    assert.equal(calculateProficiencyPerHour(207000, 1 / 60), 745200000);
});
test("parser preserves duplicate kills; malformed counts cannot be parsed as positive suffixes", () => {
    const session = parseHuntSession("Session: 01:99h\nKilled Monsters:\n -5x Makara\n 1.5x Makara\n 20x Makara\n 30x MAKARA\nLooted Items:");
    assert.equal(session.sessionDuration, 0);
    assert.equal(session.issues.length, 2);
    assert.deepEqual(session.monsters, [{ name: "makara", killsThisSession: 50 }]);
    assert.equal(extractKilledMonsters("Killed Monsters:\n1x __proto__\nLooted Items:").__proto__, 1);
});
test("old saved sessions can derive proficiency without saving redundant totals", () => {
    assert.equal(getHuntProficiency({ hasProcessedLog: true, sessionLog: log }, data).total, 207000);
    assert.equal(getHuntProficiency({ hasProcessedLog: false, sessionLog: log }, data).total, 0);
    const old = getHuntProficiency({ hasProcessedLog: true, matchedMonsters: mixed, sessionDuration: 90 }, data);
    assert.equal(old.total, 207000);
    assert.equal(old.isPartial, true);
});
test("weapon projection: manual target, reached target, missing rate, optional single-creature kills", () => {
    const session = { total: 284760, perHour: 167506, isPartial: false };
    const result = calculateWeaponProjection({ currentXP: 1840000, targetXP: 3000000 }, session, 165);
    assert.equal(result.remainingXP, 1160000);
    assert.equal(Math.round(result.hoursRemaining * 60), 416);
    assert.equal(result.sessionsRemaining.toFixed(1), "4.1");
    assert.equal(result.killsRemaining, 7031);
    assert.equal(calculateWeaponProjection({ currentXP: 4, targetXP: 3 }, session).remainingXP, 0);
    assert.equal(calculateWeaponProjection({ currentXP: -1, targetXP: 3 }, session), null);
    assert.equal(calculateWeaponProjection({ currentXP: 0, targetXP: 3 }, { total: 0, perHour: null }).hoursRemaining, null);
});

test("processed evidence is stable while raw Hunt Analyzer text is being edited", () => {
    const saved = { hasProcessedLog: true, taskMonsters: mixed, parseIssues: [], sessionDuration: 90, sessionLog: "edited draft" };
    assert.equal(getHuntProficiency(saved, data).total, 207000);
    assert.equal(getHuntProficiency({ ...saved, taskMonsters: [], sessionLog: log }, data).total, 0);
    assert.equal(getHuntProficiency({ ...saved, parseIssues: ["Invalid count"] }, data).isPartial, true);
    assert.equal(calculateCreatureProficiency(Symbol("invalid"), "Hard"), null);
    assert.equal(calculateSessionProficiency(mixed, null, 90).isPartial, true);
});
