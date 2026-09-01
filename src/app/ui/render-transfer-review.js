import { formatNumber } from "../utils/formatters.js";
import { escapeText } from "./render-tracker.js";

/**
 * What an import or a pasted list is about to do, before it does it.
 *
 * The old import replaced a whole tracker behind one confirm naming a row count,
 * with no undo — the fastest way to lose a baseline was also the least reviewed
 * action in the app. Here the player sees the same four facts every time: what
 * arrives, what changes, what did not match, and what is deliberately left alone.
 *
 * Items the file does not mention stay unknown. Silently zeroing them would turn an
 * incomplete file into a set of claims about the character.
 */

function buildGroup(title, entries, options = {}) {
    const { tone = "", limit = 8 } = options;

    if (!entries.length) {
        return "";
    }

    const shown = entries.slice(0, limit);

    return `
        <div class="review-line${tone ? ` is-${tone}` : ""}">
            <dt>${escapeText(title)}</dt>
            <dd>
                ${shown.map((entry) => `<span class="review-chip${tone ? ` is-${tone}` : ""}">${escapeText(entry)}</span>`).join(" ")}
                ${entries.length > shown.length
                    ? `<span class="cell-muted">and ${formatNumber(entries.length - shown.length)} more</span>`
                    : ""}
            </dd>
        </div>
    `;
}

export function renderTransferReview(container, review) {
    const { tracker, source, additions, changes, unmatched, untouched, total } = review;

    container.className = "results-shell";
    container.innerHTML = `
        <section class="results-section" aria-labelledby="transferReviewTitle">
            <div class="unit-head">
                <div>
                    <h3 class="subsection-title" id="transferReviewTitle">${escapeText(tracker.label)} &middot; review ${escapeText(source)}</h3>
                    <p class="unit-instruction">Nothing is saved until you confirm, and it can be undone in one step.</p>
                </div>
                <button class="btn btn-secondary" type="button" id="transferCancel">Cancel</button>
            </div>

            <dl class="review-list">
                ${buildGroup(`Adds ${formatNumber(additions.length)}`, additions.map((entry) => `${entry.name} ${entry.after}`))}
                ${buildGroup(`Changes ${formatNumber(changes.length)}`, changes.map((entry) => `${entry.name} ${entry.before} → ${entry.after}`))}
                ${buildGroup(`Not matched ${formatNumber(unmatched.length)}`, unmatched, { tone: "warning" })}

                <div class="review-line">
                    <dt>Left alone</dt>
                    <dd>${untouched
                        ? `${formatNumber(untouched)} item${untouched === 1 ? "" : "s"} this file does not mention &mdash; they stay as they are, not zeroed`
                        : '<span class="cell-muted">none</span>'}</dd>
                </div>
            </dl>

            <div class="unit-foot">
                <span class="unit-progress">${formatNumber(total)} row${total === 1 ? "" : "s"} read</span>
                <button class="btn btn-primary" type="button" id="transferApply" ${additions.length + changes.length ? "" : "disabled"}>
                    ${additions.length + changes.length
                        ? `Apply ${formatNumber(additions.length + changes.length)} change${additions.length + changes.length === 1 ? "" : "s"}`
                        : "Nothing to apply"}
                </button>
            </div>
        </section>
    `;
}

/**
 * The paste box. A column of names, or `name<TAB>value` straight out of a
 * spreadsheet — this project started from the user's own sheet, so pasting is a
 * first-class way in rather than a fallback.
 */
export function renderPasteBox(container, tracker) {
    container.className = "results-shell";
    container.innerHTML = `
        <section class="results-section" aria-labelledby="pasteTitle">
            <div class="unit-head">
                <div>
                    <h3 class="subsection-title" id="pasteTitle">Paste ${escapeText(tracker.label)} progress</h3>
                    <p class="unit-instruction">
                        One name per line. Add a tab or comma and a value to set it &mdash;
                        otherwise each name is marked as done.
                    </p>
                </div>
                <button class="btn btn-secondary" type="button" id="pasteCancel">Cancel</button>
            </div>

            <textarea id="pasteInput" class="paste-input" spellcheck="false" placeholder="Rotworm&#9;412
Cave Rat
Amazon&#9;250"></textarea>

            <div class="unit-foot">
                <span class="unit-progress">Names are matched case- and space-insensitively.</span>
                <button class="btn btn-primary" type="button" id="pasteReview">Review what changes</button>
            </div>
        </section>
    `;
}
