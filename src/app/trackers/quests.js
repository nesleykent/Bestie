import { loadQuestsData } from "../services/quests-repository.js";
import { formatNumber } from "../utils/formatters.js";
import { bookmarkControl, escapeText, plainText, tickControl } from "../ui/render-controls.js";
import { STATUS_LABELS, buildStatusFacet } from "./status.js";

/** Quests: boolean progress, grouped by the questlog entry they appear under. */

export function deriveQuestRow(quest, entry) {
    return {
        key: quest.Name,
        name: quest.Name,
        unit: quest.questlog || "Ungrouped",
        rewards: quest.rewards,
        questlog: quest.questlog,
        completed: entry.completed,
        status: entry.completed ? "done" : "notStarted",
        bookmark: entry.bookmark,
        searchText: `${quest.Name} ${quest.questlog} ${quest.rewards}`.toLowerCase()
    };
}

export const questsTracker = {
    id: "quests",
    label: "Quests",
    tableTitle: "My Quests",
    resultsTitle: "Quest Progress",
    resultsCopy: "Every quest in the game with what it rewards. Several quests can share one questlog entry, so the questlog is shown alongside.",
    progress: "boolean",
    entryDefaults: { completed: false, bookmark: false, reviewed: false },
    tickField: "completed",
    loadItems: loadQuestsData,
    itemKey: (quest) => quest.Name,
    derive: deriveQuestRow,
    defaultSortKey: "name",


    sortOptions: [
        { key: "name", label: "Name" },
        { key: "questlog", label: "Questlog" }
    ],

    card: (row) => ({
        title: escapeText(row.name),
        meta: row.questlog ? `<span>${escapeText(row.questlog)}</span>` : "",
        action: bookmarkControl(row),
        body: plainText(row.rewards),
        control: tickControl(row, "completed", { yesLabel: "Done" })
    }),


    facets: [
        { key: "search", kind: "search", label: "Search", placeholder: "Quest, questlog or reward", matches: (row, value) => row.searchText.includes(value.trim().toLowerCase()) },
        {
            key: "questlog",
            kind: "select",
            label: "Questlog",
            allLabel: "All questlogs",
            options: (items) => [...new Set(items.map((item) => item.questlog).filter(Boolean))].sort().map((name) => ({ value: name, label: name })),
            matches: (row, value) => row.questlog === value
        },
        buildStatusFacet({ doneWord: "Completed", hasInProgress: false }),
        { key: "bookmarkedOnly", kind: "check", label: "Bookmarked", matches: (row) => row.bookmark }
    ],

    tabMeta(rows) {
        return `${formatNumber(rows.filter((row) => row.completed).length)} / ${formatNumber(rows.length)}`;
    },

    totals(rows) {
        const done = rows.filter((row) => row.completed).length;
        const percent = rows.length > 0 ? (done / rows.length) * 100 : 0;
        const questlogs = new Set(rows.map((row) => row.questlog).filter(Boolean));
        const doneLogs = [...questlogs].filter((log) => rows
            .filter((row) => row.questlog === log)
            .every((row) => row.completed)).length;

        return {
            answer: {
                label: "Quests Completed",
                value: formatNumber(done),
                note: `of ${formatNumber(rows.length)} in the game &mdash; ${percent.toFixed(1)}% complete.`
            },
            stats: [
                `${formatNumber(rows.filter((row) => row.known && !row.completed).length)} not started`,
                `${formatNumber(rows.filter((row) => !row.known).length)} not recorded yet`,
                `${formatNumber(doneLogs)} of ${formatNumber(questlogs.size)} questlogs finished`
            ]
        };
    },

    transfer: {
        fileStem: "quest-progress",
        csvColumns: ["Name", "Questlog", "Completed", "Bookmark"],
        requiredColumns: ["Name", "Completed"],
        writeRow: (row) => [row.name, row.questlog, row.completed ? "Yes" : "No", row.bookmark ? "Yes" : "No"],
        readRow: (cell) => {
            const isYes = (value) => /^(yes|true|1|y)$/i.test(String(value ?? "").trim());

            return { completed: isYes(cell("Completed")), bookmark: isYes(cell("Bookmark")) };
        }
    }
};
