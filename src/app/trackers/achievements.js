import {
    loadAchievementsData,
    RARITY_LABELS,
    RARITY_ORDER
} from "../services/achievements-repository.js";
import { formatNumber } from "../utils/formatters.js";
import { bookmarkControl, escapeText, plainText, tickControl } from "../ui/render-controls.js";
import { STATUS_LABELS, buildStatusFacet } from "./status.js";

/**
 * The Achievements tracker: boolean progress, because an achievement is earned or
 * it is not — there is no partial state to count.
 *
 * Every string that reaches the table comes from a third-party dataset and ten of
 * the spoilers contain real HTML anchors, so all of it goes through escapeText.
 */

export function deriveAchievementRow(achievement, entry, context = {}) {
    // Some achievements are a consequence of another tracker — completing a
    // Cyclopedia Map area earns its achievement. Those are shown as earned and
    // are not editable here, so the same fact is never recorded twice.
    const isDerived = Boolean(context.externalDone?.has(achievement.Name)) && !entry.done;
    const done = entry.done || isDerived;

    return {
        isDerived,
        key: achievement.Name,
        name: achievement.Name,
        unit: achievement.category,
        points: achievement.points,
        grade: achievement.grade,
        category: achievement.category,
        categoryLabel: achievement.categoryLabel,
        isSecret: achievement.isSecret,
        spoiler: achievement.spoiler,
        rarity: achievement.rarity,
        rarityLabel: RARITY_LABELS[achievement.rarity] ?? "",
        rarityRank: RARITY_ORDER.indexOf(achievement.rarity),
        rarityPercent: achievement.rarityPercent,
        isObtainable: achievement.isObtainable,
        done,
        status: done ? "done" : "notStarted",
        pointsEarned: done ? achievement.points : 0,
        bookmark: entry.bookmark,
        searchText: `${achievement.Name} ${achievement.spoiler.replace(/<[^>]*>/g, " ")}`.toLowerCase()
    };
}

