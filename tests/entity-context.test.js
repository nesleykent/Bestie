import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getEntityContext } from "../src/app/features/entity-context.js";
import { loadAchievementsData } from "../src/app/services/achievements-repository.js";
import { loadQuestsData } from "../src/app/services/quests-repository.js";
import { loadBestiaryData } from "../src/app/services/bestiary-repository.js";
import { loadMeasuringTibiaData } from "../src/app/services/measuring-tibia-repository.js";

async function canonicalItems(context) {
    context.mock.method(globalThis, "fetch", async (path) => ({
        ok: true,
        json: async () => JSON.parse(await readFile(new URL(`../src/${path.replace(/^\.\//, "")}`, import.meta.url), "utf8"))
    }));
    const bestiary = await loadBestiaryData();
    return { bestiary, measuringTibia: await loadMeasuringTibiaData(bestiary), achievements: await loadAchievementsData(), quests: await loadQuestsData() };
}

test("canonical Measuring subareas expose source-backed creatures and area achievements in both directions", async (context) => {
    const items = await canonicalItems(context);
    const before = JSON.stringify(items);
    const subarea = items.measuringTibia.find((area) => area.creatureCount > 0);
    const result = getEntityContext("measuringTibia", subarea.Name, items);
    const creatures = result.relations.filter((relation) => relation.trackerId === "bestiary");
    assert.equal(creatures.length, subarea.creatureCount);
    assert.ok(result.relations.some((relation) => relation.key === subarea.areaAchievement && relation.kind === "reward"));
    assert.ok(getEntityContext("bestiary", creatures[0].key, items).relations.some((relation) => relation.key === subarea.Name));
    assert.ok(getEntityContext("achievements", subarea.areaAchievement, items).relations.some((relation) => relation.key === subarea.Name && relation.kind === "requirement"));
    assert.equal(JSON.stringify(items), before, "relationships do not mutate items or progress");
    assert.equal(getEntityContext("measuringTibia", "Ab'Dendriel City", items).relations.filter((relation) => relation.trackerId === "bestiary").length, 0);
});

test("quest rewards and actual spoiler hrefs retain different relationship semantics", async (context) => {
    const items = await canonicalItems(context);
    const graveDanger = getEntityContext("quests", "Grave Danger", items);
    assert.equal(graveDanger.relations.find((relation) => relation.key === "Inquisition's Hand").kind, "reward");
    assert.equal(graveDanger.relations.find((relation) => relation.key === "A Study in Scarlett").kind, "context");
    const achievement = getEntityContext("achievements", "A Study in Scarlett", items);
    assert.ok(achievement.sources.some((source) => source.url === "https://tibia.fandom.com/wiki/Grave_Danger_Quest"));
    assert.equal(achievement.relations.find((relation) => relation.key === "Grave Danger").kind, "context");
});

test("similar names, themes and partial reward names never establish a relationship", () => {
    const items = {
        quests: [{ Name: "Fire", rewards: "Fire Walker achievement" }, { Name: "Fire Walker", rewards: "A magic fire sword" }],
        achievements: [{ Name: "Fire", spoiler: "Enjoy the fire." }, { Name: "Fire Walker", spoiler: "" }],
        bestiary: [{ Name: "Fire", locationList: ["Forest Outskirts"] }],
        measuringTibia: [{ Name: "Forest", area: "Wood", areaAchievement: "Missing" }]
    };
    assert.deepEqual(getEntityContext("achievements", "Fire", items).relations, []);
    assert.deepEqual(getEntityContext("quests", "Fire Walker", items).relations, []);
    assert.deepEqual(getEntityContext("measuringTibia", "Forest", items).relations, []);
    assert.equal(getEntityContext("quests", "Fire", items).relations[0].key, "Fire Walker");
});

test("inspectors open verified entity pages, including disambiguation and title anchors", () => {
    const cases = [
        ["achievements", "A Friend in Need", "A_Friend_in_Need"],
        ["charms", "Curse", "Curse_(Charm)"],
        ["titles", "Adept Armorer", "Cyclopedia#Adept_Armorer"],
        ["quests", "The Great Expedition", "The_Great_Expedition"],
        ["bestiary", "Wisp", "Wisp"],
        ["bosstiary", "Abyssador", "Abyssador"]
    ];
    for (const [id, name, page] of cases) {
        const source = getEntityContext(id, name, { [id]: [{ Name: name }] }).sources[0];
        assert.equal(decodeURI(source.url), `https://tibia.fandom.com/wiki/${page}`);
        assert.equal(source.label, "Open Tibia Wiki");
    }
    assert.deepEqual(getEntityContext("achievements", "Unknown Name", { achievements: [{ Name: "Unknown Name" }] }).sources, []);
});

test("external resources are deduplicated and unsafe URLs are omitted", () => {
    const sources = getEntityContext("achievements", "Test", { achievements: [{
        Name: "Test",
        externalResources: [{ url: "javascript:alert(1)", title: "Unsafe" }, { url: "https://example.com/guide", title: "Guide" }, { url: "https://example.com/guide", title: "Duplicate" }],
        spoiler: '<a href="data:text/html,bad">Bad</a>'
    }] }).sources;
    assert.equal(sources.length, 1);
    assert.deepEqual(getEntityContext("achievements", "Missing", {}), { sources: [], relations: [] });
});


test("direct non-Wiki sources supplement rather than suppress the Wiki action", () => {
    const sources = getEntityContext("measuringTibia", "Draconia", { measuringTibia: [{
        Name: "Draconia", sourceUrl: "https://tibiopedia.pl/quests/Measuring_Tibia_Quest"
    }] }).sources;
    assert.ok(sources.some((source) => source.url === "https://tibiopedia.pl/quests/Measuring_Tibia_Quest"));
    assert.ok(sources.some((source) => source.url === "https://tibia.fandom.com/wiki/Draconia"));
});

test("longer canonical achievement names prevent overlapping short-name reward matches", () => {
    const items = { quests: [{ Name: "Trial", rewards: "The achievement Fire Walker" }], achievements: [{ Name: "Fire" }, { Name: "Fire Walker" }] };
    assert.deepEqual(getEntityContext("quests", "Trial", items).relations.map((relation) => relation.key), ["Fire Walker"]);
});
