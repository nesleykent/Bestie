// End-to-end coverage for scripts/update-public-data.mjs's exported runUpdatePublicData() orchestration:
// every side effect (fetch, file paths, current time, the Market token, logging) is injected, so these
// tests exercise the real read/reconcile/write flow against tempdir fixtures with no real network
// access and no dependency on scripts/update-public-data.mjs's own CLI entry point.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUpdatePublicData } from "../scripts/update-public-data.mjs";
import { createEmptyPublicHistory, createEmptyMarketWatch } from "../src/app/features/public-data.js";

async function withTempDir(fn) {
    const dir = await mkdtemp(join(tmpdir(), "bestie-public-data-"));
    try {
        await fn({
            dir,
            configPath: join(dir, "config.json"),
            historyPath: join(dir, "public-history.json"),
            marketPath: join(dir, "market-watch.json"),
        });
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

const writeJson = (path, data) => writeFile(path, JSON.stringify(data, null, 2));
const readJsonFile = (path) => readFile(path, "utf8").then(JSON.parse);
const exists = (path) => stat(path).then(() => true, () => false);

function jsonResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, statusText: `status ${status}`, json: async () => body };
}

/** `handlers` are tried in order; unmatched URLs fail loudly rather than hanging or guessing. */
function createMockFetch(handlers) {
    const calls = [];
    const fetchImpl = async (url) => {
        const href = String(url);
        calls.push(href);
        for (const handler of handlers) {
            if (handler.test(href)) return handler.respond(href);
        }
        throw new Error(`Unhandled fetch in test: ${href}`);
    };
    fetchImpl.calls = calls;
    return fetchImpl;
}

const noSleep = async () => {};
const silentRun = (options) => runUpdatePublicData({ log: () => {}, errorLog: () => {}, ...options });

function characterResponse({ name, world, level = 100, vocation = "Elite Knight" }) {
    return {
        character: {
            character: { name, world, level, vocation, sex: "male", title: "None", residence: "Thais", achievement_points: 0, last_login: "2026-09-15T10:00:00Z", account_status: "Free Account" },
            deaths: [],
        },
        information: { api_version: 4 },
    };
}

function highscorePage({ world, name, level, value, rank }) {
    return {
        highscores: {
            world,
            highscore_list: name ? [{ rank, name, level, value }] : [],
            highscore_page: { current_page: 1, total_pages: 1 },
        },
        information: { api_version: 4 },
    };
}

const marketHandler = (id, rows) => ({
    test: (url) => url.startsWith("https://api.tibiamarket.top/") && url.includes(`item_id=${id}`),
    respond: () => jsonResponse(200, rows),
});

test("pipeline: a blank/absent config makes no network calls and leaves default files untouched", async () => {
    await withTempDir(async ({ configPath, historyPath, marketPath }) => {
        const fetchImpl = createMockFetch([]);
        await silentRun({
            fetchImpl, sleepImpl: noSleep, configPath, historyPath, marketPath,
            now: () => new Date("2026-09-17T08:00:00.000Z"), token: "",
        });
        assert.equal(fetchImpl.calls.length, 0);
        assert.equal(await exists(historyPath), false);
        assert.equal(await exists(marketPath), false);
    });
});

