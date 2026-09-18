import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    readPublicDataConfig, normalizeMarketItemConfig,
    createEmptyPublicHistory, createEmptyMarketWatch,
    parseCharacterProfile, parseDeaths, mergeDeaths,
    highscorePageInfo, parseHighscoreEntry, highscoreVocationGroup,
    serverSaveDate,
    reconcileCharacterHistory, withProfileSnapshot, withDeaths, withHighscoreDay, withHighscoreCategory,
    selectLatestMarketPrice, reconcileMarketWatch, withMarketWorld, withMarketItemPrice,
    describeFreshness, getCharacterHistorySummary, getMarketWatchSummary,
} from "../src/app/features/public-data.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`fixtures/public-data/${name}`, import.meta.url), "utf8"));

// ---- config identity ----

test("config: blank/absent identity produces a useful unconfigured shape without network", () => {
    assert.deepEqual(readPublicDataConfig(undefined), { characterName: "", marketItems: [] });
    assert.deepEqual(readPublicDataConfig({}), { characterName: "", marketItems: [] });
    assert.throws(()=>readPublicDataConfig({ character: { name: "   " }, market: { items: "not-an-array" } }));
});

test("config: malformed identities, duplicate items and unsupported schemas reject",()=>{
 assert.deepEqual(readPublicDataConfig({character:{name:"  Gnihttik  "},market:{items:[{id:3031,name:" Gold Coin "}]}}),{characterName:"Gnihttik",marketItems:[{id:3031,name:"Gold Coin"}]});
 for(const raw of [null,[],{schemaVersion:99},{character:{name:4}},{market:{items:[{id:1,name:"A"},{id:1,name:"B"}]}},{market:{items:[{id:-1,name:"A"}]}}])assert.throws(()=>readPublicDataConfig(raw));
});

test("config: normalizeMarketItemConfig rejects non-finite/missing identity fields", () => {
    assert.equal(normalizeMarketItemConfig(null), null);
    assert.equal(normalizeMarketItemConfig({ id: 1.5, name: "Item" }), null);
    assert.equal(normalizeMarketItemConfig({ id: 1, name: "" }), null);
    assert.deepEqual(normalizeMarketItemConfig({ id: 1, name: " Item " }), { id: 1, name: "Item" });
});

// ---- TibiaData character adapter ----

test("parseCharacterProfile: valid response maps identity and optional fields", () => {
    const profile = parseCharacterProfile(fixture("character-profile-valid.json"));
    assert.equal(profile.name, "Gnihttik");
    assert.equal(profile.world, "Antica");
    assert.equal(profile.level, 250);
    assert.equal(profile.vocation, "Elite Knight");
    assert.equal(profile.achievementPoints, 300);
});

test("parseCharacterProfile: rejects a wrong name and malformed/missing fields", () => {
    assert.equal(parseCharacterProfile(fixture("character-profile-valid.json"), { expectedName: "Someone Else" }), null);
    assert.equal(parseCharacterProfile(fixture("character-profile-malformed.json")), null);
    assert.equal(parseCharacterProfile(null), null);
    assert.equal(parseCharacterProfile({}), null);
});

test("parseDeaths + mergeDeaths: drops malformed rows, de-duplicates by exact timestamp, sorts", () => {
    const deaths = parseDeaths(fixture("character-profile-valid.json"));
    assert.deepEqual(deaths, [
        { time: "2026-09-10T21:00:00Z", level: 248, reason: "Died at Level 248 by a demon." },
        { time: "2026-09-10T21:00:00Z", level: 248, reason: "Duplicate of the entry above." },
        { time: "2026-09-12T18:30:00Z", level: 249, reason: "Died at Level 249 by a dragon lord." },
    ]);
    const merged = mergeDeaths([{ time: "2026-09-12T18:30:00Z", level: 249, reason: "Died at Level 249 by a dragon lord." }], deaths);
    assert.equal(merged.length, 2);
    assert.deepEqual(merged.map((d) => d.time), ["2026-09-10T21:00:00Z", "2026-09-12T18:30:00Z"]);
    assert.deepEqual(parseDeaths(fixture("character-profile-malformed.json")), []);
});

// ---- TibiaData highscores adapter ----

