/**
 * Repository-scheduled snapshot for the bounded public data pipeline (README "Character History" and
 * "Market Watch"). Reads config/public-data.json for the tracked character name and Market items,
 * then updates src/data/public-history.json and src/data/market-watch.json in place.
 *
 * TibiaData resolves the character's profile, World, and known deaths, plus the character's exact
 * experience for the current Tibia server-save day (10:00 Europe/Berlin) via the public highscores
 * endpoint — the character endpoint alone does not expose exact experience. TibiaMarket.top's public
 * item_history endpoint supplies the latest sell price for each configured Market item on the
 * character's World; it requires a bearer token, read only from TIBIA_MARKET_TOKEN and never bundled
 * in source or sent from a browser.
 *
 * A blank configured character name or an unset TIBIA_MARKET_TOKEN are normal, supported states: the
 * corresponding snapshot is left in its current (or default, unconfigured) shape and no network
 * request is made for that part of the pipeline.
 *
 * The orchestration itself is exported as `runUpdatePublicData()` with every side effect (fetch,
 * file paths, current time, the Market token, logging) as an injectable option, so
 * tests/public-data-pipeline.test.js can exercise it end-to-end against tempdir fixtures and a mocked
 * fetch, with no real network access. Run by .github/workflows/public-data.yml, or locally:
 *   node scripts/update-public-data.mjs
 */
import { readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve as resolvePath } from "node:path";
import {
    readPublicDataConfig, createEmptyPublicHistory, createEmptyMarketWatch,
    parseCharacterProfile, parseDeaths, parseHighscoreEntry, highscorePageInfo,
    serverSaveDate, reconcileCharacterHistory, withProfileSnapshot, withDeaths, withHighscoreDay, withHighscoreCategory,
    reconcileMarketWatch, withMarketWorld, withMarketItemPrice, selectLatestMarketPrice,
} from "../src/app/features/public-data.js";

const TIBIADATA_API = "https://api.tibiadata.com/v4";
const TIBIAMARKET_API = "https://api.tibiamarket.top/item_history";
const USER_AGENT = "bestie-public-data (github.com/nesleykent/Bestie)";
const HIGHSCORE_MAX_PAGES = 20;
const REQUEST_DELAY_MS = 1200;
const MARKET_HISTORY_WINDOW_DAYS = 30;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Distinguishes an absent file (a legitimate, supported "nothing configured/observed yet" state,
 * resolved to `fallback`) from a present-but-corrupt one: a read failure other than ENOENT, or JSON
 * that fails to parse, throws instead of silently degrading to `fallback` — a corrupt config or
 * snapshot must abort the run rather than quietly being treated as blank and overwriting good data.
 */
async function readJson(path, fallback) {
    let text;
    try {
        text = await readFile(path, "utf8");
    } catch (err) {
        if (err.code === "ENOENT") return fallback;
        throw new Error(`Cannot read ${path}: ${err.message}`);
    }
    try {
        return JSON.parse(text);
    } catch (err) {
        throw new Error(`Corrupt JSON in ${path}: ${err.message}`);
    }
}

/** Write-then-rename so a failed or interrupted run cannot leave a partially written snapshot behind. */
async function writeJsonAtomic(path, data) {
    const tempPath = `${path}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`);
    await rename(tempPath, path);
}

function createFetchJson(fetchImpl, sleepImpl) {
    return async function fetchJson(url, headers = {}, attempt = 1) {
        const res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(30000) });
        if (!res.ok) {
            if ((res.status === 429 || res.status >= 500) && attempt <= 4) {
                await sleepImpl((res.status === 429 ? 15_000 : 2_000) * attempt);
                return fetchJson(url, headers, attempt + 1);
            }
            throw new Error(`${res.status} ${res.statusText} for ${url}`);
        }
        return res.json();
    };
}

/**
 * Runs one full update: Character History, then Market Watch scoped to whatever World Character
 * History just resolved (never a stale previously-stored World — see updateMarketWatch below). Every
 * side effect is an option so this can be driven by fixtures in tests, not just the real CLI.
 */
