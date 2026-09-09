import {
    formatCharmsPerHour,
    formatKillRate,
    formatNumber,
    formatTime
} from "../utils/formatters.js";

export function escapeAttribute(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function buildEmptyState(headline, detail = "", action = "") {
    return `
        <div class="empty-state">
            <strong>${headline}</strong>
            ${detail ? `<span>${detail}</span>` : ""}
            ${action ? `<div class="empty-state-action">${action}</div>` : ""}
        </div>
    `;
}

export function buildAnswer(label, value, note = "", progress = null) {
    const normalizedProgress = typeof progress === "number"
        ? Math.min(1, Math.max(0, progress))
        : null;

    return `
        <article class="answer">
            ${label ? `<span class="summary-label">${label}</span>` : ""}
            <strong class="answer-value">${value}</strong>
            ${normalizedProgress !== null ? `
                <span class="answer-progress" aria-hidden="true">
                    <span style="width: ${Math.round(normalizedProgress * 100)}%"></span>
                </span>
            ` : ""}
            ${note ? `<p class="answer-note">${note}</p>` : ""}
        </article>
    `;
}

export function buildStatLine(parts) {
    const filled = parts.filter(Boolean);

    return buildMetricLine(filled);
}

export function buildMetricLine(parts) {
    const filled = parts.filter(Boolean);

    return filled.length
        ? `<p class="stat-line">${filled.map((part) => `<span class="stat-item">${part}</span>`).join("")}</p>`
        : "";
}

export function buildPill(text, isBrand = false) {
    return `<span class="pill${isBrand ? " is-brand" : ""}">${text}</span>`;
}

export function buildLinkButton(text, attribute, value, extraClass = "") {
    return `
        <button class="link-button${extraClass ? ` ${extraClass}` : ""}" type="button" ${attribute}="${escapeAttribute(value)}">
            ${text}
        </button>
    `;
}

export function buildRow(cells, modifier = "") {
    return `
        <li class="row${modifier ? ` ${modifier}` : ""}">
            ${cells.join("")}
        </li>
    `;
}

export function buildRowList(rows, columnCount) {
    return `
        <ul class="row-list cols-${columnCount}" role="list">
            ${rows.join("")}
        </ul>
    `;
}

function buildEstimateRow(entry) {
    const monster = entry.monster;

    return `
        <tr>
            <td>
                <a href="${monster.wikiLink}" target="_blank" rel="noreferrer">${monster.name}</a>
                ${entry.huntLabel ? buildPill(entry.huntLabel) : ""}
            </td>
            <td class="is-num">${formatNumber(monster.charms)}</td>
            <td class="is-num">${formatNumber(monster.killsThisSession)}</td>
            <td class="editable-cell is-num">
                <input
                    type="number"
                    class="kills-input"
                    aria-label="Total kills for ${escapeAttribute(monster.name)}${entry.huntLabel ? ` in ${escapeAttribute(entry.huntLabel)}` : ""}"
                    data-monster-name="${escapeAttribute(monster.name)}"
                    ${entry.huntId ? `data-hunt-id="${escapeAttribute(entry.huntId)}"` : ""}
                    min="0"
                    value="${monster.typedKills || ""}"
                    placeholder="${monster.isKillFloor ? `≥ ${formatNumber(monster.totalKills)}` : "Enter kills"}"
                    title="${monster.isKillFloor ? "From the tile you picked in the Bestiary — type the exact count if you have it" : ""}"
                >
            </td>
            <td class="is-num">${formatNumber(monster.killsToUnlock)}</td>
            <td class="is-num">${formatKillRate(monster.killRate)}</td>
            <td class="is-num">${monster.isKillFloor
                ? `at most ${formatNumber(monster.remainingKills)}`
                : formatNumber(monster.remainingKills)}</td>
            <td class="is-num">${monster.isKillFloor
                ? `at most ${formatTime(monster.timeRemainingMinutes)}`
                : formatTime(monster.timeRemainingMinutes)}</td>
            <td class="is-num">${formatCharmsPerHour(monster.charmsPerHour)}</td>
        </tr>
    `;
}

export function buildEstimateTable(entries) {
    return `
        <p class="table-scroll-hint">Scroll horizontally to see all estimates.</p>
        <div class="table-container estimate-table" tabindex="0" role="region" aria-label="Bestiary estimates">
            <table>
                <thead>
                    <tr>
                        <th>Creature</th>
                        <th class="is-num">Charm points</th>
                        <th class="is-num">Session kills</th>
                        <th class="is-num">Total kills</th>
                        <th class="is-num">Unlock target</th>
                        <th class="is-num">Kill rate</th>
                        <th class="is-num">Kills remaining</th>
                        <th class="is-num">Time remaining</th>
                        <th class="is-num">Charm rate</th>
                    </tr>
                </thead>
                <tbody>
                    ${entries.map(buildEstimateRow).join("")}
                </tbody>
            </table>
        </div>
    `;
}

export function buildCreatureChip(options) {
    return `
        <button
            class="chip${options.isSelected ? " is-selected" : ""}"
            type="button"
            ${options.attribute}="${escapeAttribute(options.value)}"
            aria-pressed="${options.isSelected ? "true" : "false"}"
        >
            <span class="chip-name">${options.name}</span>
            <span class="chip-meta">${options.meta}</span>
        </button>
    `;
}