test("parseHighscoreEntry: finds the character, case-insensitively, with strict numeric fields", () => {
    const entry = parseHighscoreEntry(fixture("highscores-valid.json"), "gnihttik", { expectedWorld: "Antica" });
    assert.deepEqual(entry, { rank: 45, level: 250, value: 150000000 });
});

test("parseHighscoreEntry: rejects a response scoped to the wrong World", () => {
    assert.equal(parseHighscoreEntry(fixture("highscores-wrong-world.json"), "Gnihttik", { expectedWorld: "Antica" }), null);
});

test("parseHighscoreEntry: a missing/non-string World is rejected too, not trusted as an unverifiable match", () => {
    assert.equal(parseHighscoreEntry(fixture("highscores-missing-world.json"), "Gnihttik", { expectedWorld: "Antica" }), null);
    // Without an expectedWorld to check against, a response that omits World is still usable.
    assert.deepEqual(parseHighscoreEntry(fixture("highscores-missing-world.json"), "Gnihttik"), { rank: 1, level: 250, value: 150000000 });
});

test("parseHighscoreEntry: rejects negative rank/level/value rather than trusting a corrupt reading", () => {
    assert.equal(parseHighscoreEntry(fixture("highscores-negative-values.json"), "Gnihttik", { expectedWorld: "Antica" }), null);
});

test("parseHighscoreEntry: unranked name and malformed rows both resolve to null, not a guess", () => {
    assert.equal(parseHighscoreEntry(fixture("highscores-name-not-found.json"), "Gnihttik"), null);
    assert.equal(parseHighscoreEntry(fixture("highscores-malformed.json"), "Gnihttik"), null);
    assert.equal(parseHighscoreEntry(fixture("highscores-valid.json"), ""), null);
});

test("highscorePageInfo: strict shape, malformed page counters return null", () => {
    assert.deepEqual(highscorePageInfo(fixture("highscores-valid.json")), { currentPage: 1, totalPages: 3 });
    assert.equal(highscorePageInfo(fixture("highscores-malformed.json")), null);
});

test("highscoreVocationGroup: maps known promotions and falls back to all", () => {
    assert.equal(highscoreVocationGroup("Elite Knight"), "knights");
    assert.equal(highscoreVocationGroup("druid"), "druids");
    assert.equal(highscoreVocationGroup("Exalted Monk"), "monks");
    assert.equal(highscoreVocationGroup("None"), "none");
    assert.equal(highscoreVocationGroup("Unknown Future Vocation"), "all");
});

// ---- server-save day boundary ----

test("serverSaveDate: rolls back before 10:00 Berlin server save, across CET and CEST", () => {
    assert.equal(serverSaveDate(new Date("2026-01-15T08:59:00Z")), "2026-01-14"); // 09:59 CET, before save
    assert.equal(serverSaveDate(new Date("2026-01-15T09:00:00Z")), "2026-01-15"); // 10:00 CET, at save
    assert.equal(serverSaveDate(new Date("2026-06-15T07:59:00Z")), "2026-06-14"); // 09:59 CEST, before save
    assert.equal(serverSaveDate(new Date("2026-06-15T08:00:00Z")), "2026-06-15"); // 10:00 CEST, at save
});

// ---- character history reconciliation ----

test("reconcileCharacterHistory: keeps history for the same identity, resets on a changed name or World", () => {
    const previous = { ...createEmptyPublicHistory(), character: { name: "Gnihttik", world: "Antica" }, deaths: [{ time: "t", level: 1, reason: null }] };
    assert.equal(reconcileCharacterHistory(previous, { name: "Gnihttik", world: "Antica" }), previous);
    assert.equal(reconcileCharacterHistory(previous, { name: "gnihttik", world: "Antica" }), previous);
    assert.deepEqual(reconcileCharacterHistory(previous, { name: "Someone Else", world: "Antica" }), createEmptyPublicHistory());
    assert.deepEqual(reconcileCharacterHistory(previous, { name: "Gnihttik", world: "Secura" }), createEmptyPublicHistory());
    assert.deepEqual(reconcileCharacterHistory(createEmptyPublicHistory(), { name: "Gnihttik", world: "Antica" }), createEmptyPublicHistory());
});

