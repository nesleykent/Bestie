import { loadBestiaryData } from "../services/bestiary-repository.js";
import { formatNumber } from "../utils/formatters.js";
import { escapeAttribute } from "../ui/render-blocks.js";
import { bookmarkControl, chipControl, escapeText, stageControl } from "../ui/render-controls.js";
import { STATUS_LABELS } from "./status.js";

/**
 * The Bestiary tracker.
 *
 * The client does not show a kill count in the class list — it shows one tile per
 * creature reading `?`, `0/3`, `1/3`, `2/3` or a tick, fifteen tiles to a page. So
 * the tile is the primary input and the exact count is the optional one, rather
 * than the other way round.
 *
 * An entry therefore holds whichever fact the player has:
 *
 *   kills > 0   an exact count, typed from a creature's own entry or the client's
 *               Bestiary Tracker widget. Always wins.
 *   stage > 0   the tile they were looking at, stored as the floor it implies.
 *   neither     not recorded yet, and reported as unknown.
 *
 * `effectiveKills` is what the rest of the app reads, so every existing formula
 * keeps working on a number without knowing where it came from. Where that number
 * is a floor rather than a count, `isFloor` says so and the UI qualifies it.
 *
 * Charm points and Echo Warden points remain two separate pools, reported
 * separately, never folded together.
 */

/**
 * Tile states, in the client's own order. Zero means the player has not told us,
 * which is what keeps an untouched entry equal to its defaults and therefore
 * absent from storage.
 */
export const STAGE_UNSET = 0;
export const STAGE_NEVER_KILLED = 1;
export const STAGE_OPENED = 2;
export const STAGE_ONE = 3;
export const STAGE_TWO = 4;
export const STAGE_COMPLETE = 5;

export const BESTIARY_STAGES = [
    { value: STAGE_NEVER_KILLED, label: "?", title: "Silhouette — never killed" },
    { value: STAGE_OPENED, label: "0/3", title: "Known, no stage unlocked" },
    { value: STAGE_ONE, label: "1/3", title: "First stage unlocked" },
    { value: STAGE_TWO, label: "2/3", title: "Second stage unlocked" },
    { value: STAGE_COMPLETE, label: "✓", title: "Complete" }
];

/**
 * The kill floor each tile implies. `0/3` means the entry is open, which takes at
 * least one kill, so it floors at 1 rather than 0 — otherwise it would be
 * indistinguishable from never having killed it.
 */
function stageFloor(stage, creature) {
    const firstStage = Number(creature["Stage 1"]) || 0;
    const secondStage = Number(creature["Stage 2"]) || 0;
    const unlockTarget = Number(creature["Kills to Unlock"]) || 0;

    if (stage === STAGE_COMPLETE) {
        return unlockTarget;
    }

    if (stage === STAGE_TWO) {
        return secondStage;
    }

    if (stage === STAGE_ONE) {
        return firstStage;
    }

    if (stage === STAGE_OPENED) {
        return 1;
    }

    return 0;
}

/** The most kills an entry at this tile can hide, for honest "at most" phrasing. */
function stageCeiling(stage, creature) {
    const firstStage = Number(creature["Stage 1"]) || 0;
    const secondStage = Number(creature["Stage 2"]) || 0;
    const unlockTarget = Number(creature["Kills to Unlock"]) || 0;

    if (stage === STAGE_OPENED) {
        return Math.max(0, firstStage - 1);
    }

    if (stage === STAGE_ONE) {
        return Math.max(0, secondStage - 1);
    }

    if (stage === STAGE_TWO) {
        return Math.max(0, unlockTarget - 1);
    }

    return unlockTarget;
}

