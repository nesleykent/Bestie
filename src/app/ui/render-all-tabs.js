import { formatCharmsPerHour, formatNumber, formatTime } from "../utils/formatters.js";
import {
    buildAnswer,
    buildCreatureChip,
    buildEmptyState,
    buildEstimateTable,
    buildStatLine
} from "./render-blocks.js";

export function renderAllTabs(container, analysis, summary) {
    if (!analysis.rows.length) {
        container.className = "results-shell";
        container.innerHTML = buildEmptyState(
            "No analyzed creatures.",
            "Process a Hunt Analyzer to list a session's creatures here.",
            '<button class="btn btn-secondary" type="button" data-empty-open-session>Open current session</button>'
        );
        return;
    }

    const selectedEntries = analysis.rows.filter((entry) => entry.isSelected);

    container.className = "results-shell";
    container.innerHTML = `
        ${buildAnswer("Charm Rate", formatCharmsPerHour(summary.charmRate))}
        ${buildStatLine([
            `${formatNumber(selectedEntries.length)} of ${formatNumber(analysis.rows.length)} entries selected`,
            `${formatNumber(summary.totalCharms)} charm points`,
            `${formatTime(summary.totalTimeMinutes)} combined time`
        ])}

        <section class="results-section" aria-labelledby="allTabsSelectionTitle">
            <h3 class="subsection-title" id="allTabsSelectionTitle">Select Creatures</h3>
            <div class="chip-grid" role="list">
                ${analysis.rows.map((entry) => buildCreatureChip({
                    attribute: "data-all-tabs-entry",
                    value: entry.key,
                    isSelected: entry.isSelected,
                    name: entry.monster.name,
                    meta: `${entry.huntLabel} &middot; ${formatNumber(entry.monster.killsThisSession)}x`
                })).join("")}
            </div>
        </section>

        ${selectedEntries.length ? `
            <section class="results-section" aria-labelledby="allTabsTableTitle">
                <h3 class="subsection-title" id="allTabsTableTitle">Bestiary Estimate</h3>
                ${buildEstimateTable(selectedEntries.map((entry) => ({
                    monster: entry.monster,
                    huntLabel: entry.huntLabel,
                    huntId: entry.huntId
                })))}
            </section>
        ` : buildEmptyState("No entries selected.")}

        <div class="action-row">
            <button class="btn btn-tertiary" id="allTabsResetButton" type="button">Reset Totals</button>
        </div>
    `;
}