test("pipeline: partial failures (highscore lookup, one Market item) keep the last-good reading for that part only", async () => {
    await withTempDir(async ({ configPath, historyPath, marketPath }) => {
        await writeJson(configPath, {
            schemaVersion: 1,
            character: { name: "Gnihttik" },
            market: { items: [{ id: 1, name: "Gold Token" }, { id: 2, name: "Small Diamond" }] },
        });
        await writeJson(historyPath, {
            ...createEmptyPublicHistory(),
            character: { name: "Gnihttik", world: "Antica" },
            history: { "2026-09-16": { level: 249, experience: 149000000, capturedAt: "2026-09-16T08:00:00.000Z" } },
            checkedAt: "2026-09-16T08:00:00.000Z",
            updatedAt: "2026-09-16T08:00:00.000Z",
        });
        await writeJson(marketPath, {
            ...createEmptyMarketWatch(),
            world: "Antica",
            items: {
                1: { id: 1, name: "Gold Token", world: "Antica", price: 4000, basis: "active-sell-offer", observedAt: "2026-09-16T08:00:00.000Z", updatedAt: "2026-09-16T08:00:00.000Z" },
                2: { id: 2, name: "Small Diamond", world: "Antica", price: 100, basis: "active-sell-offer", observedAt: "2026-09-16T08:00:00.000Z", updatedAt: "2026-09-16T08:00:00.000Z" },
            },
            updatedAt: "2026-09-16T08:00:00.000Z",
        });

        const fetchImpl = createMockFetch([
            { test: (url) => url.startsWith("https://api.tibiadata.com/v4/character/"), respond: () => jsonResponse(200, characterResponse({ name: "Gnihttik", world: "Antica", level: 250 })) },
            { test: (url) => url.startsWith("https://api.tibiadata.com/v4/highscores/"), respond: () => jsonResponse(500, {}) },
            marketHandler(1, [{ time: 1758096000, is_full_data: true, sell_offer: 4500, buy_offer: 4300, day_lowest_sell: 4400, day_average_sell: 4450 }]),
            { test: (url) => url.startsWith("https://api.tibiamarket.top/") && url.includes("item_id=2"), respond: () => jsonResponse(500, {}) },
        ]);

        await silentRun({
            fetchImpl, sleepImpl: noSleep, configPath, historyPath, marketPath,
            now: () => new Date("2026-09-17T08:00:00.000Z"), token: "test-token",
        });

        const history = await readJsonFile(historyPath);
        assert.equal(history.profile.level, 250);
        assert.deepEqual(history.history, { "2026-09-16": { level: 249, experience: 149000000, capturedAt: "2026-09-16T08:00:00.000Z" } });
        assert.equal(history.checkedAt, "2026-09-17T08:00:00.000Z");

        const market = await readJsonFile(marketPath);
        assert.equal(market.items["1"].price, 4500);
        assert.equal(market.items["2"].price, 100);
        assert.equal(market.items["2"].updatedAt, "2026-09-16T08:00:00.000Z");
    });
});

test("pipeline: a corrupt config/history/market file aborts the run instead of silently resetting to defaults", async () => {
    await withTempDir(async ({ configPath, historyPath, marketPath }) => {
        await writeFile(configPath, "{ not valid json");
        const fetchImpl = createMockFetch([]);
        await assert.rejects(() => silentRun({
            fetchImpl, sleepImpl: noSleep, configPath, historyPath, marketPath,
            now: () => new Date("2026-09-17T08:00:00.000Z"), token: "",
        }));
        assert.equal(fetchImpl.calls.length, 0);
        assert.equal(await readFile(configPath, "utf8"), "{ not valid json");
    });

    await withTempDir(async ({ configPath, historyPath, marketPath }) => {
        await writeJson(configPath, { schemaVersion: 1, character: { name: "Gnihttik" }, market: { items: [] } });
        await writeFile(historyPath, "{ not valid json");
        const fetchImpl = createMockFetch([
            { test: (url) => url.startsWith("https://api.tibiadata.com/v4/character/"), respond: () => jsonResponse(200, characterResponse({ name: "Gnihttik", world: "Antica" })) },
        ]);
        await assert.rejects(() => silentRun({
            fetchImpl, sleepImpl: noSleep, configPath, historyPath, marketPath,
            now: () => new Date("2026-09-17T08:00:00.000Z"), token: "",
        }));
        assert.equal(fetchImpl.calls.length, 0);
        assert.equal(await readFile(historyPath, "utf8"), "{ not valid json");
    });
});

test("pipeline: a missing TIBIA_MARKET_TOKEN resolves identity without fetching or inventing quotes", async () => {
    await withTempDir(async ({ configPath, historyPath, marketPath }) => {
        await writeJson(configPath, {
            schemaVersion: 1,
            character: { name: "Gnihttik" },
            market: { items: [{ id: 1, name: "Gold Token" }] },
        });
        const fetchImpl = createMockFetch([
            { test: (url) => url.startsWith("https://api.tibiadata.com/v4/character/"), respond: () => jsonResponse(200, characterResponse({ name: "Gnihttik", world: "Antica" })) },
            { test: (url) => url.startsWith("https://api.tibiadata.com/v4/highscores/"), respond: () => jsonResponse(200, highscorePage({ world: "Antica" })) },
        ]);
        await silentRun({
            fetchImpl, sleepImpl: noSleep, configPath, historyPath, marketPath,
            now: () => new Date("2026-09-17T08:00:00.000Z"), token: "",
        });
        assert.ok(fetchImpl.calls.every((url) => !url.startsWith("https://api.tibiamarket.top/")));
        assert.equal((await readJsonFile(marketPath)).world,"Antica");
        assert.deepEqual((await readJsonFile(marketPath)).items,{});
    });
});

