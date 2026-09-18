import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { loadBestiaryData } from "../src/app/services/bestiary-repository.js";
import { loadBosstiaryData } from "../src/app/services/bosstiary-repository.js";
import { loadCharmsData } from "../src/app/services/charms-repository.js";
import { loadAchievementsData } from "../src/app/services/achievements-repository.js";
import { loadQuestsData } from "../src/app/services/quests-repository.js";
import { loadTitlesData } from "../src/app/services/titles-repository.js";
import { loadMeasuringTibiaData } from "../src/app/services/measuring-tibia-repository.js";

/**
 * Independent audit of the seven bundled tracker snapshots themselves — not the
 * tracker formulas `tracker-contracts.test.js` already covers. These tests read
 * the raw `src/data/*.json` payloads (the shape the network never sees once the
 * repositories normalize it) so that dataset facts, provenance and cross-dataset
 * joins are checked against the actual shipped files rather than a hand-built
 * fixture. Findings are written up in `docs/tracker-data-audit.md`; several tests
 * below intentionally pin a documented gap rather than the eventually-desired
 * fact, so that fixing the underlying data is what turns them into a normal
 * "assert the good state" test.
 */

const RAW_FILES = {
    achievements: "achievements.json",
    bestiary: "bestiary.json",
    bosstiary: "bosstiary.json",
    charms: "charms.json",
    "measuring-tibia": "measuring-tibia.json",
    quests: "quests.json",
    titles: "titles.json"
};

const RAW = Object.fromEntries(await Promise.all(
    Object.entries(RAW_FILES).map(async ([key, file]) => [
        key,
        JSON.parse(await readFile(new URL(`../src/data/${file}`, import.meta.url), "utf8"))
    ])
));

function stubFetch(context) {
    context.mock.method(globalThis, "fetch", async (url) => {
        const key = Object.keys(RAW).find((name) => String(url).includes(name));

        if (!key) {
            throw new Error(`Unhandled fetch in test: ${url}`);
        }

        return { ok: true, json: async () => RAW[key] };
    });
}

/* ==========================================================================
   Identity: every dataset key is unique and non-blank
   ========================================================================== */

test("Bestiary: all 833 creatures have a unique id and a unique, non-blank name", async (context) => {
    stubFetch(context);
    const creatures = await loadBestiaryData();
    assert.equal(creatures.length, 833);

    const ids = creatures.map((creature) => creature.ID);
    const names = creatures.map((creature) => creature.Name);
    assert.equal(new Set(ids).size, ids.length, "duplicate Bestiary id");
    assert.equal(new Set(names).size, names.length, "duplicate Bestiary name");
    assert.ok(names.every((name) => name.length > 0), "blank Bestiary name");
});

test("Bosstiary: all 316 bosses have a unique id/name, and only the three published categories appear", async (context) => {
    stubFetch(context);
    const bosses = await loadBosstiaryData();
    assert.equal(bosses.length, 316);

    const ids = bosses.map((boss) => boss.id);
    const names = bosses.map((boss) => boss.Name);
    assert.equal(new Set(ids).size, ids.length, "duplicate Bosstiary id");
    assert.equal(new Set(names).size, names.length, "duplicate Bosstiary name");
    assert.deepEqual(new Set(bosses.map((boss) => boss.category)), new Set(["Bane", "Archfoe", "Nemesis"]));
});

test("Charms: all 25 charms have a unique id/name and a known type", async (context) => {
    stubFetch(context);
    const charms = await loadCharmsData();
    assert.equal(charms.length, 25);

    const ids = charms.map((charm) => charm.id);
    const names = charms.map((charm) => charm.Name);
    assert.equal(new Set(ids).size, ids.length, "duplicate Charm id");
    assert.equal(new Set(names).size, names.length, "duplicate Charm name");
    assert.ok(charms.every((charm) => charm.type === "Major" || charm.type === "Minor"));
});

test("Achievements: all 570 achievements have a unique id/name", async (context) => {
    stubFetch(context);
    const achievements = await loadAchievementsData();
    assert.equal(achievements.length, 570);

    const ids = achievements.map((achievement) => achievement.id);
    const names = achievements.map((achievement) => achievement.Name);
    assert.equal(new Set(ids).size, ids.length, "duplicate Achievement id");
    assert.equal(new Set(names).size, names.length, "duplicate Achievement name");
});

test("Quests: all 237 quests have a unique id and a unique, trimmed name", async (context) => {
    stubFetch(context);
    const quests = await loadQuestsData();
    assert.equal(quests.length, 237);

    const ids = quests.map((quest) => quest.id);
    const names = quests.map((quest) => quest.Name);
    assert.equal(new Set(ids).size, ids.length, "duplicate Quest id");
    assert.equal(new Set(names).size, names.length, "duplicate Quest name (case where trimming collides two upstream rows)");
});

