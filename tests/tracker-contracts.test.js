import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
    isAnsweredEntry,
    isKnownEntry,
    hasStoredEntry,
    getStoredEntry,
    createTrackerProgress,
    getEntry,
    setEntry,
    restoreTrackerProgress,
    REVIEWED_FIELD
} from "../src/app/state/tracker-progress.js";

import {
    createChangeLog,
    pushChange,
    peekChange,
    applyUndo,
    CHANGE_LIMIT
} from "../src/app/state/change-log.js";

import {
    parseCsvRows,
    importTrackerCsv,
    importTrackerJson,
    exportTrackerCsv
} from "../src/app/state/tracker-transfer.js";

import { TRACKERS, getTracker, getTrackerIds, getTrackerEntryDefaults } from "../src/app/trackers/registry.js";

import {
    bestiaryTracker,
    deriveBestiaryRow,
    STAGE_UNSET,
    STAGE_TWO
} from "../src/app/trackers/bestiary.js";
import {
    bosstiaryTracker,
    deriveBossRow,
    BOSS_STAGE_UNSET,
    BOSS_STAGE_NONE
} from "../src/app/trackers/bosstiary.js";
import { charmsTracker, deriveCharmRow } from "../src/app/trackers/charms.js";
import { achievementsTracker, deriveAchievementRow } from "../src/app/trackers/achievements.js";
import { questsTracker, deriveQuestRow } from "../src/app/trackers/quests.js";
import { titlesTracker, deriveTitleRow } from "../src/app/trackers/titles.js";
import { measuringTibiaTracker, deriveMeasuringTibiaRow } from "../src/app/trackers/measuring-tibia.js";

import { loadBestiaryData } from "../src/app/services/bestiary-repository.js";
import { loadBosstiaryData } from "../src/app/services/bosstiary-repository.js";
import { loadAchievementsData } from "../src/app/services/achievements-repository.js";
import { loadQuestsData } from "../src/app/services/quests-repository.js";
import { loadTitlesData } from "../src/app/services/titles-repository.js";
import { loadMeasuringTibiaData } from "../src/app/services/measuring-tibia-repository.js";

/**
 * The bundled game-data files, read once. Tests stub `fetch` to serve these so
 * every derive/transfer contract is exercised against the real dataset rather
 * than a hand-rolled fixture that could drift from what the app actually ships.
 */
const DATA_FILES = {
    bestiary: "bestiary.json",
    bosstiary: "bosstiary.json",
    charms: "charms.json",
    achievements: "achievements.json",
    quests: "quests.json",
    titles: "titles.json",
    "measuring-tibia": "measuring-tibia.json"
};

const DATASETS = Object.fromEntries(await Promise.all(
    Object.entries(DATA_FILES).map(async ([key, file]) => [
        key,
        JSON.parse(await readFile(new URL(`../src/data/${file}`, import.meta.url), "utf8"))
    ])
));

function stubFetch(context) {
    context.mock.method(globalThis, "fetch", async (url) => {
        const key = Object.keys(DATASETS).find((name) => String(url).includes(name));

        if (!key) {
            throw new Error(`Unhandled fetch in test: ${url}`);
        }

        return { ok: true, json: async () => DATASETS[key] };
    });
}

/** Mirrors main.js's buildTrackerRows: derive, then layer on the shared known/answered facts. */
function buildRows(tracker, items, progress, context = {}) {
    return items.map((item) => {
        const entry = getEntry(progress, tracker.id, tracker.itemKey(item), tracker.entryDefaults);
        const row = tracker.derive(item, entry, context);

        row.answered = row.answered ?? isAnsweredEntry(tracker.entryDefaults, entry);
        row.known = row.answered || isKnownEntry(tracker.entryDefaults, entry);
        row.reviewed = Boolean(entry[REVIEWED_FIELD]);

        return row;
    });
}

/** Mirrors main.js's writeTrackerEntries: capture the previous entry, write, log one undoable change. */
function writeEntries(progress, changeLog, tracker, itemKeys, changesFor, kind, label) {
    const before = {};
    let touched = 0;

    itemKeys.forEach((itemKey) => {
        const changes = changesFor(itemKey);

        if (!changes) {
            return;
        }

        before[itemKey] = getStoredEntry(progress, tracker.id, itemKey);
        setEntry(progress, tracker.id, itemKey, tracker.entryDefaults, changes);
        touched += 1;
    });

    if (!touched) {
        return null;
    }

    pushChange(changeLog, { kind, trackerId: tracker.id, label, entries: before, units: {} });

    return peekChange(changeLog);
}

/* ==========================================================================
   Registry
   ========================================================================== */

test("the registry lists exactly the seven trackers in navigation order and falls back safely", () => {
    assert.deepEqual(getTrackerIds(), ["achievements", "bestiary", "bosstiary", "charms", "measuringTibia", "quests", "titles"]);
    assert.equal(TRACKERS.length, 7);
    assert.equal(getTracker("bestiary"), bestiaryTracker);
    assert.equal(getTracker("does-not-exist"), bestiaryTracker, "an unknown id falls back to the Bestiary tracker");

    const defaults = getTrackerEntryDefaults();
    assert.deepEqual(Object.keys(defaults).sort(), getTrackerIds().sort());
    assert.deepEqual(defaults.bestiary, bestiaryTracker.entryDefaults);
});

/* ==========================================================================
   Shared entry-state semantics: unknown vs explicit zero/no vs bookmarks
   ========================================================================== */