export const achievementsTracker = {
    id: "achievements",
    label: "Achievements",
    tableTitle: "My Achievements",
    resultsTitle: "Achievement Progress",
    resultsCopy: "Every achievement in the game, with what it takes to earn it. Tick the ones you already have; points and rarity come from the game data.",
    progress: "boolean",
    entryDefaults: { done: false, bookmark: false, reviewed: false },
    // Cyclopedia Map area completion satisfies 20 of these.
    consumesDerived: true,
    // The one field a bulk action may write. Echo Warden-style flags must never be
    // swept in bulk, which is why this is declared rather than inferred.
    tickField: "done",
    loadItems: loadAchievementsData,
    itemKey: (achievement) => achievement.Name,
    derive: deriveAchievementRow,
    defaultSortKey: "name",


    sortOptions: [
        { key: "name", label: "Name" },
        { key: "points", label: "Points", isNumeric: true, descending: true },
        { key: "rarityRank", label: "Rarity", isNumeric: true },
        { key: "grade", label: "Grade", isNumeric: true }
    ],

    card: (row) => ({
        title: `${escapeText(row.name)}${row.isSecret ? ' <span class="pill">Secret</span>' : ""}`,
        meta: `
            <span>${escapeText(row.categoryLabel)}</span>
            <span><strong>${formatNumber(row.points)}</strong> points</span>
            ${row.rarityLabel ? `<span>${escapeText(row.rarityLabel)}</span>` : ""}
            <span class="achievement-grade" title="Grade ${row.grade}" aria-label="Grade ${row.grade}">Grade ${"\u2605".repeat(row.grade)}</span>
        `,
        body: plainText(row.spoiler),
        control: tickControl(row, "done", {
            yesLabel: "Earned",
            locked: row.isDerived,
            title: row.isDerived ? "Earned by completing this area in Measuring Tibia" : ""
        }),
        status: row.isObtainable ? "" : "No longer obtainable",
        action: bookmarkControl(row)
    }),


    facets: [
        {
            key: "search",
            kind: "search",
            label: "Search",
            placeholder: "Name or how to earn it",
            matches: (row, value) => row.searchText.includes(value.trim().toLowerCase())
        },
        {
            key: "category",
            kind: "select",
            label: "Category",
            allLabel: "All categories",
            options: (items) => [...new Map(items.map((item) => [item.category, item.categoryLabel])).entries()]
                .sort((left, right) => left[1].localeCompare(right[1]))
                .map(([value, label]) => ({ value, label })),
            matches: (row, value) => row.category === value
        },
        buildStatusFacet({ doneWord: "Earned", hasInProgress: false }),
        {
            key: "rarity",
            kind: "select",
            label: "Rarity",
            allLabel: "Any rarity",
            options: () => RARITY_ORDER.map((value) => ({ value, label: RARITY_LABELS[value] })),
            matches: (row, value) => row.rarity === value
        },
        {
            key: "grade",
            kind: "select",
            label: "Grade",
            allLabel: "Any grade",
            options: (items) => [...new Set(items.map((item) => item.grade))].sort()
                .map((grade) => ({ value: String(grade), label: "★".repeat(grade) })),
            matches: (row, value) => String(row.grade) === String(value)
        },
        { key: "secretOnly", kind: "check", label: "Secret", matches: (row) => row.isSecret },
        { key: "bookmarkedOnly", kind: "check", label: "Bookmarked", matches: (row) => row.bookmark }
    ],

    tabMeta(rows) {
        const obtainable = rows.filter((row) => row.isObtainable);
        const earned = obtainable.reduce((sum, row) => sum + row.pointsEarned, 0);
        const total = obtainable.reduce((sum, row) => sum + row.points, 0);

        return `${formatNumber(earned)} / ${formatNumber(total)}`;
    },

    /**
     * Two headline readings, the way TibiaDraptor reports them: points and the
     * count unlocked. Removed achievements cannot be earned, so they are excluded
     * from both while staying visible under the Removed category filter.
     */
    totals(rows) {
        const obtainable = rows.filter((row) => row.isObtainable);
        const earnedPoints = obtainable.reduce((sum, row) => sum + row.pointsEarned, 0);
        const totalPoints = obtainable.reduce((sum, row) => sum + row.points, 0);
        const earnedCount = obtainable.filter((row) => row.done).length;
        const percent = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
        const secretEarned = obtainable.filter((row) => row.done && row.isSecret).length;
        const secretTotal = obtainable.filter((row) => row.isSecret).length;

        return {
            answer: {
                label: "Achievement Points",
                value: formatNumber(earnedPoints),
                note: `of ${formatNumber(totalPoints)} obtainable &mdash; ${percent.toFixed(1)}% earned.`
            },
            stats: [
                `${formatNumber(earnedCount)} of ${formatNumber(obtainable.length)} unlocked`,
                `${formatNumber(obtainable.filter((row) => row.known && !row.done).length)} not earned`,
                `${formatNumber(obtainable.filter((row) => !row.known).length)} not recorded yet`,
                `Secret ${formatNumber(secretEarned)} of ${formatNumber(secretTotal)}`
            ]
        };
    },

    transfer: {
        fileStem: "achievement-progress",
        csvColumns: ["Name", "Points", "Grade", "Category", "Secret", "Rarity", "Earned", "Bookmark"],
        requiredColumns: ["Name", "Earned"],
        writeRow: (row) => [
            row.name,
            row.points,
            row.grade,
            row.categoryLabel,
            row.isSecret ? "Yes" : "No",
            row.rarityLabel,
            row.done ? "Yes" : "No",
            row.bookmark ? "Yes" : "No"
        ],
        readRow: (cell) => {
            const isYes = (value) => /^(yes|true|1|y)$/i.test(String(value ?? "").trim());

            return { done: isYes(cell("Earned")), bookmark: isYes(cell("Bookmark")) };
        }
    }
};