test("withProfileSnapshot: preserves the prior capturedAt when nothing observable changed", () => {
    const profile = parseCharacterProfile(fixture("character-profile-valid.json"));
    const first = withProfileSnapshot(createEmptyPublicHistory(), profile, "2026-09-17T08:00:00.000Z");
    assert.equal(first.changed, true);
    assert.equal(first.document.profile.capturedAt, "2026-09-17T08:00:00.000Z");

    const second = withProfileSnapshot(first.document, profile, "2026-09-17T09:00:00.000Z");
    assert.equal(second.changed, false);
    assert.equal(second.document.profile.capturedAt, "2026-09-17T08:00:00.000Z");

    const changedProfile = { ...profile, level: 251 };
    const third = withProfileSnapshot(first.document, changedProfile, "2026-09-17T09:00:00.000Z");
    assert.equal(third.changed, true);
    assert.equal(third.document.profile.capturedAt, "2026-09-17T09:00:00.000Z");
});

test("withDeaths: only reports changed when the merged list actually grows", () => {
    const base = withDeaths(createEmptyPublicHistory(), [{ time: "t1", level: 1, reason: null }]);
    assert.equal(base.changed, true);
    const rerun = withDeaths(base.document, [{ time: "t1", level: 1, reason: null }]);
    assert.equal(rerun.changed, false);
    const grown = withDeaths(base.document, [{ time: "t2", level: 2, reason: null }]);
    assert.equal(grown.changed, true);
    assert.equal(grown.document.deaths.length, 2);
});

test("withHighscoreDay/withHighscoreCategory: idempotent same-day reruns, updates on a changed reading", () => {
    const first = withHighscoreDay(createEmptyPublicHistory(), "2026-09-17", { level: 250, experience: 150000000, capturedAt: "a" });
    assert.equal(first.changed, true);
    const rerun = withHighscoreDay(first.document, "2026-09-17", { level: 250, experience: 150000000, capturedAt: "b" });
    assert.equal(rerun.changed, false);
    assert.equal(rerun.document.history["2026-09-17"].capturedAt, "a");
    const advanced = withHighscoreDay(first.document, "2026-09-17", { level: 251, experience: 151000000, capturedAt: "c" });
    assert.equal(advanced.changed, true);
    assert.equal(advanced.document.history["2026-09-17"].capturedAt, "c");

    const category = withHighscoreCategory(createEmptyPublicHistory(), "magic", { rank: 10, value: 100, capturedAt: "a" });
    assert.equal(category.changed, true);
    assert.equal(withHighscoreCategory(category.document, "magic", { rank: 10, value: 100, capturedAt: "b" }).changed, false);
    assert.equal(withHighscoreCategory(category.document, null, { rank: 1, value: 1, capturedAt: "b" }).changed, false);
});

// ---- TibiaMarket adapter ----

test("selectLatestMarketPrice: chooses by latest timestamp, not array position", () => {
    const rows = fixture("market-history-unordered.json");
    assert.notEqual(Math.max(...rows.map((r) => r.time)), rows.at(-1).time);
    const result = selectLatestMarketPrice(rows);
    assert.deepEqual(result, { price: 4300, basis: "daily-lowest-sell", observedAt: new Date(1700000800 * 1000).toISOString() });
});

test("selectLatestMarketPrice: an offer-less latest reading uses its own daily basis rather than an older active offer", () => {
    const result = selectLatestMarketPrice(fixture("market-history-missing-prices.json"));
    assert.deepEqual(result, { price: 3901, basis: "daily-average-sell", observedAt: new Date(1700000600 * 1000).toISOString() });
});

test("selectLatestMarketPrice: zero/null prices across every row, an empty history, and malformed rows all resolve to null", () => {
    assert.equal(selectLatestMarketPrice(fixture("market-history-all-unavailable.json")), null);
    assert.equal(selectLatestMarketPrice(fixture("market-history-empty.json")), null);
    assert.equal(selectLatestMarketPrice(fixture("market-history-malformed.json")), null);
    assert.equal(selectLatestMarketPrice("not-an-array"), null);
});