export async function runUpdatePublicData({
    fetchImpl = fetch,
    sleepImpl = defaultSleep,
    configPath,
    historyPath,
    marketPath,
    now = () => new Date(),
    token = "",
    log = console.log,
    errorLog = console.error,
} = {}) {
    const fetchJson = createFetchJson(fetchImpl, sleepImpl);

    async function fetchCharacter(characterName) {
        const response = await fetchJson(`${TIBIADATA_API}/character/${encodeURIComponent(characterName.trim().toLowerCase())}`);
        return { response, profile: parseCharacterProfile(response, { expectedName: characterName }) };
    }

    /** Crawls the public highscores listing for `characterName`; returns null if unranked (not a failure). */
    async function findHighscoreEntry(world, category, vocationGroup, characterName) {
        for (let page = 1; page <= HIGHSCORE_MAX_PAGES; page++) {
            const response = await fetchJson(`${TIBIADATA_API}/highscores/${encodeURIComponent(world)}/${category}/${vocationGroup}/${page}`);
            const entry = parseHighscoreEntry(response, characterName, { expectedWorld: world });
            if (entry) {
                const age=response.highscores?.highscore_age;
                const apiTime=Date.parse(response.information?.timestamp);
                const observedAt=Number.isFinite(apiTime)&&Number.isFinite(age)&&age>=0 ? new Date(apiTime-age*60000).toISOString() : null;
                return {...entry,observedAt};
            }
            const pageInfo = highscorePageInfo(response);
            if (!pageInfo || page >= pageInfo.totalPages) return null;
            await sleepImpl(REQUEST_DELAY_MS);
        }
        return null;
    }

    /** Returns the World Character History resolved this run (or null), for Market Watch to reuse. */
    async function updateCharacterHistory(characterName) {
        const previous = await readJson(historyPath, createEmptyPublicHistory());
        if (!characterName) {
            const empty = createEmptyPublicHistory();
            if (JSON.stringify(previous) !== JSON.stringify(empty)) await writeJsonAtomic(historyPath, empty);
            log("Character History: no character configured; left unconfigured.");
            return null;
        }

        const { response, profile } = await fetchCharacter(characterName);
        if (!profile) throw new Error(`TibiaData returned no matching profile for "${characterName}".`);

        const capturedAt = now().toISOString();
        let document = reconcileCharacterHistory(previous, { name: profile.name, world: profile.world });
        document = withProfileSnapshot(document, profile, capturedAt).document;
        document = withDeaths(document, parseDeaths(response)).document;

        try {
            // TibiaData restriction mode accepts only all vocations.
            const xp = await findHighscoreEntry(profile.world, "experience", "all", profile.name);
            if (xp) {
                const day = serverSaveDate(xp.observedAt ? new Date(xp.observedAt) : now());
                document = withHighscoreDay(document, day, { level: xp.level, experience: xp.value, rank: xp.rank, ...(xp.observedAt?{observedAt:xp.observedAt}:{}), capturedAt }).document;
                document = withHighscoreCategory(document, "experience", { rank: xp.rank, level: xp.level, value: xp.value, capturedAt }).document;
                log(`Character History: observed ${day} — level ${xp.level}, ${xp.value} XP (rank ${xp.rank}).`);
            } else {
                log(`Character History: ${profile.name} not found in the ${profile.world} experience highscores (unranked or beyond ${HIGHSCORE_MAX_PAGES} tracked pages).`);
            }
        } catch (err) {
            errorLog(`Character History: experience highscore lookup failed, keeping prior XP evolution: ${err.message}`);
        }

        // checkedAt always advances on a successful run, independent of whether anything observable
        // changed, so an idle-but-still-tracked character reads as "checked recently" rather than
        // falsely "stale"; updatedAt still only advances when the content itself actually changed.
        const contentChanged = JSON.stringify({ ...document, updatedAt: null, checkedAt: null })
            !== JSON.stringify({ ...previous, updatedAt: null, checkedAt: null });
        const next = { ...document, checkedAt: capturedAt, updatedAt: contentChanged ? capturedAt : (previous.updatedAt ?? null) };
        await writeJsonAtomic(historyPath, next);
        log(contentChanged
            ? `Character History: snapshot updated for ${profile.name}.`
            : `Character History: checked ${profile.name}, no content changes.`);
        return profile.world;
    }

    /**
     * `world` must be the identity Character History resolved *this run* (or null); it never falls
     * back to a previously-stored World, since guessing would let a profile-resolution failure or a
     * changed configured character silently poll (and persist prices for) the wrong market.
     */
    async function updateMarketWatch(world, marketItems) {
        const previous = await readJson(marketPath, createEmptyMarketWatch());
        const capturedAt = now().toISOString();
        let document = world ? reconcileMarketWatch(previous, { world, itemIds: marketItems.map(item=>item.id) }) : createEmptyMarketWatch();
        if(world)document=withMarketWorld(document,world).document;
        // Configuration changes invalidate old quotes even when refresh authentication is unavailable.
        if(!world||!marketItems.length||!token){
            if(JSON.stringify(document)!==JSON.stringify(previous))await writeJsonAtomic(marketPath,document);
            log(!world?"Market Watch: no configured World.":!marketItems.length?"Market Watch: no selected items.":"Market Watch: token missing; matching last-known observations retained without refreshing.");
            return;
        }

        const headers = { Authorization: `Bearer ${token}` };

        for (const item of marketItems) {
            try {
                const url = `${TIBIAMARKET_API}?${new URLSearchParams({
                    server: world,
                    item_id: String(item.id),
                    start_days_ago: String(MARKET_HISTORY_WINDOW_DAYS),
                    end_days_ago: "-1",
                })}`;
                const history = await fetchJson(url, headers);
                const observation = selectLatestMarketPrice(history);
                if (observation) {
                    document = withMarketItemPrice(document, item, observation, capturedAt).document;
                    log(`Market Watch: ${item.name} — ${observation.price} gp (${observation.basis}).`);
                } else {
                    log(`Market Watch: ${item.name} has no usable sell observation in the last ${MARKET_HISTORY_WINDOW_DAYS} days on ${world}.`);
                }
            } catch (err) {
                errorLog(`Market Watch: ${item.name} failed, keeping its last known price: ${err.message}`);
            }
            await sleepImpl(REQUEST_DELAY_MS);
        }

        const changed = JSON.stringify({ ...document, updatedAt: null }) !== JSON.stringify({ ...previous, updatedAt: null });
        if (changed) {
            await writeJsonAtomic(marketPath, { ...document, updatedAt: capturedAt });
            log(`Market Watch: snapshot updated for ${world}.`);
        } else {
            log(`Market Watch: no changes for ${world}.`);
        }
    }

    const rawConfig=await readJson(configPath,undefined);
    if(rawConfig===undefined){log("No configuration file; snapshots preserved.");return;}
    const config = readPublicDataConfig(rawConfig);
    // Check both snapshots before any fetch/write, including partial update paths.
    for(const [path,kind] of [[historyPath,"history"],[marketPath,"market"]]){
        const saved=await readJson(path,null);
        if(saved===null)continue;
        const record=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
        if(!record(saved)||saved.schemaVersion!==1||(kind==="history"?(!record(saved.character)||typeof saved.character.name!=="string"||!record(saved.history)||!record(saved.highscores)||!Array.isArray(saved.deaths)):(!record(saved.items)||(saved.world!==null&&typeof saved.world!=="string"))))throw new Error(`Invalid ${kind} snapshot; existing observations have not been replaced.`);
    }
    const world = await updateCharacterHistory(config.characterName);
    await updateMarketWatch(world, config.marketItems);
}

function isMainModule(moduleUrl) {
    return Boolean(process.argv[1]) && resolvePath(process.argv[1]) === fileURLToPath(moduleUrl);
}

if (isMainModule(import.meta.url)) {
    await runUpdatePublicData({
        configPath: fileURLToPath(new URL("../config/public-data.json", import.meta.url)),
        historyPath: fileURLToPath(new URL("../src/data/public-history.json", import.meta.url)),
        marketPath: fileURLToPath(new URL("../src/data/market-watch.json", import.meta.url)),
        token: process.env.TIBIA_MARKET_TOKEN || "",
    });
}
