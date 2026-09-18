// Pure adapters and retrieval helpers for the bounded public data pipeline (Character History and
// Market Watch). Repository identity configuration (config/public-data.json) is deliberately kept
// separate from the generated snapshots (src/data/public-history.json, src/data/market-watch.json):
// changing which character or Market items are tracked must reset the snapshot's identity rather
// than blending a new identity's readings into a previous one's history.
//
// Nothing here performs network access; scripts/update-public-data.mjs composes these functions
// around fetch calls, and UI code can reuse the same functions to render generated documents.

export const PUBLIC_DATA_SCHEMA_VERSION = 1;
const SERVER_SAVE_TIME_ZONE = "Europe/Berlin";
const SERVER_SAVE_HOUR = 10;
export const FRESHNESS_WINDOW_MS = 26 * 60 * 60 * 1000;

// ---- repository configuration (config/public-data.json) ----

export function normalizeMarketItemConfig(entry) {
    if (!entry || typeof entry !== "object") return null;
    const id = entry.id;
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!Number.isSafeInteger(id) || id <= 0 || !name) return null;
    return { id, name };
}

/** Explicit blank config is supported; malformed configuration must never erase observations. */
export function readPublicDataConfig(raw) {
    const config=raw===undefined?{}:raw;
    const record=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
    const fail=()=>{throw new Error("Invalid public-data configuration. Keep schemaVersion 1, a text character name and unique positive item IDs/names.");};
    if(!record(config)||(config.schemaVersion!==undefined&&config.schemaVersion!==1))fail();
    if(config.character!==undefined&&(!record(config.character)||typeof config.character.name!=="string"))fail();
    if(config.market!==undefined&&(!record(config.market)||!Array.isArray(config.market.items)))fail();
    const seen=new Set();
    const marketItems=(config.market?.items??[]).map(entry=>{const item=normalizeMarketItemConfig(entry);if(!item||seen.has(item.id))fail();seen.add(item.id);return item;});
    return {characterName:config.character?.name.trim()??"",marketItems};
}

// ---- generated document defaults ----

export function createEmptyPublicHistory() {
    return {
        schemaVersion: PUBLIC_DATA_SCHEMA_VERSION,
        character: { name: "", world: null },
        profile: null,
        history: {},
        deaths: [],
        highscores: {},
        checkedAt: null,
        updatedAt: null,
    };
}

export function createEmptyMarketWatch() {
    return {
        schemaVersion: PUBLIC_DATA_SCHEMA_VERSION,
        world: null,
        items: {},
        updatedAt: null,
    };
}

// ---- TibiaData character adapter ----

/** Strict: a missing/mismatched identity or non-finite field becomes null rather than guessed. */
export function parseCharacterProfile(response, { expectedName = null } = {}) {
    const c = response && typeof response === "object" ? response.character?.character : null;
    if (!c || typeof c.name !== "string" || !c.name || typeof c.world !== "string" || !c.world) return null;
    if (expectedName && c.name.trim().toLowerCase() !== String(expectedName).trim().toLowerCase()) return null;
    return {
        name: c.name,
        world: c.world,
        level: Number.isFinite(c.level) ? c.level : null,
        vocation: typeof c.vocation === "string" ? c.vocation : null,
        sex: typeof c.sex === "string" ? c.sex : null,
        title: typeof c.title === "string" && c.title ? c.title : null,
        residence: typeof c.residence === "string" ? c.residence : null,
        achievementPoints: Number.isFinite(c.achievement_points) ? c.achievement_points : null,
        lastLogin: typeof c.last_login === "string" ? c.last_login : null,
        accountStatus: typeof c.account_status === "string" ? c.account_status : null,
    };
}

export function parseDeaths(response) {
    const deaths = response && typeof response === "object" ? response.character?.deaths : null;
    if (!Array.isArray(deaths)) return [];
    return deaths
        .filter((d) => d && typeof d.time === "string" && d.time && Number.isFinite(d.level))
        .map((d) => ({ time: d.time, level: d.level, reason: typeof d.reason === "string" ? d.reason : null }));
}

