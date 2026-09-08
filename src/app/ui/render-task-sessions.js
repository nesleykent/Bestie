import { formatNumber, formatTaskRate, formatTimeDetailed } from "../utils/formatters.js";
import { buildEmptyState, buildLinkButton, buildPill } from "./render-blocks.js";

function buildRow(session) {
    const estimate = session.estimate;

    if (!estimate.selectedMonster) {
        return `
            <tr>
                <th scope="row">
                    ${buildLinkButton(session.label, "data-task-session", session.id)}
                    ${buildPill(session.respawnModeLabel)}
                </th>
                <td colspan="6">No creature selected yet.</td>
            </tr>
        `;
    }

    const hasTarget = estimate.taskTotalKills > 0;

    return `
        <tr>
            <th scope="row">
                ${buildLinkButton(session.label, "data-task-session", session.id)}
                ${buildPill(session.respawnModeLabel)}
            </th>
            <td class="task-session-creature" data-label="Creature">${estimate.selectedMonster.displayName}</td>
            <td data-label="Session kills">${formatNumber(estimate.alreadyKilled)}</td>
            <td data-label="Kill rate">${formatTaskRate(estimate.killRatePerHour)}</td>
            <td data-label="Task target">${hasTarget ? formatNumber(estimate.taskTotalKills) : "&mdash;"}</td>
            <td data-label="Kills remaining">${hasTarget ? formatNumber(estimate.remainingKills) : "&mdash;"}</td>
            <td data-label="Time remaining">${hasTarget ? formatTimeDetailed(estimate.remainingTimeMinutes) : "&mdash;"}</td>
        </tr>
    `;
}

export function renderTaskSessions(container, sessions) {
    if (!sessions.length) {
        container.className = "results-shell";
        container.innerHTML = buildEmptyState(
            "No processed sessions.",
            "Process a Hunt Analyzer in a session, then pick the creature your task asks for.",
            '<button class="btn btn-secondary" type="button" data-empty-open-session>Open current session</button>'
        );
        return;
    }

    container.className = "results-shell";
    container.innerHTML = `
        <section class="results-section">
            <p class="results-intro">Select a session to change its creature or task target.</p>

            <div class="table-container task-sessions-table record-table" tabindex="0" role="region" aria-label="Task session estimates">
                <table>
                    <thead>
                        <tr>
                            <th>Session</th>
                            <th>Creature</th>
                            <th>Session Kills</th>
                            <th>Kill Rate</th>
                            <th>Task Target</th>
                            <th>Kills Remaining</th>
                            <th>Time Remaining</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sessions.map(buildRow).join("")}
                    </tbody>
                </table>
            </div>
        </section>
    `;
}
