import { formatCharmsPerHour, formatNumber, formatTimeDetailed } from "../utils/formatters.js";
import { buildEmptyState, buildPill, escapeAttribute } from "./render-blocks.js";

export const LIBRARY_COLUMNS = [
    { key: "label", label: "Session", isNumeric: false },
    { key: "huntedOn", label: "Hunted On", isNumeric: false },
    { key: "duration", label: "Duration", isNumeric: true },
    { key: "respawnMode", label: "Respawn", isNumeric: false },
    { key: "charmPoints", label: "Charm Points", isNumeric: true },
    { key: "charmRate", label: "Charm Rate", isNumeric: true }
];

function buildHead(sort) {
    const headers = LIBRARY_COLUMNS.map((column) => {
        const isSorted = sort.key === column.key;
        const nextDirection = isSorted && sort.direction === "asc" ? "desc" : "asc";
        const indicator = isSorted ? (sort.direction === "asc" ? "▲" : "▼") : "";

        return `
            <th class="${column.isNumeric ? "is-num" : ""}${isSorted ? " is-sorted" : ""}">
                <button
                    class="column-sort"
                    type="button"
                    data-library-sort="${column.key}"
                    data-library-direction="${nextDirection}"
                    aria-label="Sort by ${column.label}"
                >${column.label}<span class="sort-mark">${indicator}</span></button>
            </th>
        `;
    }).join("");

    return `<tr>${headers}<th>Notes</th><th></th></tr>`;
}

function buildRow(session) {
    return `
        <tr${session.isActive ? ' class="is-active"' : ""}>
            <td>
                <input
                    class="library-name"
                    type="text"
                    data-library-name="${escapeAttribute(session.id)}"
                    value="${escapeAttribute(session.name)}"
                    placeholder="${escapeAttribute(session.label)}"
                    aria-label="Name for ${escapeAttribute(session.label)}"
                >
                ${session.hasProcessedLog ? "" : buildPill("No log")}
            </td>
            <td>
                <input
                    class="library-date"
                    type="date"
                    data-library-date="${escapeAttribute(session.id)}"
                    value="${escapeAttribute(session.huntedOn)}"
                    aria-label="Date hunted for ${escapeAttribute(session.label)}"
                >
            </td>
            <td class="is-num">${session.duration > 0 ? formatTimeDetailed(session.duration) : "&mdash;"}</td>
            <td>${session.respawnModeLabel}</td>
            <td class="is-num">${session.hasProcessedLog
                ? `${formatNumber(session.charmPoints)}<span class="row-aside">${formatNumber(session.creatureCount)} creatures</span>`
                : "&mdash;"}</td>
            <td class="is-num">${session.hasProcessedLog ? formatCharmsPerHour(session.charmRate) : "&mdash;"}</td>
            <td>
                <input
                    class="library-notes"
                    type="text"
                    data-library-notes="${escapeAttribute(session.id)}"
                    value="${escapeAttribute(session.notes)}"
                    placeholder="Route, team, boosts…"
                    aria-label="Notes for ${escapeAttribute(session.label)}"
                >
            </td>
            <td class="library-actions">
                <button class="row-action" type="button" data-library-open="${escapeAttribute(session.id)}">Open</button>
                <button
                    class="row-action is-danger"
                    type="button"
                    data-library-delete="${escapeAttribute(session.id)}"
                    ${session.canDelete ? "" : "disabled"}
                >Delete</button>
            </td>
        </tr>
    `;
}

function buildControls(filters, counts) {
    const modes = [
        { key: "all", label: "All" },
        { key: "regular", label: "Regular" },
        { key: "rapid", label: "Rapid Respawn" }
    ];

    return `
        <div class="library-controls">
            <div>
                <span class="input-label" id="libraryRespawnLabel">Respawn Mode</span>
                <div class="segmented" role="group" aria-labelledby="libraryRespawnLabel">
                    ${modes.map((mode) => `
                        <button
                            class="segmented-button${filters.respawnMode === mode.key ? " is-selected" : ""}"
                            type="button"
                            data-library-filter-respawn="${mode.key}"
                            aria-pressed="${filters.respawnMode === mode.key ? "true" : "false"}"
                        >${mode.label}</button>
                    `).join("")}
                </div>
            </div>

            <div>
                <label class="input-label" for="librarySearch">Search</label>
                <input
                    id="librarySearch"
                    class="library-search"
                    type="text"
                    autocomplete="off"
                    value="${escapeAttribute(filters.search)}"
                    placeholder="Name, notes, or creature"
                >
                <p class="helper-text">
                    Showing ${formatNumber(counts.shown)} of ${formatNumber(counts.total)} sessions.
                </p>
            </div>
        </div>
    `;
}

export function renderSessionLibrary(container, sessions, sort, filters, counts) {
    container.className = "grid results-shell";
    container.innerHTML = `
        ${sessions.length ? `
            <div class="table-container library-table">
                <table>
                    <thead>${buildHead(sort)}</thead>
                    <tbody>${sessions.map(buildRow).join("")}</tbody>
                </table>
            </div>
        ` : buildEmptyState(
            counts.total ? "No session matches these filters." : "No sessions yet.",
            counts.total
                ? "Clear the search or switch the respawn filter to see the rest."
                : "Use + to add a session, then paste a Hunt Analyzer into it."
        )}

        ${buildControls(filters, counts)}

        <div class="action-row">
            <button class="btn btn-secondary" id="libraryAddButton" type="button">Add Session</button>
        </div>
    `;
}