test("selectLatestMarketPrice: rows tied on the latest timestamp resolve deterministically, not by array order", () => {
    const rows = fixture("market-history-duplicate-timestamps.json");
    const result = selectLatestMarketPrice(rows);
    assert.equal(result.basis, "active-sell-offer");
    assert.equal(result.price, 4400);
    assert.deepEqual(selectLatestMarketPrice([...rows].reverse()), result);
});

test("selectLatestMarketPrice: a deeper tie (same time, same full-data flag, same offer) still resolves deterministically", () => {
    const rows = fixture("market-history-deep-tie.json");
    const result = selectLatestMarketPrice(rows);
    assert.equal(result.price, 4200);
    assert.equal(result.basis, "active-sell-offer");
    assert.deepEqual(selectLatestMarketPrice([...rows].reverse()), result);
});

test("selectLatestMarketPrice: a time so large it would overflow Date is dropped like any other malformed row", () => {
    const result = selectLatestMarketPrice(fixture("market-history-time-overflow.json"));
    assert.equal(result.price, 4000);
    assert.equal(result.basis, "active-sell-offer");
});

test("reconcileMarketWatch/withMarketWorld: a changed World drops stale-world items rather than serving them", () => {
    const previous = { ...createEmptyMarketWatch(), world: "Antica", items: { 3031: { id: 3031, name: "Gold Token", world: "Antica", price: 4000 } } };
    assert.deepEqual(reconcileMarketWatch(previous, { world: "Antica" }).items, previous.items);
    assert.deepEqual(reconcileMarketWatch(previous, { world: "Secura" }), createEmptyMarketWatch());
    const worldSet = withMarketWorld(createEmptyMarketWatch(), "Antica");
    assert.equal(worldSet.changed, true);
    assert.equal(withMarketWorld(worldSet.document, "Antica").changed, false);
});

test("reconcileMarketWatch: drops items no longer present in the configured itemIds, even without a World change", () => {
    const previous = {
        ...createEmptyMarketWatch(),
        world: "Antica",
        items: {
            3031: { id: 3031, name: "Gold Token", world: "Antica", price: 4000 },
            3035: { id: 3035, name: "Small Diamond", world: "Antica", price: 100 },
        },
    };
    const reconciled = reconcileMarketWatch(previous, { world: "Antica", itemIds: [3031] });
    assert.deepEqual(Object.keys(reconciled.items), ["3031"]);
    // Without an itemIds list, every stored item is kept (existing callers are unaffected).
    assert.deepEqual(reconcileMarketWatch(previous, { world: "Antica" }).items, previous.items);
});

test("withMarketItemPrice: idempotent on an unchanged reading, updates on a changed one", () => {
    const item = { id: 3031, name: "Gold Token" };
    const withWorld = withMarketWorld(createEmptyMarketWatch(), "Antica").document;
    const first = withMarketItemPrice(withWorld, item, { price: 4000, basis: "active-sell-offer", observedAt: "2026-09-17T08:00:00.000Z" }, "2026-09-17T08:00:00.000Z");
    assert.equal(first.changed, true);
    const rerun = withMarketItemPrice(first.document, item, { price: 4000, basis: "active-sell-offer", observedAt: "2026-09-17T08:00:00.000Z" }, "2026-09-17T09:00:00.000Z");
    assert.equal(rerun.changed, false);
    assert.equal(rerun.document.items["3031"].updatedAt, "2026-09-17T08:00:00.000Z");
    const priceMoved = withMarketItemPrice(first.document, item, { price: 4500, basis: "active-sell-offer", observedAt: "2026-09-17T09:00:00.000Z" }, "2026-09-17T09:00:00.000Z");
    assert.equal(priceMoved.changed, true);
    assert.equal(priceMoved.document.items["3031"].price, 4500);
    assert.equal(withMarketItemPrice(first.document, null, null, "x").changed, false);
});

// ---- freshness ----

test("describeFreshness: fresh/stale/unavailable, including malformed and future timestamps", () => {
    const now = new Date("2026-09-17T12:00:00.000Z");
    assert.equal(describeFreshness(null, { now }), "unavailable");
    assert.equal(describeFreshness("not-a-timestamp", { now }), "unavailable");
    assert.equal(describeFreshness("2026-09-17T11:00:00.000Z", { now }), "fresh");
    assert.equal(describeFreshness("2026-09-14T11:00:00.000Z", { now }), "stale");
    assert.equal(describeFreshness("2026-09-18T00:00:00.000Z", { now }), "unavailable");
});

