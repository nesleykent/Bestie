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

function buildToolbar(tracker, filters, items, sort, options = {}) {
    const { canSelect = false, selectionMode = false, resultCount = 0 } = options;
    const status = tracker.facets.find((facet) => facet.isStatus);
    const search = tracker.facets.find((facet) => facet.kind === "search");
    const facets = tracker.facets.filter((facet) => facet !== status && facet !== search);
    const active = tracker.facets.filter((facet) => facet.kind === "check" ? filters[facet.key] : filters[facet.key] && filters[facet.key] !== "all");
    return `<div class="tracker-controls">
        ${status ? buildFacet(status, filters, items) : ""}
        <div class="tracker-search-row">
            ${search ? buildFacet(search, filters, items) : ""}
            <div><label class="input-label" for="trackerSort">Sort by</label><select id="trackerSort">${(tracker.sortOptions ?? []).map((option) => `<option value="${escapeAttribute(option.key)}"${sort.key === option.key ? " selected" : ""}>${escapeText(option.label)}</option>`).join("")}</select></div>

        </div>
        ${facets.length || canSelect ? `<div class="filter-strip" role="group" aria-label="Filters">${facets.map((facet) => facet.kind === "check"
            ? `<button class="filter-toggle" type="button" data-tracker-facet="${escapeAttribute(facet.key)}" data-tracker-facet-value="${!filters[facet.key]}" aria-pressed="${Boolean(filters[facet.key])}">${escapeText(facet.label)}</button>`
            : buildFacet(facet, filters, items)).join("")}</div>` : ""}
        <div class="active-filters" aria-label="Results and active filters"><span class="filter-hint">${formatNumber(resultCount)} results</span>${active.length ? active.map((facet) => {
            const value = filters[facet.key];
            const option = facet.options?.(items).find((entry) => String(entry.value) === String(value));
            const label = facet.kind === "check" ? facet.label : `${facet.label}: ${option?.label ?? value}`;
            return `<button type="button" class="active-filter" data-tracker-remove-filter="${escapeAttribute(facet.key)}" aria-label="Remove ${escapeAttribute(label)}">${escapeText(label)}<span aria-hidden="true">×</span></button>`;
        }).join("") + '<button class="text-action" type="button" data-tracker-reset-filters>Clear all</button>' : ""}            ${canSelect ? `<button class="toolbar-button" type="button" data-tracker-selection-mode aria-pressed="${selectionMode}">${selectionMode ? "Done selecting" : "Select items"}</button>` : ""}</div>
    </div>`;
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
                        aria-pressed="${page.size === size}"
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
                selectionMode,
                resultCount: page.total
            })}
            ${buildBulkBar({ selection, bulkActions, rows })}

            ${rows.length ? `
                ${(tracker.groups ?? [{ label: "", matches: () => true }]).map((group) => {
                    const grouped = rows.filter(group.matches);
                    if (!grouped.length) return "";
                    return `${group.label ? `<div class="tracker-group-heading"><h3>${escapeText(group.label)}</h3><span>${grouped.length} shown · ${escapeText(group.description)}</span></div>` : ""}
                    <div class="card-grid" role="list"${group.label ? ` aria-label="${escapeAttribute(group.label)}"` : ""}>
                        ${grouped.map((row) => `<article class="${cardClassName(row, selection.has(row.key))}" role="listitem" tabindex="-1" data-tracker-row="${escapeAttribute(row.key)}">${buildCardHtml(tracker, row, { selectable, isSelected: selection.has(row.key) })}</article>`).join("")}
                    </div>`;
                }).join("")}
                ${tracker.groups ? "" : buildPager(page)}
            ` : buildEmptyState(
                "Nothing matches these filters.",
                "Try another name or reset the filters to see every item.",
                '<button class="btn btn-secondary" type="button" data-tracker-reset-filters>Reset filters</button>'
            )}
        </section>

        ${tracker.transfer ? `
            <section class="reference-section" aria-label="Import and export progress">
                <h3 class="reference-title">Import and export progress</h3>

                <div class="action-row">
                    <button class="btn btn-secondary" id="trackerPasteButton" type="button">Paste a list</button>
                    <button class="btn btn-secondary" id="trackerImportButton" type="button">Import file</button>
                    <button class="btn btn-secondary" id="trackerExportButton" type="button">Export CSV</button>
                    <input class="sr-only" id="trackerImportInput" type="file" accept=".csv,.json,text/csv,application/json" tabindex="-1" aria-hidden="true">
                </div>

                <p class="helper-text">
                    Paste accepts a column of names copied from anywhere. Import accepts the CSV layout this tracker
                    exports. Either way you see what will change before it is saved, and only your own progress is
                    read &mdash; points, thresholds and categories always come from the game data.
                </p>
            </section>
        ` : ""}
    `;
}
