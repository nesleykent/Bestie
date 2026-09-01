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

export function aggregateAllTabsSummary(huntSummaries) {
    const totalCharms = huntSummaries.reduce((sum, huntSummary) => sum + huntSummary.totalCharms, 0);
    const hasInfiniteTime = huntSummaries.some((huntSummary) => !Number.isFinite(huntSummary.maxTimeRemainingMinutes));
    const totalTimeMinutes = hasInfiniteTime
        ? Number.POSITIVE_INFINITY
        : huntSummaries.reduce((sum, huntSummary) => sum + huntSummary.maxTimeRemainingMinutes, 0);
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
