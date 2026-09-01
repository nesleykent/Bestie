import { formatNumber } from "../utils/formatters.js";
import { buildAnswer, buildEmptyState, buildMetricLine, escapeAttribute } from "./render-blocks.js";
import { escapeText, plainText, selectControl } from "./render-controls.js";

/**
 * One card grid for every tracker.
 *
 * It was a table for a long time, and a table was the wrong container: hundreds of
 * rows of five 30px buttons is a spreadsheet, and the question a player actually
 * arrives with — what is close, what is worth hunting — cannot be read off one. Every
 * comparable Tibia tool uses cards, and they are right.
 *
 * A tracker definition supplies a `card(row)` descriptor: title, meta, optional body
 * text, the primary control, a footer, and any secondary chips. Everything structural
 * — filtering, sorting, paging, selection, the headline — lives here exactly once.
 */

export { escapeText, plainText };

export const PAGE_SIZES = [24, 48, 96, 0];

function buildFacet(facet, filters, items) {
    const value = filters[facet.key];
    const id = `trackerFacet-${facet.key}`;

    if (facet.kind === "search") {
        return `
            <div>
                <label class="input-label" for="${id}">${escapeText(facet.label)}</label>
                <input
                    id="${id}"
                    class="library-search"
                    type="text"
                    autocomplete="off"
                    data-tracker-facet="${escapeAttribute(facet.key)}"
                    value="${escapeAttribute(value ?? "")}"
                    placeholder="${escapeAttribute(facet.placeholder ?? "")}"
                >
            </div>
        `;
    }

    if (facet.kind === "select") {
        return `
            <div>
                <label class="input-label" for="${id}">${escapeText(facet.label)}</label>
                <select id="${id}" class="progress-select" data-tracker-facet="${escapeAttribute(facet.key)}">
                    <option value="all"${value === "all" ? " selected" : ""}>${escapeText(facet.allLabel ?? "All")}</option>
                    ${facet.options(items).map((option) => `
                        <option value="${escapeAttribute(option.value)}"${String(value) === String(option.value) ? " selected" : ""}>${escapeText(option.label)}</option>
                    `).join("")}
                </select>
            </div>
        `;
    }

    if (facet.kind === "segmented") {
        return `
            <div class="segmented" role="group" aria-label="${escapeAttribute(facet.label)}">
                ${facet.options().map((option) => `
                    <button
                        class="segmented-button${String(value) === String(option.value) ? " is-selected" : ""}"
                        type="button"
                        data-tracker-facet="${escapeAttribute(facet.key)}"
                        data-tracker-facet-value="${escapeAttribute(option.value)}"
                        aria-pressed="${String(value) === String(option.value) ? "true" : "false"}"
                    >${escapeText(option.label)}</button>
                `).join("")}
            </div>
        `;
    }

    return "";
}

function buildChecks(checks, filters) {
    if (!checks.length) {
        return "";
    }

    return `
        <div>
            <span class="input-label">Only show</span>
            <div class="check-row">
                ${checks.map((facet) => `
                    <label class="check">
                        <input
                            type="checkbox"
                            id="trackerFacet-${escapeAttribute(facet.key)}"
                            data-tracker-facet="${escapeAttribute(facet.key)}"
                            ${filters[facet.key] ? "checked" : ""}
                        >
                        ${escapeText(facet.label)}
                    </label>
                `).join("")}
            </div>
        </div>
    `;
}

/**
 * Search and sort stay in the open because they are what people reach for; the rest
 * fold behind one control that says how many are active. Folded, never removed.
 */