test("bookmarking alone never counts as answered or known, but does persist", () => {
    const progress = createTrackerProgress();

    setEntry(progress, "quests", "Some Quest", questsTracker.entryDefaults, { bookmark: true });

    const entry = getEntry(progress, "quests", "Some Quest", questsTracker.entryDefaults);
    assert.equal(hasStoredEntry(progress, "quests", "Some Quest"), true, "a bookmark alone is still worth persisting");
    assert.equal(isAnsweredEntry(questsTracker.entryDefaults, entry), false, "bookmark is excluded from what counts as an answer");
    assert.equal(isKnownEntry(questsTracker.entryDefaults, entry), false);
});

test("marking an item reviewed without an answer is an explicit no, distinct from never having looked", () => {
    const progress = createTrackerProgress();
    const defaults = titlesTracker.entryDefaults;

    // Untouched: genuinely unknown.
    const blank = getEntry(progress, "titles", "Adept Armorer", defaults);
    assert.equal(isKnownEntry(defaults, blank), false);

    // Checked, and the answer is no.
    setEntry(progress, "titles", "Adept Armorer", defaults, { reviewed: true });
    const reviewed = getEntry(progress, "titles", "Adept Armorer", defaults);
    assert.equal(isAnsweredEntry(defaults, reviewed), false, "reviewed carries no claim about the title itself");
    assert.equal(isKnownEntry(defaults, reviewed), true, "but it is no longer unknown");
    assert.equal(hasStoredEntry(progress, "titles", "Adept Armorer"), true);

    // Once actually earned, it is both answered and known — reviewed is no longer needed to say so.
    setEntry(progress, "titles", "Adept Armorer", defaults, { earned: true, reviewed: false });
    const earned = getEntry(progress, "titles", "Adept Armorer", defaults);
    assert.equal(isAnsweredEntry(defaults, earned), true);
    assert.equal(isKnownEntry(defaults, earned), true);
});

test("an entry that returns to every default is dropped from storage, not kept as zeroes", () => {
    const progress = createTrackerProgress();

    setEntry(progress, "bestiary", "Toad", bestiaryTracker.entryDefaults, { kills: 5 });
    assert.equal(hasStoredEntry(progress, "bestiary", "Toad"), true);

    setEntry(progress, "bestiary", "Toad", bestiaryTracker.entryDefaults, { kills: 0 });
    assert.equal(hasStoredEntry(progress, "bestiary", "Toad"), false, "back to the default kill count, the row should vanish");
    assert.deepEqual(progress, {}, "an empty tracker record is removed too, not left as {}");
});

/* ==========================================================================
   Bestiary: exact-kill precedence over the tile, and the stage floors it implies
   ========================================================================== */

test("Bestiary: an exact kill count always wins over the stage tile, even when it implies fewer kills", async (context) => {
    stubFetch(context);
    const items = await loadBestiaryData();
    const toad = items.find((creature) => creature.Name === "Toad");
    assert.ok(toad, "fixture creature Toad must exist in the bundled dataset");
    assert.deepEqual(
        [toad["Stage 1"], toad["Stage 2"], toad["Kills to Unlock"], toad.Charms, toad.echoWarden],
        [25, 250, 500, 15, { eligible: true, points: 5 }]
    );

    // Only the tile is known: 2/3 unlocked implies at least 250 kills, floored there.
    const floored = deriveBestiaryRow(toad, { kills: 0, stage: STAGE_TWO, echoWarden: false, animusMastery: false, bookmark: false });
    assert.equal(floored.kills, 250);
    assert.equal(floored.isFloor, true);
    assert.equal(floored.killsLeft, 250);
    assert.equal(floored.killsCeiling, 499, "at most one short of the next tile");
    assert.equal(floored.killsLeftAtLeast, 1);
    assert.equal(floored.stage, STAGE_TWO);

    // The same stored tile, but now an exact count of 100 is on record too — it must win,
    // even though it is *below* the floor the tile alone would have implied.
    const exact = deriveBestiaryRow(toad, { kills: 100, stage: STAGE_TWO, echoWarden: false, animusMastery: false, bookmark: false });
    assert.equal(exact.kills, 100, "typed kills override the stage floor");
    assert.equal(exact.isFloor, false);
    assert.equal(exact.killsLeft, 400);
    // The displayed tile is recomputed from the true count, not trusted from storage —
    // 100 kills only unlocks stage one (needs 25), not the stored stage two (needs 250).
    assert.equal(exact.stage, 3, "the displayed tile downgrades to match the real count");
    assert.equal(exact.storedStage, STAGE_TWO, "but the raw stored tile is preserved for the control/export");

    const complete = deriveBestiaryRow(toad, { kills: 500, stage: STAGE_UNSET, echoWarden: false, animusMastery: false, bookmark: false });
    assert.equal(complete.isComplete, true);
    assert.equal(complete.charmsEarned, 15);
    assert.equal(complete.stage, 5);
});

test("Bestiary: Echo Warden points are gated strictly by eligibility, not by the stored flag", async (context) => {
    stubFetch(context);
    const items = await loadBestiaryData();
    const crustacea = items.find((creature) => creature.Name === "Crustacea Gigantica");
    assert.ok(crustacea);
    // This creature's own upstream record carries a nonzero Echo Warden point value
    // despite being ineligible — exactly the case the eligibility gate exists for.
    assert.deepEqual(crustacea.echoWarden, { eligible: false, points: 10 });

    const row = deriveBestiaryRow(crustacea, { kills: 1, stage: STAGE_UNSET, echoWarden: true, animusMastery: false, bookmark: false });
    assert.equal(row.echoWardenEligible, false);
    assert.equal(row.echoWardenPoints, 0, "an ineligible creature reports zero Echo Warden points regardless of the raw data");
    assert.equal(row.echoWarden, false, "the claimed flag is not honored when the creature cannot ever be an Echo Warden");
});

