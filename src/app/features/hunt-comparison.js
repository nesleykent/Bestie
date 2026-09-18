import { summarizeBestiaryMonsters } from "./session-analysis.js";

function toComparisonRow(entry) {
    return {
        id: entry.id,
        label: entry.label,
        totalCharms: entry.summary.totalCharms,
        maxTimeRemainingMinutes: entry.summary.maxTimeRemainingMinutes,
        totalCharmsPerHour: entry.summary.totalCharmsPerHour,
        isBest: false
    };
}

function isBetterHunt(candidate, currentBest) {
    if (candidate.totalCharmsPerHour <= 0) {
        return false;
    }

    if (!currentBest) {
        return true;
    }

    if (candidate.totalCharmsPerHour !== currentBest.totalCharmsPerHour) {
        return candidate.totalCharmsPerHour > currentBest.totalCharmsPerHour;
    }

    return candidate.totalCharms > currentBest.totalCharms;
}

export function buildAllTabsEntryKey(huntId, monsterName) {
    return `${huntId}::${monsterName}`;
}

export function isEntryKeyForHunt(entryKey, huntId) {
    return entryKey.startsWith(`${huntId}::`);
}

export function buildAllTabsAnalysis(huntEntries, excludedEntryKeys) {
    const excludedKeys = new Set(excludedEntryKeys);
    const huntGroups = huntEntries.map((huntEntry, huntOrder) => {
        const entries = huntEntry.monsters.map((monster) => {
            const key = buildAllTabsEntryKey(huntEntry.id, monster.name);

            return {
                key,
                huntId: huntEntry.id,
                huntLabel: huntEntry.label,
                huntOrder,
                monster,
                isSelected: !excludedKeys.has(key)
            };
        });

        return {
            id: huntEntry.id,
            label: huntEntry.label,
            entries,
            selectedMonsters: entries.filter((entry) => entry.isSelected).map((entry) => entry.monster)
        };
    });
    const rows = huntGroups
        .flatMap((huntGroup) => huntGroup.entries)
        .sort((left, right) => left.monster.name.localeCompare(right.monster.name) || left.huntOrder - right.huntOrder);

    return {
        rows,
        participatingHunts: huntGroups.filter((huntGroup) => huntGroup.selectedMonsters.length > 0)
    };
}

/**
 * The combined Bestiary Sessions total, across every participating hunt.
 *
 * A creature's completion reward is a fact about the creature, not about any one
 * hunt — so a creature selected in two hunts must not pay out its charm points
 * twice, and the time to finish it must not be charged twice either. Hunts are
 * walked in their existing tab order (the only order this view has) and each
 * creature is credited to the first hunt it appears in; later hunts see it as
 * already accounted for and it drops out of their own subtotal entirely. Within
 * a hunt, monsters still finish in parallel — `summarizeBestiaryMonsters` keeps
 * that — only the *sum across hunts* changes to stop double-counting overlaps.
 *
 * `totalTimeMinutes` is naturally infinite once any surviving hunt has a monster
 * with no measured kill rate (IEEE 754 `Infinity` arithmetic propagates through
 * the running sum on its own), and `totalCharms` is naturally zero once nothing
 * is left un-rewarded — no separate zero/infinite branch is required for either.
 *
 * Takes the hunt groups from `buildAllTabsAnalysis(...).participatingHunts`
 * (each `{ id, label, selectedMonsters }`), not pre-built per-hunt summaries —
 * the dedup below needs the individual monsters, which a summary has already
 * collapsed away.
 */
export function aggregateAllTabsSummary(participatingHunts) {
    const rewardedNames = new Set();
    let totalCharms = 0;
    let totalTimeMinutes = 0;

    participatingHunts.forEach((huntGroup) => {
        const freshMonsters = huntGroup.selectedMonsters.filter((monster) => !rewardedNames.has(monster.name));
        freshMonsters.forEach((monster) => rewardedNames.add(monster.name));

        const huntSummary = summarizeBestiaryMonsters(freshMonsters);
        totalCharms += huntSummary.totalCharms;
        totalTimeMinutes += huntSummary.maxTimeRemainingMinutes;
    });

    const charmRate = Number.isFinite(totalTimeMinutes) && totalTimeMinutes > 0
        ? (totalCharms / totalTimeMinutes) * 60
        : 0;

    return {
        totalCharms,
        totalTimeMinutes,
        charmRate
    };
}

export function buildHuntComparison(entries) {
    const rows = entries.filter((entry) => Boolean(entry.summary)).map(toComparisonRow);
    const pendingLabels = entries.filter((entry) => !entry.summary).map((entry) => entry.label);
    const bestRow = rows.reduce((best, row) => (isBetterHunt(row, best) ? row : best), null);

    if (bestRow) {
        bestRow.isBest = true;
    }

    return {
        rows,
        pendingLabels,
        bestRow
    };
}
