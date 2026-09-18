import { normalizeProgressEvidence } from "./session-analysis.js";

/**
 * What you are missing, as opposed to what you are looking at.
 *
 * The session analysis can only reason about creatures that appear in a pasted
 * Hunt Analyzer. Measured against a real Bestiary that is a narrow slice: most of
 * the charm points available sit in creatures that have never been hunted at all,
 * and no amount of session analysis can surface them.
 *
 * This crosses three sources that already exist:
 *   game data      every creature, its charm points, thresholds and locations
 *   progress       the player's kills per creature
 *   session archive the fastest kill rate ever *measured* for a creature
 *
 * The arithmetic deliberately mirrors buildMonsterProgress in session-analysis.js
 * — kill rate is kills per minute and charm rate annualises the completion reward
 * to one hour — so a projection here agrees with the same creature's row in
 * the session that measured it. The verification asserts that agreement rather
 * than trusting it.
 */

function projectCharmsPerHour(charms, timeRemainingMinutes) {
    if (!Number.isFinite(timeRemainingMinutes) || timeRemainingMinutes <= 0) {
        return 0;
    }

    return (charms / timeRemainingMinutes) * 60;
}

/**
 * The fastest rate ever measured for each creature, and which session measured it.
 * A creature hunted in several sessions keeps the best one, because that is the
 * rate the player has actually proven they can sustain. `respawnMode` is carried
 * through when a session states one, but rates are still pooled across modes here
 * — legacy behavior for callers that never separated them.
 */
export function buildMeasuredRates(sessions) {
    const rates = new Map();

    sessions.forEach((session) => {
        session.monsters.forEach((monster) => {
            const current = rates.get(monster.name);

            if (!(monster.killRate > 0)) {
                return;
            }

            if (!current || monster.killRate > current.killRate) {
                rates.set(monster.name, {
                    killRate: monster.killRate,
                    sessionId: session.id,
                    sessionLabel: session.label,
                    respawnMode: session.respawnMode ?? null
                });
            }
        });
    });

    return rates;
}

/**
 * The same best-ever rates, but kept separate per stated respawn mode — Rapid
 * Respawn kill rates are not comparable to Regular Respawn ones, so a creature
 * hunted under both keeps its best rate for each rather than one mixed "best".
 * Sessions with no stated mode contribute nothing here; `buildMeasuredRates`
 * above remains the pooled fallback for those.
 */
export function buildMeasuredRatesByMode(sessions) {
    const ratesByMode = new Map();

    sessions.forEach((session) => {
        const respawnMode = session.respawnMode ?? null;

        if (!respawnMode) {
            return;
        }

        session.monsters.forEach((monster) => {
            if (!(monster.killRate > 0)) {
                return;
            }

            const modeRates = ratesByMode.get(monster.name) ?? new Map();
            const current = modeRates.get(respawnMode);

            if (!current || monster.killRate > current.killRate) {
                modeRates.set(respawnMode, {
                    killRate: monster.killRate,
                    sessionId: session.id,
                    sessionLabel: session.label,
                    respawnMode
                });
            }

            ratesByMode.set(monster.name, modeRates);
        });
    });

    return ratesByMode;
}

function buildEntry(creature, evidence) {
    const unlockTarget = Number(creature["Kills to Unlock"]) || 0;
    const charms = Number(creature.Charms) || 0;
    const kills = evidence.kills;
    const isComplete = evidence.known && unlockTarget > 0 && kills >= unlockTarget;
    // Mirrors buildMonsterProgress in session-analysis.js: the least this entry
    // could still owe, given what the evidence actually proves.
    const bestCaseKills = evidence.known
        ? (evidence.isFloor ? Math.min(unlockTarget, evidence.killsCeiling ?? unlockTarget) : kills)
        : unlockTarget;

    return {
        name: creature.Name,
        charms,
        kills,
        unlockTarget,
        isComplete,
        killsLeft: Math.max(0, unlockTarget - kills),
        killsLeftAtLeast: Math.max(0, unlockTarget - bestCaseKills),
        progressKnown: evidence.known,
        isProgressFloor: evidence.isFloor,
        // A count is required to call a creature "started": an untouched entry may
        // in truth already be far along, but nothing here proves it was started.
        hasStarted: evidence.known && kills > 0,
        locations: creature.locationList ?? [],
        className: creature.Class,
        difficulty: creature.Difficulty,
        occurrence: creature.Occurrence
    };
}

/**
 * Locations ranked by the charm points still unclaimed in them — the "where do I
 * go" answer. A creature counts toward every location it appears in, because you
 * could hunt it in any of them.
 */
export function rankLocations(entries) {
    const locations = new Map();

    entries.forEach((entry) => {
        if (entry.isComplete) {
            return;
        }

        entry.locations.forEach((location) => {
            const bucket = locations.get(location) ?? { location, charms: 0, creatures: 0, started: 0 };

            bucket.charms += entry.charms;
            bucket.creatures += 1;
            bucket.started += entry.hasStarted ? 1 : 0;
            locations.set(location, bucket);
        });
    });

    return [...locations.values()].sort((left, right) => right.charms - left.charms || left.location.localeCompare(right.location));
}

