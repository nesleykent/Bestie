import { loadMeasuringTibiaData } from "../services/measuring-tibia-repository.js";
import { formatNumber } from "../utils/formatters.js";
import { bookmarkControl, escapeText, tickControl } from "../ui/render-controls.js";
import { STATUS_LABELS, buildStatusFacet } from "./status.js";

/**
 * The Measuring Tibia tracker — the Cyclopedia Map discovery quest.
 *
 * Grouped-boolean progress: each of the 171 subareas is discovered or not, and an
 * area's completion is derived from its own subareas rather than recorded. That
 * derived completion is also the achievement condition, so this tracker feeds the
 * Achievements tracker instead of asking the user to tick the same fact twice.
 */

/** Areas keyed by name, with their subarea count and how many are discovered. */
function summarizeAreas(rows) {
    const areas = new Map();

    rows.forEach((row) => {
        const area = areas.get(row.area) ?? {
            area: row.area,
            achievement: row.areaAchievement,
            total: row.areaSubareaCount,
            discovered: 0
        };

        area.discovered += row.discovered ? 1 : 0;
        areas.set(row.area, area);
    });

    return [...areas.values()].map((area) => ({ ...area, isComplete: area.discovered >= area.total }));
}

export function deriveMeasuringTibiaRow(item, entry) {
    return {
        key: item.Name,
        name: item.Name,
        area: item.area,
        unit: item.area,
        areaAchievement: item.areaAchievement,
        areaSubareaCount: item.areaSubareaCount,
        creatureCount: item.creatureCount,
        discovered: entry.discovered,
        status: entry.discovered ? "done" : "notStarted",
        bookmark: entry.bookmark,
        searchText: `${item.Name} ${item.area}`.toLowerCase()
    };
}

export const measuringTibiaTracker = {
    id: "measuringTibia",
    label: "Measuring Tibia",
    tableTitle: "Cyclopedia Map",
    resultsTitle: "Measuring Tibia",
    resultsCopy: "The Cyclopedia Map discovery quest. Tick each subarea you have fully discovered; completing every subarea of an area earns that area's achievement, which is filled in for you under Achievements.",
    progress: "grouped-boolean",
    entryDefaults: { discovered: false, bookmark: false, reviewed: false },
    tickField: "discovered",
    loadItems: (loaded) => loadMeasuringTibiaData(loaded.bestiary ?? []),
    itemKey: (item) => item.Name,
    derive: deriveMeasuringTibiaRow,
    defaultSortKey: "area",


    /** Completing an area satisfies its achievement in the Achievements tracker. */
    derivesFor: "achievements",
    deriveExternalDone: (rows) => summarizeAreas(rows)
        .filter((area) => area.isComplete)
        .map((area) => area.achievement),

    sortOptions: [
        { key: "area", label: "Area" },
        { key: "name", label: "Subarea" },
        { key: "creatureCount", label: "Bestiary creatures", isNumeric: true, descending: true }
    ],

    card: (row) => ({
        title: escapeText(row.name),
        meta: `
            <span>${escapeText(row.area)}</span>
            ${row.creatureCount === null ? "" : `<span><strong>${formatNumber(row.creatureCount)}</strong> creatures</span>`}
        `,
        action: bookmarkControl(row),
        control: tickControl(row, "discovered", { yesLabel: "Discovered" })
    }),


    facets: [
        {
            key: "search",
            kind: "search",
            label: "Search",
            placeholder: "Area or subarea",
            matches: (row, value) => row.searchText.includes(value.trim().toLowerCase())
        },
        {
            key: "area",
            kind: "select",
            label: "Area",
            allLabel: "All areas",
            options: (items) => [...new Set(items.map((item) => item.area))].sort().map((area) => ({ value: area, label: area })),
            matches: (row, value) => row.area === value
        },
        buildStatusFacet({ doneWord: "Discovered", hasInProgress: false }),
        { key: "bookmarkedOnly", kind: "check", label: "Bookmarked", matches: (row) => row.bookmark }
    ],

    tabMeta(rows) {
        const areas = summarizeAreas(rows);

        return `${formatNumber(areas.filter((area) => area.isComplete).length)} / ${formatNumber(areas.length)} areas`;
    },

    /**
     * Areas complete is the headline, because that is what the quest rewards —
     * subareas are the work, areas are the payoff.
     */
    totals(rows) {
        const areas = summarizeAreas(rows);
        const complete = areas.filter((area) => area.isComplete).length;
        const discovered = rows.filter((row) => row.discovered).length;
        const percent = areas.length > 0 ? (complete / areas.length) * 100 : 0;

        return {
            answer: {
                label: "Areas Complete",
                value: `${formatNumber(complete)}`,
                note: `of ${formatNumber(areas.length)} areas &mdash; ${percent.toFixed(0)}% of the map. The Discoverer Outfit needs all of them.`
            },
            stats: [
                `${formatNumber(discovered)} of ${formatNumber(rows.length)} subareas discovered`,
                `${formatNumber(rows.filter((row) => row.known && !row.discovered).length)} not discovered`,
                `${formatNumber(rows.filter((row) => !row.known).length)} not recorded yet`,
                `${formatNumber(complete)} area achievement${complete === 1 ? "" : "s"} earned`
            ]
        };
    },

    transfer: {
        fileStem: "cyclopedia-map-progress",
        csvColumns: ["Area", "Subarea", "Bestiary Creatures", "Discovered", "Bookmark"],
        requiredColumns: ["Subarea", "Discovered"],
        // The generic importer matches on a Name column; Subarea is that column
        // here, so it is written under both headings.
        nameColumn: "Subarea",
        writeRow: (row) => [
            row.area,
            row.name,
            row.creatureCount === null ? "" : row.creatureCount,
            row.discovered ? "Yes" : "No",
            row.bookmark ? "Yes" : "No"
        ],
        readRow: (cell) => {
            const isYes = (value) => /^(yes|true|1|y)$/i.test(String(value ?? "").trim());

            return { discovered: isYes(cell("Discovered")), bookmark: isYes(cell("Bookmark")) };
        }
    }
};
