import { formatNumber, formatTime } from "../utils/formatters.js";
import {
    buildAnswer,
    buildLinkButton,
    buildPill,
    buildRow,
    buildRowList,
    buildStatLine,
    escapeAttribute
} from "./render-blocks.js";

const ANSWER_LABEL = "Charm Points Obtainable";

function buildEntryRows(plan) {
    const head = buildRow([
        '<span class="row-name">Creature</span>',
        '<span class="row-num">Time to Complete</span>',
        '<span class="row-charm">Charm Points</span>'
    ], "is-head");
    const rows = plan.entries.map((entry) => buildRow([
        `<span class="row-name">${entry.name}${buildLinkButton(entry.huntLabel, "data-plan-hunt", entry.huntId, "is-pill")}</span>`,
        `<span class="row-num">${formatTime(entry.timeRemainingMinutes)}</span>`,
        `<span class="row-charm">+${formatNumber(entry.charms)}</span>`
    ]));

    return buildRowList([head, ...rows], 3);
}

function buildRouteStep(step) {
    const head = buildRow([
        `<span class="row-order">${formatNumber(step.order)}</span>`,
        `<span class="row-name">${buildLinkButton(step.huntLabel, "data-plan-hunt", step.huntId)}</span>`,
        `<span class="row-num">${formatTime(step.minutes)}</span>`,
        `<span class="row-charm">+${formatNumber(step.charms)}</span>`,
        `<span class="row-num">${formatNumber(step.cumulativeCharms)} total</span>`
    ], "is-head");
    const entries = step.entries.map((entry) => buildRow([
        `<span class="row-name">${entry.name}</span>`,
        `<span class="row-num">${formatTime(entry.timeRemainingMinutes)}</span>`,
        `<span class="row-charm">+${formatNumber(entry.charms)}</span>`
    ], "is-sub"));

    return `<li class="route-step">${buildRowList([head], 5)}${buildRowList(entries, 3)}</li>`;
}

function buildRoute(plan) {
    if (!plan.route.length) {
        return "";
    }

    return `
        <section class="results-section" aria-labelledby="planRouteTitle">
            <h3 class="subsection-title" id="planRouteTitle">Recommended Route</h3>
            <p class="section-copy">
                Time on a session advances all of its selected entries at once and that progress is kept, so each
                session needs one visit. Steps are ordered to bank charm points as early as possible.
            </p>
            <ol class="route" role="list">${plan.route.map(buildRouteStep).join("")}</ol>
        </section>
    `;
}

export function buildCharmPlanResultMarkup(planView) {
    if (!planView.hasAnalyzedHunts) {
        return `
            ${buildAnswer(ANSWER_LABEL, "&mdash;", "Process a Hunt Analyzer first.")}
            <div class="answer-actions">
                <button class="btn btn-secondary" type="button" data-empty-open-session>Open current session</button>
            </div>
        `;
    }

    if (!planView.hasModeMatchedHunts) {
        return buildAnswer(ANSWER_LABEL, "&mdash;",
            `No ${planView.planRespawnModeLabel} sessions. Switch the plan mode below, or set a session's recorded mode in its own tab.`);
    }

    if (!planView.hasEligibleHunts) {
        return buildAnswer(ANSWER_LABEL, "&mdash;",
            `Every ${planView.planRespawnModeLabel} session is ignored. Enable one below.`);
    }

    if (!planView.plan) {
        return buildAnswer(ANSWER_LABEL, "&mdash;", "Enter the time you have available below.");
    }

    const plan = planView.plan;

    return `
        ${buildAnswer(ANSWER_LABEL, formatNumber(plan.charms), plan.entries.length
            ? ""
            : "No entry can be completed in this time. Your progress still matters, but it will not award charm points until an entry is complete.")}
        ${buildStatLine([
            `of ${formatTime(plan.availableMinutes)} available`,
            `${formatTime(plan.timeUsedMinutes)} used`,
            `${formatTime(plan.unusedMinutes)} unused`,
            `${formatNumber(plan.completedCount)} Bestiary entries completed`
        ])}

        ${plan.entries.length ? `
            <section class="results-section" aria-label="Bestiary entries you can finish">
                ${buildEntryRows(plan)}
            </section>
        ` : ""}

        ${buildRoute(plan)}
    `;
}

function buildConsideredSessions(planView) {
    if (!planView.consideredSessions.length) {
        return "";
    }

    const rows = planView.consideredSessions.map((session) => {
        const isEligible = session.isAvailable && session.matchesPlanMode;
        const status = !session.matchesPlanMode
            ? "Wrong respawn mode"
            : (session.isAvailable ? "Available" : "Spawn unavailable");

        return buildRow([
            `<span class="row-name">${session.label}</span>`,
            buildPill(session.respawnModeLabel),
            `<span class="row-num">${status}</span>`,
            `<button class="row-action" type="button" data-plan-availability="${escapeAttribute(session.id)}" aria-pressed="${session.isAvailable ? "true" : "false"}">${session.isAvailable ? "Ignore" : "Enable"}</button>`
        ], isEligible ? "is-on" : "");
    });

    return `
        <div class="plan-sessions-block">
            <span class="input-label" id="planSessionsLabel">Sessions Considered</span>
            ${buildRowList(rows, 4)}
            <p class="helper-text">Ignoring a session affects Charm Points Plan only.</p>
        </div>
    `;
}

export function renderCharmPlan(container, planView) {
    const modes = [
        { key: "regular", label: "Regular" },
        { key: "rapid", label: "Rapid Respawn" }
    ];

    container.className = "results-shell";
    container.innerHTML = `
        <div id="charmPlanResult">${buildCharmPlanResultMarkup(planView)}</div>

        <div class="plan-controls">
            <div>
                <label class="input-label" for="playTimeInput">Play Time Available</label>
                <input
                    id="playTimeInput"
                    class="plan-time-input"
                    type="text"
                    inputmode="text"
                    autocomplete="off"
                    spellcheck="false"
                    value="${escapeAttribute(planView.playTimeValue)}"
                    placeholder="Example: 2h 30min"
                >
                <p class="helper-text">Accepts 90 min, 1.5 h, 2h 30min, or 2:30. A plain number counts as hours.</p>
            </div>

            <div>
                <span class="input-label" id="planRespawnModeLabel">Plan For Respawn Mode</span>
                <div class="segmented" role="group" aria-labelledby="planRespawnModeLabel">
                    ${modes.map((mode) => `
                        <button
                            class="segmented-button${planView.planRespawnMode === mode.key ? " is-selected" : ""}"
                            type="button"
                            data-plan-respawn-mode="${mode.key}"
                            aria-pressed="${planView.planRespawnMode === mode.key ? "true" : "false"}"
                        >${mode.label}</button>
                    `).join("")}
                </div>
            </div>
        </div>

        ${buildConsideredSessions(planView)}
    `;
}
