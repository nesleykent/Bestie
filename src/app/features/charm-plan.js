import { isBestiaryEntryComplete } from "./session-analysis.js";

const MINUTE_TOLERANCE = 0.000001;

export function parsePlayTimeMinutes(rawValue) {
    const value = String(rawValue ?? "").trim().toLowerCase().replace(",", ".");

    if (!value) {
        return null;
    }

    let minutes;
    const clock = value.match(/^(\d+):([0-5]\d)$/);
    const hours = value.match(/^(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)(?:\s*(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)?)?$/);
    const mins = value.match(/^(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)$/);
    if (clock) minutes = Number(clock[1]) * 60 + Number(clock[2]);
    else if (hours) minutes = Number(hours[1]) * 60 + Number(hours[2] ?? 0);
    else if (mins) minutes = Number(mins[1]);
    else if (/^\d+(?:\.\d+)?$/.test(value)) minutes = Number(value) * 60;
    return Number.isFinite(minutes) && minutes > 0 && minutes <= Number.MAX_SAFE_INTEGER ? minutes : null;
}

function buildHuntOptions(monsters) {
    const planableMonsters = monsters
        .filter((monster) => !isBestiaryEntryComplete(monster) && Number.isFinite(monster.timeRemainingMinutes))
        .sort((left, right) => left.timeRemainingMinutes - right.timeRemainingMinutes);
    const options = [{ minutes: 0, charms: 0, monsters: [] }];
    const completedMonsters = [];
    let charms = 0;

    planableMonsters.forEach((monster, index) => {
        charms += monster.charms;
        completedMonsters.push(monster);

        const nextMonster = planableMonsters[index + 1];
        if (nextMonster && nextMonster.timeRemainingMinutes === monster.timeRemainingMinutes) {
            return;
        }

        options.push({
            minutes: monster.timeRemainingMinutes,
            charms,
            monsters: [...completedMonsters]
        });
    });

    return options;
}

function keepBestStates(states) {
    // Only states with the same already-rewarded overlapping objectives can
    // dominate one another. Otherwise a future spawn can change their ranking.
    const buckets = new Map();
    for (const state of states) {
        const key = [...state.rewarded].sort().join("\u0000");
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(state);
    }
    return [...buckets.values()].flatMap(keepBestBucket);
}

function keepBestBucket(states) {
    const sortedStates = [...states]
        .sort((left, right) => left.minutes - right.minutes || right.charms - left.charms);
    const bestStates = [];
    let bestCharms = -1;

    sortedStates.forEach((state) => {
        if (state.charms > bestCharms) {
            bestStates.push(state);
            bestCharms = state.charms;
        }
    });

    return bestStates;
}

function buildRoute(picks) {
    const steps = picks
        .filter(({ option }) => option.minutes > 0)
        .map(({ group, option }) => ({
            huntId: group.id,
            huntLabel: group.label,
            minutes: option.minutes,
            charms: option.charms,
            entries: option.monsters
                .map((monster) => ({
                    name: monster.name,
                    charms: monster.charms,
                    timeRemainingMinutes: monster.timeRemainingMinutes
                }))
                .sort((left, right) => left.timeRemainingMinutes - right.timeRemainingMinutes
                    || left.name.localeCompare(right.name))
        }))
        .sort((left, right) => (right.charms / right.minutes) - (left.charms / left.minutes)
            || left.minutes - right.minutes);
    let cumulativeCharms = 0;

    return steps.map((step, index) => {
        cumulativeCharms += step.charms;

        return {
            ...step,
            order: index + 1,
            cumulativeCharms
        };
    });
}

export function planCharmTime(huntGroups, availableMinutes) {
    if (!Number.isFinite(availableMinutes) || availableMinutes < 0) {
        throw new RangeError("Available time must be a finite, non-negative number of minutes.");
    }
    const occurrences = new Map();
    huntGroups.forEach((group) => new Set(group.monsters.map((monster) => monster.name)).forEach((name) => occurrences.set(name, (occurrences.get(name) ?? 0) + 1)));
    const overlaps = new Set([...occurrences].filter(([, count]) => count > 1).map(([name]) => name));
    const groups = huntGroups.map((huntGroup) => ({
        id: huntGroup.id,
        label: huntGroup.label,
        options: buildHuntOptions(huntGroup.monsters)
    }));

    let states = [{ minutes: 0, charms: 0, picks: [], rewarded: new Set() }];

    groups.forEach((group) => {
        const nextStates = [];

        states.forEach((state) => {
            group.options.forEach((option) => {
                const minutes = state.minutes + option.minutes;

                if (minutes > availableMinutes + MINUTE_TOLERANCE) {
                    return;
                }

                const monsters = option.monsters.filter((monster) => !state.rewarded.has(monster.name));
                const charms = monsters.reduce((sum, monster) => sum + monster.charms, 0);
                const rewarded = new Set(state.rewarded);
                monsters.filter((monster) => overlaps.has(monster.name)).forEach((monster) => rewarded.add(monster.name));
                nextStates.push({
                    minutes, charms: state.charms + charms, rewarded,
                    picks: [...state.picks, { group, option: { ...option, charms, monsters } }]
                });
            });
        });

        states = keepBestStates(nextStates);
    });

    const bestState = states.reduce((best, candidate) => candidate.charms > best.charms
        || (candidate.charms === best.charms && candidate.minutes < best.minutes) ? candidate : best);
    const entries = bestState.picks
        .flatMap(({ group, option }) => option.monsters.map((monster) => ({
            huntId: group.id,
            huntLabel: group.label,
            name: monster.name,
            charms: monster.charms,
            timeRemainingMinutes: monster.timeRemainingMinutes
        })))
        .sort((left, right) => left.timeRemainingMinutes - right.timeRemainingMinutes
            || left.name.localeCompare(right.name));
    return {
        availableMinutes,
        charms: bestState.charms,
        timeUsedMinutes: bestState.minutes,
        unusedMinutes: Math.max(0, availableMinutes - bestState.minutes),
        completedCount: entries.length,
        entries,
        route: buildRoute(bestState.picks)
    };
}