// ---- UI retrieval summaries: must work with zero configuration and no network ----

test("getCharacterHistorySummary: the default document is a usable unconfigured state", () => {
    const summary = getCharacterHistorySummary(createEmptyPublicHistory());
    assert.equal(summary.configured, false);
    assert.equal(summary.name, null);
    assert.deepEqual(summary.recentDays, []);
    assert.equal(summary.freshness, "unavailable");
    assert.deepEqual(getCharacterHistorySummary(null), summary);
});

test("getCharacterHistorySummary: surfaces recent days sorted and capped, and death history", () => {
    let document = createEmptyPublicHistory();
    document = withProfileSnapshot(document, parseCharacterProfile(fixture("character-profile-valid.json")), "2026-09-17T08:00:00.000Z").document;
    document = withHighscoreDay(document, "2026-09-16", { level: 249, experience: 149000000, capturedAt: "a" }).document;
    document = withHighscoreDay(document, "2026-09-17", { level: 250, experience: 150000000, capturedAt: "b" }).document;
    document = { ...document, updatedAt: "2026-09-17T08:00:00.000Z", checkedAt: "2026-09-17T08:00:00.000Z" };
    const summary = getCharacterHistorySummary(document, { now: new Date("2026-09-17T09:00:00.000Z") });
    assert.equal(summary.configured, true);
    assert.deepEqual(summary.recentDays.map((d) => d.day), ["2026-09-16", "2026-09-17"]);
    assert.equal(summary.freshness, "fresh");
});

test("getCharacterHistorySummary: freshness follows checkedAt so an unchanged-but-checked character isn't falsely stale", () => {
    const document = {
        ...createEmptyPublicHistory(),
        character: { name: "Gnihttik", world: "Antica" },
        updatedAt: "2026-09-01T08:00:00.000Z", // content hasn't changed in weeks
        checkedAt: "2026-09-17T08:00:00.000Z", // but the pipeline just checked and confirmed that
    };
    const summary = getCharacterHistorySummary(document, { now: new Date("2026-09-17T09:00:00.000Z") });
    assert.equal(summary.freshness, "fresh");
    // A document written before checkedAt existed falls back to updatedAt.
    const legacy = { ...document, checkedAt: null };
    assert.equal(getCharacterHistorySummary(legacy, { now: new Date("2026-09-17T09:00:00.000Z") }).freshness, "stale");
});

test("getMarketWatchSummary: the default document is a usable unconfigured state", () => {
    const summary = getMarketWatchSummary(createEmptyMarketWatch());
    assert.equal(summary.configured, false);
    assert.deepEqual(summary.items, []);
    assert.equal(summary.freshness, "unavailable");
    assert.deepEqual(getMarketWatchSummary(undefined), summary);
});

test("getMarketWatchSummary: reports per-item freshness from each item's own observedAt, not the pipeline's updatedAt", () => {
    let document = withMarketWorld(createEmptyMarketWatch(), "Antica").document;
    document = withMarketItemPrice(document, { id: 1, name: "Gold Token" }, { price: 4000, basis: "active-sell-offer", observedAt: "2026-09-17T07:00:00.000Z" }, "2026-09-17T08:00:00.000Z").document;
    document = withMarketItemPrice(document, { id: 2, name: "Small Diamond" }, { price: 100, basis: "active-sell-offer", observedAt: "2026-09-10T07:00:00.000Z" }, "2026-09-17T08:00:00.000Z").document;
    document = { ...document, updatedAt: "2026-09-17T08:00:00.000Z" };
    const summary = getMarketWatchSummary(document, { now: new Date("2026-09-17T09:00:00.000Z") });
    assert.equal(summary.configured, true);
    // Both items were fetched (updatedAt) at the same time, but only Gold Token's underlying market
    // reading (observedAt) is actually recent — the pipeline having just run doesn't make a stale price
    // read as fresh.
    assert.deepEqual(summary.items.map((i) => [i.name, i.freshness]), [["Gold Token", "fresh"], ["Small Diamond", "stale"]]);
});