test("Bestiary: charm and Echo Warden points are two pools that sum without conflation", async (context) => {
    stubFetch(context);
    const items = await loadBestiaryData();
    const toad = items.find((creature) => creature.Name === "Toad");
    const crustacea = items.find((creature) => creature.Name === "Crustacea Gigantica");

    const toadRow = deriveBestiaryRow(toad, { kills: 500, stage: STAGE_UNSET, echoWarden: true, animusMastery: false, bookmark: false });
    // Below its own unlock target of 5, so no charm points yet, and ineligible for Echo Warden.
    const crustaceaRow = deriveBestiaryRow(crustacea, { kills: 2, stage: STAGE_UNSET, echoWarden: true, animusMastery: false, bookmark: false });

    const budget = bestiaryTracker.providesBudget([toadRow, crustaceaRow]);
    // earned = Toad's 15 charm points + its 5 Echo Warden points; Crustacea contributes nothing yet.
    assert.equal(budget.earned, 20);
    // total = both creatures' charm points (15 + 50) plus only Toad's *eligible* Echo Warden points (5 + 0).
    assert.equal(budget.total, 70);
});

/* ==========================================================================
   Bosstiary: points accrue per stage cleared, and typed kills still win
   ========================================================================== */

test("Bosstiary: boss points accrue incrementally per stage cleared, not only on Mastery", async (context) => {
    stubFetch(context);
    const bosses = await loadBosstiaryData();
    const boss = bosses.find((candidate) => candidate.Name === "Abyssador");
    assert.ok(boss);
    assert.equal(boss.category, "Archfoe");
    assert.equal(boss.totalPoints, 100);
    assert.deepEqual(boss.stages.map((stage) => [stage.kills, stage.points]), [[5, 10], [20, 30], [60, 60]]);

    const none = deriveBossRow(boss, { kills: 0, stage: BOSS_STAGE_NONE, bookmark: false });
    assert.equal(none.pointsEarned, 0);
    assert.equal(none.isComplete, false);

    const prowess = deriveBossRow(boss, { kills: 5, stage: BOSS_STAGE_NONE, bookmark: false });
    assert.equal(prowess.pointsEarned, 10, "Prowess alone already banks its own 10 points");
    assert.equal(prowess.killsLeft, 15, "15 more to Expertise's threshold of 20");

    const expertise = deriveBossRow(boss, { kills: 20, stage: BOSS_STAGE_NONE, bookmark: false });
    assert.equal(expertise.pointsEarned, 40, "Prowess (10) plus Expertise (30), summed rather than replaced");
    assert.equal(expertise.isComplete, false);

    const mastery = deriveBossRow(boss, { kills: 60, stage: BOSS_STAGE_NONE, bookmark: false });
    assert.equal(mastery.pointsEarned, 100, "all three stages sum to the boss's published total");
    assert.equal(mastery.isComplete, true);
    assert.equal(mastery.stageLabel, "Mastery");
});

test("Bosstiary: an exact kill count overrides a stored Mastery tile the same way the Bestiary does", async (context) => {
    stubFetch(context);
    const bosses = await loadBosstiaryData();
    const boss = bosses.find((candidate) => candidate.Name === "Abyssador");

    // The stored tile claims Mastery (stage 4), but only 5 kills are actually on record.
    const row = deriveBossRow(boss, { kills: 5, stage: 4, bookmark: false });
    assert.equal(row.kills, 5, "the typed count, not the stored tile, is the truth");
    assert.equal(row.pointsEarned, 10, "only Prowess is actually cleared at 5 kills");
    assert.equal(row.isComplete, false);
    assert.equal(row.isFloor, false, "a typed count is never reported as a floor");

    // With no typed count, the stored tile is what floors the kill count, at the exact
    // threshold the client shows for it — Expertise floors at 20, not one below.
    const floored = deriveBossRow(boss, { kills: 0, stage: 3, bookmark: false });
    assert.equal(floored.kills, 20);
    assert.equal(floored.pointsEarned, 40);
    assert.equal(floored.isFloor, true);
});

/* ==========================================================================
   Charms: two currencies that never mix, funded by the Bestiary and by each other
   ========================================================================== */