export function deriveBestiaryRow(creature, entry) {
    const unlockTarget = Number(creature["Kills to Unlock"]) || 0;
    const firstStage = Number(creature["Stage 1"]) || 0;
    const secondStage = Number(creature["Stage 2"]) || 0;
    const charms = Number(creature.Charms) || 0;
    const typedKills = entry.kills;
    const stage = entry.stage;
    const hasTypedKills = typedKills > 0;
    // An exact count always wins over the tile it implies.
    const kills = hasTypedKills ? typedKills : stageFloor(stage, creature);
    const isFloor = !hasTypedKills && stage > STAGE_UNSET && stage !== STAGE_COMPLETE && stage !== STAGE_NEVER_KILLED;
    const isComplete = unlockTarget > 0 && kills >= unlockTarget;
    const answered = hasTypedKills || stage > STAGE_UNSET;
    const derivedStage = isComplete
        ? STAGE_COMPLETE
        : (kills >= secondStage && secondStage > 0
            ? STAGE_TWO
            : (kills >= firstStage && firstStage > 0 && kills > 0
                ? STAGE_ONE
                : (kills > 0 ? STAGE_OPENED : STAGE_NEVER_KILLED)));

    return {
        key: creature.Name,
        name: creature.Name,
        className: creature.Class,
        // The unit the player reads to record this row: the client's class page.
        unit: creature.Class,
        wikiLink: `https://tibia.fandom.com/wiki/${creature.Name.replace(/\s/g, "_")}`,
        kills,
        typedKills,
        hasTypedKills,
        // What the tile control shows: the stored tile, or the one the count implies.
        stage: answered ? derivedStage : STAGE_UNSET,
        storedStage: stage,
        isFloor,
        killsCeiling: stageCeiling(stage, creature),
        answered,
        unlockTarget,
        isComplete,
        status: isComplete ? "done" : (kills > 0 ? "inProgress" : "notStarted"),
        killsLeft: Math.max(0, unlockTarget - kills),
        killsLeftAtLeast: isFloor ? Math.max(0, unlockTarget - stageCeiling(stage, creature)) : 0,
        progress: unlockTarget > 0 ? Math.min(1, kills / unlockTarget) : 0,
        charms,
        charmsEarned: isComplete ? charms : 0,
        echoWardenEligible: creature.echoWarden.eligible,
        echoWardenPoints: creature.echoWarden.eligible ? creature.echoWarden.points : 0,
        echoWarden: entry.echoWarden && creature.echoWarden.eligible,
        animusMastery: entry.animusMastery,
        bookmark: entry.bookmark,
        searchText: creature.Name.toLowerCase()
    };
}