function buildToolbar(tracker, filters, items, sort, options = {}) {
    const { canSelect = false, selectionMode = false } = options;
    const statusFacet = tracker.facets.find((facet) => facet.kind === "segmented" && facet.isStatus);
    const searchFacet = tracker.facets.find((facet) => facet.kind === "search");
    const checks = tracker.facets.filter((facet) => facet.kind === "check");
    const rest = tracker.facets.filter((facet) => facet !== statusFacet && facet !== searchFacet && facet.kind !== "check");
    const active = rest.concat(checks).filter((facet) => {
        const value = filters[facet.key];

        return facet.kind === "check" ? Boolean(value) : value !== undefined && value !== "all";
    }).length;

    return `
        ${statusFacet ? buildFacet(statusFacet, filters, items) : ""}

        <div class="toolbar">
            ${searchFacet ? buildFacet(searchFacet, filters, items) : ""}

            <div>
                <label class="input-label" for="trackerSort">Sort by</label>
                <select id="trackerSort" class="progress-select">
                    ${(tracker.sortOptions ?? []).map((option) => `
                        <option value="${escapeAttribute(option.key)}"${sort.key === option.key ? " selected" : ""}>${escapeText(option.label)}</option>
                    `).join("")}
                </select>
            </div>

            ${rest.length || checks.length ? `
                <details class="filter-disclosure"${active ? " open" : ""}>
                    <summary>
                        <span class="material-symbols-outlined" aria-hidden="true">tune</span>
                        Filters${active ? `<span class="filter-count">${active}</span>` : ""}
                    </summary>
                    <div class="progress-filters">
                        ${rest.map((facet) => buildFacet(facet, filters, items)).join("")}
                        ${buildChecks(checks, filters)}
                    </div>
                </details>
            ` : ""}

            ${canSelect ? `
                <button
                    class="toolbar-button${selectionMode ? " is-on" : ""}"
                    type="button"
                    data-tracker-selection-mode
                    aria-pressed="${selectionMode ? "true" : "false"}"
                >
                    <span class="material-symbols-outlined" aria-hidden="true">${selectionMode ? "done" : "checklist"}</span>
                    ${selectionMode ? "Done selecting" : "Select items"}
                </button>
            ` : ""}
        </div>
    `;
}

function buildBulkBar(view) {
    const { selection, bulkActions = [], rows } = view;

    if (!selection.size || !bulkActions.length) {
        return "";
    }

    const allShown = rows.length > 0 && rows.every((row) => selection.has(row.key));

    return `
        <div class="bulk-bar" role="region" aria-label="Bulk actions">
            <label class="bulk-select">
                <input type="checkbox" id="trackerSelectAll" ${allShown ? "checked" : ""}>
                <span>${formatNumber(selection.size)} selected</span>
            </label>

            <div class="bulk-actions">
                ${bulkActions.map((action) => `
                    <button class="row-action" type="button" data-tracker-bulk="${escapeAttribute(action.key)}">${escapeText(action.label)}</button>
                `).join("")}
            </div>

            <button class="icon-button" type="button" id="trackerClearSelection" aria-label="Clear selection">
                <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
        </div>
    `;
}

function cardStatus(card) {
    const status = card.status ?? "";

    return `<span class="card-status" title="${plainText(status)}">${status}</span>`;
}

function cardClassName(row, isSelected) {
    return [
        "progress-card",
        row.status ? `is-${row.status}` : "",
        row.answered ? "is-answered" : "",
        row.known === false ? "is-unrecorded" : "",
        isSelected ? "is-selected" : ""
    ].filter(Boolean).join(" ");
}

/** One card. Exported so a single change can repaint its own card in place. */
export function buildCardHtml(tracker, row, options = {}) {
    const { selectable = false, isSelected = false } = options;
    const card = tracker.card(row);
    const hasFooter = Boolean(card.status || card.extras);

    return `
        <div class="card-content">
            <div class="card-head">
                ${selectable ? selectControl(row, isSelected) : ""}
                <div class="card-title">${card.title}</div>
                ${card.action ?? ""}
            </div>

            ${card.meta ? `<div class="card-meta">${card.meta}</div>` : ""}
            ${card.body ? `<p class="card-body">${card.body}</p>` : ""}
        </div>

        <div class="card-actions">
            <div class="card-control">${card.control}</div>

            ${hasFooter ? `<div class="card-foot">
                ${cardStatus(card)}
                ${card.extras ? `<span class="card-extras">${card.extras}</span>` : ""}
            </div>` : ""}
        </div>

        ${typeof row.progress === "number" ? `
            <span class="card-bar" aria-hidden="true">
                <span style="width: ${Math.round(Math.min(1, Math.max(0, row.progress)) * 100)}%"></span>
            </span>
        ` : ""}
    `;
}

