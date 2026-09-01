import { loadTitlesData } from "../services/titles-repository.js";
import { formatNumber } from "../utils/formatters.js";
import { bookmarkControl, escapeText, plainText, tickControl } from "../ui/render-controls.js";
import { STATUS_LABELS, buildStatusFacet } from "./status.js";

/** Titles: boolean progress, no points — the title itself is the reward. */

export function deriveTitleRow(title, entry) {
    return {
        key: title.Name,
        name: title.Name,
        unit: title.isPermanent ? "Permanent" : "Losable",
        requirement: title.requirement,
        isPermanent: title.isPermanent,
        earned: entry.earned,
        status: entry.earned ? "done" : "notStarted",
        bookmark: entry.bookmark,
        searchText: `${title.Name} ${title.requirement}`.toLowerCase()
    };
}

export const titlesTracker = {
    id: "titles",
    label: "Titles",
    tableTitle: "My Titles",
    resultsTitle: "Title Progress",
    resultsCopy: "Every title in the game and what it takes to earn one. Permanent titles stay once earned; the rest can be lost again.",
    progress: "boolean",
    entryDefaults: { earned: false, bookmark: false, reviewed: false },
    tickField: "earned",
    loadItems: loadTitlesData,
    itemKey: (title) => title.Name,
    derive: deriveTitleRow,
    defaultSortKey: "name",


    sortOptions: [
        { key: "name", label: "Name" },
        { key: "isPermanent", label: "Permanence", isNumeric: true }
    ],

    card: (row) => ({
        title: escapeText(row.name),
        meta: `<span>${row.isPermanent ? "Permanent" : "Can be lost"}</span>`,
        action: bookmarkControl(row),
        body: plainText(row.requirement),
        control: tickControl(row, "earned", { yesLabel: "Earned" })
    }),


    facets: [
        { key: "search", kind: "search", label: "Search", placeholder: "Title or requirement", matches: (row, value) => row.searchText.includes(value.trim().toLowerCase()) },
        buildStatusFacet({ doneWord: "Earned", hasInProgress: false }),
        {
            key: "permanence",
            kind: "select",
            label: "Permanence",
            allLabel: "Any",
            options: () => [
                { value: "permanent", label: "Permanent" },
                { value: "losable", label: "Losable" }
            ],
            matches: (row, value) => (value === "permanent") === row.isPermanent
        },
        { key: "bookmarkedOnly", kind: "check", label: "Bookmarked", matches: (row) => row.bookmark }
    ],

    tabMeta(rows) {
        return `${formatNumber(rows.filter((row) => row.earned).length)} / ${formatNumber(rows.length)}`;
    },

    totals(rows) {
        const earned = rows.filter((row) => row.earned).length;
        const percent = rows.length > 0 ? (earned / rows.length) * 100 : 0;

        return {
            answer: {
                label: "Titles Earned",
                value: formatNumber(earned),
                note: `of ${formatNumber(rows.length)} in the game &mdash; ${percent.toFixed(1)}% earned.`
            },
            stats: [
                `${formatNumber(rows.filter((row) => row.known && !row.earned).length)} not earned`,
                `${formatNumber(rows.filter((row) => !row.known).length)} not recorded yet`,
                `Permanent ${formatNumber(rows.filter((row) => row.earned && row.isPermanent).length)} of ${formatNumber(rows.filter((row) => row.isPermanent).length)}`
            ]
        };
    },

    transfer: {
        fileStem: "title-progress",
        csvColumns: ["Name", "Permanent", "Earned", "Bookmark"],
        requiredColumns: ["Name", "Earned"],
        writeRow: (row) => [row.name, row.isPermanent ? "Yes" : "No", row.earned ? "Yes" : "No", row.bookmark ? "Yes" : "No"],
        readRow: (cell) => {
            const isYes = (value) => /^(yes|true|1|y)$/i.test(String(value ?? "").trim());

            return { earned: isYes(cell("Earned")), bookmark: isYes(cell("Bookmark")) };
        }
    }
};
