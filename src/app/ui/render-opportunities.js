import { formatCharmsPerHour, formatNumber, formatTime } from "../utils/formatters.js";
import {
    buildAnswer,
    buildEmptyState,
    buildLinkButton,
    buildRow,
    buildRowList,
    buildStatLine,
    escapeAttribute
} from "./render-blocks.js";

/**
 * Four readings of the same question — what is worth doing next — ordered by how
 * actionable each one is. Every block reuses the shared row-list primitive, so
 * this view introduces no new idiom.
 */

function buildSection(title, copy, body, count, shown) {
    return `
        <section class="results-section" aria-labelledby="${title.replace(/\s/g, "")}Title">
            <h3 class="subsection-title" id="${title.replace(/\s/g, "")}Title">${title}</h3>
            <p class="section-copy">${copy}</p>
            ${body}
            ${count > shown ? `<p class="helper-text">Showing the top ${formatNumber(shown)} of ${formatNumber(count)}.</p>` : ""}
        </section>
    `;
}

function buildCreatureAction(name) {
    return `
        <button class="opportunity-creature" type="button" data-opportunity-creature="${escapeAttribute(name)}">
            <span>${escapeAttribute(name)}</span>
            <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
        </button>
    `;
}

function buildFinishable(analysis) {
    if (!analysis.finishableCount) {
        return buildSection(
            "Finishable Now",
            "Creatures you have a measured kill rate for and have not finished yet.",
            buildEmptyState(
                analysis.totals.sessionCount
                    ? "Nothing left to finish in your stored sessions."
                    : "No sessions stored yet.",
                analysis.totals.sessionCount
                    ? "Every creature your sessions measured is already unlocked, so the opportunities below are the ones worth planning for."
                    : "Paste a Hunt Analyzer under Sessions and its kill rates will project completion times here.",
                analysis.totals.sessionCount
                    ? ""
                    : '<button class="btn btn-secondary" type="button" data-empty-open-session>Open current session</button>'
            ),
            0,
            0
        );
    }

    const head = buildRow([
        '<span class="row-name is-verbatim">Creature</span>',
        '<span class="row-num">Kills Left</span>',
        '<span class="row-num">Time</span>',
        '<span class="row-charm">Charm Rate</span>'
    ], "is-head");
    const rows = analysis.finishable.map((entry) => buildRow([
        `<span class="row-name is-verbatim">${buildCreatureAction(entry.name)}${buildLinkButton(escapeAttribute(entry.sessionLabel), "data-opportunity-session", entry.sessionId, "is-pill")}</span>`,
        `<span class="row-num">${formatNumber(entry.killsLeft)}</span>`,
        `<span class="row-num">${formatTime(entry.timeRemainingMinutes)}</span>`,
        `<span class="row-charm">${formatCharmsPerHour(entry.charmsPerHour)}</span>`
    ]));

    return buildSection(
        "Finishable Now",
        "Creatures you have a measured kill rate for, ranked by what finishing them pays per hour. The tag names the session that measured the fastest rate.",
        buildRowList([head, ...rows], 4),
        analysis.finishableCount,
        analysis.finishable.length
    );
}

function buildQuickWins(analysis) {
    if (!analysis.quickWinCount) {
        return "";
    }

    const head = buildRow([
        '<span class="row-name is-verbatim">Creature</span>',
        '<span class="row-num">Kills Left</span>',
        '<span class="row-charm">Charm Points</span>'
    ], "is-head");
    const rows = analysis.quickWins.map((entry) => buildRow([
        `<span class="row-name is-verbatim">${buildCreatureAction(entry.name)}</span>`,
        `<span class="row-num">${formatNumber(entry.killsLeft)} of ${formatNumber(entry.unlockTarget)}</span>`,
        `<span class="row-charm">+${formatNumber(entry.charms)}</span>`
    ]));

    return buildSection(
        "Quick Wins",
        "Entries you have already started that are closest to unlocking, whether or not a stored session covers them.",
        buildRowList([head, ...rows], 3),
        analysis.quickWinCount,
        analysis.quickWins.length
    );
}

function buildLocations(analysis) {
    if (!analysis.locationCount) {
        return "";
    }

    const head = buildRow([
        '<span class="row-name is-verbatim">Location</span>',
        '<span class="row-num">Creatures</span>',
        '<span class="row-num">Started</span>',
        '<span class="row-charm">Unclaimed</span>'
    ], "is-head");
    const rows = analysis.locations.map((entry) => buildRow([
        `<span class="row-name is-verbatim">${escapeAttribute(entry.location)}</span>`,
        `<span class="row-num">${formatNumber(entry.creatures)}</span>`,
        `<span class="row-num">${formatNumber(entry.started)}</span>`,
        `<span class="row-charm">${formatNumber(entry.charms)}</span>`
    ]));

    return buildSection(
        "Where To Go",
        "Locations ranked by the charm points still unclaimed in them. A creature counts toward every location it appears in, since you could hunt it in any of them.",
        buildRowList([head, ...rows], 4),
        analysis.locationCount,
        analysis.locations.length
    );
}

function buildBlindSpots(analysis) {
    if (!analysis.blindSpotCount) {
        return "";
    }

    const head = buildRow([
        '<span class="row-name is-verbatim">Creature</span>',
        '<span class="row-num">Kills Left</span>',
        '<span class="row-charm">Charm Points</span>'
    ], "is-head");
    const rows = analysis.blindSpots.map((entry) => buildRow([
        `<span class="row-name is-verbatim">${buildCreatureAction(entry.name)}</span>`,
        `<span class="row-num">${formatNumber(entry.killsLeft)}</span>`,
        `<span class="row-charm">+${formatNumber(entry.charms)}</span>`
    ]));

    return buildSection(
        "Started And Dropped",
        "Entries with progress that no stored session features, so nothing is currently measuring them. Paste a Hunt Analyzer covering one and it moves into Finishable Now.",
        buildRowList([head, ...rows], 3),
        analysis.blindSpotCount,
        analysis.blindSpots.length
    );
}

export function renderOpportunities(container, analysis) {
    const { totals } = analysis;
    const percent = totals.charmsTotal > 0 ? (totals.charmsUnclaimed / totals.charmsTotal) * 100 : 0;

    container.className = "results-shell";
    container.innerHTML = `
        ${buildAnswer(
            "Charm Points Unclaimed",
            formatNumber(totals.charmsUnclaimed),
            `of ${formatNumber(totals.charmsTotal)} in the game &mdash; ${percent.toFixed(0)}% still on the table.`
        )}
        ${buildStatLine([
            `${formatNumber(totals.charmsNeverHunted)} in ${formatNumber(totals.neverHunted)} creatures never hunted`,
            `${formatNumber(totals.charmsInProgress)} in ${formatNumber(totals.inProgress)} started`,
            `${formatNumber(totals.measuredCreatures)} creatures measured by ${formatNumber(totals.sessionCount)} session${totals.sessionCount === 1 ? "" : "s"}`
        ])}

        ${buildFinishable(analysis)}
        ${buildQuickWins(analysis)}
        ${buildLocations(analysis)}
        ${buildBlindSpots(analysis)}
    `;
}