export function patchTrackerCard(container, tracker, row, options = {}) {
    const card = container.querySelector(`[data-tracker-row="${CSS.escape(row.key)}"]`);

    if (!card) {
        return null;
    }

    card.className = cardClassName(row, options.isSelected);
    card.innerHTML = buildCardHtml(tracker, row, options);

    return card;
}

function buildPager(page) {
    if (!page.total) {
        return "";
    }

    return `
        <div class="pager">
            <span class="pager-count">
                Showing ${formatNumber(page.from)}&ndash;${formatNumber(page.to)} of ${formatNumber(page.total)}
            </span>

            <div class="pager-sizes" role="group" aria-label="Cards per page">
                ${PAGE_SIZES.map((size) => `
                    <button
                        class="row-action${page.size === size ? " is-on" : ""}"
                        type="button"
                        data-tracker-page-size="${size}"
                    >${size === 0 ? "All" : size}</button>
                `).join("")}
            </div>

            <div class="pager-steps">
                <button class="row-action" type="button" data-tracker-page="prev" ${page.index === 0 ? "disabled" : ""}>Previous</button>
                <button class="row-action" type="button" data-tracker-page="next" ${page.index >= page.lastIndex ? "disabled" : ""}>Next</button>
            </div>
        </div>
    `;
}

export function renderTracker(container, view) {
    const {
        tracker,
        rows,
        page,
        sort,
        filters,
        items,
        totals,
        selection = new Set(),
        bulkActions = [],
        selectionMode = false
    } = view;
    const selectable = selectionMode && bulkActions.length > 0;

    container.className = `results-shell tracker-${tracker.id}`;
    container.innerHTML = `
        ${buildAnswer(totals.answer.label, totals.answer.value, totals.answer.note ?? "", totals.answer.progress)}
        ${buildMetricLine(totals.stats ?? [])}

        <section class="results-section" aria-labelledby="trackerGridTitle">
            <h2 class="sr-only" id="trackerGridTitle">${escapeText(tracker.tableTitle ?? tracker.label)}</h2>

            ${buildToolbar(tracker, filters, items, sort, {
                canSelect: bulkActions.length > 0,
                selectionMode
            })}
            ${buildBulkBar({ selection, bulkActions, rows })}

            ${rows.length ? `
                <div class="card-grid" role="list">
                    ${rows.map((row) => `
                        <article
                            class="${cardClassName(row, selection.has(row.key))}"
                            role="listitem"
                            tabindex="-1"
                            data-tracker-row="${escapeAttribute(row.key)}"
                        >${buildCardHtml(tracker, row, { selectable, isSelected: selection.has(row.key) })}</article>
                    `).join("")}
                </div>
                ${buildPager(page)}
            ` : buildEmptyState(
                "Nothing matches these filters.",
                "Clear the search, or set the filters back to All."
            )}
        </section>

        ${tracker.transfer ? `
            <details class="transfer-disclosure">
                <summary>Bring progress in, or take it out</summary>

                <div class="action-row">
                    <button class="btn" id="trackerPasteButton" type="button">Paste a list</button>
                    <button class="btn" id="trackerImportButton" type="button">Import file</button>
                    <button class="btn" id="trackerExportButton" type="button">Export CSV</button>
                    <input class="sr-only" id="trackerImportInput" type="file" accept=".csv,.json,text/csv,application/json" tabindex="-1" aria-hidden="true">
                </div>

                <p class="helper-text">
                    Paste accepts a column of names copied from anywhere. Import accepts the CSV layout this tracker
                    exports. Either way you see what will change before it is saved, and only your own progress is
                    read &mdash; points, thresholds and categories always come from the game data.
                </p>
            </details>
        ` : ""}
    `;
}