test("Charms: Major charms spend charm points, Minor charms spend echoes, and stages are clamped", async (context) => {
    stubFetch(context);
    const response = await fetch("./data/charms.json");
    const payload = await response.json();
    const major = payload.data.find((charm) => charm.name === "Carnage");
    const minor = payload.data.find((charm) => charm.name === "Adrenaline Burst");

    const carnage = { id: major.id, Name: major.name, type: "Major", effect: major.effect,
        stages: [{ stage: 1, cost: 600, cumulativeCost: 600, value: 10 }, { stage: 2, cost: 900, cumulativeCost: 1500, value: 20 }, { stage: 3, cost: 3000, cumulativeCost: 4500, value: 22 }],
        totalCost: 4500 };
    const adrenaline = { id: minor.id, Name: minor.name, type: "Minor", effect: minor.effect,
        stages: [{ stage: 1, cost: 100, cumulativeCost: 100, value: 6 }, { stage: 2, cost: 150, cumulativeCost: 250, value: 9 }, { stage: 3, cost: 225, cumulativeCost: 475, value: 12 }],
        totalCost: 475 };

    const stage2 = deriveCharmRow(carnage, { stage: 2, bookmark: false });
    assert.equal(stage2.currency, "points");
    assert.equal(stage2.spent, 1500);
    assert.equal(stage2.nextCost, 3000);
    assert.equal(stage2.echoesGenerated, 150, "50 + 100 echoes from the two Major stages unlocked so far");
    assert.equal(stage2.isComplete, false);

    const maxed = deriveCharmRow(carnage, { stage: 3, bookmark: false });
    assert.equal(maxed.spent, 4500);
    assert.equal(maxed.nextCost, 0);
    assert.equal(maxed.echoesGenerated, 350, "50 + 100 + 200");
    assert.equal(maxed.isComplete, true);

    // A hand-edited file could carry any number; a charm only ever has three stages.
    const overshot = deriveCharmRow(carnage, { stage: 99, bookmark: false });
    assert.equal(overshot.stage, 3);
    assert.equal(overshot.spent, 4500);

    const minorRow = deriveCharmRow(adrenaline, { stage: 1, bookmark: false });
    assert.equal(minorRow.currency, "echoes");
    assert.equal(minorRow.spent, 100);
    assert.equal(minorRow.echoesGenerated, 0, "Minor charms never generate echoes themselves");
});

test("Charms: the headline switches between a flat cost and the Bestiary-funded budget, and flags overspend", () => {
    const carnage = {
        Name: "Carnage", type: "Major", effect: "",
        stages: [{ stage: 1, cost: 600, cumulativeCost: 600, value: 10 }, { stage: 2, cost: 900, cumulativeCost: 1500, value: 20 }, { stage: 3, cost: 3000, cumulativeCost: 4500, value: 22 }],
        totalCost: 4500
    };
    const carnageMaxed = deriveCharmRow(carnage, { stage: 3, bookmark: false });
    assert.equal(carnageMaxed.spent, 4500);
    assert.equal(carnageMaxed.isComplete, true);

    const noBudget = charmsTracker.totals([carnageMaxed], {});
    assert.equal(noBudget.answer.label, "Charm Points Spent");
    assert.match(noBudget.answer.value, /4,500|4500/);

    const overspent = charmsTracker.totals([carnageMaxed], { budget: { earned: 20, total: 70 } });
    assert.equal(overspent.answer.label, "Charm Points Available");
    assert.equal(overspent.answer.value, "0");
    assert.match(overspent.answer.note, /more charm points than your Bestiary has earned/);

    const funded = charmsTracker.totals([carnageMaxed], { budget: { earned: 10000, total: 50000 } });
    assert.equal(funded.answer.value, "5,500");
    assert.doesNotMatch(funded.answer.note, /more charm points/);
});

/* ==========================================================================
   Achievements: derived-from-map completion, Removed/uncategorized normalization
   ========================================================================== */

test("Achievements: a completed Cyclopedia Map area satisfies its achievement without double-counting", async (context) => {
    stubFetch(context);
    const achievements = await loadAchievementsData();
    const elvenWoods = achievements.find((achievement) => achievement.Name === "Elven Woods");
    assert.ok(elvenWoods);
    assert.equal(elvenWoods.points, 1);
    assert.equal(elvenWoods.category, "Cyclopedia Map");

    const notYetDerived = deriveAchievementRow(elvenWoods, { done: false, bookmark: false }, { externalDone: new Set() });
    assert.equal(notYetDerived.done, false);
    assert.equal(notYetDerived.isDerived, false);

    const derived = deriveAchievementRow(elvenWoods, { done: false, bookmark: false }, { externalDone: new Set(["Elven Woods"]) });
    assert.equal(derived.done, true);
    assert.equal(derived.isDerived, true);
    assert.equal(derived.pointsEarned, 1);
    assert.match(achievementsTracker.card(derived).control, /is-locked/, "a derived achievement is not independently editable");

    // If the player also ticked it directly, the direct tick wins the "isDerived" flag —
    // it must not still read as locked, and it must not double the points.
    const directAndDerived = deriveAchievementRow(elvenWoods, { done: true, bookmark: false }, { externalDone: new Set(["Elven Woods"]) });
    assert.equal(directAndDerived.done, true);
    assert.equal(directAndDerived.isDerived, false);
    assert.equal(directAndDerived.pointsEarned, 1);
    assert.doesNotMatch(achievementsTracker.card(directAndDerived).control, /is-locked/);
});

test("Achievements: Removed achievements are excluded from totals but stay visible, and categories are normalized", async (context) => {
    stubFetch(context);
    const achievements = await loadAchievementsData();

    const removed = achievements.find((achievement) => achievement.Name === "The More the Merrier");
    assert.ok(removed);
    assert.equal(removed.category, "Removed");
    assert.equal(removed.isObtainable, false);

    const uncategorized = achievements.find((achievement) => achievement.Name === "Smart Thinking");
    assert.equal(uncategorized.category, "Misc.", "an achievement with no upstream category lands in Misc., not its own blank category");

    const aliased = achievements.find((achievement) => achievement.Name === "Beyonder");
    assert.equal(aliased.category, "Quest", "the upstream 'Quests' typo is folded into the real 'Quest' category");

    const removedRow = deriveAchievementRow(removed, { done: true, bookmark: false }, {});
    const totals = achievementsTracker.totals([removedRow]);
    assert.equal(totals.answer.value, "0", "a Removed achievement cannot contribute points even if marked done");
    assert.equal(totals.stats[0], "0 of 0 unlocked");
});

