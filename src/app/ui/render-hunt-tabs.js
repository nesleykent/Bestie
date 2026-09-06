import { escapeText } from "./render-tracker.js";
import { escapeAttribute } from "./render-blocks.js";

function buildTabButton(selectAttribute, tab) {
    return `
        <button
            class="hunt-tab-button"
            type="button"
            ${selectAttribute}
            aria-pressed="${tab.isActive ? "true" : "false"}"
        >
            <span class="hunt-tab-label">${escapeText(tab.label)}</span>
            <span class="hunt-tab-meta">${escapeText(tab.meta)}</span>
        </button>
    `;
}

function buildFixedTab(tab) {
    return `
        <div class="hunt-tab hunt-tab-fixed${tab.isActive ? " is-active" : ""}">
            ${buildTabButton(`data-fixed-select="${escapeAttribute(tab.key)}"`, tab)}
        </div>
    `;
}

function buildHuntTab(tab, canClose) {
    return `
        <div class="hunt-tab${tab.isActive ? " is-active" : ""}">
            ${buildTabButton(`data-hunt-select="${escapeAttribute(tab.id)}"`, tab)}
            ${canClose ? `
                <button
                    class="hunt-tab-close"
                    type="button"
                    data-hunt-close="${escapeAttribute(tab.id)}"
                    aria-label="Close ${escapeAttribute(tab.label)}"
                >&times;</button>
            ` : ""}
        </div>
    `;
}

export function renderHuntTabs(container, fixedTabs, huntTabs, options = {}) {
    const { canAdd = true } = options;
    const canClose = huntTabs.length > 1;

    container.innerHTML = `
        ${fixedTabs.map(buildFixedTab).join("")}
        ${huntTabs.map((tab) => buildHuntTab(tab, canClose)).join("")}
        ${canAdd ? '<button class="hunt-tab-add" id="addHuntButton" type="button" aria-label="Add session">+</button>' : ""}
    `;
}