export const bestiaryTracker = {
    id: "bestiary",
    label: "Bestiary",
    tableTitle: "My Bestiary",
    resultsTitle: "Bestiary",
    resultsCopy: "Every creature in the game. Copy the tile Tibia shows you — ? · 0/3 · 1/3 · 2/3 · ✓ — or type an exact kill count when you have one. Charm points and thresholds come from the game data.",
    progress: "counter",
    entryDefaults: { kills: 0, stage: STAGE_UNSET, echoWarden: false, animusMastery: false, bookmark: false, reviewed: false },
    loadItems: loadBestiaryData,
    itemKey: (creature) => creature.Name,
    derive: deriveBestiaryRow,


    sortOptions: [
        { key: "name", label: "Name" },
        { key: "killsLeft", label: "Closest to done", isNumeric: true },
        { key: "charms", label: "Charm points", isNumeric: true },
        { key: "progress", label: "Progress", isNumeric: true, descending: true }
    ],

    card: (row) => ({
        title: `<a href="${escapeAttribute(row.wikiLink)}" target="_blank" rel="noreferrer">${escapeText(row.name)}</a>`,
        meta: `
            <span>${escapeText(row.className)}</span>
            <span><strong>${formatNumber(row.charms)}</strong> charm points</span>
        `,
        action: bookmarkControl(row),
        control: stageControl(row, "stage", BESTIARY_STAGES, { label: "Stage" }),
        status: row.known
            ? (row.isComplete
                ? "Complete"
                : `${row.isFloor ? "at most " : ""}${formatNumber(row.killsLeft)} kills left`)
            : "Not recorded yet",
        extras: `
            ${chipControl(row, "echoWarden", {
                label: `EW ${formatNumber(row.echoWardenPoints)}`,
                eligible: row.echoWardenEligible,
                title: "Echo Warden points claimed"
            })}
            ${chipControl(row, "animusMastery", { label: "Animus", title: "Animus Mastery" })}
        `
    }),


    facets: [
        { key: "search", kind: "search", label: "Search", placeholder: "Creature name", matches: (row, value) => row.searchText.includes(value.trim().toLowerCase()) },
        {
            key: "className",
            kind: "select",
            label: "Class",
            allLabel: "All classes",
            options: (items) => [...new Set(items.map((item) => item.Class).filter(Boolean))].sort().map((name) => ({ value: name, label: name })),
            matches: (row, value) => row.className === value
        },
        {
            key: "status",
            kind: "segmented",
            label: "Status",
            isStatus: true,
            options: () => [
                { value: "all", label: "All" },
                { value: "unknown", label: STATUS_LABELS.unknown },
                { value: "notStarted", label: STATUS_LABELS.notStarted },
                { value: "inProgress", label: STATUS_LABELS.inProgress },
                { value: "done", label: "Complete" }
            ],
            matches: (row, value) => (value === "unknown" ? !row.known : row.known && row.status === value)
        },
        { key: "bookmarkedOnly", kind: "check", label: "Bookmarked", matches: (row) => row.bookmark },
        { key: "echoWardenOnly", kind: "check", label: "Echo Warden eligible", matches: (row) => row.echoWardenEligible }
    ],

    /**
     * Charm points earned here are what the Charms tracker spends, so the total is
     * published rather than recomputed there. Echo Warden is a separate pool that
     * also buys charms, so both are included.
     */
    providesBudget: (rows) => ({
        earned: rows.reduce((sum, row) => sum + row.charmsEarned + (row.echoWarden ? row.echoWardenPoints : 0), 0),
        total: rows.reduce((sum, row) => sum + row.charms + row.echoWardenPoints, 0)
    }),

    /** Shown under the tracker's name in the tab strip. */
    tabMeta(rows) {
        const earned = rows.reduce((sum, row) => sum + row.charmsEarned, 0);
        const total = rows.reduce((sum, row) => sum + row.charms, 0);

        return `${formatNumber(earned)} / ${formatNumber(total)}`;
    },

    totals(rows) {
        const totals = rows.reduce((acc, row) => {
            acc.charmPointsTotal += row.charms;
            acc.charmPointsEarned += row.charmsEarned;
            acc.echoWardenTotal += row.echoWardenPoints;
            acc.echoWardenEarned += row.echoWarden ? row.echoWardenPoints : 0;
            acc.completed += row.isComplete ? 1 : 0;
            acc.inProgress += row.known && row.status === "inProgress" ? 1 : 0;
            acc.notStarted += row.known && row.status === "notStarted" ? 1 : 0;
            acc.unknown += row.known ? 0 : 1;
            return acc;
        }, {
            charmPointsTotal: 0,
            charmPointsEarned: 0,
            echoWardenTotal: 0,
            echoWardenEarned: 0,
            completed: 0,
            inProgress: 0,
            notStarted: 0,
            unknown: 0
        });

        return {
            answer: {
                label: "",
                value: `${formatNumber(totals.completed)} / ${formatNumber(rows.length)} complete`,
                note: "",
                progress: rows.length ? totals.completed / rows.length : 0
            },
            stats: [
                `${formatNumber(totals.charmPointsEarned)} charm points`,
                `${formatNumber(totals.inProgress)} in progress`,
                `${formatNumber(totals.notStarted)} not started`,
                `${formatNumber(totals.unknown)} not recorded yet`,
                `Echo Warden ${formatNumber(totals.echoWardenEarned)} of ${formatNumber(totals.echoWardenTotal)}`
            ]
        };
    },

    /**
     * Exported in the reference spreadsheet's column order so it opens in the
     * original sheet and imports straight back. The derived columns are written
     * for the reader and ignored on the way in.
     *
     * Echo Warden, Animus Mastery and Stage are appended after the original
     * columns: they are user-owned facts with nowhere to live in the reference
     * layout, and without them a round trip silently drops them. Appending keeps
     * older files importable, since columns are read by header name.
     */
    transfer: {
        fileStem: "bestiary-progress",
        csvColumns: ["Bookmark", "Name", "Charms", "Earned", "Killed", "Stage 1", "Stage 2", "Kills to Unlock", "Status", "Kills Left", "Progress (%)", "Echo Warden", "Animus Mastery", "Tile"],
        requiredColumns: ["Name"],
        writeRow: (row, creature) => [
            row.bookmark ? "Yes" : "No",
            row.name,
            row.charms,
            row.isComplete ? row.charms : "",
            row.hasTypedKills ? row.typedKills : "",
            creature["Stage 1"],
            creature["Stage 2"],
            row.unlockTarget,
            row.known ? STATUS_LABELS[row.status] : STATUS_LABELS.unknown,
            row.answered && !row.isComplete ? row.killsLeft : "",
            row.answered ? `${Math.round(row.progress * 100)}%` : "",
            row.echoWardenEligible ? (row.echoWarden ? "Yes" : "No") : "",
            row.animusMastery ? "Yes" : "No",
            BESTIARY_STAGES.find((stage) => stage.value === row.storedStage)?.label ?? ""
        ],
        writeTotals: (rows) => [
            "Total",
            rows.length,
            rows.reduce((sum, row) => sum + row.charms, 0),
            rows.reduce((sum, row) => sum + row.charmsEarned, 0),
            "", "", "", "",
            `${(() => {
                const all = rows.reduce((sum, row) => sum + row.charms, 0);
                const got = rows.reduce((sum, row) => sum + row.charmsEarned, 0);
                return all > 0 ? ((got / all) * 100).toFixed(2) : "0.00";
            })()}%`,
            "", "", "", "", ""
        ],
        readRow: (cell) => {
            const isYes = (value) => /^(yes|true|1|y)$/i.test(String(value ?? "").trim());
            const tile = String(cell("Tile") ?? "").trim();
            const stage = BESTIARY_STAGES.find((candidate) => candidate.label === tile);

            return {
                kills: cell("Killed"),
                stage: stage ? stage.value : STAGE_UNSET,
                bookmark: isYes(cell("Bookmark")),
                echoWarden: isYes(cell("Echo Warden")),
                animusMastery: isYes(cell("Animus Mastery"))
            };
        },
        // A TibiaDraptor bestiary export carries its own user_data block.
        readJsonRow: (item) => ({
            kills: item?.user_data?.kills,
            stage: STAGE_UNSET,
            echoWarden: Boolean(item?.user_data?.echo_warden),
            animusMastery: Boolean(item?.user_data?.animus_mastery)
        })
    }
};