/* ==========================================================================
   Measuring Tibia: area completion is derived from its subareas, never stored twice
   ========================================================================== */

test("Measuring Tibia: an area is complete only once every one of its subareas is discovered", async (context) => {
    stubFetch(context);
    const items = await loadMeasuringTibiaData([]);
    const abDendriel = items.filter((item) => item.area === "Ab'Dendriel");
    assert.deepEqual(abDendriel.map((item) => item.Name).sort(), ["Ab'Dendriel City", "Ab'Dendriel Surroundings", "Draconia", "Elvenbane"]);
    assert.ok(abDendriel.every((item) => item.areaAchievement === "Elven Woods"));

    const progress = createTrackerProgress();
    ["Ab'Dendriel City", "Ab'Dendriel Surroundings", "Draconia"].forEach((name) => {
        setEntry(progress, "measuringTibia", name, measuringTibiaTracker.entryDefaults, { discovered: true });
    });

    const partialRows = buildRows(measuringTibiaTracker, abDendriel, progress);
    assert.deepEqual(measuringTibiaTracker.deriveExternalDone(partialRows), [], "three of four subareas is not the area");

    setEntry(progress, "measuringTibia", "Elvenbane", measuringTibiaTracker.entryDefaults, { discovered: true });
    const completeRows = buildRows(measuringTibiaTracker, abDendriel, progress);
    assert.deepEqual(measuringTibiaTracker.deriveExternalDone(completeRows), ["Elven Woods"]);
});

test("Measuring Tibia feeds Achievements end to end through the real datasets", async (context) => {
    stubFetch(context);
    const mapItems = await loadMeasuringTibiaData([]);
    const abDendriel = mapItems.filter((item) => item.area === "Ab'Dendriel");
    const progress = createTrackerProgress();

    abDendriel.forEach((item) => {
        setEntry(progress, "measuringTibia", item.Name, measuringTibiaTracker.entryDefaults, { discovered: true });
    });

    const mapRows = buildRows(measuringTibiaTracker, abDendriel, progress);
    const externalDone = new Set(measuringTibiaTracker.deriveExternalDone(mapRows));
    assert.ok(externalDone.has("Elven Woods"));

    const achievements = await loadAchievementsData();
    const achievementRows = buildRows(achievementsTracker, achievements, createTrackerProgress(), { externalDone });
    const elvenWoodsRow = achievementRows.find((row) => row.name === "Elven Woods");

    assert.equal(elvenWoodsRow.done, true);
    assert.equal(elvenWoodsRow.isDerived, true);
    const totals = achievementsTracker.totals(achievementRows);
    assert.ok(totals.stats.join(" ").includes("1 of"), "the derived point is reflected in the aggregate totals");
});

/* ==========================================================================
   Quests and Titles: plain booleans, grouped by questlog / gated by permanence
   ========================================================================== */

test("Quests: completion is grouped by questlog, and a trailing-space upstream name still matches on import", async (context) => {
    stubFetch(context);
    const quests = await loadQuestsData();
    // The upstream record for this quest has a trailing space in its name; the
    // repository trims it, and import matching must still find it either way.
    const jack = quests.find((quest) => quest.Name === "Jack to the Future");
    assert.ok(jack, "the trimmed name must be the item's key");
    assert.equal(jack.questlog, "Tibia Tales");

    const row = deriveQuestRow(jack, { completed: true, bookmark: false });
    assert.equal(row.status, "done");
});

test("Titles: permanence is reported as its own stat, separate from the earned count", () => {
    const permanent = deriveTitleRow({ Name: "Adept Armorer", requirement: "Reached Mastery with a weapon at level 3 proficiency.", isPermanent: true }, { earned: true, bookmark: false });
    const losable = deriveTitleRow({ Name: "Adept Enhancer", requirement: "All mods enhanced to Grade III.", isPermanent: false }, { earned: true, bookmark: false });
    const losableUnearned = deriveTitleRow({ Name: "Unrelated Losable Title", requirement: "", isPermanent: false }, { earned: false, bookmark: false });

    const rows = [permanent, losable, losableUnearned].map((row) => ({ ...row, answered: true, known: true }));
    const totals = titlesTracker.totals(rows);

    assert.equal(totals.answer.value, "2", "two titles earned");
    assert.match(totals.stats.find((line) => line.startsWith("Permanent")), /Permanent 1 of 1/);
});

/* ==========================================================================
   Shared transfer: CSV round trips, TibiaDraptor JSON, and no metadata pollution
   ========================================================================== */

test("parseCsvRows handles quoted fields, embedded commas and escaped quotes", () => {
    const rows = parseCsvRows('Name,Note\n"Smith, Jr.","She said ""hi"""\n');
    assert.deepEqual(rows, [["Name", "Note"], ["Smith, Jr.", 'She said "hi"']]);
});

