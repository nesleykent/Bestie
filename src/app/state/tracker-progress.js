/**
 * The player's progress across every tracker — user data, kept strictly apart
 * from the game data in src/data.
 *
 *   { [trackerId]: { [itemKey]: entry } }
 *
 * An entry only ever holds facts that cannot be derived: kills for a counter,
 * a done flag for a checklist, plus whatever flags the tracker declares. Status,
 * points earned, remaining and percentages are all derived from the entry plus
 * game data, never stored, so a rebalanced item is picked up automatically
 * rather than going stale in a saved file.
 *
 * Entries at their defaults are absent from the record rather than stored as
 * zeroes. For a real account that is a few hundred rows instead of thousands.
 */

function toCount(value) {
    const count = Math.floor(Number(value));

    return Number.isFinite(count) && count > 0 ? count : 0;
}

/**
 * Field types come from the shape of the tracker's declared defaults, so a
 * tracker never has to supply its own coercion code.
 */
export function normalizeEntry(entryDefaults, raw) {
    return Object.entries(entryDefaults).reduce((entry, [field, fallback]) => {
        entry[field] = typeof fallback === "number" ? toCount(raw?.[field]) : Boolean(raw?.[field]);
        return entry;
    }, {});
}

export function isDefaultEntry(entryDefaults, entry) {
    return Object.entries(entryDefaults).every(([field, fallback]) => entry[field] === fallback);
}

/**
 * Fields that say nothing about the character's progress, so they must not make an
 * item count as answered. Bookmarking a creature is a note to self, not a claim
 * that you have killed it.
 */
const UNANSWERED_FIELDS = new Set(["bookmark"]);

/**
 * Every tracker carries this. It is what makes "I checked, and the answer is no"
 * storable per item: an entry holding only `reviewed: true` differs from the
 * defaults, so it survives, while an untouched item still stores nothing at all.
 *
 * This replaced a whole layer of units, pages and confirmation screens whose only
 * job was to express the same fact one screenful at a time.
 */
export const REVIEWED_FIELD = "reviewed";

/**
 * Has the player told us anything about this item?
 *
 * Three states, all derived from the entry alone:
 *
 *   a value        answered — 412 kills, earned, stage 2
 *   reviewed only  checked, and the answer is no
 *   nothing        not recorded yet
 */
export function isAnsweredEntry(entryDefaults, entry) {
    return Object.entries(entryDefaults)
        .some(([field, fallback]) => !UNANSWERED_FIELDS.has(field) && field !== REVIEWED_FIELD && entry[field] !== fallback);
}

/** Answered, or explicitly checked and found absent. */
export function isKnownEntry(entryDefaults, entry) {
    return isAnsweredEntry(entryDefaults, entry) || Boolean(entry[REVIEWED_FIELD]);
}

export function hasStoredEntry(progress, trackerId, itemKey) {
    return Object.prototype.hasOwnProperty.call(getTrackerRecord(progress, trackerId), itemKey);
}

/** The stored entry, or null — what an undo needs in order to restore exactly. */
export function getStoredEntry(progress, trackerId, itemKey) {
    const stored = getTrackerRecord(progress, trackerId)[itemKey];

    return stored ? { ...stored } : null;
}

export function createTrackerProgress() {
    return {};
}

export function getTrackerRecord(progress, trackerId) {
    return progress[trackerId] ?? {};
}

export function getEntry(progress, trackerId, itemKey, entryDefaults) {
    return getTrackerRecord(progress, trackerId)[itemKey] ?? normalizeEntry(entryDefaults, {});
}

/**
 * Writes are in place and drop entries that fall back to their defaults, so the
 * record never accumulates rows that say nothing.
 */
export function setEntry(progress, trackerId, itemKey, entryDefaults, changes) {
    const record = progress[trackerId] ?? (progress[trackerId] = {});
    const next = normalizeEntry(entryDefaults, { ...getEntry(progress, trackerId, itemKey, entryDefaults), ...changes });

    if (isDefaultEntry(entryDefaults, next)) {
        delete record[itemKey];
    } else {
        record[itemKey] = next;
    }

    if (!Object.keys(record).length) {
        delete progress[trackerId];
    }

    return progress;
}

export function toggleEntryFlag(progress, trackerId, itemKey, entryDefaults, field) {
    if (!(field in entryDefaults)) {
        return progress;
    }

    const current = getEntry(progress, trackerId, itemKey, entryDefaults)[field];

    return setEntry(progress, trackerId, itemKey, entryDefaults, { [field]: !current });
}

export function countTrackedEntries(progress) {
    return Object.values(progress).reduce((total, record) => total + Object.keys(record).length, 0);
}

/**
 * Restores the record, discarding anything that does not belong to a known
 * tracker and re-normalizing every entry against that tracker's declared
 * fields, so a hand-edited or older file cannot smuggle in junk.
 *
 * `legacyBestiaryProgress` is the pre-framework shape, when Bestiary was the
 * only tracker and its record sat at the top level of the workspace.
 */
export function restoreTrackerProgress(saved, trackerDefaults, legacyBestiaryProgress) {
    const progress = createTrackerProgress();

    const adopt = (trackerId, record) => {
        const entryDefaults = trackerDefaults[trackerId];

        if (!entryDefaults || !record || typeof record !== "object" || Array.isArray(record)) {
            return;
        }

        Object.entries(record).forEach(([itemKey, rawEntry]) => {
            if (typeof itemKey !== "string" || !itemKey.trim()) {
                return;
            }

            const entry = normalizeEntry(entryDefaults, rawEntry);

            if (!isDefaultEntry(entryDefaults, entry)) {
                (progress[trackerId] ?? (progress[trackerId] = {}))[itemKey] = entry;
            }
        });
    };

    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        Object.entries(saved).forEach(([trackerId, record]) => adopt(trackerId, record));
    }

    // Only fall back to the legacy shape when the new one carried nothing for
    // Bestiary, so a migrated workspace is never overwritten by a stale copy.
    if (!progress.bestiary) {
        adopt("bestiary", legacyBestiaryProgress);
    }

    return progress;
}