/** De-duplicates by exact timestamp so a rerun that observes the same death cannot grow the list. */
export function mergeDeaths(known, incoming) {
    const seen = new Set();
    const merged = [];
    for (const death of [...(Array.isArray(known) ? known : []), ...(Array.isArray(incoming) ? incoming : [])]) {
        if (!death || typeof death.time !== "string" || !death.time || seen.has(death.time)) continue;
        seen.add(death.time);
        merged.push(death);
    }
    return merged.sort((a, b) => a.time.localeCompare(b.time));
}

// ---- TibiaData highscores adapter ----

export function highscorePageInfo(response) {
    const page = response?.highscores?.highscore_page;
    if (!page || !Number.isFinite(page.current_page) || !Number.isFinite(page.total_pages)) return null;
    return { currentPage: page.current_page, totalPages: page.total_pages };
}

/**
 * Rejects a response scoped to the wrong World rather than trusting the caller's request URL — a
 * missing/non-string `world` field is treated the same as a mismatch, not skipped as unverifiable.
 * Rank/level/value must be finite, non-negative numbers (rank/level whole numbers); anything else is
 * a malformed row, not a guessed reading.
 */
export function parseHighscoreEntry(response, characterName, { expectedWorld = null } = {}) {
    const highscores = response?.highscores;
    const list = highscores?.highscore_list;
    if (!Array.isArray(list) || typeof characterName !== "string" || !characterName) return null;
    if (expectedWorld && (typeof highscores.world !== "string" || highscores.world.toLowerCase() !== String(expectedWorld).toLowerCase())) return null;
    const name = characterName.trim().toLowerCase();
    const hit = list.find((entry) => entry && typeof entry.name === "string" && entry.name.trim().toLowerCase() === name);
    if (!hit) return null;
    if (!Number.isSafeInteger(hit.rank) || hit.rank < 1) return null;
    if (!Number.isSafeInteger(hit.level) || hit.level < 1) return null;
    if (!Number.isSafeInteger(hit.value) || hit.value < 0) return null;
    return { rank: hit.rank, level: hit.level, value: hit.value };
}

const HIGHSCORE_VOCATION_GROUPS = {
    knight: "knights", "elite knight": "knights",
    paladin: "paladins", "royal paladin": "paladins",
    sorcerer: "sorcerers", "master sorcerer": "sorcerers",
    druid: "druids", "elder druid": "druids",
    monk: "monks", "exalted monk": "monks",
    none: "none",
};

/** Maps a character's exact Vocation string to the highscores endpoint's vocation path segment. */
export function highscoreVocationGroup(vocation) {
    const key = String(vocation || "none").trim().toLowerCase();
    return HIGHSCORE_VOCATION_GROUPS[key] || "all";
}

// ---- Tibia server-save day boundary (10:00 server save time, Europe/Berlin CET/CEST) ----

export function serverSaveDate(date = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
        timeZone: SERVER_SAVE_TIME_ZONE,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    const rollsBackADay = parts.hour < SERVER_SAVE_HOUR ? 1 : 0;
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day - rollsBackADay)).toISOString().slice(0, 10);
}

// ---- character history reconciliation ----

const stableJson = (value, omit) => JSON.stringify(Object.fromEntries(Object.entries(value || {}).filter(([key]) => key !== omit)));

/** A changed configured name or World is a different identity: prior history resets, never blends. */
export function reconcileCharacterHistory(previous, { name, world }) {
    const base = previous && typeof previous === "object" ? previous : createEmptyPublicHistory();
    const priorName = base.character?.name || "";
    const priorWorld = base.character?.world || null;
    const sameIdentity = priorName && priorName.toLowerCase() === String(name || "").toLowerCase()
        && (!priorWorld || !world || priorWorld === world);
    return sameIdentity ? base : createEmptyPublicHistory();
}

/** Refreshes the identity/profile fields; keeps the prior capturedAt when nothing observable changed. */
export function withProfileSnapshot(history, profile, capturedAt) {
    const base = history && typeof history === "object" ? history : createEmptyPublicHistory();
    const nextProfile = { ...profile, capturedAt };
    if (base.profile && stableJson(base.profile, "capturedAt") === stableJson(nextProfile, "capturedAt")) {
        return { document: base, changed: false };
    }
    return {
        document: { ...base, character: { name: profile.name, world: profile.world }, profile: nextProfile },
        changed: true,
    };
}

