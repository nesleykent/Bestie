/**
 * One undo trail for every write to tracker data.
 *
 * A change stores the *previous* value of everything it touched, so undoing is a
 * restore rather than an inverse operation — that is what lets one entry cover a
 * single field, a bulk mark of 40 rows, a whole recorded unit, and an import,
 * with no special cases at the call site.
 *
 * `entries` maps an item key to the entry it had before, or null when the item
 * had no entry at all. `units` does the same for unit records. Restoring means
 * putting both back exactly as they were.
 *
 * Capped, because this is a recovery aid and not a history feature: the last 50
 * changes are kept and the rest fall off the end.
 */

export const CHANGE_LIMIT = 50;

let changeSequence = 0;

export function createChangeLog() {
    return [];
}

function nextChangeId() {
    changeSequence += 1;
    return `change-${changeSequence}`;
}

/**
 * @param {object} change
 * @param {string} change.kind    entry | bulk | unit | import | proposal
 * @param {string} change.trackerId
 * @param {string} change.label   what the player sees in the undo affordance
 * @param {object} change.entries { [itemKey]: previousEntry | null }
 * @param {object} [change.units] { [unitKey]: previousUnitRecord | null }
 */
export function pushChange(log, change) {
    log.unshift({
        id: nextChangeId(),
        at: new Date().toISOString(),
        kind: change.kind,
        trackerId: change.trackerId,
        label: change.label,
        entries: change.entries ?? {},
        units: change.units ?? {}
    });

    log.splice(CHANGE_LIMIT);

    return log;
}

export function peekChange(log) {
    return log[0] ?? null;
}

export function dropChange(log, changeId) {
    const index = log.findIndex((change) => change.id === changeId);

    if (index === -1) {
        return null;
    }

    return log.splice(index, 1)[0] ?? null;
}

/**
 * Restores a change in place. Progress and unit records are mutated the same way
 * the forward path mutates them, so nothing else in the app has to know that an
 * undo happened.
 */
export function applyUndo(change, progress, units) {
    const record = progress[change.trackerId] ?? (progress[change.trackerId] = {});

    Object.entries(change.entries).forEach(([itemKey, previous]) => {
        if (previous) {
            record[itemKey] = { ...previous };
        } else {
            delete record[itemKey];
        }
    });

    if (!Object.keys(record).length) {
        delete progress[change.trackerId];
    }

    const unitRecord = units[change.trackerId] ?? (units[change.trackerId] = {});

    Object.entries(change.units).forEach(([unitKey, previous]) => {
        if (previous) {
            unitRecord[unitKey] = { ...previous };
        } else {
            delete unitRecord[unitKey];
        }
    });

    if (!Object.keys(unitRecord).length) {
        delete units[change.trackerId];
    }
}

/** A saved log is data from disk: keep only well-formed entries. */
export function restoreChangeLog(saved, trackerIds) {
    if (!Array.isArray(saved)) {
        return createChangeLog();
    }

    const known = new Set(trackerIds);

    return saved
        .filter((change) => change
            && typeof change === "object"
            && known.has(change.trackerId)
            && typeof change.label === "string"
            && change.entries
            && typeof change.entries === "object")
        .slice(0, CHANGE_LIMIT)
        .map((change) => ({
            id: nextChangeId(),
            at: typeof change.at === "string" ? change.at : new Date().toISOString(),
            kind: typeof change.kind === "string" ? change.kind : "entry",
            trackerId: change.trackerId,
            label: change.label,
            entries: change.entries,
            units: change.units && typeof change.units === "object" ? change.units : {}
        }));
}
