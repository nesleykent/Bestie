import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROFICIENCY_BY_BOSS_CATEGORY, PROFICIENCY_BY_DIFFICULTY, PROFICIENCY_ORDER, calculateBossProficiency,
    calculateCreatureProficiency, calculateSessionProficiency, calculateProficiencyPerHour, calculateWeaponProjection,
    getBossProficiencyPerKill, getHuntProficiency, getProficiencyPerKill,
    resolveProficiencyClassification } from "../src/app/features/weapon-proficiency.js";
import { parseHuntSession, extractKilledMonsters } from "../src/app/features/session-parser.js";
import { analyzeSession } from "../src/app/features/session-analysis.js";
import { analyzeTaskSession } from "../src/app/features/task-analysis.js";
const data = JSON.parse(readFileSync(new URL("../src/data/bestiary.json", import.meta.url))).data
    .map((entry) => ({ Name: entry.name, Difficulty: entry.difficulty, Charms: entry.charm_details.charm_points, "Kills to Unlock": entry.charm_details.third_stage }));
// Mirrors bosstiary-repository normalization; the repository itself fetches, so it cannot run here.
const bosses = JSON.parse(readFileSync(new URL("../src/data/bosstiary.json", import.meta.url))).data
    .map((entry) => ({ Name: entry.name, category: entry.category, totalPoints: entry.total_boss_points }));
const sources = { bestiary: data, bosstiary: bosses };
const log = readFileSync(new URL("fixtures/proficiency-hunt.txt", import.meta.url), "utf8");
const bossLog = readFileSync(new URL("fixtures/proficiency-boss-hunt.txt", import.meta.url), "utf8");
const mixed = [{ name: "Makara", killsThisSession: 600 }, { name: "Rotten Golem", killsThisSession: 450 }];
// One real boss per Bosstiary category, taken from the shipped dataset.
const bossKills = [
    { name: "Annihilon", killsThisSession: 2 },
    { name: "Abyssador", killsThisSession: 3 },
    { name: "Ferumbras", killsThisSession: 1 }
];

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
    assert.equal(result.rows[2].classification, null);
    assert.equal(result.rows[2].source, null);
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

/* --- Bosstiary classification ------------------------------------------- */