export function withDeaths(history, incomingDeaths) {
    const base = history && typeof history === "object" ? history : createEmptyPublicHistory();
    const merged = mergeDeaths(base.deaths, incomingDeaths);
    if (JSON.stringify(merged) === JSON.stringify(base.deaths || [])) return { document: base, changed: false };
    return { document: { ...base, deaths: merged }, changed: true };
}

/** Idempotent per server-save day: a same-day rerun only rewrites the row if the reading changed. */
export function withHighscoreDay(history, day, entry) {
    const base = history && typeof history === "object" ? history : createEmptyPublicHistory();
    if (!day || !entry) return { document: base, changed: false };
    const previous = base.history[day];
    if (previous && previous.level === entry.level && previous.experience === entry.experience && previous.rank === entry.rank) return { document: base, changed: false };
    return { document: { ...base, history: { ...base.history, [day]: entry } }, changed: true };
}

export function withHighscoreCategory(history, category, entry) {
    const base = history && typeof history === "object" ? history : createEmptyPublicHistory();
    if (!category || !entry) return { document: base, changed: false };
    const previous = base.highscores[category];
    if (previous && previous.rank === entry.rank && previous.value === entry.value) return { document: base, changed: false };
    return { document: { ...base, highscores: { ...base.highscores, [category]: entry } }, changed: true };
}

// ---- TibiaMarket.top item_history adapter ----

const numericOrFloor = (value) => (Number.isFinite(value) ? value : -1);

/**
 * The item_history array is not guaranteed to be in timestamp order, so the latest reading is found
 * explicitly by its `time` field rather than assumed from array position; a `time` so large it would
 * overflow `Date`'s representable range is treated as malformed and dropped, same as a non-finite
 * `time`. Rows tying on `time` break deterministically by content (full-data first, then the highest
 * available offer/lowest/average price), never by input array position, so the result never depends
 * on array order. The chosen row's own best-available price is used — an active sell offer when that
 * row has one (basis "active-sell-offer"), otherwise that same row's daily lowest, then average, sell
 * price — so a fresher but offer-less reading is never skipped in favor of an older active offer.
 */
export function selectLatestMarketPrice(historyRows) {
    if (!Array.isArray(historyRows)) return null;
    const rows = historyRows
        .filter((row) => row && Number.isFinite(row.time) && row.time >= 0)
        .map((row) => {
            const observed = new Date(row.time * 1000);
            return Number.isFinite(observed.getTime()) ? { row, observedAt: observed.toISOString() } : null;
        })
        .filter(Boolean)
        .sort((a, b) =>
            b.row.time - a.row.time
            || (b.row.is_full_data === true) - (a.row.is_full_data === true)
            || numericOrFloor(b.row.sell_offer) - numericOrFloor(a.row.sell_offer)
            || numericOrFloor(b.row.day_lowest_sell) - numericOrFloor(a.row.day_lowest_sell)
            || numericOrFloor(b.row.day_average_sell) - numericOrFloor(a.row.day_average_sell));
    for (const { row, observedAt } of rows) {
        if (row.is_full_data === true && Number.isFinite(row.sell_offer) && row.sell_offer > 0) {
            return { price: row.sell_offer, basis: "active-sell-offer", observedAt };
        }
        if (Number.isFinite(row.day_lowest_sell) && row.day_lowest_sell > 0) {
            return { price: row.day_lowest_sell, basis: "daily-lowest-sell", observedAt };
        }
        if (Number.isFinite(row.day_average_sell) && row.day_average_sell > 0) {
            return { price: Math.round(row.day_average_sell), basis: "daily-average-sell", observedAt };
        }
    }
    return null;
}

/**
 * A changed World invalidates every stored price: they were quoted for a market that no longer
 * applies. Independent of a World change, an `itemIds` list (the currently configured Market items)
 * drops any stored item no longer configured, so removing an item from config actually removes it
 * rather than leaving a stale price behind indefinitely.
 */