test("Bestiary CSV export/import round-trips a row exactly, including a simultaneous count and tile", async (context) => {
    stubFetch(context);
    const items = await loadBestiaryData();
    const toad = items.find((creature) => creature.Name === "Toad");
    const entry = { kills: 100, stage: STAGE_TWO, bookmark: true, echoWarden: true, animusMastery: false };
    const row = { ...deriveBestiaryRow(toad, entry), answered: true, known: true };

    const csv = exportTrackerCsv([row], items, bestiaryTracker);
    const lines = csv.trim().split("\n");
    assert.equal(lines[0], [...bestiaryTracker.transfer.csvColumns, "Reviewed"].join(","));
    assert.equal(lines[1], "Yes,Toad,15,,100,25,250,500,In progress,400,20%,Yes,No,2/3,No");

    const imported = importTrackerCsv(csv, items, bestiaryTracker);
    assert.equal(imported.matched, 1);
    assert.deepEqual(imported.unmatched, []);
    assert.deepEqual(imported.record.Toad, { kills: 100, stage: STAGE_TWO, echoWarden: true, animusMastery: false, bookmark: true, reviewed: false });
});

test("Bosstiary CSV export/import preserves the derived outcome even though the raw stage can be rebuilt differently", async (context) => {
    stubFetch(context);
    const bosses = await loadBosstiaryData();
    const boss = bosses.find((candidate) => candidate.Name === "Abyssador");
    // A stored Mastery tile with only 5 real kills — the CSV format has no column for the
    // raw stored tile on a boss (unlike the Bestiary's Tile column), only for the level the
    // *current* kill count implies, so the raw entry does not round-trip byte-for-byte.
    const entry = { kills: 5, stage: 4, bookmark: false };
    const originalRow = deriveBossRow(boss, entry);
    const row = { ...originalRow, answered: true, known: true };

    const csv = exportTrackerCsv([row], bosses, bosstiaryTracker);
    const imported = importTrackerCsv(csv, bosses, bosstiaryTracker);
    assert.equal(imported.matched, 1);

    const roundTrippedRow = deriveBossRow(boss, imported.record.Abyssador);
    assert.equal(roundTrippedRow.kills, originalRow.kills);
    assert.equal(roundTrippedRow.pointsEarned, originalRow.pointsEarned);
    assert.equal(roundTrippedRow.isComplete, originalRow.isComplete);
    assert.equal(roundTrippedRow.stage, originalRow.stage);
});

test("Charms CSV export/import round-trips the stage exactly", () => {
    const carnage = { Name: "Carnage", type: "Major", effect: "", stages: [], totalCost: 4500 };
    const entry = { stage: 2, bookmark: true };
    const row = { ...deriveCharmRow(carnage, entry), answered: true, known: true };

    const csv = exportTrackerCsv([row], [carnage], charmsTracker);
    const imported = importTrackerCsv(csv, [carnage], charmsTracker);
    assert.deepEqual(imported.record.Carnage, { stage: 2, bookmark: true, reviewed: false });
});

for (const [label, tracker, item, entryField, load] of [
    ["Achievements", achievementsTracker, "Elven Woods", "done", loadAchievementsData],
    ["Titles", titlesTracker, "Adept Armorer", "earned", loadTitlesData]
]) {
    test(`${label} CSV export/import round-trips a boolean entry exactly`, async (context) => {
        stubFetch(context);
        const items = await load();
        const found = items.find((candidate) => candidate.Name === item);
        assert.ok(found, `${item} must exist in the bundled dataset`);

        const entry = { [entryField]: true, bookmark: true };
        const row = { ...tracker.derive(found, entry, {}), answered: true, known: true };

        const csv = exportTrackerCsv([row], items, tracker);
        const imported = importTrackerCsv(csv, items, tracker);
        assert.equal(imported.matched, 1);
        assert.deepEqual(imported.unmatched, []);
        assert.deepEqual(imported.record[item], { [entryField]: true, bookmark: true, reviewed: false });
    });
}

test("Quests CSV import matches an upstream name with a trailing space by its trimmed key", async (context) => {
    stubFetch(context);
    const quests = await loadQuestsData();
    const csv = "Name,Questlog,Completed,Bookmark\nJack to the Future,Tibia Tales,Yes,No\n";

    const imported = importTrackerCsv(csv, quests, questsTracker);
    assert.equal(imported.matched, 1);
    assert.deepEqual(imported.unmatched, []);
    assert.deepEqual(imported.record["Jack to the Future"], { completed: true, bookmark: false, reviewed: false });
});

test("Measuring Tibia CSV round-trips by its Subarea column, since it has no single 'Name'", async (context) => {
    stubFetch(context);
    const items = await loadMeasuringTibiaData([]);
    const row = { ...deriveMeasuringTibiaRow(items.find((item) => item.Name === "Draconia"), { discovered: true, bookmark: false }), answered: true, known: true };

    const csv = exportTrackerCsv([row], items, measuringTibiaTracker);
    const imported = importTrackerCsv(csv, items, measuringTibiaTracker);
    assert.deepEqual(imported.record.Draconia, { discovered: true, bookmark: false, reviewed: false });
});

test("A tampered CSV cannot smuggle fake game data past the importer — Charms and thresholds still come from the dataset", async (context) => {
    stubFetch(context);
    const items = await loadBestiaryData();
    const csv = [
        bestiaryTracker.transfer.csvColumns.join(","),
        // Charms, Stage 1/2 and Kills to Unlock are all attacker-controlled here.
        "No,Toad,999999,999999,100,1,1,1,Done,0,100%,No,No,2/3"
    ].join("\n");

    const imported = importTrackerCsv(csv, items, bestiaryTracker);
    assert.equal(imported.matched, 1);

    const progress = createTrackerProgress();
    setEntry(progress, "bestiary", "Toad", bestiaryTracker.entryDefaults, imported.record.Toad);
    const toad = items.find((creature) => creature.Name === "Toad");
    const row = deriveBestiaryRow(toad, getEntry(progress, "bestiary", "Toad", bestiaryTracker.entryDefaults));

    assert.equal(row.charms, 15, "the real charm point value, not the tampered CSV cell");
    assert.equal(row.unlockTarget, 500, "the real unlock threshold, not the tampered CSV cell");
    assert.equal(row.kills, 100, "the one column the tracker actually owns is still honored");
});

