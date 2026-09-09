/** Shared state keys; labels retain the meaning of each tracker. */

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
 * The shared filter preserves persisted keys while allowing domain-specific labels.
 */
export function buildStatusFacet({ doneWord = "Done", notStartedWord = STATUS_LABELS.notStarted, startedWord = STATUS_LABELS.inProgress, hasInProgress = true } = {}) {
    const options = [
        { value: "all", label: "All" },
        { value: "unknown", label: STATUS_LABELS.unknown },
        { value: "notStarted", label: notStartedWord }
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
