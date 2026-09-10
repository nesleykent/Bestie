import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadAchievementsData } from "../src/app/services/achievements-repository.js";
import { achievementsTracker, deriveAchievementRow } from "../src/app/trackers/achievements.js";

const source = JSON.parse(await readFile(new URL("../src/data/achievements.json", import.meta.url), "utf8"));

test("achievement descriptions and earning instructions remain separate from source to card and search", async (context) => {
    context.mock.method(globalThis, "fetch", async () => ({ok: true, json: async () => source}));
    const items = await loadAchievementsData();
    const item = items.find((achievement) => achievement.Name === "A Friend in Need");
    const canonical = source.data.find((achievement) => achievement.name === item.Name);
    const row = deriveAchievementRow(item, {done: false, bookmark: false});

    assert.equal(row.description, canonical.description);
    assert.equal(row.spoiler, canonical.spoiler);
    assert.notEqual(row.description, row.spoiler);
    assert.equal(achievementsTracker.card(row).body, canonical.description);
    const search = achievementsTracker.facets.find((facet) => facet.key === "search");
    assert.ok(search.matches(row, "friend indeed"), "description text is searchable");
    assert.ok(search.matches(row, "Sweet Dreams"), "earning instructions remain searchable");
    assert.equal(row.pointsEarned, 0);
    assert.equal(deriveAchievementRow(item, {done: true, bookmark: false}).pointsEarned, canonical.points);
});

test("missing description does not promote spoiler text into the card description", async (context) => {
    context.mock.method(globalThis, "fetch", async () => ({ok: true, json: async () => source}));
    const items = await loadAchievementsData();
    const item = items.find((achievement) => achievement.Name === "Forbidden Knowledge");
    const row = deriveAchievementRow(item, {done: false, bookmark: false});

    assert.equal(row.description, "");
    assert.notEqual(row.spoiler, "");
    assert.equal(achievementsTracker.card(row).body, "");
    assert.ok(row.searchText.includes("key to knowledge"));
});

test("achievement card prose is escaped without showing earning instructions", () => {
    const row = deriveAchievementRow({Name: "Example", description: '<b>Story</b> &amp; context', spoiler: "Secret instruction", grade: 1}, {done: false});
    const card = achievementsTracker.card(row);
    assert.equal(card.body, "Story &amp; context");
    assert.doesNotMatch(card.body, /<b>|Secret instruction/);
});