test("TibiaDraptor JSON import reads only the user_data block, ignoring any game-data fields in the payload", async (context) => {
    stubFetch(context);
    const items = await loadBestiaryData();
    const payload = {
        data: [
            {
                name: "Toad",
                // An attacker- or export-tool-controlled payload could carry anything else here.
                charm_details: { charm_points: 999999 },
                points: 999999,
                user_data: { kills: 50, echo_warden: true, animus_mastery: true }
            },
            { name: "A Creature That Does Not Exist", user_data: { kills: 3 } }
        ]
    };

    const imported = importTrackerJson(JSON.stringify(payload), items, bestiaryTracker);
    assert.equal(imported.matched, 1, "only the row that actually matched a creature is counted");
    assert.deepEqual(imported.unmatched, ["A Creature That Does Not Exist"]);
    assert.deepEqual(imported.record.Toad, { kills: 50, stage: STAGE_UNSET, echoWarden: true, animusMastery: true, bookmark: false, reviewed: false });
    assert.equal(Object.keys(imported.record.Toad).some((field) => !(field in bestiaryTracker.entryDefaults)), false, "no foreign field leaks into the stored entry");

    const toad = items.find((creature) => creature.Name === "Toad");
    const row = deriveBestiaryRow(toad, imported.record.Toad);
    assert.equal(row.charms, 15, "game data still comes from the dataset, never the import payload");
});

test("Bosstiary has no TibiaDraptor JSON stage import, and other trackers do not import JSON at all", () => {
    assert.equal(typeof bosstiaryTracker.transfer.readJsonRow, "function");
    assert.equal(bosstiaryTracker.transfer.readJsonRow({ user_data: { kills: 7 } }).stage, BOSS_STAGE_UNSET, "JSON import carries no stage tile for bosses, only kills");

    for (const tracker of [charmsTracker, achievementsTracker, questsTracker, titlesTracker, measuringTibiaTracker]) {
        assert.equal(tracker.transfer.readJsonRow, undefined, `${tracker.id} should only import CSV`);
    }

    assert.throws(() => importTrackerJson("{}", [], charmsTracker), /only imports CSV/);
});

/* ==========================================================================
   Shared undo: single edits, bulk edits, and imports all restore exactly
   ========================================================================== */

test("Undo after a single edit removes an entry that did not exist before", () => {
    const progress = createTrackerProgress();
    const changeLog = createChangeLog();

    const change = writeEntries(progress, changeLog, questsTracker, ["Jack to the Future"], () => ({ completed: true }), "entry", "Marked Jack to the Future");
    assert.ok(change);
    assert.equal(getEntry(progress, "quests", "Jack to the Future", questsTracker.entryDefaults).completed, true);

    applyUndo(change, progress, {});
    assert.equal(hasStoredEntry(progress, "quests", "Jack to the Future"), false);
    assert.deepEqual(progress, {});
});

test("Undo after a bulk edit restores each row to its own prior state, not a shared one", () => {
    const progress = createTrackerProgress();
    const changeLog = createChangeLog();

    // One of the three targets already had a real answer before the bulk action.
    setEntry(progress, "quests", "Quest A", questsTracker.entryDefaults, { completed: true, bookmark: true });

    const change = writeEntries(
        progress,
        changeLog,
        questsTracker,
        ["Quest A", "Quest B", "Quest C"],
        () => ({ completed: true }),
        "bulk",
        "Marked 3 quests completed"
    );

    assert.equal(change.kind, "bulk");
    assert.equal(Object.keys(change.entries).length, 3);
    ["Quest A", "Quest B", "Quest C"].forEach((name) => {
        assert.equal(getEntry(progress, "quests", name, questsTracker.entryDefaults).completed, true);
    });

    applyUndo(change, progress, {});
    // Quest A returns to exactly what it was — completed and bookmarked — not wiped.
    assert.deepEqual(getEntry(progress, "quests", "Quest A", questsTracker.entryDefaults), { completed: true, bookmark: true, reviewed: false });
    assert.equal(hasStoredEntry(progress, "quests", "Quest B"), false);
    assert.equal(hasStoredEntry(progress, "quests", "Quest C"), false);
});