export function reconcileMarketWatch(previous, { world, itemIds = null } = {}) {
    const base = previous && typeof previous === "object" ? previous : createEmptyMarketWatch();
    if (base.world && world && base.world !== world) return createEmptyMarketWatch();
    const allowed = Array.isArray(itemIds) ? new Set(itemIds.map(String)) : null;
    const items = allowed
        ? Object.fromEntries(Object.entries(base.items || {}).filter(([key]) => allowed.has(key)))
        : { ...base.items };
    return { ...base, items };
}

export function withMarketWorld(document, world) {
    const base = document && typeof document === "object" ? document : createEmptyMarketWatch();
    if (base.world === world) return { document: base, changed: false };
    return { document: { ...base, world }, changed: true };
}

export function withMarketItemPrice(document, item, observation, capturedAt) {
    const base = document && typeof document === "object" ? document : createEmptyMarketWatch();
    if (!item || !observation) return { document: base, changed: false };
    const key = String(item.id);
    const next = {
        id: item.id,
        name: item.name,
        world: base.world,
        price: observation.price,
        basis: observation.basis,
        observedAt: observation.observedAt,
        updatedAt: capturedAt,
    };
    const previous = base.items[key];
    if (previous && stableJson(previous, "updatedAt") === stableJson(next, "updatedAt")) return { document: base, changed: false };
    return { document: { ...base, items: { ...base.items, [key]: next } }, changed: true };
}

// ---- freshness ----

/** A future timestamp (clock skew or corrupt data) is untrustworthy, not "fresh". */
export function describeFreshness(timestamp, { now = new Date(), windowMs = FRESHNESS_WINDOW_MS } = {}) {
    if (!timestamp) return "unavailable";
    const observed = new Date(timestamp);
    if (Number.isNaN(observed.getTime())) return "unavailable";
    const ageMs = now.getTime() - observed.getTime();
    if (ageMs < 0) return "unavailable";
    return ageMs <= windowMs ? "fresh" : "stale";
}

// ---- UI retrieval summaries ----

export function getCharacterHistorySummary(document, { now = new Date() } = {}) {
    const doc = document && typeof document === "object" ? document : createEmptyPublicHistory();
    const days = Object.keys(doc.history || {}).sort();
    return {
        configured: Boolean(doc.character?.name),
        name: doc.character?.name || null,
        world: doc.character?.world || null,
        profile: doc.profile || null,
        recentDays: days.slice(-30).map((day) => ({ day, ...doc.history[day] })),
        deathCount: Array.isArray(doc.deaths) ? doc.deaths.length : 0,
        recentDeaths: Array.isArray(doc.deaths) ? doc.deaths.slice(-10) : [],
        highscores: doc.highscores || {},
        updatedAt: doc.updatedAt || null,
        checkedAt: doc.checkedAt || null,
        // checkedAt reflects the last successful pipeline run even when nothing observable changed, so
        // an unattended-but-still-tracked character isn't misreported "stale" just because its reading
        // held steady; it falls back to updatedAt for documents written before checkedAt existed.
        freshness: describeFreshness(doc.checkedAt || doc.updatedAt, { now }),
    };
}

export function getMarketWatchSummary(document, { now = new Date() } = {}) {
    const doc = document && typeof document === "object" ? document : createEmptyMarketWatch();
    // Freshness is measured from each item's own observedAt (the market reading's timestamp), not the
    // pipeline's updatedAt (when we happened to run) — a stale market reading should read as stale even
    // if the run that fetched it just completed.
    const items = Object.values(doc.items || {}).map((item) => ({ ...item, freshness: describeFreshness(item.observedAt, { now }) }));
    items.sort((a, b) => a.name.localeCompare(b.name));
    return {
        configured: items.length > 0,
        world: doc.world || null,
        items,
        updatedAt: doc.updatedAt || null,
        freshness: !items.length ? "unavailable" : items.every(item=>item.freshness==="fresh") ? "fresh" : "stale",
    };
}
