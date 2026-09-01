import { formatNumber, formatTaskRate, formatTimeDetailed } from "../utils/formatters.js";
import { buildAnswer, buildCreatureChip, buildStatLine } from "./render-blocks.js";

function buildTargetBlock(estimate, respawnModeLabel) {
    const hasTarget = estimate.taskTotalKills > 0;

    return `
        <div class="task-target-block">
            <label class="input-label" for="taskTotalKills">Task target</label>
            <input
                id="taskTotalKills"
                class="task-total-input"
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
                value="${hasTarget ? estimate.taskTotalKills : ""}"
                placeholder="Example: 500"
            >
            <p class="helper-text">
                Estimated from the kill rate this session recorded under ${respawnModeLabel}, so it is not comparable
                to a session recorded under different spawn conditions.
            </p>
        </div>
    `;
}

function buildEstimate(estimate, respawnModeLabel, sessionDuration) {
    if (!estimate.selectedMonster) {
        return buildAnswer("Time Remaining", "&mdash;", "Select a creature from this session.");
    }

    const creature = estimate.selectedMonster.displayName;

    if (!(estimate.taskTotalKills > 0)) {
        return `
            ${buildAnswer("Kill Rate", formatTaskRate(estimate.killRatePerHour),
                `${creature}, ${formatNumber(estimate.alreadyKilled)} killed this session. Enter a task target for the time remaining.`)}
            ${buildTargetBlock(estimate, respawnModeLabel)}
        `;
    }

    return `
        ${buildAnswer("Time Remaining", formatTimeDetailed(estimate.remainingTimeMinutes),
            `${formatNumber(estimate.remainingKills)} more ${creature} at ${formatTaskRate(estimate.killRatePerHour)}.`)}
        ${buildStatLine([
            `${formatNumber(estimate.alreadyKilled)} killed this session`,
            `${formatTimeDetailed(estimate.totalEstimatedTimeMinutes)} total`,
            `${formatTimeDetailed(sessionDuration)} session`,
            `${formatNumber(estimate.totalMonsterTypes)} creature types`,
            respawnModeLabel
        ])}
        ${buildTargetBlock(estimate, respawnModeLabel)}
    `;
}

export function renderTaskResults(container, monsters, estimate, sessionDuration, respawnModeLabel) {
    if (!monsters.length) {
        container.className = "empty-state";
        container.innerHTML = `
            <strong>No task candidates found.</strong>
            <span>The log was processed, but no killed creatures were detected in the session block.</span>
        `;
        return;
    }

    container.className = "results-shell";
    container.innerHTML = `
        ${buildEstimate(estimate, respawnModeLabel, sessionDuration)}

        <section class="results-section" aria-labelledby="taskSelectionTitle">
            <h3 class="subsection-title" id="taskSelectionTitle">Select Creature</h3>
            <div class="chip-grid" role="list">
                ${monsters.map((monster) => buildCreatureChip({
                    attribute: "data-task-monster",
                    value: monster.name,
                    isSelected: monster.name === estimate.selectedMonster?.name,
                    name: monster.displayName,
                    meta: `${formatNumber(monster.killsThisSession)}x`
                })).join("")}
            </div>
        </section>
    `;
}
