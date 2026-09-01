import { formatCharmsPerHour, formatNumber, formatTime } from "../utils/formatters.js";
import { buildAnswer, buildPill, buildStatLine } from "./render-blocks.js";

function buildRow(row) {
    return `
        <tr class="${row.isBest ? "is-best" : ""}">
            <td>${row.label} ${row.isBest ? buildPill("Best", true) : ""}</td>
            <td>${formatNumber(row.totalCharms)}</td>
            <td>${formatTime(row.maxTimeRemainingMinutes)}</td>
            <td>${formatCharmsPerHour(row.totalCharmsPerHour)}</td>
        </tr>
    `;
}

export function renderComparison(container, comparison) {
    if (comparison.rows.length < 2) {
        container.className = "empty-state";
        container.innerHTML = `
            <strong>Not enough analyzed sessions.</strong>
            <span>Process at least two sessions to compare their charm rate.</span>
        `;
        return;
    }

    const best = comparison.bestRow;
    const pending = comparison.pendingLabels.length
        ? `not analyzed: ${comparison.pendingLabels.join(", ")}`
        : "";

    container.className = "results-shell";
    container.innerHTML = `
        ${best
            ? buildAnswer("Best Session", best.label,
                `${formatCharmsPerHour(best.totalCharmsPerHour)} &mdash; ${formatNumber(best.totalCharms)} charm points over ${formatTime(best.maxTimeRemainingMinutes)}.`)
            : buildAnswer("Best Session", "&mdash;",
                "No session projects any charm points per hour yet. Update the total kills or the creature selection.")}
        ${buildStatLine([`${formatNumber(comparison.rows.length)} sessions ranked`, pending])}

        <section class="results-section" aria-labelledby="comparisonTableTitle">
            <h3 class="subsection-title" id="comparisonTableTitle">Charm Rate Ranking</h3>

            <div class="table-container comparison-table">
                <table>
                    <thead>
                        <tr>
                            <th>Session</th>
                            <th>Charm Points</th>
                            <th>Longest Time Remaining</th>
                            <th>Charm Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${comparison.rows.map(buildRow).join("")}
                    </tbody>
                </table>
            </div>
        </section>
    `;
}
