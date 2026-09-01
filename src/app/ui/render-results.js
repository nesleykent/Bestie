import { formatCharmsPerHour, formatNumber, formatTime } from "../utils/formatters.js";
import {
    buildAnswer,
    buildCreatureChip,
    buildEmptyState,
    buildEstimateTable,
    buildStatLine
} from "./render-blocks.js";

export function renderResults(container, monsters, selectedMonsterNames, summary) {
    if (!monsters.length) {
        container.className = "empty-state";
        container.innerHTML = `
            <strong>No matching creatures found.</strong>
            <span>The log was processed, but none of the killed creatures matched the Bestiary dataset.</span>
        `;
        return;
    }

    const selectedMonsters = monsters.filter((monster) => selectedMonsterNames.includes(monster.name));

    container.className = "results-shell";
    container.innerHTML = `
        ${buildAnswer("Charm Rate", formatCharmsPerHour(summary.totalCharmsPerHour))}
        ${buildStatLine([
            `${formatNumber(selectedMonsters.length)} of ${formatNumber(monsters.length)} creatures selected`,
            `${formatNumber(summary.totalCharms)} charm points`,
            `${formatTime(summary.maxTimeRemainingMinutes)} longest time remaining`
        ])}

        <section class="results-section" aria-labelledby="bestiarySelectionTitle">
            <h3 class="subsection-title" id="bestiarySelectionTitle">Select Creatures</h3>
            <div class="chip-grid" role="list">
                ${monsters.map((monster) => buildCreatureChip({
                    attribute: "data-bestiary-monster",
                    value: monster.name,
                    isSelected: selectedMonsterNames.includes(monster.name),
                    name: monster.displayName || monster.name,
                    meta: `${formatNumber(monster.killsThisSession)}x`
                })).join("")}
            </div>
        </section>

        ${selectedMonsters.length ? `
            <section class="results-section" aria-labelledby="bestiaryTableTitle">
                <h3 class="subsection-title" id="bestiaryTableTitle">Bestiary Estimate</h3>
                ${buildEstimateTable(selectedMonsters.map((monster) => ({ monster })))}
            </section>
        ` : buildEmptyState("No creatures selected.")}

        <div class="action-row">
            <button class="btn btn-tertiary" id="clearInputsButton" type="button">Reset Totals</button>
        </div>
    `;
}