test("Titles: all 113 titles have a unique id/name", async (context) => {
    stubFetch(context);
    const titles = await loadTitlesData();
    assert.equal(titles.length, 113);

    const ids = titles.map((title) => title.id);
    const names = titles.map((title) => title.Name);
    assert.equal(new Set(ids).size, ids.length, "duplicate Title id");
    assert.equal(new Set(names).size, names.length, "duplicate Title name");
});

test("Measuring Tibia: 20 areas cover 171 globally unique subarea names", async (context) => {
    stubFetch(context);
    const subareas = await loadMeasuringTibiaData([]);
    assert.equal(subareas.length, 171);

    const areaCount = new Set(subareas.map((item) => item.area)).size;
    assert.equal(areaCount, 20);

    const names = subareas.map((item) => item.Name);
    assert.equal(new Set(names).size, names.length, "a subarea name must be a safe cross-area key");
});

/* ==========================================================================
   Thresholds and costs: every published number is internally consistent
   ========================================================================== */

test("Bestiary: every creature's Stage 1 <= Stage 2 <= Kills to Unlock, and Charms/Echo Warden points are non-negative", async (context) => {
    stubFetch(context);
    const creatures = await loadBestiaryData();

    creatures.forEach((creature) => {
        assert.ok(creature["Stage 1"] <= creature["Stage 2"], `${creature.Name}: Stage 1 above Stage 2`);
        assert.ok(creature["Stage 2"] <= creature["Kills to Unlock"], `${creature.Name}: Stage 2 above the unlock target`);
        assert.ok(creature.Charms >= 0, `${creature.Name}: negative charm points`);
        assert.ok(creature.echoWarden.points >= 0, `${creature.Name}: negative Echo Warden points`);
        assert.ok(creature["Kills to Unlock"] > 0, `${creature.Name}: an unlock target of zero is never reachable`);
    });
});

test("Bosstiary: each boss's three stage points sum to its published total, and kill thresholds strictly increase", async (context) => {
    stubFetch(context);
    const bosses = await loadBosstiaryData();

    bosses.forEach((boss) => {
        const [prowess, expertise, mastery] = boss.stages;
        const sum = prowess.points + expertise.points + mastery.points;
        assert.equal(sum, boss.totalPoints, `${boss.Name}: stage points ${sum} do not sum to totalPoints ${boss.totalPoints}`);
        assert.ok(prowess.kills < expertise.kills, `${boss.Name}: Prowess threshold not below Expertise`);
        assert.ok(expertise.kills < mastery.kills, `${boss.Name}: Expertise threshold not below Mastery`);
    });
});

test("Charms: each charm's three stage costs sum to its published totalCost, and every charm has exactly three stages", async (context) => {
    stubFetch(context);
    const charms = await loadCharmsData();

    charms.forEach((charm) => {
        assert.equal(charm.stages.length, 3, `${charm.Name}: expected exactly three stages`);
        assert.equal(charm.stages[2].cumulativeCost, charm.totalCost, `${charm.Name}: cumulative cost does not reach totalCost`);
        assert.ok(charm.effect.includes("{{"), `${charm.Name}: effect text has no stage-value placeholder to interpolate`);
    });
});

/* ==========================================================================
   Cross-dataset joins
   ========================================================================== */

test("Measuring Tibia: every area's achievement name resolves to a real, Cyclopedia-Map-categorized Achievements entry", async (context) => {
    stubFetch(context);
    const subareas = await loadMeasuringTibiaData([]);
    const achievements = await loadAchievementsData();
    const byName = new Map(achievements.map((achievement) => [achievement.Name, achievement]));

    const areaAchievements = new Set(subareas.map((item) => item.areaAchievement));
    areaAchievements.forEach((name) => {
        const achievement = byName.get(name);
        assert.ok(achievement, `area achievement "${name}" does not exist in achievements.json`);
        assert.equal(achievement.category, "Cyclopedia Map", `"${name}" is not categorized as Cyclopedia Map upstream`);
    });
});

test("Measuring Tibia: the Bestiary-location join reaches 147 of 171 subareas", async (context) => {
    stubFetch(context);
    const bestiaryItems = await loadBestiaryData();
    const subareas = await loadMeasuringTibiaData(bestiaryItems);

    const withCount = subareas.filter((item) => item.creatureCount !== null);
    // Locked to the exact figure the repository's own doc comment claims, so a
    // silent regression (or improvement) in the join is visible here rather than
    // only in the UI.
    assert.equal(withCount.length, 147);
});

