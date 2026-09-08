import { formatCharmsPerHour, formatNumber, formatTimeDetailed } from "../utils/formatters.js";
import { buildEmptyState, escapeAttribute } from "./render-blocks.js";

export const LIBRARY_COLUMNS = [
    { key: "label", label: "Session", isNumeric: false },
    { key: "huntedOn", label: "Hunted On", isNumeric: false },
    { key: "duration", label: "Duration", isNumeric: true },
    { key: "respawnMode", label: "Respawn", isNumeric: false },
    { key: "charmPoints", label: "Charm Points", isNumeric: true },
    { key: "charmRate", label: "Charm Rate", isNumeric: true },
    { key: "proficiencyRate", label: "Proficiency XP/h", isNumeric: true },
    { key: "proficiencyTotal", label: "Proficiency XP", isNumeric: true },
    { key: "kills", label: "Kills", isNumeric: true }
];

const value = (number) => number === null ? "—" : formatNumber(number);
export const formatSessionDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${date}T12:00:00`)) : "Undated";

function buildRow(session) {
    const id = escapeAttribute(session.id);
    const label = escapeAttribute(session.label);
    return `<article class="history-record" data-library-record="${id}" aria-label="${label}">
        <div class="history-record-main">
            <div class="history-identity">
                <label class="sr-only" for="sessionName-${id}">Session name</label>
                <input id="sessionName-${id}" class="history-name" type="text" data-library-name="${id}" value="${escapeAttribute(session.name)}" placeholder="${label}" aria-label="Name for ${label}">
                <p class="history-context">${session.duration > 0 ? formatTimeDetailed(session.duration) : "No duration"} · ${session.respawnModeLabel}</p>
            </div>
            <div class="history-metric"><span>Proficiency</span><strong>${session.hasProcessedLog ? value(session.proficiencyTotal) : "—"} <small>XP</small></strong><span>${session.hasProcessedLog ? value(session.proficiencyRate) : "—"} XP/h${session.proficiency?.isPartial ? " · Partial" : ""}</span></div>
            <div class="history-metric"><span>Charm points</span><strong>${session.hasProcessedLog ? value(session.charmPoints) : "—"}</strong><span>${session.hasProcessedLog ? formatCharmsPerHour(session.charmRate) : "No log"}</span></div>
            <div class="history-metric"><span>Kills</span><strong>${session.hasProcessedLog ? value(session.kills) : "—"}</strong><span>${session.creatureCount} creatures</span></div>

        </div>
        <div class="history-edit-fields">
            <label>Hunted on<input type="date" data-library-date="${id}" value="${escapeAttribute(session.huntedOn)}" aria-label="Date hunted for ${label}"></label>
            <label>Notes<input type="text" data-library-notes="${id}" value="${escapeAttribute(session.notes)}" placeholder="Route, team, boosts…" aria-label="Notes for ${label}"></label>
            <div class="history-actions">
                <button class="text-action" type="button" data-library-open="${id}">Open session</button>
                <button class="text-action" type="button" data-proficiency-open="${id}">View proficiency</button>
                <button class="text-action is-danger" type="button" data-library-delete="${id}" ${session.canDelete ? "" : "disabled"}>Delete</button>
            </div>
        </div>
    </article>`;
}

function buildControls(filters, counts, sort) {
    return `<div class="history-controls tracker-controls">
        <div class="history-filters segmented" role="group" aria-label="Respawn mode">${[{key:"all",label:"All sessions"},{key:"regular",label:"Regular"},{key:"rapid",label:"Rapid Respawn"}].map((mode) => `<button class="segmented-button${filters.respawnMode === mode.key ? " is-selected" : ""}" type="button" data-library-filter-respawn="${mode.key}" aria-pressed="${filters.respawnMode === mode.key}">${mode.label}</button>`).join("")}</div>
        <div class="history-search-row">
        <div class="history-search"><label class="input-label" for="librarySearch">Search sessions</label><input id="librarySearch" class="library-search" type="search" autocomplete="off" value="${escapeAttribute(filters.search)}" placeholder="Name, notes, or creature"></div>
        <div><label class="input-label" for="librarySort">Sort by</label><select id="librarySort">${LIBRARY_COLUMNS.map((column) => `<option value="${column.key}"${sort.key === column.key ? " selected" : ""}>${column.label}</option>`).join("")}</select></div>
        <button type="button" class="text-action" data-library-sort="${sort.key}" data-library-direction="${sort.direction === "asc" ? "desc" : "asc"}" aria-label="Reverse sort direction">${sort.direction === "asc" ? "Ascending ↑" : "Descending ↓"}</button>
        <button class="btn btn-secondary" id="libraryCompareButton" type="button" ${counts.comparable < 2 ? "disabled" : ""}>Compare sessions</button>

        </div><span class="history-count">${counts.shown} of ${counts.total} sessions · Changes save automatically</span>
    </div>`;
}

export function renderSessionLibrary(container, sessions, sort, filters, counts) {
    container.className = "results-shell session-history";
    container.innerHTML = `${buildControls(filters, counts, sort)}<div class="history-records">${sessions.length ? sessions.map(buildRow).join("") : buildEmptyState(counts.total ? "No sessions match." : "No sessions yet.", counts.total ? "Clear the search or select All sessions." : "Choose New session and paste a Hunt Analyzer.")}</div>`;
}