for (const [category, kills, expected] of [["Bane", 2, 1000], ["Archfoe", 3, 15000], ["Nemesis", 1, 15000]]) {
    test(`${kills} ${category} = ${expected}`, () => {
        assert.equal(calculateBossProficiency(kills, category), expected);
        assert.equal(calculateBossProficiency(kills, category.toUpperCase()), expected);
    });
}
test("boss rewards are the published Bane / Archfoe / Nemesis values and nothing else", () => {
    assert.deepEqual(PROFICIENCY_BY_BOSS_CATEGORY, { bane: 500, archfoe: 5000, nemesis: 15000 });
    assert.equal(getBossProficiencyPerKill("toString"), null);
    assert.equal(getBossProficiencyPerKill("Hard"), null);
    assert.equal(getProficiencyPerKill("Nemesis"), null);
    assert.deepEqual(PROFICIENCY_ORDER, ["harmless", "trivial", "easy", "medium", "hard", "challenging", "bane", "archfoe", "nemesis"]);
});
test("every canonical boss has a supported category; matching reuses creature normalization", () => {
    assert.equal(bosses.filter((boss) => getBossProficiencyPerKill(boss.category) === null).length, 0);
    assert.equal(bosses.filter((boss) => data.some((entry) => entry.Name.toLowerCase() === boss.Name.toLowerCase())).length, 0);
    assert.deepEqual(resolveProficiencyClassification("  fErUmBrAs ", sources),
        { name: "Ferumbras", source: "bosstiary", classification: "nemesis", perKill: 15000 });
    assert.deepEqual(resolveProficiencyClassification("rotten  GOLEM", sources),
        { name: "Rotten Golem", source: "bestiary", classification: "challenging", perKill: 240 });
});
test("each boss category contributes its own reward to a boss-only session", () => {
    const result = calculateSessionProficiency(bossKills, sources, 60);
    assert.deepEqual(result.rows.map((row) => [row.name, row.source, row.classification, row.perKill, row.total]), [
        ["Annihilon", "bosstiary", "bane", 500, 1000],
        ["Abyssador", "bosstiary", "archfoe", 5000, 15000],
        ["Ferumbras", "bosstiary", "nemesis", 15000, 15000]
    ]);
    assert.equal(result.total, 31000);
    assert.equal(result.kills, 6);
    assert.equal(result.perHour, 31000);
    assert.equal(result.isPartial, false);
});
test("mixed creatures and bosses: 207,000 + 31,000 = 238,000 over 2h", () => {
    const result = calculateSessionProficiency([...mixed, ...bossKills], sources, 120);
    assert.equal(result.total, 238000);
    assert.equal(result.kills, 1056);
    assert.equal(result.perHour, 119000);
    assert.equal(result.isPartial, false);
    assert.equal(result.rows.reduce((sum, row) => sum + row.total, 0), result.total);
    assert.ok(Math.abs(result.rows.reduce((sum, row) => sum + row.contribution, 0) - 100) < 1e-10);
    assert.equal(result.rows.filter((row) => row.source === "bosstiary").length, 3);
    assert.equal(result.rows.filter((row) => row.source === "bestiary").length, 2);
});
test("a mixed Hunt Analyzer log reaches the same total through the shared parser", () => {
    const session = parseHuntSession(bossLog);
    assert.equal(session.monsters.length, 5);
    assert.equal(session.sessionDuration, 120);
    const result = getHuntProficiency({ hasProcessedLog: true, sessionLog: bossLog }, sources);
    assert.equal(result.total, 238000);
    assert.equal(result.perHour, 119000);
    assert.equal(result.rows.reduce((sum, row) => sum + row.total, 0), result.total);
    assert.equal(getHuntProficiency({ hasProcessedLog: true, taskMonsters: session.monsters, sessionDuration: 120, parseIssues: [] }, sources).total, 238000);
});
test("unknown bosses and unclassifiable categories are excluded, never invented", () => {
    const unknownBoss = { name: "Not A Real Boss", killsThisSession: 4 };
    const brokenCategory = { Name: "Broken Boss", category: "Overlord", totalPoints: 999 };
    const result = calculateSessionProficiency([...bossKills, unknownBoss, { name: "Broken Boss", killsThisSession: 7 }],
        { bestiary: data, bosstiary: [...bosses, brokenCategory] }, 60);
    assert.equal(result.total, 31000);
    assert.equal(result.kills, 17);
    assert.equal(result.isPartial, true);
    assert.deepEqual(result.rows[3], { name: "Not A Real Boss", source: null, classification: null, kills: 4, perKill: null, total: null, issue: "Unclassified creature", contribution: null });
    assert.deepEqual(result.rows[4], { name: "Broken Boss", source: "bosstiary", classification: null, kills: 7, perKill: null, total: null, issue: "Unclassified boss category", contribution: null });
    assert.ok(result.warnings.includes("Broken Boss: Unclassified boss category."));
    assert.equal(calculateBossProficiency(Number.MAX_SAFE_INTEGER, "Nemesis"), null);
    for (const kills of [-1, 1.5, NaN, "2", null, undefined]) assert.equal(calculateBossProficiency(kills, "Bane"), null);
});
test("without Bosstiary data a boss stays unclassified instead of borrowing a difficulty", () => {
    const bestiaryOnly = calculateSessionProficiency([...mixed, ...bossKills], data, 120);
    assert.equal(bestiaryOnly.total, 207000);
    assert.equal(bestiaryOnly.isPartial, true);
    assert.deepEqual(bestiaryOnly.rows.slice(2).map((row) => [row.source, row.perKill, row.issue]),
        [[null, null, "Unclassified creature"], [null, null, "Unclassified creature"], [null, null, "Unclassified creature"]]);
    // Regular creatures resolve identically whether or not the Bosstiary is supplied.
    assert.equal(calculateSessionProficiency(mixed, sources, 90).total, calculateSessionProficiency(mixed, data, 90).total);
    assert.equal(calculateSessionProficiency(mixed, sources, 90).isPartial, false);
    assert.equal(resolveProficiencyClassification("Ferumbras", data).source, null);
});
test("the breakdown always sums to the session total, partial or not", () => {
    const cases = [
        calculateSessionProficiency([...mixed, ...bossKills], sources, 120),
        calculateSessionProficiency(bossKills, sources, 60),
        calculateSessionProficiency([...bossKills, { name: "Unknown", killsThisSession: 9 }], sources, 60),
        getHuntProficiency({ hasProcessedLog: true, sessionLog: bossLog }, sources),
        calculateSessionProficiency([], sources, 60)
    ];
    for (const result of cases) {
        assert.equal(result.rows.reduce((sum, row) => sum + (row.total ?? 0), 0), result.total);
        assert.equal(result.rows.reduce((sum, row) => sum + (row.kills ?? 0), 0), result.kills);
        const contributions = result.rows.filter((row) => row.total !== null).reduce((sum, row) => sum + row.contribution, 0);
        assert.ok(Math.abs(contributions - (result.total > 0 ? 100 : 0)) < 1e-10);
    }
});