test("Undo after an import restores pre-existing manual data instead of deleting it", () => {
    const progress = createTrackerProgress();
    const changeLog = createChangeLog();

    // A manually recorded kill count exists before the import runs.
    setEntry(progress, "bestiary", "Toad", bestiaryTracker.entryDefaults, { kills: 10 });

    const importedRecord = {
        Toad: { kills: 999, stage: STAGE_UNSET, echoWarden: false, animusMastery: false, bookmark: false },
        "Crustacea Gigantica": { kills: 5, stage: STAGE_UNSET, echoWarden: false, animusMastery: false, bookmark: false }
    };

    const change = writeEntries(
        progress,
        changeLog,
        bestiaryTracker,
        Object.keys(importedRecord),
        (key) => importedRecord[key],
        "import",
        "Imported bestiary-progress.csv"
    );

    assert.equal(getEntry(progress, "bestiary", "Toad", bestiaryTracker.entryDefaults).kills, 999);
    assert.equal(getEntry(progress, "bestiary", "Crustacea Gigantica", bestiaryTracker.entryDefaults).kills, 5);

    applyUndo(change, progress, {});

    assert.equal(getEntry(progress, "bestiary", "Toad", bestiaryTracker.entryDefaults).kills, 10, "the pre-import manual count is restored, not zeroed");
    assert.equal(hasStoredEntry(progress, "bestiary", "Crustacea Gigantica"), false, "the row the import newly created is fully removed");
});

test("The change log caps at CHANGE_LIMIT and drops the oldest entries first", () => {
    const changeLog = createChangeLog();

    for (let index = 0; index < CHANGE_LIMIT + 5; index += 1) {
        pushChange(changeLog, { kind: "entry", trackerId: "quests", label: `Change ${index}`, entries: {}, units: {} });
    }

    assert.equal(changeLog.length, CHANGE_LIMIT);
    assert.equal(changeLog[0].label, `Change ${CHANGE_LIMIT + 4}`, "the most recent change stays on top");
    assert.equal(changeLog[changeLog.length - 1].label, "Change 5", "the five oldest changes fell off the end");
});

/* ==========================================================================
   Legacy progress normalization
   ========================================================================== */

test("restoreTrackerProgress strips junk, drops entries at their defaults, and never trusts an unknown tracker", () => {
    const defaults = getTrackerEntryDefaults();

    const saved = {
        bestiary: {
            // A malformed count coerces to zero, which is the default — the whole row must vanish.
            Toad: { kills: "50abc", notAField: "smuggled" },
            "Crustacea Gigantica": { kills: 5, bookmark: true, notAField: "smuggled" },
            "": { kills: 5 },
            "   ": { kills: 5 }
        },
        madeUpTracker: { Something: { done: true } },
        quests: "not an object",
        achievements: [{ done: true }]
    };

    const progress = restoreTrackerProgress(saved, defaults, null);

    assert.equal(hasStoredEntry(progress, "bestiary", "Toad"), false, "a garbage count that normalizes to the default is not kept");
    assert.deepEqual(progress.bestiary["Crustacea Gigantica"], { kills: 5, stage: 0, echoWarden: false, animusMastery: false, bookmark: true, reviewed: false });
    assert.deepEqual(Object.keys(progress.bestiary), ["Crustacea Gigantica"], "blank/whitespace keys are rejected");
    assert.equal("madeUpTracker" in progress, false);
    assert.equal("quests" in progress, false, "a non-object record for a real tracker is ignored, not crashed on");
    assert.equal("achievements" in progress, false, "an array is never treated as a record even though typeof is object");
});

test("restoreTrackerProgress only falls back to the legacy Bestiary shape when the new shape carried nothing", () => {
    const defaults = getTrackerEntryDefaults();
    const legacy = { Toad: { kills: 12 } };

    const migrated = restoreTrackerProgress({}, defaults, legacy);
    assert.equal(getEntry(migrated, "bestiary", "Toad", defaults.bestiary).kills, 12, "a fresh workspace adopts the legacy Bestiary data");

    const alreadyMigrated = restoreTrackerProgress({ bestiary: { Toad: { kills: 99 } } }, defaults, legacy);
    assert.equal(getEntry(alreadyMigrated, "bestiary", "Toad", defaults.bestiary).kills, 99, "a workspace that already has the new shape is never overwritten by a stale legacy copy");
});


test("CSV preserves reviewed zero independently from unknown and bookmarks", () => {
    const items = [{ Name: "Known zero" }, { Name: "Unknown" }, { Name: "Bookmark" }];
    const progress = createTrackerProgress();
    setEntry(progress, "quests", "Known zero", questsTracker.entryDefaults, { reviewed: true });
    setEntry(progress, "quests", "Bookmark", questsTracker.entryDefaults, { bookmark: true });
    const csv = exportTrackerCsv(buildRows(questsTracker, items, progress), items, questsTracker);
    const imported = importTrackerCsv(csv, items, questsTracker);
    assert.deepEqual(imported.record, progress.quests);
});

test("CSV rejects ambiguous syntax, duplicate entries and malformed progress before returning a replacement", () => {
    for (const text of ['Name,Kills\n"Toad,20', 'Name,Kills\n"Toad"oops,20', 'Name,Kills\nTo"ad,20']) {
        assert.throws(() => parseCsvRows(text), /CSV|quoted/);
    }
    assert.deepEqual(parseCsvRows('A,B\r"hello\rworld",2\r'), [["A", "B"], ["hello\rworld", "2"]]);
    const items = [{ Name: "Toad" }];
    for (const count of ["12junk", "-1", "1.5", "9007199254740992"]) {
        assert.throws(() => importTrackerCsv(`Name,Killed\nToad,${count}`, items, bestiaryTracker), /count/);
    }
    assert.throws(() => importTrackerCsv('Name,Killed\nToad,1\nToad,2', items, bestiaryTracker), /Duplicate/);
    assert.throws(() => importTrackerCsv('Name,Completed\nToad,maybe', items, questsTracker), /Invalid Completed/);
    assert.throws(() => importTrackerCsv('Name,Stage\nToad,1oops', items, charmsTracker), /count/);
});
