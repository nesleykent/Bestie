import { TRACKER_ICONS } from "./render-dashboard.js";
import { escapeAttribute } from "./render-blocks.js";
import { escapeText } from "./render-tracker.js";

/** The Trackers section of the sidebar — one link per tracker, in registry order. */
export function renderSidebarTrackers(container, trackers, activeTrackerId, isTrackersActive) {
    container.innerHTML = trackers.map((tracker) => `
        <li>
            <button class="sidebar-link${isTrackersActive && tracker.id === activeTrackerId ? " is-active" : ""}" type="button" data-sidebar-tracker="${escapeAttribute(tracker.id)}">
                <span class="material-symbols-outlined" aria-hidden="true">${TRACKER_ICONS[tracker.id] ?? "checklist"}</span>
                <span class="sidebar-link-label">${escapeText(tracker.label)}</span>
            </button>
        </li>
    `).join("");
}

/** The character switcher's dropdown — every character, plus "Add character". */
export function renderSidebarCharacterMenu(container, characters, activeCharacterId, getLabel) {
    const options = characters.map((character, index) => `
        <button class="sidebar-character-option${character.id === activeCharacterId ? " is-active" : ""}" type="button" role="option" aria-selected="${character.id === activeCharacterId}" data-sidebar-character="${escapeAttribute(character.id)}">
            ${escapeText(getLabel(index, character))}
        </button>
    `).join("");

    container.innerHTML = `
        ${options}
        <button class="sidebar-character-option sidebar-character-add" type="button" data-sidebar-add-character>
            <span class="material-symbols-outlined" aria-hidden="true">add</span>Add character
        </button>
    `;
}
