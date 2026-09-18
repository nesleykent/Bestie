import { parseHuntSession } from "./session-parser.js";
import { findBestiaryCreature } from "./creature-names.js";

/**
 * A Bestiary total is either a bare number — the legacy shape, always treated as
 * an exact, known count — or explicit evidence describing *how* that count is
 * known: `known` false for a tile that was never touched, `isFloor` true for a
 * tile that only proves a minimum (with `killsCeiling` the most it could hide).
 * Every caller below still gets a plain `kills` number, so nothing downstream
 * has to change to keep working; evidence only adds the honesty on top.
 */
export function normalizeProgressEvidence(value) {
    if (value && typeof value === "object") {
        const rawKills = Number(value.kills);
        const rawCeiling = Number(value.killsCeiling);

        return {
            kills: Number.isFinite(rawKills) ? rawKills : 0,
            known: value.known !== false,
            isFloor: value.known !== false && Boolean(value.isFloor),
            killsCeiling: Number.isFinite(rawCeiling) ? rawCeiling : null
        };
    }

    const rawKills = Number(value);
    return { kills: Number.isFinite(rawKills) ? rawKills : 0, known: true, isFloor: false, killsCeiling: null };
}

function buildMonsterProgress(entry, killsThisSession, sessionDuration, totalKillsInput = 0) {
    const killsToUnlock = Number(entry["Kills to Unlock"]) || 0;
    const charms = Number(entry.Charms) || 0;
    const killRate = sessionDuration > 0 ? (killsThisSession / sessionDuration) : 0;
    const evidence = normalizeProgressEvidence(totalKillsInput);
    const totalKills = evidence.kills;

    // The most kills that could already be banked under this evidence: the tile's
    // ceiling when it only proves a floor, the full target when nothing has been
    // recorded at all (an untouched entry could already be complete), or the typed
    // count itself when it is exact. This bounds remaining kills/time from below,
    // so an unrecorded entry is never asserted to need the full grind — only that
    // it might, which is what the (unchanged) pessimistic fields below still say.
    const bestCaseKills = !evidence.known
        ? killsToUnlock
        : (evidence.isFloor ? Math.min(killsToUnlock, evidence.killsCeiling ?? killsToUnlock) : totalKills);

    // Unchanged in shape and meaning for every existing caller: the pessimistic
    // "assume no more progress than proven" reading, which is what an untouched
    // or floor-only entry has always resolved to here.
    const remainingKills = Math.max(0, killsToUnlock - totalKills);
    const remainingKillsAtLeast = Math.max(0, killsToUnlock - bestCaseKills);
    const timeRemainingMinutes = remainingKills === 0
        ? 0
        : (killRate > 0 ? (remainingKills / killRate) : Number.POSITIVE_INFINITY);
    const timeRemainingMinutesAtLeast = remainingKillsAtLeast === 0
        ? 0
        : (killRate > 0 ? (remainingKillsAtLeast / killRate) : Number.POSITIVE_INFINITY);
    const charmsPerHour = Number.isFinite(timeRemainingMinutes) && timeRemainingMinutes > 0
        ? (charms / timeRemainingMinutes) * 60
        : 0;

    return {
        name: entry.Name,
        wikiLink: `https://tibia.fandom.com/wiki/${entry.Name.replace(/\s/g, "_")}`,
        charms,
        killsThisSession,
        totalKills,
        progressKnown: evidence.known,
        isProgressFloor: evidence.isFloor,
        killsToUnlock,
        killRate,
        remainingKills,
        remainingKillsAtLeast,
        timeRemainingMinutes,
        timeRemainingMinutesAtLeast,
        charmsPerHour
    };
}

export function isBestiaryEntryComplete(monster) {
    return (monster.totalKills || 0) >= monster.killsToUnlock;
}

export function summarizeBestiaryMonsters(monsters) {
    const totals = monsters.reduce((summary, monster) => {
        summary.totalCharms += isBestiaryEntryComplete(monster) ? 0 : monster.charms;
        summary.maxTimeRemainingMinutes = Math.max(
            summary.maxTimeRemainingMinutes,
            monster.timeRemainingMinutes
        );
        summary.maxTimeRemainingMinutesAtLeast = Math.max(
            summary.maxTimeRemainingMinutesAtLeast,
            monster.timeRemainingMinutesAtLeast ?? monster.timeRemainingMinutes
        );
        summary.hasUnknownProgress = summary.hasUnknownProgress || monster.progressKnown === false;
        summary.hasFloorProgress = summary.hasFloorProgress || monster.isProgressFloor === true;
        return summary;
    }, {
        maxTimeRemainingMinutes: 0,
        maxTimeRemainingMinutesAtLeast: 0,
        totalCharms: 0,
        hasUnknownProgress: false,
        hasFloorProgress: false
    });

    return {
        ...totals,
        totalCharmsPerHour: Number.isFinite(totals.maxTimeRemainingMinutes) && totals.maxTimeRemainingMinutes > 0
            ? (totals.totalCharms / totals.maxTimeRemainingMinutes) * 60
            : 0
    };
}

export function analyzeSession(logText, bestiaryData, session = parseHuntSession(logText)) {
    const monsters = session.monsters.map(({ name, killsThisSession }) => {
        const entry = findBestiaryCreature(name, bestiaryData);
        return entry ? buildMonsterProgress(entry, killsThisSession, session.sessionDuration) : null;
    }).filter(Boolean);
    return { sessionDuration: session.sessionDuration, monsters };
}

export function recalculateProgress(monsters, bestiaryData, sessionDuration, totalKillsByName) {
    return monsters.map((monster) => {
        const bestiaryEntry = bestiaryData.find((entry) => entry.Name === monster.name);
        if (!bestiaryEntry) return null; // Removed metadata cannot crash a saved workspace.
        // A plain number (legacy) or explicit progress evidence — buildMonsterProgress
        // normalizes either. Do not coerce with Number() here: that would silently
        // flatten an evidence object to NaN before it gets the chance to be read.
        const totalKillsInput = totalKillsByName[monster.name] ?? 0;

        return buildMonsterProgress(bestiaryEntry, monster.killsThisSession, sessionDuration, totalKillsInput);
    }).filter(Boolean);
}