test("pipeline: never sends the Market token anywhere but the Authorization header", async () => {
    await withTempDir(async ({ configPath, historyPath, marketPath }) => {
        await writeJson(configPath, {
            schemaVersion: 1,
            character: { name: "Gnihttik" },
            market: { items: [{ id: 1, name: "Gold Token" }] },
        });
        const token = "super-secret-bearer-jwt";
        const seenHeaders = [];
        const fetchImpl = async (url, options) => {
            seenHeaders.push({ url: String(url), headers: options?.headers || {} });
            if (String(url).startsWith("https://api.tibiadata.com/v4/character/")) return jsonResponse(200, characterResponse({ name: "Gnihttik", world: "Antica" }));
            if (String(url).startsWith("https://api.tibiadata.com/v4/highscores/")) return jsonResponse(200, highscorePage({ world: "Antica" }));
            if (String(url).startsWith("https://api.tibiamarket.top/")) return jsonResponse(200, [{ time: 1758096000, is_full_data: true, sell_offer: 4200, buy_offer: 4000, day_lowest_sell: 4100, day_average_sell: 4150 }]);
            throw new Error(`Unhandled fetch: ${url}`);
        };
        await silentRun({
            fetchImpl, sleepImpl: noSleep, configPath, historyPath, marketPath,
            now: () => new Date("2026-09-17T08:00:00.000Z"), token,
        });
        for (const { url, headers } of seenHeaders) assert.ok(!url.includes(token), `token leaked in URL: ${url}`);
        const marketCall = seenHeaders.find(({ url }) => url.startsWith("https://api.tibiamarket.top/"));
        assert.equal(marketCall.headers.Authorization, `Bearer ${token}`);
    });
});

