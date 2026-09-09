import { escapeText } from "./render-tracker.js";
import { formatCharmsPerHour, formatNumber, formatTime } from "../utils/formatters.js";
import { buildAnswer, buildPill, buildStatLine } from "./render-blocks.js";

function buildRow(row) {
    return `
        <tr class="${row.isBest ? "is-best" : ""}">
            <td>${escapeText(row.label)} ${row.isBest ? buildPill("Best", true) : ""}</td>
            <td class="is-num">${formatNumber(row.totalCharms)}</td>
            <td class="is-num">${formatTime(row.maxTimeRemainingMinutes)}</td>
            <td class="is-num">${formatCharmsPerHour(row.totalCharmsPerHour)}</td>
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
        ? `not analyzed: ${comparison.pendingLabels.map(escapeText).join(", ")}`
        : "";

    container.className = "results-shell";
    container.innerHTML = `
        ${best
            ? buildAnswer("Best Charm Session", escapeText(best.label),
                `${formatCharmsPerHour(best.totalCharmsPerHour)} &mdash; ${formatNumber(best.totalCharms)} charm points over ${formatTime(best.maxTimeRemainingMinutes)}.`)
            : buildAnswer("Best Charm Session", "&mdash;",
                "No session projects any charm points per hour yet. Update the total kills or the creature selection.")}
        ${buildStatLine([`${formatNumber(comparison.rows.length)} sessions ranked`, pending])}

        <section class="results-section" aria-labelledby="comparisonTableTitle">
            <h3 class="subsection-title" id="comparisonTableTitle">Charm Rate Ranking</h3>

            <div class="table-container comparison-table" tabindex="0" role="region" aria-label="Charm rate ranking">
                <table>
                    <thead>
                        <tr>
                            <th>Session</th>
                            <th class="is-num">Charm points</th>
                            <th class="is-num">Longest time remaining</th>
                            <th class="is-num">Charm rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${[...comparison.rows].sort((a, b) => b.totalCharmsPerHour - a.totalCharmsPerHour || b.totalCharms - a.totalCharms).map(buildRow).join("")}
                    </tbody>
                </table>
            </div>
        </section>
    `;
}