test("RESOLVED (see docs/tracker-data-audit.md): the 'Venore Dragon lair' subarea joins the Bestiary locations that describe the same place despite differing case", async (context) => {
    stubFetch(context);
    const bestiaryItems = await loadBestiaryData();
    const subareas = await loadMeasuringTibiaData(bestiaryItems);
    const subarea = subareas.find((item) => item.Name === "Venore Dragon lair");
    assert.ok(subarea, "the lowercase-'lair' spelling must still exist in the bundled dataset for this test to mean anything");

    // Four Bestiary creatures (Dragon, Dragon Lord, Dragon Hatchling, Dragon Lord
    // Hatchling) list "Venore Dragon Lair" — capital L — as a location. The join
    // is trimmed and case-insensitive, so the differing case no longer hides the
    // match, and the subarea's own name stays exactly as recorded upstream
    // ("Venore Dragon lair", lowercase) rather than being rewritten to match.
    assert.equal(subarea.creatureCount, 4);

    const dragonLocations = bestiaryItems
        .filter((creature) => creature.locationList.includes("Venore Dragon Lair"))
        .map((creature) => creature.Name);
    assert.deepEqual(dragonLocations.sort(), ["Dragon", "Dragon Hatchling", "Dragon Lord", "Dragon Lord Hatchling"]);
});

/* ==========================================================================
   Source metadata: capturedAt/source provenance, and foreign fields ignored
   ========================================================================== */

test("Six of the seven bundled snapshots carry source/sourceName/capturedAt provenance", () => {
    for (const key of ["achievements", "bosstiary", "charms", "measuring-tibia", "quests", "titles"]) {
        const payload = RAW[key];
        assert.ok(payload.source, `${key}.json has no source URL`);
        assert.ok(payload.sourceName, `${key}.json has no sourceName`);
        assert.match(payload.capturedAt, /^\d{4}-\d{2}-\d{2}$/, `${key}.json has no capturedAt date`);
    }
});

test("KNOWN GAP (see docs/tracker-data-audit.md): bestiary.json is the one dataset with no source/sourceName/capturedAt at all", () => {
    const payload = RAW.bestiary;
    assert.equal(payload.source, undefined);
    assert.equal(payload.sourceName, undefined);
    assert.equal(payload.capturedAt, undefined);
    // It does carry TibiaDraptor's own live pagination/account scaffolding instead
    // of the plain source manifest the other six datasets use.
    assert.ok(payload.links && payload.meta && payload.user_details);
});

test("Every bundled dataset's foreign per-record progress fields are inert in the shipped snapshot", async (context) => {
    stubFetch(context);
    // Loaded through the repositories to prove these fields are also never
    // surfaced on a normalized row, not just zero upstream.
    const creatures = await loadBestiaryData();
    assert.ok(creatures.every((creature) => !("user_data" in creature) && !("kills" in creature)));

    RAW.bestiary.data.forEach((creature) => {
        assert.deepEqual(creature.user_data, { progress: 0, kills: 0, animus_mastery: false, echo_warden: false });
    });
    assert.deepEqual(RAW.bestiary.user_details, { count: 0, points: 0 });
    assert.deepEqual(RAW.bosstiary.user_details, { prowess: { count: 0 }, expertise: { count: 0 }, mastery: { count: 0, points: 0 } });
    assert.deepEqual(RAW.quests.user_details, { quests_in_progress: 0, quests_completed: 0 });
    assert.deepEqual(RAW.titles.user_details, { titles_earned: 0 });

    const checkedTruthy = [...RAW.bosstiary.data, ...RAW.charms.data, ...RAW.quests.data, ...RAW.titles.data, ...RAW.achievements.data]
        .filter((row) => row.checked === true || row.checked === 1);
    assert.equal(checkedTruthy.length, 0, "a foreign 'checked' answer is baked into the bundled snapshot");
});

test("Normalization ignores foreign per-record progress even when it is nonzero, not just in the shipped all-zero snapshot", async (context) => {
    // The test above only proves the bundled file happens to carry zeroes. This
    // proves the normalizer itself drops these fields structurally, by feeding it
    // a synthetic row where every foreign progress field is nonzero/true.
    const dirtyBestiary = {
        data: [{
            ...RAW.bestiary.data[0],
            user_data: { progress: 5000, kills: 9999, animus_mastery: true, echo_warden: true }
        }]
    };
    const dirtyAchievement = {
        data: [{
            ...RAW.achievements.data[0],
            checked: true
        }]
    };

    context.mock.method(globalThis, "fetch", async (url) => {
        if (String(url).includes("bestiary")) {
            return { ok: true, json: async () => dirtyBestiary };
        }

        if (String(url).includes("achievements")) {
            return { ok: true, json: async () => dirtyAchievement };
        }

        throw new Error(`Unhandled fetch in test: ${url}`);
    });

    const [creatures, achievements] = await Promise.all([loadBestiaryData(), loadAchievementsData()]);

    assert.equal(creatures.length, 1);
    assert.ok(!("user_data" in creatures[0]) && !("kills" in creatures[0]) && !("checked" in creatures[0]));

    assert.equal(achievements.length, 1);
    assert.ok(!("checked" in achievements[0]));
});