test("pipeline: a changed configured character resets both snapshots to the new identity, never blending or old-world-falling-back", async () => {
    await withTempDir(async ({ configPath, historyPath, marketPath }) => {
        await writeJson(configPath, {
            schemaVersion: 1,
            character: { name: "New Character" },
            market: { items: [{ id: 1, name: "Gold Token" }] },
        });
        await writeJson(historyPath, {
            ...createEmptyPublicHistory(),
            character: { name: "Old Character", world: "Antica" },
            history: { "2026-09-01": { level: 100, experience: 1000000, capturedAt: "2026-09-01T08:00:00.000Z" } },
            checkedAt: "2026-09-01T08:00:00.000Z",
            updatedAt: "2026-09-01T08:00:00.000Z",
        });
        await writeJson(marketPath, {
            ...createEmptyMarketWatch(),
            world: "Antica",
            items: { 1: { id: 1, name: "Gold Token", world: "Antica", price: 4000, basis: "active-sell-offer", observedAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z" } },
            updatedAt: "2026-09-01T08:00:00.000Z",
        });

        const fetchImpl = createMockFetch([
            { test: (url) => url.startsWith("https://api.tibiadata.com/v4/character/"), respond: () => jsonResponse(200, characterResponse({ name: "New Character", world: "Secura", level: 50 })) },
            { test: (url) => url.startsWith("https://api.tibiadata.com/v4/highscores/"), respond: () => jsonResponse(200, highscorePage({ world: "Secura", name: "New Character", level: 50, value: 500000, rank: 900 })) },
            marketHandler(1, [{ time: 1758096000, is_full_data: true, sell_offer: 100, buy_offer: 90, day_lowest_sell: 95, day_average_sell: 98 }]),
        ]);

        await silentRun({
            fetchImpl, sleepImpl: noSleep, configPath, historyPath, marketPath,
            now: () => new Date("2026-09-17T08:00:00.000Z"), token: "test-token",
        });

        const history = await readJsonFile(historyPath);
        assert.equal(history.character.name, "New Character");
        assert.equal(history.character.world, "Secura");
        assert.deepEqual(Object.keys(history.history), ["2026-09-17"]);
        assert.deepEqual(history.highscores.experience, { rank: 900, level: 50, value: 500000, capturedAt: "2026-09-17T08:00:00.000Z" });

        const market = await readJsonFile(marketPath);
        assert.equal(market.world, "Secura");
        assert.equal(market.items["1"].price, 100);
    });
});

test("pipeline: removing an item from config drops it from Market Watch without any World change", async () => {
    await withTempDir(async ({ configPath, historyPath, marketPath }) => {
        await writeJson(configPath, {
            schemaVersion: 1,
            character: { name: "Gnihttik" },
            market: { items: [{ id: 1, name: "Gold Token" }] }, // item 2 was removed from config
        });
        await writeJson(historyPath, { ...createEmptyPublicHistory(), character: { name: "Gnihttik", world: "Antica" } });
        await writeJson(marketPath, {
            ...createEmptyMarketWatch(),
            world: "Antica",
            items: {
                1: { id: 1, name: "Gold Token", world: "Antica", price: 4000, basis: "active-sell-offer", observedAt: "2026-09-16T08:00:00.000Z", updatedAt: "2026-09-16T08:00:00.000Z" },
                2: { id: 2, name: "Removed Item", world: "Antica", price: 1, basis: "active-sell-offer", observedAt: "2026-09-16T08:00:00.000Z", updatedAt: "2026-09-16T08:00:00.000Z" },
            },
            updatedAt: "2026-09-16T08:00:00.000Z",
        });

        const fetchImpl = createMockFetch([
            { test: (url) => url.startsWith("https://api.tibiadata.com/v4/character/"), respond: () => jsonResponse(200, characterResponse({ name: "Gnihttik", world: "Antica" })) },
            { test: (url) => url.startsWith("https://api.tibiadata.com/v4/highscores/"), respond: () => jsonResponse(200, highscorePage({ world: "Antica" })) },
            marketHandler(1, [{ time: 1758096000, is_full_data: true, sell_offer: 4100, buy_offer: 4000, day_lowest_sell: 4050, day_average_sell: 4075 }]),
        ]);

        await silentRun({
            fetchImpl, sleepImpl: noSleep, configPath, historyPath, marketPath,
            now: () => new Date("2026-09-17T08:00:00.000Z"), token: "test-token",
        });

        const market = await readJsonFile(marketPath);
        assert.deepEqual(Object.keys(market.items), ["1"]);
    });
});

test("pipeline: a failed character resolution aborts before Market Watch, never falling back to a stale World", async () => {
    await withTempDir(async ({ configPath, historyPath, marketPath }) => {
        await writeJson(configPath, {
            schemaVersion: 1,
            character: { name: "Gnihttik" },
            market: { items: [{ id: 1, name: "Gold Token" }] },
        });
        await writeJson(marketPath, {
            ...createEmptyMarketWatch(),
            world: "Antica",
            items: { 1: { id: 1, name: "Gold Token", world: "Antica", price: 4000, basis: "active-sell-offer", observedAt: "2026-09-16T08:00:00.000Z", updatedAt: "2026-09-16T08:00:00.000Z" } },
            updatedAt: "2026-09-16T08:00:00.000Z",
        });

        const fetchImpl = createMockFetch([
            { test: (url) => url.startsWith("https://api.tibiadata.com/v4/character/"), respond: () => jsonResponse(200, { character: {}, information: {} }) }, // no matching profile
        ]);

        await assert.rejects(() => silentRun({
            fetchImpl, sleepImpl: noSleep, configPath, historyPath, marketPath,
            now: () => new Date("2026-09-17T08:00:00.000Z"), token: "test-token",
        }));

        assert.ok(fetchImpl.calls.every((url) => !url.startsWith("https://api.tibiamarket.top/")));
        const market = await readJsonFile(marketPath);
        assert.equal(market.items["1"].price, 4000); // untouched, not silently re-served for a wrong/guessed World
    });
});

test("pipeline: an unchanged reading still advances checkedAt (so freshness reflects the real check) without touching the day's history row", async () => {
    await withTempDir(async ({ configPath, historyPath, marketPath }) => {
        await writeJson(configPath, { schemaVersion: 1, character: { name: "Gnihttik" }, market: { items: [] } });
        await writeJson(historyPath, {
            ...createEmptyPublicHistory(),
            character: { name: "Gnihttik", world: "Antica" },
            profile: { name: "Gnihttik", world: "Antica", level: 250, vocation: "Elite Knight", sex: "male", title: "None", residence: "Thais", achievementPoints: 0, lastLogin: "2026-09-15T10:00:00Z", accountStatus: "Free Account", capturedAt: "2026-09-01T08:00:00.000Z" },
            history: { "2026-09-17": { level: 250, experience: 150000000, rank:45, capturedAt: "2026-09-17T06:00:00.000Z" } },
            highscores: { experience: { rank: 45, level: 250, value: 150000000, capturedAt: "2026-09-17T06:00:00.000Z" } },
            checkedAt: "2026-09-17T06:00:00.000Z",
            updatedAt: "2026-09-01T08:00:00.000Z",
        });

        const fetchImpl = createMockFetch([
            { test: (url) => url.startsWith("https://api.tibiadata.com/v4/character/"), respond: () => jsonResponse(200, characterResponse({ name: "Gnihttik", world: "Antica", level: 250 })) },
            { test: (url) => url.startsWith("https://api.tibiadata.com/v4/highscores/"), respond: () => jsonResponse(200, highscorePage({ world: "Antica", name: "Gnihttik", level: 250, value: 150000000, rank: 45 })) },
        ]);

        await silentRun({
            fetchImpl, sleepImpl: noSleep, configPath, historyPath, marketPath,
            now: () => new Date("2026-09-17T20:00:00.000Z"), token: "",
        });

        const history = await readJsonFile(historyPath);
        assert.equal(history.checkedAt, "2026-09-17T20:00:00.000Z");
        assert.equal(history.updatedAt, "2026-09-01T08:00:00.000Z"); // no content actually changed
        assert.deepEqual(history.history, { "2026-09-17": { level: 250, experience: 150000000, rank:45, capturedAt: "2026-09-17T06:00:00.000Z" } });
    });
});

test('pipeline: malformed config or snapshot shape cannot replace valid observations',async()=>{
 await withTempDir(async paths=>{
  const prior={...createEmptyPublicHistory(),character:{name:'Prior',world:'Antica'}};
  await writeJson(paths.historyPath,prior);await writeJson(paths.marketPath,createEmptyMarketWatch());
  for(const config of [{schemaVersion:99},{character:{name:3}},{market:{items:[{id:1,name:'A'},{id:1,name:'B'}]}}]){
   await writeJson(paths.configPath,config);await assert.rejects(()=>silentRun({...paths,fetchImpl:()=>{throw new Error('must not fetch')}}),/configuration/);
   assert.deepEqual(await readJsonFile(paths.historyPath),prior);
  }
  await writeJson(paths.configPath,{character:{name:''}});await writeJson(paths.marketPath,[]);
  await assert.rejects(()=>silentRun(paths),/Invalid market snapshot/);assert.deepEqual(await readJsonFile(paths.historyPath),prior);
 });
});
test('pipeline: removed items and old-world prices are invalidated even without a token',async()=>{
 await withTempDir(async paths=>{
  await writeJson(paths.configPath,{character:{name:'Test'},market:{items:[]}});
  await writeJson(paths.marketPath,{...createEmptyMarketWatch(),world:'Old World',items:{1:{id:1,name:'Item',world:'Old World',price:123}}});
  const fetchImpl=async url=>jsonResponse(200,String(url).includes('/character/')?characterResponse({name:'Test',world:'Secura'}):highscorePage({world:'Secura'}));
  await silentRun({...paths,fetchImpl,sleepImpl:noSleep,token:''});
  const result=await readJsonFile(paths.marketPath);assert.equal(result.world,'Secura');assert.deepEqual(result.items,{});
 });
});

test('pipeline: restriction-compatible all-vocation scope and source age determine the observation day',async()=>{
 await withTempDir(async paths=>{
  await writeJson(paths.configPath,{character:{name:'Test'},market:{items:[]}});
  const fetchImpl=async url=>{
   if(String(url).includes('/character/'))return jsonResponse(200,characterResponse({name:'Test',world:'Antica'}));
   assert.match(String(url),/\/experience\/all\/1$/);
   const page=highscorePage({world:'Antica',name:'Test',level:100,value:15694800,rank:7});
   page.highscores.highscore_age=30;page.information.timestamp='2026-09-18T08:15:00Z';return jsonResponse(200,page);
  };
  await silentRun({...paths,fetchImpl,sleepImpl:noSleep,now:()=>new Date('2026-09-18T08:15:00Z')});
  const h=await readJsonFile(paths.historyPath);assert.deepEqual(Object.keys(h.history),['2026-09-17']);assert.equal(h.history['2026-09-17'].observedAt,'2026-09-18T07:45:00.000Z');
 });
});
