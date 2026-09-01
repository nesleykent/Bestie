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
 * rate the player has actually proven they can sustain.
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
                    sessionLabel: session.label
                });
            }
        });
    });

    return rates;
}

function buildEntry(creature, kills) {
    const unlockTarget = Number(creature["Kills to Unlock"]) || 0;
    const charms = Number(creature.Charms) || 0;
    const isComplete = unlockTarget > 0 && kills >= unlockTarget;

    return {
        name: creature.Name,
        charms,
        kills,
        unlockTarget,
        isComplete,
        killsLeft: Math.max(0, unlockTarget - kills),
        hasStarted: kills > 0,
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
    const { quickWinLimit = 12, locationLimit = 12, finishableLimit = 12, blindSpotLimit = 12 } = options;
    const rates = buildMeasuredRates(sessions);
    const huntedNames = new Set(sessions.flatMap((session) => session.monsters.map((monster) => monster.name)));
    const entries = creatures.map((creature) => buildEntry(creature, Number(killsByName[creature.Name]) || 0));
    const outstanding = entries.filter((entry) => !entry.isComplete);

    const totals = entries.reduce((acc, entry) => {
        acc.charmsTotal += entry.charms;

        if (entry.isComplete) {
            acc.done += 1;
            acc.charmsEarned += entry.charms;
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
        done: 0,
        inProgress: 0,
        neverHunted: 0
    });

    // Creatures you have a proven rate for and have not finished: the work you
    // could start tonight, ranked by what it pays per hour.
    const finishable = outstanding
        .filter((entry) => rates.has(entry.name))
        .map((entry) => {
            const measured = rates.get(entry.name);
            const timeRemainingMinutes = entry.killsLeft / measured.killRate;

            return {
                ...entry,
                killRate: measured.killRate,
                sessionId: measured.sessionId,
                sessionLabel: measured.sessionLabel,
                timeRemainingMinutes,
                charmsPerHour: projectCharmsPerHour(entry.charms, timeRemainingMinutes)
            };
        })
        .sort((left, right) => right.charmsPerHour - left.charmsPerHour || left.timeRemainingMinutes - right.timeRemainingMinutes);

    // Started and nearly done, whether or not a session covers them. These are the
    // cheapest points on the board and the session analysis cannot see the ones it
    // has no log for.
    const quickWins = outstanding
        .filter((entry) => entry.hasStarted)
        .sort((left, right) => left.killsLeft - right.killsLeft || right.charms - left.charms);

    // Started, then abandoned: progress exists but no stored session features it,
    // so nothing is currently measuring it.
    const blindSpots = outstanding
        .filter((entry) => entry.hasStarted && !huntedNames.has(entry.name))
        .sort((left, right) => left.killsLeft - right.killsLeft);

    const locations = rankLocations(entries);

    return {
        totals: {
            ...totals,
            charmsUnclaimed: totals.charmsInProgress + totals.charmsNeverHunted,
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
        blindSpotCount: blindSpots.length
    };
}
