/**
 * One vocabulary for progress state, shared by all seven trackers.
 *
 * Before this, the same idea had six names — Missing, Not Started, Open,
 * Undiscovered, Locked, and a blank — so every tracker taught the player a new
 * word for "you don't have it". The terminal state keeps its domain verb, because
 * an achievement is Earned and a Bestiary entry is Complete, but everything
 * leading up to it reads the same everywhere.
 *
 * `unknown` is the state that did not exist at all: nothing recorded, as opposed to
 * recorded as nothing.
 */

export const STATUS_LABELS = {
    unknown: "Not recorded",
    notStarted: "Not started",
    inProgress: "In progress",
    done: "Done"
};

export const STATUS_ORDER = ["unknown", "notStarted", "inProgress", "done"];

/** Tracker-specific word for the finished state, kept short enough for a cell. */
export function doneLabel(word = "Done") {
    return word;
}

/**
 * The status filter every tracker exposes, so the strip reads identically
 * everywhere. `doneWord` is the only thing a tracker changes.
 */
export function buildStatusFacet({ doneWord = "Done", startedWord = STATUS_LABELS.inProgress, hasInProgress = true } = {}) {
    const options = [
        { value: "all", label: "All" },
        { value: "unknown", label: STATUS_LABELS.unknown },
        { value: "notStarted", label: STATUS_LABELS.notStarted }
    ];

    if (hasInProgress) {
        options.push({ value: "inProgress", label: startedWord });
    }

    options.push({ value: "done", label: doneWord });

    return {
        key: "status",
        kind: "segmented",
        label: "Status",
        isStatus: true,
        options: () => options,
        matches: (row, value) => (value === "unknown" ? !row.known : row.known && row.status === value)
    };
}