/* ==========================================================================
   Achievements: source fact freshness, and an un-derived cross-dataset gap
   ========================================================================== */

test("RESOLVED (see docs/tracker-data-audit.md): community rarity's own older aggregation date survives normalization as rarityObservedAt", async (context) => {
    stubFetch(context);
    // The vast majority of achievements share one upstream aggregation run,
    // which predates the file's own capturedAt by about three months.
    const aggregatedAt = RAW.achievements.data
        .map((achievement) => achievement.completion_stats?.last_aggregated_at)
        .filter(Boolean);
    assert.equal(aggregatedAt.length, 555);
    assert.ok(aggregatedAt.every((value) => value === "2026-05-12 01:07:35"));
    assert.ok(RAW.achievements.capturedAt > "2026-05-12", "capturedAt should postdate the rarity aggregation for this gap to matter");

    const achievements = await loadAchievementsData();
    const withAggregation = achievements.filter((achievement) => achievement.rarityObservedAt);
    // The normalized row now carries the aggregation date under its own name,
    // distinct from the file's capturedAt, so a consumer can tell rarity/percentage
    // is older than the rest of the record.
    assert.equal(withAggregation.length, 555);
    assert.ok(withAggregation.every((achievement) => achievement.rarityObservedAt === "2026-05-12 01:07:35"));

    const withoutStats = achievements.filter((achievement) => !achievement.rarityObservedAt);
    assert.equal(withoutStats.length, 15, "achievements with no completion_stats at all");
    assert.ok(withoutStats.every((achievement) => achievement.rarityObservedAt === null));
});

test("Achievements: a missing community percentage normalizes to null, never a misleading zero", async (context) => {
    stubFetch(context);
    const achievements = await loadAchievementsData();

    const noStats = achievements.filter((achievement) => !RAW.achievements.data
        .find((row) => row.id === achievement.id).completion_stats);
    assert.ok(noStats.length > 0, "at least one achievement must have no completion_stats for this test to mean anything");
    assert.ok(noStats.every((achievement) => achievement.rarityPercent === null), "a missing percentage must stay null, not coerce to 0");
    assert.ok(noStats.every((achievement) => achievement.rarityPercent !== 0));
});

test("KNOWN GAP (see docs/tracker-data-audit.md): seven Bestiary-category achievements read like Measuring-Tibia-style derived facts but have no cross-dataset join or structured threshold", async (context) => {
    stubFetch(context);
    const achievements = await loadAchievementsData();
    const bestiaryCategory = achievements.filter((achievement) => achievement.category === "Bestiary");

    // Their spoiler text names an exact Bestiary-difficulty completion count,
    // the same shape of fact Measuring Tibia already derives for Cyclopedia Map —
    // but achievements.json has no structured field for the count/difficulty
    // pair, only this free text, and no tracker declares `derivesFor`/
    // `deriveExternalDone` against the Bestiary dataset the way
    // measuring-tibia.js does. Recording one of these seven is entirely manual.
    assert.deepEqual(
        bestiaryCategory.map((achievement) => achievement.Name).sort(),
        [
            "Contender",
            "Hunting Permit",
            "Little Adventure",
            "Little Big Adventure",
            "Master Hunter",
            "Serious Contender",
            "Skilled Hunter"
        ]
    );
    bestiaryCategory.forEach((achievement) => {
        assert.match(achievement.spoiler, /Unlock all details from (any monster|\d+ \w+ monsters)/);
    });
});

/* ==========================================================================
   Quests: the README's "94 questlogs" figure includes a blank bucket
   ========================================================================== */

test("KNOWN GAP (see docs/tracker-data-audit.md): 104 of 237 quests carry no questlog at all, leaving only 93 real questlogs", async (context) => {
    stubFetch(context);
    const quests = await loadQuestsData();

    const blank = quests.filter((quest) => !quest.questlog);
    const namedQuestlogs = new Set(quests.map((quest) => quest.questlog).filter(Boolean));

    assert.equal(blank.length, 104, "quests with no questlog attribution at all");
    assert.equal(namedQuestlogs.size, 93, "distinct real (non-blank) questlogs");
    // README states "237 quests across 94 questlogs" — that figure only balances
    // by counting the blank/"Ungrouped" bucket as a 94th questlog.
    assert.equal(namedQuestlogs.size + 1, 94);
});


test("explicitly null or blank rarity percentages remain unknown", async (context) => {
    context.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({ data:
        [null, "", " ", undefined, 0].map((percentage, index) => ({ ...RAW.achievements.data[0], id: index, completion_stats: { percentage } }))
    }) }));
    const rows = await loadAchievementsData();
    assert.deepEqual(rows.map(row => row.rarityPercent), [null, null, null, null, 0]);
});
