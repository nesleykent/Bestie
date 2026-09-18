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
                    ? "No confirmed unfinished entry has a measured rate in this mode."
                    : "No sessions stored yet.",
                analysis.totals.sessionCount
                    ? "Check unrecorded progress below, or process a session in the selected respawn mode."
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
        `<span class="row-name is-verbatim">${buildCreatureAction(entry.name)}${buildLinkButton(entry.sessionLabel, "data-opportunity-session", entry.sessionId, "is-pill")}</span>`,
        `<span class="row-num">${entry.isProgressFloor ? "up to " : ""}${formatNumber(entry.killsLeft)}</span>`,
        `<span class="row-num">${entry.isProgressFloor ? "up to " : ""}${formatTime(entry.timeRemainingMinutes)}</span>`,
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
        `<span class="row-num">${entry.isProgressFloor ? "up to " : ""}${formatNumber(entry.killsLeft)} of ${formatNumber(entry.unlockTarget)}</span>`,
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
        `<span class="row-num">${entry.isProgressFloor ? "up to " : ""}${formatNumber(entry.killsLeft)}</span>`,
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

export function renderOpportunities(container, analysis, respawnMode = "regular") {
    const { totals } = analysis;
    const percent = totals.charmsTotal > 0 ? (totals.charmsUnclaimed / totals.charmsTotal) * 100 : 0;

    container.className = "results-shell";
    container.innerHTML = `
        <label class="tool-field" for="opportunityMode"><span class="input-label">Measured respawn mode</span><select id="opportunityMode"><option value="regular" ${respawnMode==="regular"?"selected":""}>Regular</option><option value="rapid" ${respawnMode==="rapid"?"selected":""}>Rapid</option></select></label>
        ${buildAnswer(
            "Potential Charm Points Remaining",
            formatNumber(totals.charmsUnclaimed),
            `of ${formatNumber(totals.charmsTotal)} in the game &mdash; ${percent.toFixed(0)}% potentially remaining; includes unrecorded progress.`
        )}
        ${buildStatLine([
            `${formatNumber(totals.unknownProgress)} entries not recorded`,
            `${formatNumber(totals.charmsNeverHunted)} in ${formatNumber(totals.neverHunted)} creatures never hunted`,
            `${formatNumber(totals.charmsInProgress)} in ${formatNumber(totals.inProgress)} started`,
            `${formatNumber(totals.measuredCreatures)} creatures measured by ${formatNumber(totals.sessionCount)} session${totals.sessionCount === 1 ? "" : "s"}`
        ])}

        <div class="opportunity-columns">
            <div>${buildFinishable(analysis)}${buildQuickWins(analysis)}${buildBlindSpots(analysis)}</div>
            <div>${buildLocations(analysis)}${buildSection("Progress Not Recorded","Verify these entries in Bestiary. Their rewards may already be claimed.",buildRowList(analysis.unknownProgress.map(entry=>buildRow([buildCreatureAction(entry.name),`<span class="row-charm">${formatNumber(entry.charms)} possible points</span>`])),2),analysis.unknownProgressCount,analysis.unknownProgress.length)}</div>
        </div>
    `;
}
