import { isBestiaryEntryComplete } from "./session-analysis.js";

const MINUTE_TOLERANCE = 0.000001;

export function parsePlayTimeMinutes(rawValue) {
    const value = String(rawValue ?? "").trim().toLowerCase().replace(",", ".");

    if (!value) {
        return null;
    }

    const clockMatch = value.match(/^(\d+):([0-5]?\d)$/);
    if (clockMatch) {
        const clockMinutes = (Number(clockMatch[1]) * 60) + Number(clockMatch[2]);
        return clockMinutes > 0 ? clockMinutes : null;
    }

    const hourAndMinuteMatch = value.match(/^(\d+(?:\.\d+)?)\s*(?:hours|hour|hrs|hr|h)\s*(\d+(?:\.\d+)?)$/);
    if (hourAndMinuteMatch) {
        const totalMinutes = (Number(hourAndMinuteMatch[1]) * 60) + Number(hourAndMinuteMatch[2]);
        return totalMinutes > 0 ? totalMinutes : null;
    }

    const hourMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:hours|hour|hrs|hr|h)\b/);
    const minuteMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:minutes|minute|mins|min|m)\b/);
    let minutes = 0;

    if (hourMatch) {
        minutes += Number(hourMatch[1]) * 60;
    }

    if (minuteMatch) {
        minutes += Number(minuteMatch[1]);
    }

    if (!hourMatch && !minuteMatch) {
        const bareMatch = value.match(/^(\d+(?:\.\d+)?)$/);

        if (!bareMatch) {
            return null;
        }

        minutes = Number(bareMatch[1]) * 60;
    }

    return minutes > 0 ? minutes : null;
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
    const groups = huntGroups.map((huntGroup) => ({
        id: huntGroup.id,
        label: huntGroup.label,
        options: buildHuntOptions(huntGroup.monsters)
    }));

    let states = [{ minutes: 0, charms: 0, picks: [] }];

    groups.forEach((group) => {
        const nextStates = [];

        states.forEach((state) => {
            group.options.forEach((option) => {
                const minutes = state.minutes + option.minutes;

                if (minutes > availableMinutes + MINUTE_TOLERANCE) {
                    return;
                }

                nextStates.push({
                    minutes,
                    charms: state.charms + option.charms,
                    picks: [...state.picks, { group, option }]
                });
            });
        });

        states = keepBestStates(nextStates);
    });

    const bestState = states[states.length - 1];
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