export function buildOpportunityAnalysis(creatures, killsByName, sessions, options = {}) {
    const {
        quickWinLimit = 12,
        locationLimit = 12,
        finishableLimit = 12,
        blindSpotLimit = 12,
        unknownProgressLimit = 12,
        // Opt-in: when a respawn mode is requested, finishable time only trusts
        // rates measured under that same mode. Omitted, this pools every mode's
        // best-ever rate exactly as before — unchanged for every existing caller.
        respawnMode = null
    } = options;
    const rates = buildMeasuredRates(sessions);
    const ratesByMode = respawnMode ? buildMeasuredRatesByMode(sessions) : null;
    const huntedNames = new Set(sessions.flatMap((session) => session.monsters.map((monster) => monster.name)));
    const entries = creatures.map((creature) => buildEntry(creature, normalizeProgressEvidence(killsByName[creature.Name])));
    const outstanding = entries.filter((entry) => !entry.isComplete);

    const totals = entries.reduce((acc, entry) => {
        acc.charmsTotal += entry.charms;

        if (entry.isComplete) {
            acc.done += 1;
            acc.charmsEarned += entry.charms;
        } else if (!entry.progressKnown) {
            // Never recorded at all — distinct from a confirmed zero. It could
            // already be complete, so it is counted on its own rather than folded
            // into "never hunted".
            acc.unknownProgress += 1;
            acc.charmsUnknownProgress += entry.charms;
        } else if (entry.hasStarted) {
            acc.inProgress += 1;
            acc.charmsInProgress += entry.charms;
        } else {
            acc.neverHunted += 1;
            acc.charmsNeverHunted += entry.charms;
        }

        return acc;
    }, {
        charmsTotal: 0,
        charmsEarned: 0,
        charmsInProgress: 0,
        charmsNeverHunted: 0,
        charmsUnknownProgress: 0,
        done: 0,
        inProgress: 0,
        neverHunted: 0,
        unknownProgress: 0
    });

    // Creatures you have a proven rate for and have not finished: the work you
    // could start tonight, ranked by what it pays per hour. Unknown progress is
    // excluded even when a rate exists — a time estimate built on an unrecorded
    // total would overstate what the tile actually proves, so it cannot honestly
    // be ranked "finishable".
    const finishable = outstanding
        .filter((entry) => entry.progressKnown && (ratesByMode ? ratesByMode.get(entry.name)?.has(respawnMode) : rates.has(entry.name)))
        .map((entry) => {
            const measured = ratesByMode ? ratesByMode.get(entry.name).get(respawnMode) : rates.get(entry.name);
            const timeRemainingMinutes = entry.killsLeft / measured.killRate;
            const timeRemainingMinutesAtLeast = entry.killsLeftAtLeast / measured.killRate;

            return {
                ...entry,
                killRate: measured.killRate,
                sessionId: measured.sessionId,
                sessionLabel: measured.sessionLabel,
                respawnMode: measured.respawnMode,
                timeRemainingMinutes,
                timeRemainingMinutesAtLeast,
                charmsPerHour: projectCharmsPerHour(entry.charms, timeRemainingMinutes)
            };
        })
        .sort((left, right) => right.charmsPerHour - left.charmsPerHour || left.timeRemainingMinutes - right.timeRemainingMinutes);

    // Started and nearly done, whether or not a session covers them. These are the
    // cheapest points on the board and the session analysis cannot see the ones it
    // has no log for. Unknown-progress entries are excluded here too: "started" is
    // a claim about a confirmed count, not an absence of one.
    const quickWins = outstanding
        .filter((entry) => entry.progressKnown && entry.hasStarted)
        .sort((left, right) => left.killsLeft - right.killsLeft || right.charms - left.charms);

    // Started, then abandoned: progress exists but no stored session features it,
    // so nothing is currently measuring it.
    const blindSpots = outstanding
        .filter((entry) => entry.progressKnown && entry.hasStarted && !huntedNames.has(entry.name))
        .sort((left, right) => left.killsLeft - right.killsLeft);

    // Bestiary progress that was simply never recorded — never touched the tile
    // or the kill count. Kept apart from "never hunted" (a confirmed zero) and
    // from "finishable" (which needs a trustworthy remaining-kills number).
    const unknownProgress = outstanding
        .filter((entry) => !entry.progressKnown)
        .sort((left, right) => right.charms - left.charms || left.name.localeCompare(right.name));

    const locations = rankLocations(entries);

    return {
        totals: {
            ...totals,
            charmsUnclaimed: totals.charmsInProgress + totals.charmsNeverHunted + totals.charmsUnknownProgress,
            creatureTotal: entries.length,
            measuredCreatures: rates.size,
            sessionCount: sessions.length
        },
        finishable: finishable.slice(0, finishableLimit),
        finishableCount: finishable.length,
        quickWins: quickWins.slice(0, quickWinLimit),
        quickWinCount: quickWins.length,
        locations: locations.slice(0, locationLimit),
        locationCount: locations.length,
        blindSpots: blindSpots.slice(0, blindSpotLimit),
        blindSpotCount: blindSpots.length,
        unknownProgress: unknownProgress.slice(0, unknownProgressLimit),
        unknownProgressCount: unknownProgress.length
    };
}
