import { parsePlayTimeMinutes, planCharmTime } from "./features/charm-plan.js";
import {
    aggregateAllTabsSummary,
    buildAllTabsAnalysis,
    buildHuntComparison,
    isEntryKeyForHunt
} from "./features/hunt-comparison.js";
import { buildOpportunityAnalysis } from "./features/opportunity-analysis.js";
import { analyzeSession, recalculateProgress, summarizeBestiaryMonsters } from "./features/session-analysis.js";
import { analyzeTaskSession, calculateTaskEstimate } from "./features/task-analysis.js";
import { loadBestiaryData } from "./services/bestiary-repository.js";
import {
    addHunt,
    getHuntLabel,
    hasBestiaryAnalysis,
    hasTaskAnalysis,
    huntHasContent,
    removeHunt,
    resetHunt,
    restoreWorkspace
} from "./state/hunt-workspace.js";
import {
    addCharacter,
    createDefaultCharacter,
    getCharacterLabel,
    removeCharacter,
    restoreAppWorkspace,
    wrapLegacyWorkspaceAsCharacter
} from "./state/character-workspace.js";
import {
    buildAppExportFileName,
    parseAppWorkspaceFile,
    serializeAppState
} from "./state/app-workspace-transfer.js";
import {
    clearAllStoredState,
    loadAppState,
    loadSidebarCollapsed,
    loadWorkspaceState,
    saveAppState,
    saveSidebarCollapsed
} from "./state/local-store.js";
import {
    createTrackerProgress,
    getEntry,
    getStoredEntry,
    getTrackerRecord,
    isAnsweredEntry,
    isKnownEntry,
    REVIEWED_FIELD,
    setEntry
} from "./state/tracker-progress.js";

import {
    applyUndo,
    createChangeLog,
    dropChange,
    peekChange,
    pushChange
} from "./state/change-log.js";
import {
    buildTrackerExportFileName,
    exportTrackerCsv,
    importTrackerCsv,
    importTrackerJson
} from "./state/tracker-transfer.js";
import { BESTIARY_STAGES, STAGE_COMPLETE, bestiaryTracker } from "./trackers/bestiary.js";
import { CHARM_STAGES } from "./trackers/charms.js";
import {
    buildInitialFilters,
    getTracker,
    getTrackerEntryDefaults,
    getTrackerIds,
    TRACKERS
} from "./trackers/registry.js";
import { renderAllTabs } from "./ui/render-all-tabs.js";
import { renderDashboard } from "./ui/render-dashboard.js";
import { renderSidebarCharacterMenu, renderSidebarTrackers } from "./ui/render-sidebar.js";
import { escapeText, patchTrackerCard, renderTracker } from "./ui/render-tracker.js";
import { escapeAttribute } from "./ui/render-blocks.js";
import { bookmarkControl, plainText, stageControl, tickControl } from "./ui/render-controls.js";

import { renderPasteBox, renderTransferReview } from "./ui/render-transfer-review.js";
import { closeQuickAdd, isQuickAddOpen, openQuickAdd } from "./ui/render-quick-add.js";
import { buildCharmPlanResultMarkup, renderCharmPlan } from "./ui/render-charm-plan.js";
import { renderComparison } from "./ui/render-comparison.js";
import { renderHuntTabs } from "./ui/render-hunt-tabs.js";
import { renderOpportunities } from "./ui/render-opportunities.js";
import { renderResults } from "./ui/render-results.js";
import { LIBRARY_COLUMNS, renderSessionLibrary } from "./ui/render-session-library.js";
import { renderTaskResults } from "./ui/render-task-results.js";
import { renderTaskSessions } from "./ui/render-task-sessions.js";
import { formatCharmsPerHour, formatNumber, formatTaskRate, formatTimeDetailed } from "./utils/formatters.js";

const elements = {
    appShell: document.querySelector(".app-shell"),
    appSidebar: document.getElementById("appSidebar"),
    sidebarCharacterButton: document.getElementById("sidebarCharacterButton"),
    sidebarCharacterName: document.getElementById("sidebarCharacterName"),
    sidebarCharacterInput: document.getElementById("sidebarCharacterInput"),
    sidebarCharacterMenu: document.getElementById("sidebarCharacterMenu"),
    sidebarRenameButton: document.getElementById("sidebarRenameButton"),
    sidebarDeleteCharacterButton: document.getElementById("sidebarDeleteCharacterButton"),
    sidebarAddCharacterButton: document.getElementById("sidebarAddCharacterButton"),
    sidebarDashboardLink: document.getElementById("sidebarDashboardLink"),
    sidebarSearchLink: document.getElementById("sidebarSearchLink"),
    sidebarTrackerList: document.getElementById("sidebarTrackerList"),
    sidebarPlanningList: document.getElementById("sidebarPlanningList"),
    sidebarExportButton: document.getElementById("sidebarExportButton"),
    sidebarImportButton: document.getElementById("sidebarImportButton"),
    sidebarImportInput: document.getElementById("sidebarImportInput"),
    sidebarRecentChangesButton: document.getElementById("sidebarRecentChangesButton"),
    sidebarClearDataButton: document.getElementById("sidebarClearDataButton"),
    sidebarCollapseButton: document.getElementById("sidebarCollapseButton"),
    sidebarCollapseIcon: document.getElementById("sidebarCollapseIcon"),
    sidebarMenuToggle: document.getElementById("sidebarMenuToggle"),
    sidebarScrim: document.getElementById("sidebarScrim"),
    analysisSection: document.getElementById("analysisSection"),
    clearLogButton: document.getElementById("clearLogButton"),
    compareHuntsButton: document.getElementById("compareHuntsButton"),
    comparisonOutput: document.getElementById("comparisonOutput"),
    comparisonSection: document.getElementById("comparisonSection"),
    detailCloseButton: document.getElementById("detailCloseButton"),
    detailPanel: document.getElementById("detailPanel"),
    detailPanelContent: document.getElementById("detailPanelContent"),
    huntTabStrip: document.getElementById("huntTabStrip"),
    huntWorkspace: document.getElementById("huntWorkspace"),
    huntWorkspaceActions: document.getElementById("huntWorkspaceActions"),
    appAlert: document.getElementById("appAlert"),
    inputSection: document.getElementById("inputSection"),
    respawnModeBlock: document.getElementById("respawnModeBlock"),
    respawnModeHint: document.getElementById("respawnModeHint"),
    sessionRapidButton: document.getElementById("sessionRapidButton"),
    sessionRegularButton: document.getElementById("sessionRegularButton"),
    newSessionButton: document.getElementById("newSessionButton"),
    output: document.getElementById("output"),
    pasteLogButton: document.getElementById("pasteLogButton"),
    processLogButton: document.getElementById("processLogButton"),
    resultsCopy: document.getElementById("resultsCopy"),
    resultsTitle: document.getElementById("resultsTitle"),
    pageDescription: document.getElementById("pageDescription"),
    pageEyebrow: document.getElementById("pageEyebrow"),
    pageTitle: document.getElementById("pageTitle"),
    sessionEditor: document.getElementById("sessionEditor"),
    sessionLog: document.getElementById("sessionLog"),
    sessionToggle: document.getElementById("sessionToggle"),
    sectionHeading: document.querySelector("#analysisSection .section-heading"),
    srStatus: document.getElementById("srStatus"),
    undoBar: document.getElementById("undoBar"),
    workspaceMain: document.getElementById("workspaceMain")
};

const RESPAWN_MODE_HINT = "Records the spawn conditions this Hunt Analyzer was captured under. It changes no calculation.";

const VIEW_CONTENT = {
    allSessions: {
        resultsTitle: "Bestiary Sessions",
        resultsCopy: "A creature analyzed in several sessions appears once per session; keep the hunt whose measured rate you want to use. Combined time adds each session's longest remaining time, and every row reads the same character-wide Bestiary total for that creature."
    },
    charmPlan: {
        resultsTitle: "Charm Points Plan",
        resultsCopy: "Bestiary progress is preserved, but charm points are awarded only when an entry is completed. The plan prioritizes completions that fit your available time."
    },
    tasks: {
        resultsCopy: "Estimated from the kill rate this session recorded."
    },
    session: {
        resultsCopy: "Total kills apply when you leave the field."
    },
    opportunities: {
        resultsTitle: "Opportunities",
        resultsCopy: "Use your Bestiary progress and measured sessions to find quick wins, efficient known hunts, high-value locations, and started entries with no saved rate."
    },
    library: {
        resultsTitle: "Session History",
        resultsCopy: "Every Hunt Analyzer you have stored. Name them, date them, and note the conditions so a rate you recorded months ago still means something."
    }
};

const FIXED_VIEWS = {
    bestiary: ["allSessions", "charmPlan", "opportunities", "library"],
    // In Trackers mode the fixed tabs ARE the trackers.
    trackers: getTrackerIds(),
    tasks: ["library", "allSessions"]
};

const RESPAWN_MODE_LABELS = {
    regular: "Regular",
    rapid: "Rapid Respawn"
};

const RESPAWN_MODE_SHORT_LABELS = {
    regular: "Regular",
    rapid: "Rapid"
};

const state = {
    mode: "dashboard",
    activeHuntId: "",
    characters: [],
    activeCharacterId: "",
    editingCharacterId: "",
    isCharacterMenuOpen: false,
    isSidebarCollapsed: false,
    bestiaryData: [],
    bestiaryView: "session",
    isSessionInputOpen: false,
    // Library sort and filters are view state, not workspace data, so they are
    // deliberately absent from getWorkspaceSnapshot() and the export format.
    librarySort: { key: "label", direction: "asc" },
    libraryFilters: { respawnMode: "all", search: "" },
    // Tracker progress is user data and IS persisted, keyed by tracker id. Sort,
    // filters and paging are view state and are deliberately not.
    trackerProgress: {},
    // The undo trail, persisted with the record.
    changeLog: [],
    trackerItems: {},
    activeTrackerId: bestiaryTracker.id,
    trackerSort: {},
    trackerFilters: {},
    trackerPageSize: 24,
    trackerPageIndex: 0,
    selectedTrackerKey: "",
    // Selection, the keyboard cursor and the pending undo are all view state.
    trackerSelection: new Set(),
    trackerSelectionAnchor: "",
    trackerSelectionMode: false,
    trackerCursorKey: "",
    pendingUndoId: "",
    // "changes" shows the revert history. Empty means a tracker page.
    recordView: "",
    // A pending paste or import, held until the player accepts the review.
    transfer: null,
    excludedAllTabsEntries: [],
    hunts: [],
    ignoredPlanHuntIds: [],
    planRespawnMode: "regular",
    playTimeInput: "",
    tasksView: "session"
};

function getModeView() {
    if (state.mode === "trackers") {
        return state.activeTrackerId;
    }

    if (state.mode === "dashboard") {
        return "dashboard";
    }

    return state.mode === "tasks" ? state.tasksView : state.bestiaryView;
}

function setModeView(view) {
    if (state.mode === "trackers") {
        state.activeTrackerId = view;
        // Paging is per-view, so opening another tracker starts at its first page.
        state.trackerPageIndex = 0;
        return;
    }

    if (state.mode === "tasks") {
        state.tasksView = view;
        return;
    }

    // The Dashboard has no view state of its own to track.
    if (state.mode === "dashboard") {
        return;
    }

    state.bestiaryView = view;
}

function showAlert(message) {
    elements.appAlert.textContent = message;
}

function announce(message) {
    elements.srStatus.textContent = message;
}

function setBusyState(isBusy) {
    elements.processLogButton.disabled = isBusy;
    elements.pasteLogButton.disabled = isBusy;
    elements.clearLogButton.disabled = isBusy;
}

function getActiveHunt() {
    return state.hunts.find((hunt) => hunt.id === state.activeHuntId) || state.hunts[0];
}

function getHuntLabelById(huntId) {
    const index = state.hunts.findIndex((hunt) => hunt.id === huntId);

    return getHuntLabel(index, state.hunts[index]);
}

function getComparableHunts() {
    return state.hunts.filter(hasBestiaryAnalysis);
}

function getWorkspaceSnapshot() {
    return {
        mode: state.mode,
        activeHuntId: state.activeHuntId,
        trackerProgress: state.trackerProgress,
        changeLog: state.changeLog,
        bestiaryView: state.bestiaryView,
        excludedAllTabsEntries: state.excludedAllTabsEntries,
        hunts: state.hunts,
        ignoredPlanHuntIds: state.ignoredPlanHuntIds,
        planRespawnMode: state.planRespawnMode,
        playTimeInput: state.playTimeInput,
        tasksView: state.tasksView
    };
}

function hasWorkspaceContent() {
    return state.hunts.some(huntHasContent);
}

/**
 * A character's own content check: the active character's data lives on the
 * flat `state` fields, everything else sits in its own stored workspace.
 * Sessions and tracker progress are both checked — a character can hold real
 * data (marked Bestiary/tracker entries) with no hunts at all.
 */
function getActiveCharacterIndex() {
    return state.characters.findIndex((character) => character.id === state.activeCharacterId);
}

/** Writes the active character's live state back into its stored slot. */
function snapshotActiveCharacterWorkspace() {
    const index = getActiveCharacterIndex();

    if (index === -1) {
        return;
    }

    state.characters[index].workspace = getWorkspaceSnapshot();
}

function getAppSnapshot() {
    return {
        activeCharacterId: state.activeCharacterId,
        characters: state.characters
    };
}

function persistState() {
    if (!state.characters.length) {
        return;
    }

    snapshotActiveCharacterWorkspace();
    saveAppState(getAppSnapshot());
}

/* --------------------------------------------------------------------------
   Sidebar: character switcher
   -------------------------------------------------------------------------- */

function getActiveCharacter() {
    const index = getActiveCharacterIndex();

    return index === -1 ? null : state.characters[index];
}

/** Every character switch leaves the record flow and any open detail panel behind. */
function leaveCharacterForWorkspace(workspace) {
    applyWorkspace(workspace);
    leaveRecordFlow();
    closeDetailPanel();
}

function switchCharacter(characterId) {
    state.isCharacterMenuOpen = false;

    if (characterId === state.activeCharacterId) {
        renderApp();
        return;
    }

    const nextCharacter = state.characters.find((character) => character.id === characterId);

    if (!nextCharacter) {
        renderApp();
        return;
    }

    captureVisibleInputs();
    snapshotActiveCharacterWorkspace();
    state.activeCharacterId = characterId;
    state.editingCharacterId = "";
    leaveCharacterForWorkspace(nextCharacter.workspace);
    renderApp();
    persistState();
}

function addCharacterFlow() {
    captureVisibleInputs();
    snapshotActiveCharacterWorkspace();

    const { character, characters } = addCharacter(state.characters, "");

    state.characters = characters;
    state.activeCharacterId = character.id;
    state.isCharacterMenuOpen = false;
    state.editingCharacterId = character.id;
    leaveCharacterForWorkspace(character.workspace);
    renderApp();
    persistState();
    elements.sidebarCharacterInput.focus();
}

function deleteCharacterFlow() {
    if (state.characters.length < 2) {
        return;
    }

    const index = getActiveCharacterIndex();
    const label = getCharacterLabel(index, state.characters[index]);

    if (!window.confirm(`Delete ${label}? Every tracker, session and Bestiary total for this character is discarded.`)) {
        return;
    }

    const result = removeCharacter(state.characters, state.activeCharacterId, state.activeCharacterId);
    const nextCharacter = result.characters.find((character) => character.id === result.activeCharacterId);

    state.characters = result.characters;
    state.activeCharacterId = result.activeCharacterId;
    state.isCharacterMenuOpen = false;
    state.editingCharacterId = "";
    leaveCharacterForWorkspace(nextCharacter.workspace);
    renderApp();
    persistState();
}

function startRenameCharacter() {
    const character = getActiveCharacter();

    if (!character) {
        return;
    }

    state.editingCharacterId = character.id;
    state.isCharacterMenuOpen = false;
    renderApp();
    elements.sidebarCharacterInput.focus();
    elements.sidebarCharacterInput.select();
}

function commitRenameCharacter() {
    const character = state.characters.find((candidate) => candidate.id === state.editingCharacterId);

    if (!character) {
        return;
    }

    character.name = elements.sidebarCharacterInput.value.trim();
    state.editingCharacterId = "";
    renderApp();
    persistState();
}

function cancelRenameCharacter() {
    if (!state.editingCharacterId) {
        return;
    }

    state.editingCharacterId = "";
    renderApp();
}

/* --------------------------------------------------------------------------
   Sidebar: data & backup
   -------------------------------------------------------------------------- */

function openRecentChanges() {
    captureVisibleInputs();
    state.mode = "trackers";
    state.recordView = "changes";
    state.selectedTrackerKey = "";
    state.isSessionInputOpen = false;
    closeDetailPanel();
    renderApp();
    persistState();
}

function exportAppData() {
    captureVisibleInputs();
    snapshotActiveCharacterWorkspace();

    const exportedAt = new Date().toISOString();
    const json = serializeAppState(getAppSnapshot(), exportedAt);

    downloadFile(json, buildAppExportFileName(exportedAt), "application/json");
    announce("Exported every character to a JSON file.");
}

function applyImportedAppState(resolved) {
    state.characters = resolved.characters;
    state.activeCharacterId = resolved.activeCharacterId;
    state.editingCharacterId = "";
    state.isCharacterMenuOpen = false;

    const active = state.characters.find((character) => character.id === state.activeCharacterId)
        || state.characters[0];

    leaveCharacterForWorkspace(active.workspace);
    renderApp();
    persistState();
    announce("Import complete.");
}

function importAppData(file) {
    const reader = new FileReader();

    reader.onload = () => {
        let parsed;

        try {
            parsed = parseAppWorkspaceFile(String(reader.result ?? ""));
        } catch (error) {
            showAlert(error.message || "Could not read that file.");
            return;
        }

        if (!window.confirm("Importing replaces every character currently saved in this browser. Continue?")) {
            return;
        }

        const resolved = restoreAppWorkspace(parsed);

        if (!resolved) {
            showAlert("That file has no characters to import.");
            return;
        }

        applyImportedAppState(resolved);
    };

    reader.onerror = () => showAlert("Could not read that file.");
    reader.readAsText(file);
}

function clearAllDataFlow() {
    if (!window.confirm("Clear all data? Every character, tracker record and session stored in this browser is permanently deleted. This cannot be undone.")) {
        return;
    }

    clearAllStoredState();

    const character = createDefaultCharacter();

    state.characters = [character];
    state.activeCharacterId = character.id;
    state.editingCharacterId = "";
    state.isCharacterMenuOpen = false;
    leaveCharacterForWorkspace(character.workspace);
    renderApp();
    persistState();
    announce("All data cleared.");
}

/* --------------------------------------------------------------------------
   Sidebar: collapse (desktop) and drawer (mobile)
   -------------------------------------------------------------------------- */

function setSidebarCollapsed(isCollapsed) {
    state.isSidebarCollapsed = isCollapsed;
    elements.appShell.classList.toggle("sidebar-collapsed", isCollapsed);
    elements.sidebarCollapseButton.setAttribute("aria-expanded", String(!isCollapsed));
    elements.sidebarCollapseButton.setAttribute("aria-label", isCollapsed ? "Expand sidebar" : "Collapse sidebar");
    elements.sidebarCollapseIcon.textContent = isCollapsed ? "left_panel_open" : "left_panel_close";
    saveSidebarCollapsed(isCollapsed);
}

function setSidebarOpen(isOpen) {
    elements.appSidebar.classList.toggle("is-open", isOpen);
    elements.sidebarScrim.hidden = !isOpen;
    elements.sidebarMenuToggle.setAttribute("aria-expanded", String(isOpen));
}

/**
 * Reads every visible total-kills field into the canonical progress record.
 * Editing the number anywhere is editing your Bestiary, so all sessions that
 * feature the creature update together.
 */
function commitVisibleTotalKills() {
    elements.output.querySelectorAll(".kills-input").forEach((input) => {
        setEntry(state.trackerProgress, "bestiary", input.dataset.monsterName, bestiaryTracker.entryDefaults, {
            kills: input.value
        });
    });
}

/**
 * Bestiary total kills are a property of the player, not of a session, so every
 * session reads the same canonical record. The arithmetic in recalculateProgress
 * is untouched — only the source of its totalKills argument.
 */
function getBestiaryKills(creatureName) {
    const creature = getTrackerItems(bestiaryTracker).find((item) => item.Name === creatureName);
    const entry = getEntry(state.trackerProgress, "bestiary", creatureName, bestiaryTracker.entryDefaults);

    if (!creature) {
        return entry.kills;
    }

    // A tile the player picked implies a kill floor, and that floor is a better
    // input than zero. deriveBestiaryRow owns the mapping, so there is one place
    // where a stage becomes a number.
    return bestiaryTracker.derive(creature, entry).kills;
}

function buildBestiaryTotalKills(creatureNames) {
    return creatureNames.reduce((totals, creatureName) => {
        totals[creatureName] = getBestiaryKills(creatureName);
        return totals;
    }, {});
}

function commitAllHuntProgress() {
    state.hunts.forEach(commitHuntProgress);
}

function commitHuntProgress(hunt) {
    const { monsters, selectedMonsterNames } = calculateBestiaryResult(hunt);

    hunt.matchedMonsters = monsters;
    hunt.selectedBestiaryMonsterNames = selectedMonsterNames;
}

function captureActiveHuntInputs() {
    const hunt = getActiveHunt();

    if (!hunt || state.mode !== "bestiary" || getModeView() !== "session") {
        return;
    }

    hunt.sessionLog = elements.sessionLog.value;

    commitVisibleTotalKills();
    commitAllHuntProgress();
}

function captureAllTabsInputs() {
    if (state.mode !== "bestiary" || getModeView() !== "allSessions") {
        return;
    }

    // Bestiary Sessions shows one row per session, but the totals behind them are a
    // single per-creature fact, so the hunt id on the field no longer matters.
    commitVisibleTotalKills();
    commitAllHuntProgress();
}

function captureTaskInputs() {
    const hunt = getActiveHunt();

    if (!hunt || state.mode !== "tasks" || getModeView() !== "session") {
        return;
    }

    hunt.sessionLog = elements.sessionLog.value;

    const taskTargetInput = document.getElementById("taskTotalKills");
    if (taskTargetInput) {
        hunt.taskTargetKills = taskTargetInput.value;
    }
}

function captureVisibleInputs() {
    if (state.mode === "trackers") {
        captureTrackerInputs();
        return;
    }

    if (state.mode === "tasks") {
        captureTaskInputs();
        return;
    }

    if (getModeView() === "allSessions") {
        captureAllTabsInputs();
        return;
    }

    captureActiveHuntInputs();
}

/**
 * Bestiary totals are a property of the player, not of a session. Every session
 * reads the same canonical record, so a creature that appears in three logs can
 * no longer hold three disagreeing totals.
 *
 * The arithmetic in recalculateProgress is untouched — only the source of its
 * totalKills argument changed.
 */
/**
 * Which creatures' totals come from a tile rather than a typed count. The session
 * table qualifies those readings with "at most", because a tile says the entry sits
 * between two thresholds and claiming a precise remaining count would overstate what
 * the player actually read.
 */
function markKillFloors(monsters) {
    monsters.forEach((monster) => {
        const entry = getEntry(state.trackerProgress, "bestiary", monster.name, bestiaryTracker.entryDefaults);
        const creature = getTrackerItems(bestiaryTracker).find((item) => item.Name === monster.name);

        monster.typedKills = entry.kills || "";
        monster.isKillFloor = Boolean(creature) && bestiaryTracker.derive(creature, entry).isFloor;
    });

    return monsters;
}

function calculateBestiaryResult(hunt) {
    const monsters = recalculateProgress(
        hunt.matchedMonsters,
        state.bestiaryData,
        hunt.sessionDuration,
        buildBestiaryTotalKills(hunt.matchedMonsters.map((monster) => monster.name))
    );

    markKillFloors(monsters);

    const availableMonsterNames = new Set(monsters.map((monster) => monster.name));
    const selectedMonsterNames = hunt.selectedBestiaryMonsterNames
        .filter((monsterName) => availableMonsterNames.has(monsterName));
    const selectedNameSet = new Set(selectedMonsterNames);
    const selectedMonsters = monsters.filter((monster) => selectedNameSet.has(monster.name));

    return {
        monsters,
        selectedMonsterNames,
        selectedMonsters,
        summary: summarizeBestiaryMonsters(selectedMonsters)
    };
}

function calculateAllTabsResult() {
    const huntEntries = state.hunts
        .map((hunt, index) => ({ hunt, label: getHuntLabel(index, hunt) }))
        .filter((huntEntry) => hasBestiaryAnalysis(huntEntry.hunt))
        .map((huntEntry) => ({
            id: huntEntry.hunt.id,
            label: huntEntry.label,
            monsters: calculateBestiaryResult(huntEntry.hunt).selectedMonsters
        }))
        .filter((huntEntry) => huntEntry.monsters.length > 0);
    const analysis = buildAllTabsAnalysis(huntEntries, state.excludedAllTabsEntries);
    const huntSummaries = analysis.participatingHunts
        .map((participatingHunt) => summarizeBestiaryMonsters(participatingHunt.selectedMonsters));

    return {
        analysis,
        summary: aggregateAllTabsSummary(huntSummaries)
    };
}

function isHuntAvailableForPlan(huntId) {
    return !state.ignoredPlanHuntIds.includes(huntId);
}

function getProcessedSessions() {
    return state.hunts
        .map((hunt, index) => ({ hunt, id: hunt.id, label: getHuntLabel(index, hunt) }))
        .filter((session) => hasBestiaryAnalysis(session.hunt));
}

function matchesPlanRespawnMode(hunt) {
    return hunt.respawnMode === state.planRespawnMode;
}

function isHuntEligibleForPlan(hunt) {
    return isHuntAvailableForPlan(hunt.id) && matchesPlanRespawnMode(hunt);
}

function getCharmPlanView() {
    const { analysis } = calculateAllTabsResult();
    const consideredSessions = getProcessedSessions().map((session) => ({
        id: session.id,
        label: session.label,
        respawnModeLabel: RESPAWN_MODE_SHORT_LABELS[session.hunt.respawnMode],
        isAvailable: isHuntAvailableForPlan(session.id),
        matchesPlanMode: matchesPlanRespawnMode(session.hunt)
    }));
    const eligibleHuntIds = new Set(state.hunts.filter(isHuntEligibleForPlan).map((hunt) => hunt.id));
    const huntGroups = analysis.participatingHunts
        .filter((participatingHunt) => eligibleHuntIds.has(participatingHunt.id))
        .map((participatingHunt) => ({
            id: participatingHunt.id,
            label: participatingHunt.label,
            monsters: participatingHunt.selectedMonsters
        }));
    const availableMinutes = parsePlayTimeMinutes(state.playTimeInput);

    return {
        playTimeValue: state.playTimeInput,
        planRespawnMode: state.planRespawnMode,
        planRespawnModeLabel: RESPAWN_MODE_LABELS[state.planRespawnMode],
        consideredSessions,
        hasAnalyzedHunts: consideredSessions.length > 0,
        hasModeMatchedHunts: consideredSessions.some((session) => session.matchesPlanMode),
        hasEligibleHunts: huntGroups.length > 0,
        plan: availableMinutes === null || !huntGroups.length
            ? null
            : planCharmTime(huntGroups, availableMinutes)
    };
}

function getCharmPlanTabMeta(planView) {
    if (planView.hasAnalyzedHunts && !planView.hasEligibleHunts) {
        return "None eligible";
    }

    return planView.plan ? `+${formatNumber(planView.plan.charms)} charm points` : "No play time";
}

function updateCharmPlanResult() {
    const planResult = document.getElementById("charmPlanResult");

    if (!planResult) {
        return;
    }

    const planView = getCharmPlanView();
    const planTabMeta = elements.huntTabStrip
        .querySelector('[data-fixed-select="charmPlan"] .hunt-tab-meta');

    planResult.innerHTML = buildCharmPlanResultMarkup(planView);
    attachPlanHuntLinks();

    if (planTabMeta) {
        planTabMeta.textContent = getCharmPlanTabMeta(planView);
    }
}

function normalizeView() {
    if (state.bestiaryView === "comparison" && getComparableHunts().length < 2) {
        state.bestiaryView = "session";
    }
}

function setEmptyOutput() {
    elements.output.className = "empty-state";
    elements.output.innerHTML = state.mode === "tasks"
        ? `
            <strong>No task estimate yet.</strong>
            <span>Process a Hunt Analyzer to select a creature and project the time remaining.</span>
        `
        : `
            <strong>No analysis yet.</strong>
            <span>Process a Hunt Analyzer to view matched creatures, time remaining, and charm rate.</span>
        `;
}

function renderBestiaryMode(hunt) {
    const { monsters, selectedMonsterNames, summary } = calculateBestiaryResult(hunt);

    commitHuntProgress(hunt);

    renderResults(elements.output, monsters, selectedMonsterNames, summary);
    attachResultActions();
}

function getTaskEstimateForHunt(hunt) {
    return calculateTaskEstimate(
        hunt.taskMonsters,
        hunt.selectedTaskMonsterName,
        hunt.sessionDuration,
        hunt.taskTargetKills
    );
}

function getBestiaryTabMeta(hunt) {
    return hasBestiaryAnalysis(hunt)
        ? formatCharmsPerHour(calculateBestiaryResult(hunt).summary.totalCharmsPerHour)
        : "No analysis";
}

function getTaskTabMeta(hunt) {
    if (!hasTaskAnalysis(hunt)) {
        return "No analysis";
    }

    const estimate = getTaskEstimateForHunt(hunt);

    return estimate.selectedMonster
        ? formatTaskRate(estimate.killRatePerHour)
        : `${formatNumber(hunt.taskMonsters.length)} creatures`;
}

function getOpportunityTabMeta() {
    const { totals } = getOpportunityAnalysis();

    return `${formatNumber(totals.charmsUnclaimed)} unclaimed`;
}

function buildLibraryTab(view) {
    return {
        key: "library",
        label: "Session History",
        meta: `${formatNumber(state.hunts.length)} ${state.hunts.length === 1 ? "session" : "sessions"}`,
        isActive: view === "library"
    };
}

function buildFixedTabs(view) {
    if (state.mode === "trackers") {
        return TRACKERS.map((tracker) => ({
            key: tracker.id,
            label: tracker.label,
            meta: tracker.tabMeta(buildTrackerRows(tracker)),
            isActive: view === tracker.id
        }));
    }

    if (state.mode === "tasks") {
        const processedCount = state.hunts.filter(hasTaskAnalysis).length;

        return [
            buildLibraryTab(view),
            {
                key: "allSessions",
                label: "Task Sessions",
                meta: processedCount
                    ? `${formatNumber(processedCount)} processed`
                    : "No analysis",
                isActive: view === "allSessions"
            }
        ];
    }

    const { analysis, summary } = calculateAllTabsResult();
    const planView = getCharmPlanView();

    return [
        {
            key: "allSessions",
            label: "Bestiary Sessions",
            meta: analysis.rows.length ? formatCharmsPerHour(summary.charmRate) : "No analysis",
            isActive: view === "allSessions"
        },
        {
            key: "charmPlan",
            label: "Charm Points Plan",
            meta: getCharmPlanTabMeta(planView),
            isActive: view === "charmPlan"
        },
        {
            key: "opportunities",
            label: "Opportunities",
            meta: getOpportunityTabMeta(),
            isActive: view === "opportunities"
        },
        buildLibraryTab(view)
    ];
}

function applySessionInput(hunt, creatureCount) {
    const canCollapse = hunt.hasProcessedLog;
    const isOpen = !canCollapse || state.isSessionInputOpen;

    elements.respawnModeBlock.hidden = false;
    elements.respawnModeHint.textContent = RESPAWN_MODE_HINT;
    elements.sessionRegularButton.classList.toggle("is-selected", hunt.respawnMode === "regular");
    elements.sessionRapidButton.classList.toggle("is-selected", hunt.respawnMode === "rapid");
    elements.sessionRegularButton.setAttribute("aria-pressed", String(hunt.respawnMode === "regular"));
    elements.sessionRapidButton.setAttribute("aria-pressed", String(hunt.respawnMode === "rapid"));
    elements.sessionLog.value = hunt.sessionLog;

    elements.sessionToggle.hidden = !canCollapse;
    elements.sessionToggle.setAttribute("aria-expanded", String(isOpen));
    elements.sessionToggle.textContent = isOpen
        ? "Hide Hunt Analyzer"
        : [
            getHuntLabelById(hunt.id),
            formatTimeDetailed(hunt.sessionDuration),
            `${formatNumber(creatureCount)} ${creatureCount === 1 ? "creature" : "creatures"}`,
            RESPAWN_MODE_LABELS[hunt.respawnMode]
        ].join(" · ");
    elements.sessionEditor.hidden = !isOpen;
}

function renderHuntTabStrip() {
    const view = getModeView();
    const isBestiary = state.mode === "bestiary";
    // Trackers are not session-scoped, so the strip carries only tracker tabs —
    // no session tabs and no "add session" control.
    const isTrackers = state.mode === "trackers";
    const huntTabs = isTrackers ? [] : state.hunts.map((hunt, index) => ({
        id: hunt.id,
        label: getHuntLabel(index, hunt),
        meta: [
            isBestiary ? getBestiaryTabMeta(hunt) : getTaskTabMeta(hunt),
            hunt.hasProcessedLog ? RESPAWN_MODE_SHORT_LABELS[hunt.respawnMode] : ""
        ].filter(Boolean).join(" · "),
        isActive: view === "session" && hunt.id === state.activeHuntId
    }));
    const isComparing = view === "comparison";

    renderHuntTabs(elements.huntTabStrip, buildFixedTabs(view), huntTabs, { canAdd: !isTrackers });
    attachHuntTabActions();

    elements.huntWorkspaceActions.hidden = !isBestiary;
    elements.compareHuntsButton.disabled = getComparableHunts().length < 2;
    elements.compareHuntsButton.classList.toggle("is-selected", isComparing);
    elements.compareHuntsButton.setAttribute("aria-pressed", String(isComparing));
}

function renderHuntView() {
    const hunt = getActiveHunt();
    const huntLabel = getHuntLabelById(hunt.id);

    elements.comparisonSection.hidden = true;
    elements.inputSection.hidden = false;
    elements.analysisSection.hidden = false;
    applySessionInput(hunt, hunt.matchedMonsters.length);
    showSectionHeading(`${huntLabel} Analysis`, VIEW_CONTENT.session.resultsCopy);

    if (hunt.matchedMonsters.length || hunt.hasProcessedLog) {
        renderBestiaryMode(hunt);
        return;
    }

    setEmptyOutput();
}

function renderAllTabsView() {
    const { analysis, summary } = calculateAllTabsResult();

    elements.comparisonSection.hidden = true;
    elements.inputSection.hidden = true;
    elements.analysisSection.hidden = false;
    showSectionHeading(VIEW_CONTENT.allSessions.resultsTitle, VIEW_CONTENT.allSessions.resultsCopy);

    renderAllTabs(elements.output, analysis, summary);
    attachAllTabsActions();
}

function renderCharmPlanView() {
    elements.comparisonSection.hidden = true;
    elements.inputSection.hidden = true;
    elements.analysisSection.hidden = false;
    showSectionHeading(VIEW_CONTENT.charmPlan.resultsTitle, VIEW_CONTENT.charmPlan.resultsCopy);

    renderCharmPlan(elements.output, getCharmPlanView());
    attachCharmPlanActions();
    attachPlanHuntLinks();
}

function renderComparisonView() {
    const comparison = buildHuntComparison(state.hunts.map((hunt, index) => ({
        id: hunt.id,
        label: getHuntLabel(index, hunt),
        summary: hasBestiaryAnalysis(hunt) ? calculateBestiaryResult(hunt).summary : null
    })));

    elements.inputSection.hidden = true;
    elements.analysisSection.hidden = true;
    elements.comparisonSection.hidden = false;

    renderComparison(elements.comparisonOutput, comparison);
}

function renderTaskSessionView() {
    const hunt = getActiveHunt();
    const huntLabel = getHuntLabelById(hunt.id);
    const estimate = getTaskEstimateForHunt(hunt);

    elements.comparisonSection.hidden = true;
    elements.inputSection.hidden = false;
    elements.analysisSection.hidden = false;
    applySessionInput(hunt, hunt.taskMonsters.length);
    showSectionHeading(`${huntLabel} Task Estimate`, VIEW_CONTENT.tasks.resultsCopy);

    if (!hasTaskAnalysis(hunt) && !hunt.hasProcessedLog) {
        setEmptyOutput();
        return;
    }

    renderTaskResults(
        elements.output,
        hunt.taskMonsters,
        estimate,
        hunt.sessionDuration,
        RESPAWN_MODE_LABELS[hunt.respawnMode]
    );
    attachTaskActions();
}

/* --------------------------------------------------------------------------
   Bestiary manager
   -------------------------------------------------------------------------- */


/* --------------------------------------------------------------------------
   Trackers
   -------------------------------------------------------------------------- */

/**
 * Datasets load once at boot, in registry order, and each loader is handed what
 * has loaded already — which is how the Cyclopedia Map subareas pick up their
 * Bestiary creature counts without fetching bestiary.json a second time.
 *
 * Bestiary itself reuses the copy the session analysis already needs.
 */
async function loadTrackerItems(bestiaryData) {
    const loaded = { bestiary: bestiaryData };

    for (const tracker of TRACKERS) {
        if (!loaded[tracker.id]) {
            loaded[tracker.id] = await tracker.loadItems(loaded);
        }
    }

    return loaded;
}

/**
 * Some progress is a consequence of another tracker: completing every subarea of
 * a Cyclopedia Map area earns that area's achievement, so the Achievements
 * tracker should show it without the user recording it twice.
 *
 * One level only — a tracker that supplies derived keys must not itself consume
 * them, which keeps this a single pass with no cycle to resolve.
 */
function getExternalDoneKeys(trackerId) {
    return TRACKERS.reduce((keys, tracker) => {
        if (tracker.derivesFor === trackerId && tracker.deriveExternalDone) {
            tracker.deriveExternalDone(buildTrackerRows(tracker, {})).forEach((key) => keys.add(key));
        }

        return keys;
    }, new Set());
}

/** Drops out of the record landing or a unit screen back to plain browsing. */

/** Any navigation leaves a transient surface — the change list, a pending import. */
function leaveRecordFlow() {
    state.recordView = "";
    state.transfer = null;
    state.trackerSelection.clear();
    state.trackerSelectionAnchor = "";
    state.trackerSelectionMode = false;
}

function selectTracker(trackerId) {
    if (!getTracker(trackerId)) {
        return;
    }

    state.activeTrackerId = trackerId;
    state.trackerPageIndex = 0;
    leaveRecordFlow();
    renderApp();
    persistState();
}

function getActiveTracker() {
    return getTracker(state.activeTrackerId);
}

/** Sort and filter state is created per tracker on first use, from its facets. */
function getTrackerSort(tracker) {
    if (!state.trackerSort[tracker.id]) {
        state.trackerSort[tracker.id] = {
            key: tracker.defaultSortKey ?? tracker.sortOptions?.[0]?.key ?? "name",
            direction: "asc"
        };
    }

    return state.trackerSort[tracker.id];
}

function getTrackerFilters(tracker) {
    if (!state.trackerFilters[tracker.id]) {
        state.trackerFilters[tracker.id] = buildInitialFilters(tracker);
    }

    return state.trackerFilters[tracker.id];
}

function getTrackerItems(tracker) {
    return state.trackerItems[tracker.id] ?? [];
}

function entryFor(tracker, item) {
    return getEntry(state.trackerProgress, tracker.id, tracker.itemKey(item), tracker.entryDefaults);
}

/**
 * What one tracker needs to know about the others. Two kinds so far, both
 * one-directional and one level deep:
 *
 *   externalDone — keys another tracker has already satisfied (a completed
 *                  Cyclopedia Map area earns its achievement)
 *   budget       — a scalar another tracker produces and this one spends
 *                  (charms are bought with Bestiary charm points)
 */
function getTrackerContext(tracker) {
    return {
        externalDone: tracker.consumesDerived ? getExternalDoneKeys(tracker.id) : null,
        budget: tracker.consumesBudgetFrom ? getTrackerBudget(tracker.consumesBudgetFrom) : null
    };
}

function getTrackerBudget(providerId) {
    const provider = getTracker(providerId);

    return provider?.providesBudget ? provider.providesBudget(buildTrackerRows(provider, {})) : null;
}

/**
 * Every row is answered, a confirmed zero, or unknown — the three-state model.
 * `answered` comes from the entry, `known` adds the unit the player has read, and
 * the tracker's own derive never has to think about either.
 */
function buildTrackerRows(tracker, context) {
    const resolved = context ?? getTrackerContext(tracker);

    return getTrackerItems(tracker).map((item) => {
        const entry = entryFor(tracker, item);
        const row = tracker.derive(item, entry, resolved);

        row.answered = row.answered ?? isAnsweredEntry(tracker.entryDefaults, entry);
        row.known = row.answered || isKnownEntry(tracker.entryDefaults, entry);
        row.reviewed = Boolean(entry[REVIEWED_FIELD]);

        return row;
    });
}

function filterTrackerRows(tracker, rows) {
    const filters = getTrackerFilters(tracker);

    return rows.filter((row) => tracker.facets.every((facet) => {
        const value = filters[facet.key];

        if (facet.kind === "check") {
            return !value || facet.matches(row, value);
        }

        if (facet.kind === "search") {
            return !String(value).trim() || facet.matches(row, value);
        }

        return value === "all" || facet.matches(row, value);
    }));
}

function sortTrackerRows(tracker, rows) {
    const { key, direction } = getTrackerSort(tracker);
    const column = (tracker.sortOptions ?? []).find((candidate) => candidate.key === key)
        ?? (tracker.sortOptions ?? [])[0]
        ?? { key: "name" };
    const factor = direction === "desc" ? -1 : 1;
    // Booleans and counters both sort numerically; only labels sort as text.
    const numeric = column.isNumeric || typeof rows[0]?.[key] === "number" || typeof rows[0]?.[key] === "boolean";

    return [...rows].sort((left, right) => {
        const a = numeric ? Number(left[key]) || 0 : String(left[key] ?? "").toLowerCase();
        const b = numeric ? Number(right[key]) || 0 : String(right[key] ?? "").toLowerCase();

        if (a === b) {
            return left.name.localeCompare(right.name) * factor;
        }

        return (a < b ? -1 : 1) * factor;
    });
}

/**
 * Hundreds of rows re-render on every keystroke in a count field, so the default
 * page size is a deliberate performance guard rather than a nicety.
 */
function paginateTrackerRows(rows) {
    const size = state.trackerPageSize;

    if (!size) {
        return { rows, page: { from: rows.length ? 1 : 0, to: rows.length, total: rows.length, size, index: 0, lastIndex: 0 } };
    }

    const lastIndex = Math.max(0, Math.ceil(rows.length / size) - 1);
    const index = Math.min(state.trackerPageIndex, lastIndex);

    state.trackerPageIndex = index;

    const start = index * size;
    const pageRows = rows.slice(start, start + size);

    return {
        rows: pageRows,
        page: { from: rows.length ? start + 1 : 0, to: start + pageRows.length, total: rows.length, size, index, lastIndex }
    };
}

function getTrackerView(tracker) {
    const context = getTrackerContext(tracker);
    const allRows = buildTrackerRows(tracker, context);
    const visible = sortTrackerRows(tracker, filterTrackerRows(tracker, allRows));
    const { rows, page } = paginateTrackerRows(visible);

    return {
        tracker,
        rows,
        page,
        sort: getTrackerSort(tracker),
        filters: getTrackerFilters(tracker),
        items: getTrackerItems(tracker),
        totals: tracker.totals(allRows, context),
        selectedKey: state.selectedTrackerKey,
        selection: state.trackerSelection,
        selectionMode: state.trackerSelectionMode,
        bulkActions: getBulkActions(tracker)
    };
}

function closeDetailPanel() {
    state.selectedTrackerKey = "";
    elements.detailPanel.hidden = true;
    elements.appShell.classList.remove("has-detail");
}

function formatDetailRecordedAt(trackerId, itemKey) {
    const change = state.changeLog.find((candidate) => candidate.trackerId === trackerId
        && Object.prototype.hasOwnProperty.call(candidate.entries ?? {}, itemKey));

    if (!change?.at) {
        return "Never";
    }

    const recordedAt = new Date(change.at);

    if (Number.isNaN(recordedAt.getTime())) {
        return "Never";
    }

    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(recordedAt);
}

function renderBestiaryDetail(row) {
    const item = getTrackerItems(bestiaryTracker)
        .find((creature) => bestiaryTracker.itemKey(creature) === row.key);
    const locations = item?.Locations || "No locations listed";
    const locationItems = locations.split(/,\s*/).filter(Boolean);
    const progressPercent = row.progress * 100;
    const progressLabel = `${progressPercent.toFixed(1)}%`;

    elements.detailPanelContent.innerHTML = `
        <header class="detail-header">
            <h2 class="detail-title"><span class="material-symbols-outlined" aria-hidden="true">pets</span>${escapeText(row.name)}</h2>
            <p class="detail-header-meta">${escapeText(row.className)} <span aria-hidden="true">·</span> ${formatNumber(row.charms)} charm points</p>
        </header>

        <section class="detail-group">
            <h3 class="detail-group-title">Progress</h3>
            <div class="detail-kills-row">
                <label class="detail-kills-field">
                    <span>Kills</span>
                    <input
                        class="detail-kills-input"
                        type="number"
                        min="0"
                        max="${row.unlockTarget}"
                        inputmode="numeric"
                        value="${row.kills || ""}"
                        aria-describedby="detailKillsTarget"
                    >
                </label>
                <span class="detail-kills-target" id="detailKillsTarget">of ${formatNumber(row.unlockTarget)}</span>
            </div>
            <div class="detail-progress" role="progressbar" aria-label="Bestiary progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progressPercent.toFixed(1)}"><span style="width:${progressPercent}%"></span></div>
            <div class="detail-progress-meta">
                <span data-detail-progress-percent>${progressLabel}</span>
                <span data-detail-kills-left>${formatNumber(row.killsLeft)} remaining</span>
            </div>
        </section>

        <section class="detail-group">
            <h3 class="detail-group-title">Charm points</h3>
            <p class="detail-value">${formatNumber(row.charms)}</p>
        </section>

        <section class="detail-group">
            <h3 class="detail-group-title">Locations</h3>
            <ul class="detail-location-list">
                ${locationItems.map((location) => `<li>${escapeText(location)}</li>`).join("")}
            </ul>
        </section>

        <section class="detail-group">
            <h3 class="detail-group-title">Tracking</h3>
            <div class="detail-checks">
                ${row.echoWardenEligible ? `<label class="detail-check"><input type="checkbox" data-detail-flag="echoWarden" ${row.echoWarden ? "checked" : ""}><span>Echo Warden</span></label>` : ""}
                <label class="detail-check"><input type="checkbox" data-detail-flag="animusMastery" ${row.animusMastery ? "checked" : ""}><span>Animus Mastery</span></label>
                <label class="detail-check"><input type="checkbox" data-detail-flag="bookmark" ${row.bookmark ? "checked" : ""}><span>Bookmarked</span></label>
            </div>
        </section>

        <section class="detail-group">
            <h3 class="detail-group-title">Actions</h3>
            <div class="detail-actions">
                <button class="btn btn-secondary detail-action" type="button" id="detailSessionsButton"><span class="material-symbols-outlined" aria-hidden="true">monitoring</span><span>View measured sessions</span></button>
                <a class="btn btn-secondary detail-action" href="${row.wikiLink}" target="_blank" rel="noreferrer"><span class="material-symbols-outlined" aria-hidden="true">open_in_new</span><span>Open Tibia Wiki</span><span class="material-symbols-outlined detail-action-tail" aria-hidden="true">north_east</span></a>
            </div>
            <p class="detail-last-recorded">Last recorded: ${escapeText(formatDetailRecordedAt(bestiaryTracker.id, row.key))}</p>
        </section>
    `;

    const killsInput = elements.detailPanelContent.querySelector(".detail-kills-input");
    let killsDirty = false;

    const previewKills = () => {
        const entered = Number.parseInt(killsInput.value, 10) || 0;
        const kills = Math.min(row.unlockTarget, Math.max(0, entered));
        const percent = row.unlockTarget > 0 ? (kills / row.unlockTarget) * 100 : 0;
        const remaining = Math.max(0, row.unlockTarget - kills);
        const bar = elements.detailPanelContent.querySelector(".detail-progress");

        bar?.setAttribute("aria-valuenow", percent.toFixed(1));
        bar?.querySelector("span")?.style.setProperty("width", `${percent}%`);
        elements.detailPanelContent.querySelector("[data-detail-progress-percent]").textContent = `${percent.toFixed(1)}%`;
        elements.detailPanelContent.querySelector("[data-detail-kills-left]").textContent = `${formatNumber(remaining)} remaining`;
    };

    killsInput?.addEventListener("input", () => {
        killsDirty = true;
        previewKills();
    });

    killsInput?.addEventListener("focusout", () => {
        if (!killsDirty) {
            return;
        }

        const entered = Number.parseInt(killsInput.value, 10) || 0;
        const next = Math.min(row.unlockTarget, Math.max(0, entered));
        const previous = Number.parseInt(
            getEntry(state.trackerProgress, bestiaryTracker.id, row.key, bestiaryTracker.entryDefaults).kills,
            10
        ) || 0;

        if (next === previous) {
            return;
        }

        const change = writeTrackerEntries(bestiaryTracker, [row.key], () => ({ kills: next }), {
            kind: "entry",
            label: `${row.name} ${previous} → ${next}`
        });

        refreshTrackerRow(bestiaryTracker, row.key);
        showUndo(change);

        const updated = buildTrackerRows(bestiaryTracker)
            .find((candidate) => candidate.key === row.key);

        if (updated) {
            renderBestiaryDetail(updated);
        }
    });

    killsInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            killsInput.blur();
        }

        if (event.key === "Escape") {
            event.preventDefault();
            killsDirty = false;
            killsInput.value = row.kills || "";
            previewKills();
            killsInput.blur();
        }
    });

    elements.detailPanelContent.querySelectorAll("[data-detail-flag]").forEach((input) => {
        input.addEventListener("change", () => {
            const field = input.dataset.detailFlag;
            const current = getEntry(
                state.trackerProgress,
                bestiaryTracker.id,
                row.key,
                bestiaryTracker.entryDefaults
            )[field];
            const change = writeTrackerEntries(bestiaryTracker, [row.key], () => ({ [field]: !current }), {
                kind: "entry",
                label: `${row.name} ${field === "bookmark" ? (current ? "unbookmarked" : "bookmarked") : (current ? "cleared" : "marked")}`
            });

            refreshTrackerRow(bestiaryTracker, row.key);

            if (field !== "bookmark") {
                showUndo(change);
            }

            const updated = buildTrackerRows(bestiaryTracker)
                .find((candidate) => candidate.key === row.key);

            if (updated) {
                renderBestiaryDetail(updated);
            }
        });
    });

    document.getElementById("detailSessionsButton")?.addEventListener("click", () => {
        closeDetailPanel();
        state.mode = "bestiary";
        state.bestiaryView = "allSessions";
        renderApp();
        persistState();
    });
}

const TRACKER_DETAIL_ICONS = {
    achievements: "trophy",
    bosstiary: "skull",
    charms: "auto_awesome",
    measuringTibia: "straighten",
    quests: "account_tree",
    titles: "workspace_premium"
};

/** The affirmative verb each tracker's single-button tick control asserts. */
const TICK_YES_LABELS = {
    achievements: "Earned",
    measuringTibia: "Discovered",
    quests: "Completed",
    titles: "Earned"
};

/** The header's one-line meta, tailored to what each tracker's row actually has. */
function buildDetailMeta(tracker, row) {
    if (tracker.id === "bosstiary") {
        return `${row.category} · ${formatNumber(row.pointsEarned)} of ${formatNumber(row.totalPoints)} boss points`;
    }

    if (tracker.id === "charms") {
        return `${row.type} charm · spends ${row.currencyLabel}`;
    }

    if (tracker.id === "achievements") {
        return row.rarityLabel ? `${row.categoryLabel} · ${row.rarityLabel}` : row.categoryLabel;
    }

    if (tracker.id === "quests") {
        return row.questlog || "Ungrouped";
    }

    if (tracker.id === "titles") {
        return row.isPermanent ? "Permanent" : "Losable";
    }

    if (tracker.id === "measuringTibia") {
        return row.area;
    }

    return tracker.label;
}

function buildDetailInfoGroup(title, value) {
    if (!value) {
        return "";
    }

    return `
        <section class="detail-group">
            <h3 class="detail-group-title">${escapeText(title)}</h3>
            <p class="detail-value">${value}</p>
        </section>
    `;
}

function buildDetailStageList(items) {
    return `
        <ul class="detail-stage-list">
            ${items.map((item) => `
                <li class="${item.isDone ? "is-done" : ""}">
                    <span class="material-symbols-outlined" aria-hidden="true">${item.isDone ? "check_circle" : "radio_button_unchecked"}</span>
                    <span>${escapeText(item.label)}</span>
                    <span class="row-aside">${item.meta}</span>
                </li>
            `).join("")}
        </ul>
    `;
}

function buildDetailGroupHtml(title, innerHtml) {
    return `
        <section class="detail-group">
            <h3 class="detail-group-title">${escapeText(title)}</h3>
            ${innerHtml}
        </section>
    `;
}

/**
 * The one or two groups particular to this tracker, beyond the shared shell.
 * Every stage/points/completion figure here is read straight off the row
 * (or, for cross-item context like a questlog or map area, off other rows
 * from the same buildTrackerRows() pass) rather than recomputed — so this
 * can never disagree with the grid or the tracker's own totals.
 */
function buildDetailInfoGroups(tracker, row) {
    if (tracker.id === "bosstiary") {
        const stageList = buildDetailStageList(row.stages.map((stage, index) => ({
            label: stage.label,
            meta: `${formatNumber(stage.kills)} kills · ${formatNumber(stage.points)} points`,
            isDone: row.stagesCleared > index
        })));

        return [
            buildDetailInfoGroup("Boss points", `${formatNumber(row.pointsEarned)} <span class="row-aside">of ${formatNumber(row.totalPoints)}</span>`),
            buildDetailGroupHtml("Stages", stageList)
        ];
    }

    if (tracker.id === "charms") {
        const stageList = buildDetailStageList(row.stages.map((stage, index) => ({
            label: `Stage ${index + 1}`,
            meta: `${formatNumber(stage.cost)} ${row.currencyLabel}`,
            isDone: row.stage > index
        })));

        return [
            buildDetailInfoGroup("Effect", escapeText(row.effect)),
            buildDetailInfoGroup("Cost", row.isComplete
                ? "Maxed"
                : `${formatNumber(row.nextCost)} <span class="row-aside">next stage, ${formatNumber(row.totalCost)} to max</span>`),
            buildDetailGroupHtml("Stages", stageList)
        ];
    }

    if (tracker.id === "achievements") {
        const rarityMeta = row.rarityLabel
            ? `${row.rarityLabel}${Number.isFinite(row.rarityPercent) ? ` <span class="row-aside">${row.rarityPercent.toFixed(1)}% of characters have it</span>` : ""}`
            : "";

        return [
            buildDetailInfoGroup("Description", plainText(row.spoiler)),
            buildDetailInfoGroup("Points", `${formatNumber(row.points)}${row.isSecret ? ' <span class="pill">Secret</span>' : ""}`),
            buildDetailInfoGroup("Rarity", rarityMeta),
            buildDetailInfoGroup("Grade", row.grade ? "★".repeat(row.grade) : "")
        ];
    }

    if (tracker.id === "quests") {
        const siblings = row.questlog
            ? buildTrackerRows(getTracker("quests")).filter((candidate) => candidate.questlog === row.questlog)
            : [];
        const questlogMeta = siblings.length > 1
            ? `${formatNumber(siblings.filter((candidate) => candidate.completed).length)} <span class="row-aside">of ${formatNumber(siblings.length)} in this questlog completed</span>`
            : "";

        return [
            buildDetailInfoGroup("Rewards", escapeText(row.rewards)),
            buildDetailInfoGroup("Questlog progress", questlogMeta)
        ];
    }

    if (tracker.id === "titles") {
        return [buildDetailInfoGroup("Requirement", escapeText(row.requirement))];
    }

    if (tracker.id === "measuringTibia") {
        const areaRows = buildTrackerRows(getTracker("measuringTibia")).filter((candidate) => candidate.area === row.area);
        const areaDiscovered = areaRows.filter((candidate) => candidate.discovered).length;

        return [
            buildDetailInfoGroup("Area progress", `${formatNumber(areaDiscovered)} <span class="row-aside">of ${formatNumber(row.areaSubareaCount)} subareas in ${escapeText(row.area)} discovered</span>`),
            buildDetailInfoGroup("Area achievement", escapeText(row.areaAchievement)),
            buildDetailInfoGroup("Bestiary creatures", row.creatureCount === null ? "" : formatNumber(row.creatureCount))
        ];
    }

    return [];
}

/** The primary control: a stage ladder for staged trackers, a single tick for boolean ones. */
function buildDetailPrimaryControl(tracker, row) {
    if (tracker.id === "bosstiary") {
        return stageControl(row, "stage", row.stageOptions, { label: "Stage" });
    }

    if (tracker.id === "charms") {
        return stageControl(row, "stage", CHARM_STAGES, { label: "Stage" });
    }

    if (tracker.tickField) {
        return tickControl(row, tracker.tickField, {
            yesLabel: TICK_YES_LABELS[tracker.id] ?? "Done",
            locked: Boolean(row.isDerived),
            title: row.isDerived ? "Earned by completing this area in Measuring Tibia" : ""
        });
    }

    return "";
}

/**
 * Every tracker but Bestiary shares this one panel — only the meta line, the
 * primary control and the extra info groups vary. Bestiary keeps its own
 * hand-built panel because its progress control (a typed kill count with a
 * live preview) has no equivalent among the stage/tick shapes here.
 */
function renderGenericTrackerDetail(tracker, row) {
    const icon = TRACKER_DETAIL_ICONS[tracker.id] ?? "checklist";
    const infoGroups = buildDetailInfoGroups(tracker, row).filter(Boolean).join("");

    elements.detailPanelContent.innerHTML = `
        <header class="detail-header">
            <h2 class="detail-title"><span class="material-symbols-outlined" aria-hidden="true">${icon}</span>${escapeText(row.name)}</h2>
            <p class="detail-header-meta">${escapeText(buildDetailMeta(tracker, row))}</p>
        </header>

        <section class="detail-group">
            <h3 class="detail-group-title">Progress</h3>
            ${buildDetailPrimaryControl(tracker, row)}
        </section>

        ${infoGroups}

        <section class="detail-group">
            <h3 class="detail-group-title">Tracking</h3>
            <div class="detail-checks">
                <div class="detail-check">${bookmarkControl(row)}<span>Bookmarked</span></div>
            </div>
        </section>

        <section class="detail-group">
            <h3 class="detail-group-title">Actions</h3>
            ${row.wikiLink ? `
                <div class="detail-actions">
                    <a class="btn btn-secondary detail-action" href="${escapeAttribute(row.wikiLink)}" target="_blank" rel="noreferrer"><span class="material-symbols-outlined" aria-hidden="true">open_in_new</span><span>Open Tibia Wiki</span><span class="material-symbols-outlined detail-action-tail" aria-hidden="true">north_east</span></a>
                </div>
            ` : ""}
            <p class="detail-last-recorded">Last recorded: ${escapeText(formatDetailRecordedAt(tracker.id, row.key))}</p>
        </section>
    `;

    attachGenericDetailActions(tracker, row.key);
}

/**
 * Reuses the grid's own commit functions (commitTrackerStage/Set/Flag) rather
 * than a second write path — they already do the write-through, undo and grid
 * refresh correctly. This only adds refreshing the detail panel itself, which
 * those functions have no reason to know about.
 */
function attachGenericDetailActions(tracker, itemKey) {
    const refresh = () => {
        const updated = buildTrackerRows(tracker).find((candidate) => candidate.key === itemKey);

        if (updated) {
            renderGenericTrackerDetail(tracker, updated);
        } else {
            closeDetailPanel();
        }
    };

    elements.detailPanelContent.querySelectorAll("[data-tracker-stage-value]").forEach((button) => {
        button.addEventListener("click", () => {
            commitTrackerStage(button);
            refresh();
        });
    });

    elements.detailPanelContent.querySelectorAll("[data-tracker-set]").forEach((button) => {
        button.addEventListener("click", () => {
            commitTrackerSet(button);
            refresh();
        });
    });

    elements.detailPanelContent.querySelectorAll("[data-tracker-flag]").forEach((button) => {
        button.addEventListener("click", () => {
            commitTrackerFlag(button);
            refresh();
        });
    });
}

function renderTrackerDetail(tracker) {
    if (!state.selectedTrackerKey) {
        closeDetailPanel();
        return;
    }

    const row = buildTrackerRows(tracker).find((candidate) => candidate.key === state.selectedTrackerKey);

    if (!row) {
        closeDetailPanel();
        return;
    }

    elements.detailPanel.hidden = false;
    elements.detailPanel.scrollTop = 0;
    elements.appShell.classList.add("has-detail");

    if (tracker.id === "bestiary") {
        renderBestiaryDetail(row);
        return;
    }

    renderGenericTrackerDetail(tracker, row);
}

/**
 * A tracker's tab shows its own progress, so a change has to reach the strip.
 * Re-rendering the whole strip would destroy the field being typed into, so the
 * one affected tab's meta is updated in place — the same approach
 * updateCharmPlanResult and syncHuntTabLabel already use.
 */
function syncTrackerTabMeta(tracker) {
    const meta = elements.huntTabStrip
        .querySelector(`[data-fixed-select="${tracker.id}"] .hunt-tab-meta`);

    if (meta) {
        meta.textContent = tracker.tabMeta(buildTrackerRows(tracker));
    }
}

/* ==========================================================================
   Recording: the landing, one unit at a time, then the review

   The landing is the screen the app never had — what is missing across all seven
   trackers, ranked, with the cheapest unit to read next. A unit is one bounded
   client screen, and its four states describe the transcription task rather than
   the game item, which is what makes it resumable.
   ========================================================================== */


/**
 * Every change that is still revertable, newest first.
 *
 * Undo in the moment covers the mistake you notice straight away. This covers the
 * one you notice tomorrow — an undo affordance that has scrolled away is not a
 * recovery path, and the app should not be the only thing that remembers.
 */
/** The section heading, used by every surface except the tracker pages — there the
 * page title already names the tracker, so a second heading repeated it. */
function showSectionHeading(title, copy) {
    elements.sectionHeading.hidden = false;
    elements.resultsTitle.textContent = title;
    elements.resultsCopy.textContent = copy;
    elements.sectionHeading.classList.toggle("is-page-redundant", title === elements.pageTitle.textContent);
}

function renderRecentChangesView() {
    elements.comparisonSection.hidden = true;
    elements.inputSection.hidden = true;
    elements.analysisSection.hidden = false;
    elements.respawnModeBlock.hidden = true;
    showSectionHeading("Recent changes", "The last 50 changes to your progress. Any of them can be reverted.");

    const rows = state.changeLog.map((change) => `
        <li class="change-row">
            <span class="change-when">${escapeText(formatChangeTime(change.at))}</span>
            <span class="change-label">${escapeText(change.label)}</span>
            <span class="change-scope">${escapeText(getTracker(change.trackerId)?.label ?? change.trackerId)}</span>
            <button class="row-action" type="button" data-revert-change="${escapeText(change.id)}">Revert</button>
        </li>
    `).join("");

    elements.output.className = "results-shell";
    elements.output.innerHTML = `
        <section class="results-section" aria-labelledby="changesTitle">
            <h3 class="subsection-title" id="changesTitle">Recent changes</h3>
            ${state.changeLog.length
                ? `<ul class="change-list">${rows}</ul>`
                : '<p class="section-copy">Nothing recorded yet, so there is nothing to revert.</p>'}
        </section>
    `;

    elements.output.querySelectorAll("[data-revert-change]").forEach((button) => {
        button.addEventListener("click", () => undoChange(button.dataset.revertChange));
    });
}

function formatChangeTime(iso) {
    const when = new Date(iso);

    if (Number.isNaN(when.getTime())) {
        return "";
    }

    const today = new Date();
    const sameDay = when.toDateString() === today.toDateString();

    return sameDay
        ? when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
        : when.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function describeValue(tracker, row) {
    if (tracker.id === "bestiary") {
        return BESTIARY_STAGES.find((stage) => stage.value === row.stage)?.label ?? String(row.kills);
    }

    if (tracker.id === "bosstiary") {
        return row.stageOptions?.find((stage) => stage.value === row.stage)?.label ?? String(row.kills);
    }

    if (tracker.id === "charms") {
        return row.stage ? `stage ${row.stage}` : "locked";
    }

    return "yes";
}


function renderTrackerView() {
    const tracker = getActiveTracker();

    elements.comparisonSection.hidden = true;
    elements.inputSection.hidden = true;
    elements.analysisSection.hidden = false;
    elements.respawnModeBlock.hidden = true;
    elements.sectionHeading.hidden = true;
    elements.sectionHeading.classList.remove("is-page-redundant");
    // The heading is visually redundant on tracker pages, but it still labels the
    // analysis region for assistive technology. Keep that label in sync with the
    // active tracker instead of leaking the title of the previously visited page.
    elements.resultsTitle.textContent = tracker.resultsTitle ?? tracker.label;
    elements.resultsCopy.textContent = tracker.resultsCopy ?? "";

    renderTracker(elements.output, getTrackerView(tracker));
    attachTrackerActions();
    renderTrackerDetail(tracker);
    // Completing a Cyclopedia Map area changes the Achievements total too, so
    // every tab's meta is refreshed rather than only the active one.
    TRACKERS.forEach(syncTrackerTabMeta);
}

/**
 * One card per tracker, each built from that tracker's own totals() — the
 * exact function that drives its own page header — so the Dashboard cannot
 * show a number its own tracker page would disagree with.
 */
function renderDashboardView() {
    elements.comparisonSection.hidden = true;
    elements.inputSection.hidden = true;
    elements.analysisSection.hidden = false;
    elements.respawnModeBlock.hidden = true;
    elements.sectionHeading.hidden = true;
    elements.sectionHeading.classList.remove("is-page-redundant");
    elements.resultsTitle.textContent = "Dashboard";
    elements.resultsCopy.textContent = elements.pageDescription.textContent;

    const cards = TRACKERS.map((tracker) => {
        const context = getTrackerContext(tracker);

        return { tracker, totals: tracker.totals(buildTrackerRows(tracker, context), context) };
    });

    renderDashboard(elements.output, cards);
    attachDashboardActions();
}

function attachDashboardActions() {
    elements.output.querySelectorAll("[data-dashboard-tracker]").forEach((card) => {
        card.addEventListener("click", () => navigateWorkspace("trackers", card.dataset.dashboardTracker));
    });
}




/**
 * 833 rows re-render on every keystroke in a kills field, so the default page
 * size is a deliberate performance guard rather than a nicety.
 */



/**
 * The opportunity view crosses the Bestiary tracker's progress with every stored
 * session's measured kill rates, so it belongs with the sessions rather than with
 * the trackers — a tracker knows its own progress but not how fast you kill.
 */
function getOpportunityAnalysis() {
    const sessions = state.hunts
        .map((hunt, index) => ({
            id: hunt.id,
            label: getHuntLabel(index, hunt),
            monsters: hasBestiaryAnalysis(hunt) ? calculateBestiaryResult(hunt).monsters : []
        }))
        .filter((session) => session.monsters.length);
    const killsByName = Object.fromEntries(
        state.bestiaryData.map((creature) => [creature.Name, getBestiaryKills(creature.Name)])
    );

    return buildOpportunityAnalysis(state.bestiaryData, killsByName, sessions);
}

function renderOpportunitiesView() {
    elements.comparisonSection.hidden = true;
    elements.inputSection.hidden = true;
    elements.analysisSection.hidden = false;
    elements.respawnModeBlock.hidden = true;
    showSectionHeading(VIEW_CONTENT.opportunities.resultsTitle, VIEW_CONTENT.opportunities.resultsCopy);

    renderOpportunities(elements.output, getOpportunityAnalysis());
    attachOpportunityActions();
}

function attachOpportunityActions() {
    elements.output.querySelectorAll("[data-opportunity-session]").forEach((button) => {
        button.addEventListener("click", () => selectHunt(button.dataset.opportunitySession));
    });

    elements.output.querySelectorAll("[data-opportunity-creature]").forEach((button) => {
        button.addEventListener("click", () => {
            const tracker = bestiaryTracker;
            const row = buildTrackerRows(tracker)
                .find((candidate) => candidate.name === button.dataset.opportunityCreature);
            const filters = buildInitialFilters(tracker);

            filters.search = button.dataset.opportunityCreature;
            state.trackerFilters[tracker.id] = filters;
            state.mode = "trackers";
            state.activeTrackerId = tracker.id;
            state.trackerPageIndex = 0;
            state.selectedTrackerKey = row?.key ?? "";
            leaveRecordFlow();
            renderApp();
            persistState();
            announce(`${button.dataset.opportunityCreature} opened in Bestiary.`);
        });
    });
}

function buildLibraryRows() {
    return state.hunts.map((hunt, index) => {
        const summary = hasBestiaryAnalysis(hunt) ? calculateBestiaryResult(hunt).summary : null;

        return {
            id: hunt.id,
            name: hunt.name,
            label: getHuntLabel(index, hunt),
            huntedOn: hunt.huntedOn,
            notes: hunt.notes,
            respawnMode: hunt.respawnMode,
            respawnModeLabel: RESPAWN_MODE_LABELS[hunt.respawnMode],
            duration: hunt.sessionDuration,
            creatureCount: hunt.matchedMonsters.length,
            charmPoints: summary ? summary.totalCharms : 0,
            charmRate: summary ? summary.totalCharmsPerHour : 0,
            hasProcessedLog: hunt.hasProcessedLog,
            isActive: hunt.id === state.activeHuntId,
            canDelete: state.hunts.length > 1,
            searchText: [hunt.name, hunt.notes, ...hunt.matchedMonsters.map((monster) => monster.name)]
                .join(" ")
                .toLowerCase()
        };
    });
}

function filterLibraryRows(rows) {
    const { respawnMode, search } = state.libraryFilters;
    const needle = search.trim().toLowerCase();

    return rows.filter((row) => {
        if (respawnMode !== "all" && row.respawnMode !== respawnMode) {
            return false;
        }

        return !needle || row.searchText.includes(needle) || row.label.toLowerCase().includes(needle);
    });
}

function sortLibraryRows(rows) {
    const { key, direction } = state.librarySort;
    const column = LIBRARY_COLUMNS.find((candidate) => candidate.key === key) || LIBRARY_COLUMNS[0];
    const factor = direction === "desc" ? -1 : 1;

    // Sorting a copy keeps state.hunts in its own order: the positional
    // "Session N" labels must not renumber just because the table is re-sorted.
    return [...rows].sort((left, right) => {
        const a = column.isNumeric ? Number(left[key]) || 0 : String(left[key] ?? "").toLowerCase();
        const b = column.isNumeric ? Number(right[key]) || 0 : String(right[key] ?? "").toLowerCase();

        if (a === b) {
            return left.label.localeCompare(right.label, undefined, { numeric: true }) * factor;
        }

        return (a < b ? -1 : 1) * factor;
    });
}

function renderSessionLibraryView() {
    const rows = buildLibraryRows();
    const visible = sortLibraryRows(filterLibraryRows(rows));

    elements.comparisonSection.hidden = true;
    elements.inputSection.hidden = true;
    elements.analysisSection.hidden = false;
    elements.respawnModeBlock.hidden = true;
    showSectionHeading(VIEW_CONTENT.library.resultsTitle, VIEW_CONTENT.library.resultsCopy);

    renderSessionLibrary(
        elements.output,
        visible,
        state.librarySort,
        state.libraryFilters,
        { shown: visible.length, total: rows.length }
    );
    attachLibraryActions();
}

function renderTaskSessionsView() {
    const sessions = state.hunts
        .map((hunt, index) => ({ hunt, id: hunt.id, label: getHuntLabel(index, hunt) }))
        .filter((session) => hasTaskAnalysis(session.hunt))
        .map((session) => ({
            id: session.id,
            label: session.label,
            respawnModeLabel: RESPAWN_MODE_SHORT_LABELS[session.hunt.respawnMode],
            estimate: getTaskEstimateForHunt(session.hunt)
        }));

    elements.comparisonSection.hidden = true;
    elements.inputSection.hidden = true;
    elements.analysisSection.hidden = false;
    elements.respawnModeBlock.hidden = true;
    showSectionHeading("Task Sessions", "Every processed session with the creature and task target you chose for it, estimated from that session's own kill rate.");

    renderTaskSessions(elements.output, sessions);
    attachTaskSessionLinks();
}

/**
 * The single place mode chrome goes: which sidebar entry is lit, and what the
 * character switcher currently shows. Every navigation reaches here through
 * renderApp(), so the sidebar can never disagree with the page it points at.
 */
function applyPrimaryMode() {
    const view = getModeView();
    const isDashboard = state.mode === "dashboard";
    const isTrackers = state.mode === "trackers";
    const isRecentChanges = isTrackers && state.recordView === "changes";

    elements.sidebarDashboardLink.classList.toggle("is-active", isDashboard);

    renderSidebarTrackers(elements.sidebarTrackerList, TRACKERS, state.activeTrackerId, isTrackers && !isRecentChanges);

    elements.sidebarPlanningList.querySelectorAll("[data-nav-planning]").forEach((link) => {
        const key = link.dataset.navPlanning;
        const isActive = key === "taskSessions"
            ? state.mode === "tasks" && view === "allSessions"
            : state.mode === "bestiary" && view === key;

        link.classList.toggle("is-active", isActive);
    });

    elements.sidebarRecentChangesButton.classList.toggle("is-active", isRecentChanges);

    renderSidebarCharacter();
}

function renderSidebarCharacter() {
    const index = getActiveCharacterIndex();
    const character = state.characters[index];
    const isEditing = Boolean(character) && state.editingCharacterId === character.id;

    elements.sidebarCharacterButton.hidden = isEditing;
    elements.sidebarCharacterInput.hidden = !isEditing;

    if (isEditing) {
        elements.sidebarCharacterInput.value = character.name || "";
    } else if (character) {
        elements.sidebarCharacterName.textContent = getCharacterLabel(index, character);
    }

    elements.sidebarDeleteCharacterButton.disabled = state.characters.length < 2;
    elements.sidebarCharacterButton.setAttribute("aria-expanded", String(state.isCharacterMenuOpen));
    elements.sidebarCharacterMenu.hidden = !state.isCharacterMenuOpen;

    if (state.isCharacterMenuOpen) {
        renderSidebarCharacterMenu(elements.sidebarCharacterMenu, state.characters, state.activeCharacterId, getCharacterLabel);
    }
}

function getPageContent() {
    const view = getModeView();

    if (state.mode === "dashboard") {
        const activeIndex = getActiveCharacterIndex();
        const characterLabel = activeIndex === -1 ? "" : getCharacterLabel(activeIndex, state.characters[activeIndex]);

        return {
            eyebrow: "Overview",
            title: "Dashboard",
            description: `Aggregate progress across every tracker, for ${characterLabel || "the active character"}.`
        };
    }

    if (state.mode === "trackers" && state.recordView === "changes") {
        return {
            eyebrow: "Data",
            title: "Recent changes",
            description: "Everything you have recorded lately, newest first. Any of it can be reverted."
        };
    }

    if (state.mode === "trackers") {
        const tracker = getActiveTracker();
        const trackerDescriptions = {
            achievements: "Track achievement progress and earned points.",
            bestiary: "Character-wide progress for every creature.",
            bosstiary: "Character-wide progress for every boss.",
            charms: "Track Major and Minor charm stages, effects, costs, and currencies.",
            measuringTibia: "Follow Cyclopedia Map areas and their completion requirements.",
            quests: "Keep every quest state in one dependable list.",
            titles: "Track the titles your character has unlocked."
        };

        return {
            eyebrow: "Tracker",
            title: tracker.label,
            description: trackerDescriptions[tracker.id] ?? tracker.resultsCopy
        };
    }

    if (state.mode === "tasks") {
        return {
            eyebrow: "Sessions · Tasks",
            title: view === "library" ? "Session History" : (view === "allSessions" ? "Task Sessions" : "Task Estimate"),
            description: view === "allSessions"
                ? "Estimate each task target from the measured kill rate in its Hunt Analyzer."
                : "Use measured sessions to project how long a task target will take."
        };
    }

    const contentByView = {
        charmPlan: ["Charm Points Plan", "Turn your measured sessions and remaining Bestiary progress into a focused hunting plan."],
        opportunities: ["Opportunities", "Find unfinished Bestiary objectives across known hunts, quick wins, locations, and unmeasured progress."],
        allSessions: ["Bestiary Sessions", "Compare measured sessions and see where hunting time produces the most progress."],
        library: ["Session History", "Your stored Hunt Analyzers, notes, dates, and recorded spawn conditions."],
        comparison: ["Compare Sessions", "Compare measured hunts by time, progress, and charm efficiency."],
        session: ["Bestiary Session", "Paste one Hunt Analyzer and turn its evidence into a progress estimate."]
    };
    const [title, description] = contentByView[view] ?? contentByView.session;

    return { eyebrow: "Sessions · Bestiary", title, description };
}

function applyWorkspaceChrome() {
    const content = getPageContent();

    elements.pageEyebrow.textContent = content.eyebrow;
    elements.pageTitle.textContent = content.title;
    elements.pageDescription.textContent = content.description;
    // Trackers and the Dashboard have nothing "New session" would do.
    elements.newSessionButton.hidden = state.mode === "trackers" || state.mode === "dashboard";
    elements.workspaceMain.classList.toggle("is-trackers", state.mode === "trackers");
}

function renderApp() {
    const view = getModeView();

    elements.appAlert.textContent = "";

    applyPrimaryMode();
    applyWorkspaceChrome();

    if (state.mode === "dashboard") {
        elements.huntWorkspace.hidden = true;
        closeDetailPanel();
        renderDashboardView();
        return;
    }

    if (state.mode === "trackers") {
        elements.huntWorkspace.hidden = true;
        renderUndoBar();

        if (state.recordView === "changes") {
            renderRecentChangesView();
            return;
        }

        if (state.transfer) {
            renderTransferReviewView();
            return;
        }

        renderTrackerView();
        return;
    }

    closeDetailPanel();
    elements.huntWorkspace.hidden = false;
    renderHuntTabStrip();

    // The library manages the logs both modes share, so it renders identically
    // in either one.
    if (view === "library") {
        renderSessionLibraryView();
        return;
    }

    if (view === "opportunities") {
        renderOpportunitiesView();
        return;
    }

    if (state.mode === "tasks") {
        if (view === "allSessions") {
            renderTaskSessionsView();
            return;
        }

        renderTaskSessionView();
        return;
    }

    if (view === "comparison") {
        renderComparisonView();
        return;
    }

    if (view === "allSessions") {
        renderAllTabsView();
        return;
    }

    if (view === "charmPlan") {
        renderCharmPlanView();
        return;
    }

    renderHuntView();
}

function setMode(mode) {
    state.isSessionInputOpen = false;
    if (state.mode === mode) {
        return;
    }

    captureVisibleInputs();
    leaveRecordFlow();
    state.mode = mode;
    renderApp();
    persistState();

    if (mode === "tasks") {
        return;
    }

}

async function pasteLog() {
    try {
        const clipboardText = await navigator.clipboard.readText();
        getActiveHunt().sessionLog = clipboardText;
        state.isSessionInputOpen = true;
        renderApp();
        persistState();
        elements.sessionLog.focus();
    } catch (error) {
        showAlert("Clipboard access blocked. Paste the text manually.");
    }
}

function clearLog() {
    const hunt = getActiveHunt();
    const clearedHunt = resetHunt(hunt);

    state.hunts = state.hunts.map((current) => (current.id === hunt.id ? clearedHunt : current));
    state.activeHuntId = clearedHunt.id;
    dropAllTabsEntriesOfHunt(hunt.id);
    dropIgnoredPlanHunt(hunt.id);
    normalizeView();
    renderApp();
    persistState();
    elements.sessionLog.focus();
}

function selectHunt(huntId) {
    state.isSessionInputOpen = false;
    captureVisibleInputs();
    state.activeHuntId = huntId;
    setModeView("session");
    renderApp();
    persistState();
}

function addHuntTab() {
    state.isSessionInputOpen = false;
    captureVisibleInputs();

    const { hunt, hunts } = addHunt(state.hunts);

    state.hunts = hunts;
    state.activeHuntId = hunt.id;
    setModeView("session");
    renderApp();
    persistState();
}

function openCurrentSession() {
    captureVisibleInputs();
    state.isSessionInputOpen = true;
    setModeView("session");
    renderApp();
    persistState();
    elements.sessionLog.focus();
}

function closeHuntTab(huntId) {
    if (state.hunts.length < 2) {
        return;
    }

    captureVisibleInputs();

    const closedLabel = getHuntLabelById(huntId);
    const closedHunt = findHuntById(huntId);

    // Closing discards the pasted Hunt Analyzer and everything derived from it,
    // and there is no undo. An empty session has nothing to lose, so only ask
    // when there is something.
    if (closedHunt && huntHasContent(closedHunt)
        && !window.confirm(`Delete ${closedLabel}? Its Hunt Analyzer text, creature selection, notes and task target are discarded. Character-wide Bestiary totals remain saved.`)) {
        return;
    }

    const { activeHuntId, hunts } = removeHunt(state.hunts, huntId, state.activeHuntId);

    state.hunts = hunts;
    state.activeHuntId = activeHuntId;
    dropAllTabsEntriesOfHunt(huntId);
    dropIgnoredPlanHunt(huntId);
    normalizeView();
    renderApp();
    persistState();
}

function showComparison() {
    captureVisibleInputs();

    if (getComparableHunts().length < 2) {
        return;
    }

    state.bestiaryView = "comparison";
    renderApp();
    persistState();
}

function selectFixedView(view) {
    if (getModeView() === view || !FIXED_VIEWS[state.mode].includes(view)) {
        return;
    }

    captureVisibleInputs();
    setModeView(view);
    leaveRecordFlow();
    renderApp();
    persistState();
}

/**
 * Totals are Bestiary progress now, so resetting them edits the player's record
 * rather than a scratch value on one session. That is worth confirming.
 */
function resetTotalsForCreatures(creatureNames, promptText) {
    const names = [...new Set(creatureNames)];
    const withKills = names.filter((name) => getBestiaryKills(name) > 0);

    if (!withKills.length || !window.confirm(promptText(withKills.length))) {
        return;
    }

    withKills.forEach((name) => setEntry(state.trackerProgress, "bestiary", name, bestiaryTracker.entryDefaults, { kills: 0 }));
    commitAllHuntProgress();
    renderApp();
    persistState();
    announce(`Total kills reset for ${withKills.length} creatures.`);
}

function clearInputs() {
    resetTotalsForCreatures(
        getActiveHunt().matchedMonsters.map((monster) => monster.name),
        (count) => `Reset your Bestiary total kills for ${count} ${count === 1 ? "creature" : "creatures"} in this session? This is your saved progress, not a per-session value.`
    );
}

function resetAllTabsTotals() {
    resetTotalsForCreatures(
        state.hunts.flatMap((hunt) => hunt.matchedMonsters.map((monster) => monster.name)),
        (count) => `Reset your Bestiary total kills for ${count} ${count === 1 ? "creature" : "creatures"} across every session? This is your saved progress, not a per-session value.`
    );
}

function toggleAllTabsEntry(entryKey) {
    captureAllTabsInputs();

    const isExcluded = state.excludedAllTabsEntries.includes(entryKey);

    state.excludedAllTabsEntries = isExcluded
        ? state.excludedAllTabsEntries.filter((key) => key !== entryKey)
        : [...state.excludedAllTabsEntries, entryKey];

    renderApp();
    persistState();
}

function toggleHuntPlanAvailability(huntId) {
    captureVisibleInputs();

    const isIgnored = state.ignoredPlanHuntIds.includes(huntId);

    state.ignoredPlanHuntIds = isIgnored
        ? state.ignoredPlanHuntIds.filter((ignoredId) => ignoredId !== huntId)
        : [...state.ignoredPlanHuntIds, huntId];

    renderApp();
    persistState();
}

function setPlanRespawnMode(respawnMode) {
    if (state.planRespawnMode === respawnMode) {
        return;
    }

    captureVisibleInputs();
    state.planRespawnMode = respawnMode;
    renderApp();
    persistState();
}

function setSessionRespawnMode(respawnMode) {
    const hunt = getActiveHunt();

    if (!hunt || hunt.respawnMode === respawnMode) {
        return;
    }

    captureVisibleInputs();
    hunt.respawnMode = respawnMode;
    renderApp();
    persistState();
}

function dropIgnoredPlanHunt(huntId) {
    state.ignoredPlanHuntIds = state.ignoredPlanHuntIds.filter((ignoredId) => ignoredId !== huntId);
}

function dropAllTabsEntriesOfHunt(huntId) {
    state.excludedAllTabsEntries = state.excludedAllTabsEntries
        .filter((entryKey) => !isEntryKeyForHunt(entryKey, huntId));
}

function getModelTotalKills(input) {
    const huntId = input.dataset.huntId;
    const hunt = huntId ? state.hunts.find((candidate) => candidate.id === huntId) : getActiveHunt();
    const monster = hunt?.matchedMonsters.find((candidate) => candidate.name === input.dataset.monsterName);

    return monster ? (monster.totalKills || 0) : 0;
}

function handleKillsCommit(event) {
    const input = event.target;

    if (!input.classList || !input.classList.contains("kills-input")) {
        return;
    }

    if ((Number.parseInt(input.value, 10) || 0) === getModelTotalKills(input)) {
        return;
    }

    captureVisibleInputs();
    persistState();

    const next = event.relatedTarget;

    if (next && next.classList && next.classList.contains("kills-input")) {
        const selector = next.dataset.huntId
            ? `.kills-input[data-monster-name="${next.dataset.monsterName}"][data-hunt-id="${next.dataset.huntId}"]`
            : `.kills-input[data-monster-name="${next.dataset.monsterName}"]`;

        renderApp();

        const restored = elements.output.querySelector(selector);

        if (restored) {
            restored.focus();
            restored.select();
        }

        return;
    }

    if (!next) {
        renderApp();
    }
}

function attachHuntTabActions() {
    const addHuntButton = document.getElementById("addHuntButton");

    if (addHuntButton) {
        addHuntButton.addEventListener("click", addHuntTab);
    }

    elements.huntTabStrip.querySelectorAll("[data-fixed-select]").forEach((button) => {
        button.addEventListener("click", () => selectFixedView(button.dataset.fixedSelect));
    });

    elements.huntTabStrip.querySelectorAll("[data-hunt-select]").forEach((button) => {
        button.addEventListener("click", () => selectHunt(button.dataset.huntSelect));
    });

    elements.huntTabStrip.querySelectorAll("[data-hunt-close]").forEach((button) => {
        button.addEventListener("click", () => closeHuntTab(button.dataset.huntClose));
    });
}

function attachPlanHuntLinks() {
    elements.output.querySelectorAll("[data-plan-hunt]").forEach((button) => {
        button.addEventListener("click", () => selectHunt(button.dataset.planHunt));
    });
}

function attachCharmPlanActions() {
    const playTimeInput = document.getElementById("playTimeInput");

    elements.output.querySelectorAll("[data-plan-availability]").forEach((button) => {
        button.addEventListener("click", () => toggleHuntPlanAvailability(button.dataset.planAvailability));
    });

    elements.output.querySelectorAll("[data-plan-respawn-mode]").forEach((button) => {
        button.addEventListener("click", () => setPlanRespawnMode(button.dataset.planRespawnMode));
    });

    if (!playTimeInput) {
        return;
    }

    playTimeInput.addEventListener("input", () => {
        state.playTimeInput = playTimeInput.value;
        updateCharmPlanResult();
        persistState();
    });
}

/**
 * The manager's kills fields deliberately use their own class and data
 * attribute. Reusing `.kills-input` would put them on the session commit path,
 * which reads every visible field into whichever hunt is active.
 */

function captureTrackerInputs() {
    const tracker = getActiveTracker();

    elements.output.querySelectorAll(".tracker-count").forEach((input) => {
        setEntry(state.trackerProgress, tracker.id, input.dataset.trackerItem, tracker.entryDefaults, {
            [input.dataset.trackerField]: input.value
        });
    });
}

/* ==========================================================================
   Writing tracker data

   Every write goes through writeTrackerEntries so that three things are always
   true: the previous value is captured for undo, the affected row repaints in
   place rather than redrawing the table, and the session analysis is refreshed.
   Redrawing the table is what used to throw focus onto <body> after every mark.
   ========================================================================== */

function writeTrackerEntries(tracker, itemKeys, changesFor, { kind, label }) {
    const before = {};
    let touched = 0;

    itemKeys.forEach((itemKey) => {
        const changes = changesFor(itemKey);

        if (!changes) {
            return;
        }

        before[itemKey] = getStoredEntry(state.trackerProgress, tracker.id, itemKey);
        setEntry(state.trackerProgress, tracker.id, itemKey, tracker.entryDefaults, changes);
        touched += 1;
    });

    if (!touched) {
        return null;
    }

    const change = { kind, trackerId: tracker.id, label, entries: before, units: {} };

    pushChange(state.changeLog, change);
    onTrackerProgressChanged();

    return peekChange(state.changeLog);
}

/**
 * Repaints one row and its dependent readouts, leaving focus where it was.
 *
 * The row's DOM is replaced, so the element that had focus no longer exists. Its
 * identity does: the same data attributes name the same control in the new markup,
 * so focus is re-established on the control the player was actually using. Without
 * this, marking an item drops focus onto <body> and keyboard entry has to start
 * over from the top of the page.
 */
function refreshTrackerRow(tracker, itemKey) {
    const row = buildTrackerRows(tracker).find((candidate) => candidate.key === itemKey);

    if (!row) {
        renderTrackerView();
        return;
    }

    const focusedSelector = describeFocusedControl();
    const patched = patchTrackerCard(elements.output, tracker, row, {
        isSelected: state.trackerSelection.has(itemKey),
        selectable: state.trackerSelectionMode && Boolean(getBulkActions(tracker).length)
    });

    syncTrackerTotals(tracker);
    TRACKERS.forEach(syncTrackerTabMeta);

    if (focusedSelector && patched) {
        const restored = patched.querySelector(focusedSelector) ?? patched;

        restored.focus?.();
    }
}

/** A CSS selector that finds the focused control again after its row is replaced. */
function describeFocusedControl() {
    const active = document.activeElement;

    if (!active || active === document.body) {
        return "";
    }

    const { trackerStage, trackerStageValue, trackerFlag, trackerField, trackerSelect } = active.dataset ?? {};

    if (trackerStage) {
        return `[data-tracker-stage="${CSS.escape(trackerStage)}"][data-tracker-stage-value="${CSS.escape(trackerStageValue)}"]`;
    }

    if (trackerFlag) {
        return `[data-tracker-flag="${CSS.escape(trackerFlag)}"]`;
    }

    if (trackerField) {
        return `[data-tracker-field="${CSS.escape(trackerField)}"]`;
    }

    if (trackerSelect) {
        return "[data-tracker-select]";
    }

    return "";
}

/**
 * The headline and stat line sit outside the table, so a patched row has to push
 * its own totals. Rewriting them in place keeps the table DOM — and the focus
 * inside it — untouched.
 */
function syncTrackerTotals(tracker) {
    const context = getTrackerContext(tracker);
    const totals = tracker.totals(buildTrackerRows(tracker, context), context);
    const answer = elements.output.querySelector(".answer-value");
    const note = elements.output.querySelector(".answer-note");
    const stats = elements.output.querySelector(".stat-line");

    if (answer) {
        answer.innerHTML = totals.answer.value;
    }

    if (note) {
        note.innerHTML = totals.answer.note ?? "";
    }

    if (stats) {
        // Tracker metrics keep their desktop column geometry after an inline edit.
        stats.innerHTML = (totals.stats ?? [])
            .filter(Boolean)
            .map((part) => `<span class="stat-item">${part}</span>`)
            .join("");
    }
}

/**
 * Tracker count fields deliberately use their own class and data attributes.
 * Reusing `.kills-input` would put them on the session commit path, which reads
 * every visible field into whichever hunt is active.
 */
function commitTrackerCount(input) {
    const tracker = getActiveTracker();
    const { trackerItem: itemKey, trackerField: field } = input.dataset;
    const previous = getEntry(state.trackerProgress, tracker.id, itemKey, tracker.entryDefaults)[field];
    const next = Number.parseInt(input.value, 10) || 0;

    if (next === previous) {
        return;
    }

    const change = writeTrackerEntries(tracker, [itemKey], () => ({ [field]: input.value }), {
        kind: "entry",
        label: `${itemKey} ${previous || 0} → ${next}`
    });

    refreshTrackerRow(tracker, itemKey);
    showUndo(change);
}

function commitTrackerStage(button) {
    const tracker = getActiveTracker();
    const { trackerItem: itemKey, trackerStage: field, trackerStageValue: rawValue } = button.dataset;
    const value = Number(rawValue) || 0;
    const entry = getEntry(state.trackerProgress, tracker.id, itemKey, tracker.entryDefaults);
    // Picking the tile that is already set clears it, which is the only way back to
    // "not recorded" without an undo.
    const next = entry[field] === value ? 0 : value;
    // An exact count would silently outrank the tile the player just picked, so
    // setting a tile by hand clears it. Typing the count again is one keystroke.
    const clearsCount = tracker.id === "bestiary" && entry.kills > 0;

    const change = writeTrackerEntries(tracker, [itemKey], () => ({
        [field]: next,
        ...(clearsCount ? { kills: 0 } : {})
    }), {
        kind: "entry",
        label: `${itemKey} set to ${button.textContent.trim()}`
    });

    refreshTrackerRow(tracker, itemKey);
    showUndo(change);
}

function commitTrackerFlag(button) {
    const tracker = getActiveTracker();
    const { trackerItem: itemKey, trackerFlag: field } = button.dataset;
    const current = getEntry(state.trackerProgress, tracker.id, itemKey, tracker.entryDefaults)[field];

    const change = writeTrackerEntries(tracker, [itemKey], () => ({ [field]: !current }), {
        kind: "entry",
        label: `${itemKey} ${field === "bookmark" ? (current ? "unbookmarked" : "bookmarked") : (current ? "cleared" : "marked")}`
    });

    refreshTrackerRow(tracker, itemKey);

    if (field !== "bookmark") {
        showUndo(change);
    }
}

/* ==========================================================================
   Undo
   ========================================================================== */

function showUndo(change) {
    if (!change) {
        return;
    }

    state.pendingUndoId = change.id;
    announce(`${change.label}. Undo available.`);
    renderUndoBar();
}

function renderUndoBar() {
    const change = state.changeLog.find((candidate) => candidate.id === state.pendingUndoId);

    if (!elements.undoBar) {
        return;
    }

    if (!change) {
        elements.undoBar.hidden = true;
        elements.undoBar.innerHTML = "";
        return;
    }

    elements.undoBar.hidden = false;
    elements.undoBar.innerHTML = `
        <span class="undo-text">${escapeText(change.label)}</span>
        <button class="undo-action" type="button" id="undoLastChange">Undo</button>
        <button class="icon-button" type="button" id="dismissUndo" aria-label="Dismiss">
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
    `;

    document.getElementById("undoLastChange").addEventListener("click", () => undoChange(change.id));
    document.getElementById("dismissUndo").addEventListener("click", () => {
        state.pendingUndoId = "";
        renderUndoBar();
    });
}

function undoChange(changeId) {
    const change = dropChange(state.changeLog, changeId);

    if (!change) {
        return;
    }

    applyUndo(change, state.trackerProgress, {});
    state.pendingUndoId = "";
    onTrackerProgressChanged();
    announce(`Undone: ${change.label}`);
    renderApp();
}

function undoLatestChange() {
    const change = peekChange(state.changeLog);

    if (change) {
        undoChange(change.id);
    }
}

/**
 * A tracker's progress can feed the session analysis (Bestiary total kills), so a
 * change has to refresh the derived per-session values as well as persist.
 */
function onTrackerProgressChanged() {
    commitAllHuntProgress();
    persistState();
}

/**
 * Bulk verbs a tracker supports. Only the tick trackers get them, because the
 * Bestiary's equivalent would mean asserting kill counts nobody read.
 *
 * There is deliberately no "mark not earned" here. A false is equal to the entry
 * default, so storing one deletes the entry and the item goes back to unknown —
 * the control would appear to work and change nothing. Asserting a negative is
 * only meaningful for a whole bounded screen, which is what "confirm remaining"
 * does inside the unit flow.
 */
function getBulkActions(tracker) {
    const tickField = tracker.tickField;

    if (!tickField) {
        return [];
    }

    const verb = { done: "earned", completed: "completed", earned: "earned", discovered: "discovered" }[tickField] ?? "marked";

    return [
        { key: `${tickField}:on`, label: `Mark ${verb}`, field: tickField, value: true },
        { key: `${tickField}:clear`, label: "Clear back to not recorded", field: tickField, value: false }
    ];
}

function applyBulkAction(tracker, action, visibleRows) {
    const keys = [...state.trackerSelection];

    if (!keys.length) {
        return;
    }

    const change = writeTrackerEntries(tracker, keys, () => ({ [action.field]: action.value }), {
        kind: "bulk",
        label: `${keys.length} item${keys.length === 1 ? "" : "s"} — ${action.label.toLowerCase()}`
    });

    state.trackerSelection.clear();
    state.trackerSelectionMode = false;
    renderTrackerView();
    showUndo(change);
}


function toggleRowSelection(itemKey, extend, list) {
    if (extend && state.trackerSelectionAnchor) {
        const keys = list.map((tr) => tr.dataset.trackerRow);
        const from = keys.indexOf(state.trackerSelectionAnchor);
        const to = keys.indexOf(itemKey);

        if (from !== -1 && to !== -1) {
            keys.slice(Math.min(from, to), Math.max(from, to) + 1)
                .forEach((key) => state.trackerSelection.add(key));
            renderTrackerView();
            return;
        }
    }

    if (state.trackerSelection.has(itemKey)) {
        state.trackerSelection.delete(itemKey);
    } else {
        state.trackerSelection.add(itemKey);
        state.trackerSelectionAnchor = itemKey;
    }

    renderTrackerView();
}

/**
 * One delegated listener per surface, bound once.
 *
 * Per-element listeners looked fine until a card repainted itself: replacing its
 * innerHTML throws away every listener inside it, so the second interaction with the
 * same card silently did nothing. Delegation survives repainting by construction,
 * which is the whole reason the app can patch a single card instead of the page.
 */
let trackerDelegationBound = false;

function bindTrackerDelegation() {
    if (trackerDelegationBound) {
        return;
    }

    trackerDelegationBound = true;

    elements.output.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;

        if (!target || state.mode !== "trackers") {
            return;
        }

        const tracker = getActiveTracker();

        const selectionMode = target.closest("[data-tracker-selection-mode]");

        if (selectionMode) {
            state.trackerSelectionMode = !state.trackerSelectionMode;

            if (!state.trackerSelectionMode) {
                state.trackerSelection.clear();
                state.trackerSelectionAnchor = "";
            }

            renderTrackerView();
            return;
        }

        const stage = target.closest("[data-tracker-stage-value]");

        if (stage) {
            commitTrackerStage(stage);
            return;
        }

        const set = target.closest("[data-tracker-set]");

        if (set) {
            commitTrackerSet(set);
            return;
        }

        const flag = target.closest("[data-tracker-flag]");

        if (flag) {
            commitTrackerFlag(flag);
            return;
        }

        const bulk = target.closest("[data-tracker-bulk]");

        if (bulk) {
            const action = getBulkActions(tracker).find((candidate) => candidate.key === bulk.dataset.trackerBulk);

            if (action) {
                applyBulkAction(tracker, action);
            }

            return;
        }

        const pageSize = target.closest("[data-tracker-page-size]");

        if (pageSize) {
            state.trackerPageSize = Number(pageSize.dataset.trackerPageSize) || 0;
            state.trackerPageIndex = 0;
            renderTrackerView();
            return;
        }

        const page = target.closest("[data-tracker-page]");

        if (page) {
            state.trackerPageIndex = Math.max(0, state.trackerPageIndex + (page.dataset.trackerPage === "next" ? 1 : -1));
            renderTrackerView();
            return;
        }

        const facetButton = target.closest("[data-tracker-facet-value]");

        if (facetButton) {
            getTrackerFilters(tracker)[facetButton.dataset.trackerFacet] = facetButton.dataset.trackerFacetValue;
            state.trackerPageIndex = 0;
            renderTrackerView();
            return;
        }

        if (target.closest("#trackerClearSelection")) {
            state.trackerSelection.clear();
            renderTrackerView();
            return;
        }

        // Clicking the card itself — not one of its controls — opens the detail panel.
        const card = target.closest("[data-tracker-row]");

        if (card && state.trackerSelectionMode && !target.closest("a, button, input, select, label, summary")) {
            toggleRowSelection(card.dataset.trackerRow, event.shiftKey, [...elements.output.querySelectorAll("[data-tracker-row]")]);
            return;
        }

        if (card && !target.closest("a, button, input, select, label, summary")) {
            state.selectedTrackerKey = card.dataset.trackerRow;
            renderTrackerView();
        }
    });

    elements.output.addEventListener("change", (event) => {
        const target = event.target instanceof Element ? event.target : null;

        if (!target || state.mode !== "trackers") {
            return;
        }

        const tracker = getActiveTracker();
        const select = target.closest("[data-tracker-select]");

        if (select) {
            const key = select.dataset.trackerSelect;

            if (select.checked) {
                state.trackerSelection.add(key);
                state.trackerSelectionAnchor = key;
            } else {
                state.trackerSelection.delete(key);
            }

            renderTrackerView();
            return;
        }

        if (target.id === "trackerSelectAll") {
            getTrackerView(tracker).rows.forEach((row) => {
                if (target.checked) {
                    state.trackerSelection.add(row.key);
                } else {
                    state.trackerSelection.delete(row.key);
                }
            });
            renderTrackerView();
            return;
        }

        if (target.id === "trackerSort") {
            state.trackerSort[tracker.id] = { key: target.value, direction: "asc" };
            renderTrackerView();
            return;
        }

        const facet = target.closest("[data-tracker-facet]");

        if (facet) {
            const definition = tracker.facets.find((candidate) => candidate.key === facet.dataset.trackerFacet);

            if (definition) {
                getTrackerFilters(tracker)[definition.key] = definition.kind === "check" ? facet.checked : facet.value;
                state.trackerPageIndex = 0;
                renderTrackerView();
            }
        }
    });

    // Search filters as you type, so it re-renders and restores its own caret.
    elements.output.addEventListener("input", (event) => {
        const target = event.target instanceof Element ? event.target : null;

        if (!target || state.mode !== "trackers") {
            return;
        }

        const search = target.closest('[data-tracker-facet="search"]');

        if (!search) {
            return;
        }

        const tracker = getActiveTracker();

        getTrackerFilters(tracker).search = search.value;
        state.trackerPageIndex = 0;
        renderTrackerView();

        const restored = document.getElementById("trackerFacet-search");

        if (restored) {
            restored.focus();
            restored.setSelectionRange(restored.value.length, restored.value.length);
        }
    });

    elements.output.addEventListener("focusout", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const count = target?.closest(".tracker-count");

        if (count && state.mode === "trackers") {
            commitTrackerCount(count);
        }
    });

    elements.output.addEventListener("keydown", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const count = target?.closest(".tracker-count");

        if (!count) {
            return;
        }

        if (event.key === "Enter") {
            event.preventDefault();
            count.blur();
        }

        if (event.key === "Escape") {
            event.preventDefault();
            count.value = "";
            count.blur();
        }
    });
}

/** A persistent boolean uses one affirmative control; activating it again reverses it. */
function commitTrackerSet(button) {
    const tracker = getActiveTracker();
    const { trackerItem: itemKey, trackerSet: field } = button.dataset;
    const entry = getEntry(state.trackerProgress, tracker.id, itemKey, tracker.entryDefaults);
    const nextValue = !Boolean(entry[field]);
    const changes = { [field]: nextValue, [REVIEWED_FIELD]: true };

    const change = writeTrackerEntries(tracker, [itemKey], () => changes, {
        kind: "entry",
        label: `${itemKey} — ${nextValue ? "yes" : "no"}`
    });

    refreshTrackerRow(tracker, itemKey);
    showUndo(change);
}

/**
 * Keyboard model for the grid, rebuilt for cards.
 *
 * The grid is one tab stop, like the ARIA grid pattern: Tab reaches the card you were
 * last on, arrows move between cards, and the number keys pick a state without
 * reaching for the mouse. Marking a hundred items should never require a hundred
 * pointer trips.
 */
function bindGridKeyboard() {
    if (gridKeyboardBound) {
        return;
    }

    gridKeyboardBound = true;

    elements.output.addEventListener("keydown", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const card = target?.closest("[data-tracker-row]");

        if (!card || target.closest("input, textarea, select")) {
            return;
        }

        const cards = [...elements.output.querySelectorAll("[data-tracker-row]")];
        const index = cards.indexOf(card);
        const columns = countGridColumns();
        const move = {
            ArrowRight: 1,
            ArrowLeft: -1,
            ArrowDown: columns,
            ArrowUp: -columns,
            j: columns,
            k: -columns
        }[event.key];

        if (move !== undefined) {
            event.preventDefault();
            focusCard(cards[Math.min(cards.length - 1, Math.max(0, index + move))]);
            return;
        }

        // Digits pick a state directly: 1 is the leftmost option, and 0 clears.
        if (/^[0-9]$/.test(event.key)) {
            const options = [...card.querySelectorAll("[data-tracker-stage-value], [data-tracker-set-value]")];
            const wanted = Number(event.key);
            const option = wanted === 0 ? options.find((o) => o.classList.contains("is-on")) : options[wanted - 1];

            if (option) {
                event.preventDefault();
                option.click();
                focusCard(elements.output.querySelector(`[data-tracker-row="${CSS.escape(card.dataset.trackerRow)}"]`));
            }

            return;
        }

        if (event.key === "x") {
            if (getBulkActions(getActiveTracker()).length) {
                event.preventDefault();
                state.trackerSelectionMode = true;
                toggleRowSelection(card.dataset.trackerRow, event.shiftKey, cards);
            }

            return;
        }

        if (event.key === "Enter") {
            const count = card.querySelector(".tracker-count");

            if (count) {
                event.preventDefault();
                count.focus();
                count.select();
            }
        }
    });
}

let gridKeyboardBound = false;

function countGridColumns() {
    const grid = elements.output.querySelector(".card-grid");

    if (!grid) {
        return 1;
    }

    return Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length);
}

function focusCard(card) {
    if (!card) {
        return;
    }

    elements.output.querySelectorAll("[data-tracker-row]").forEach((candidate) => {
        candidate.setAttribute("tabindex", "-1");
    });
    card.setAttribute("tabindex", "0");
    card.focus();
    state.trackerCursorKey = card.dataset.trackerRow;
}

/** Exactly one card is in the page tab order, so Tab lands where you left off. */
function applyGridTabStop() {
    const cards = [...elements.output.querySelectorAll("[data-tracker-row]")];

    if (!cards.length) {
        return;
    }

    const cursor = cards.find((card) => card.dataset.trackerRow === state.trackerCursorKey) ?? cards[0];

    cards.forEach((card) => card.setAttribute("tabindex", card === cursor ? "0" : "-1"));
}

function attachTrackerActions() {
    bindTrackerDelegation();
    bindGridKeyboard();
    applyGridTabStop();
    attachTrackerTransfer(getActiveTracker());
}

function attachTrackerTransfer(tracker) {
    if (!tracker.transfer) {
        return;
    }

    const importButton = document.getElementById("trackerImportButton");
    const importInput = document.getElementById("trackerImportInput");
    const exportButton = document.getElementById("trackerExportButton");

    if (importButton && importInput) {
        importButton.addEventListener("click", () => importInput.click());
        importInput.addEventListener("change", () => importTrackerFile(importInput, tracker));
    }

    if (exportButton) {
        exportButton.addEventListener("click", () => exportTrackerFile(tracker));
    }

    document.getElementById("trackerPasteButton")?.addEventListener("click", () => {
        state.transfer = { stage: "paste", tracker };
        renderApp();
    });
}

function exportTrackerFile(tracker) {
    captureVisibleInputs();

    const exportedAt = new Date().toISOString();

    downloadFile(
        exportTrackerCsv(buildTrackerRows(tracker), getTrackerItems(tracker), tracker),
        buildTrackerExportFileName(tracker, exportedAt),
        "text/csv"
    );
    announce(`${tracker.label} progress exported.`);
}

/**
 * Import replaces this tracker's whole record, so it asks first when there is
 * something to lose. Points and thresholds are never read from the file.
 */
/* ==========================================================================
   Bringing progress in from a file or a paste

   Both paths go through the same review: adds, changes, names that did not match,
   and what is deliberately left alone. Items the source does not mention stay
   unknown rather than being zeroed, because an incomplete file is not a set of
   claims about the character. One change entry covers the whole thing, so it undoes
   in a single step.
   ========================================================================== */

/** Turns a parsed record into the four lists the review shows. */
function buildTransferReview(tracker, record, unmatched, source, total) {
    const additions = [];
    const changes = [];
    const rowsByKey = new Map(buildTrackerRows(tracker).map((row) => [row.key, row]));

    Object.entries(record).forEach(([itemKey, entry]) => {
        const current = getStoredEntry(state.trackerProgress, tracker.id, itemKey);
        const row = rowsByKey.get(itemKey);
        const after = describeEntry(tracker, itemKey, entry);

        if (!current) {
            additions.push({ name: itemKey, after });
            return;
        }

        if (JSON.stringify(current) !== JSON.stringify(entry)) {
            changes.push({ name: itemKey, before: row ? describeEntry(tracker, itemKey, current) : "?", after });
        }
    });

    return {
        tracker,
        source,
        additions,
        changes,
        unmatched,
        untouched: getTrackerItems(tracker).length - Object.keys(record).length,
        total,
        record
    };
}

/** A short, human description of an entry, for the before → after columns. */
function describeEntry(tracker, itemKey, entry) {
    const item = getTrackerItems(tracker).find((candidate) => tracker.itemKey(candidate) === itemKey);

    if (!item) {
        return "?";
    }

    const row = tracker.derive(item, { ...tracker.entryDefaults, ...entry }, getTrackerContext(tracker));

    row.known = true;

    // A typed count and a tile are different facts, so the review names which one
    // it is rather than collapsing both into the tile they imply.
    if (row.hasTypedKills) {
        return `${formatNumber(row.typedKills)} kills`;
    }

    return describeValue(tracker, row);
}

function openTransferReview(review) {
    state.transfer = review;
    renderApp();
}

function renderTransferReviewView() {
    elements.comparisonSection.hidden = true;
    elements.inputSection.hidden = true;
    elements.analysisSection.hidden = false;
    elements.respawnModeBlock.hidden = true;

    if (state.transfer.stage === "paste") {
        renderPasteBox(elements.output, state.transfer.tracker);
        document.getElementById("pasteCancel").addEventListener("click", closeTransfer);
        document.getElementById("pasteReview").addEventListener("click", () => {
            reviewPastedList(state.transfer.tracker, document.getElementById("pasteInput").value);
        });
        return;
    }

    renderTransferReview(elements.output, state.transfer);
    document.getElementById("transferCancel").addEventListener("click", closeTransfer);
    document.getElementById("transferApply").addEventListener("click", applyTransfer);
}

function closeTransfer() {
    state.transfer = null;
    renderApp();
}

function applyTransfer() {
    const { tracker, record, additions, changes } = state.transfer;
    const keys = Object.keys(record);
    const change = writeTrackerEntries(tracker, keys, (itemKey) => record[itemKey], {
        kind: "import",
        label: `${tracker.label}: ${additions.length} added, ${changes.length} changed`
    });

    state.transfer = null;
    renderApp();
    showUndo(change);
}

/**
 * A pasted column of names, optionally with a value after a tab or comma. A bare
 * name means "this one is done", which is what a list copied off a client screen
 * usually means.
 */
function reviewPastedList(tracker, text) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    if (!lines.length) {
        showAlert("Nothing pasted yet.");
        return;
    }

    const byKey = new Map(getTrackerItems(tracker).map((item) => {
        const key = tracker.itemKey(item);

        return [key.trim().toLowerCase(), key];
    }));
    const record = {};
    const unmatched = [];

    lines.forEach((line) => {
        const [rawName, rawValue] = line.split(/\t|,(?=\s*\d)/);
        const key = byKey.get(String(rawName).trim().toLowerCase());

        if (!key) {
            unmatched.push(rawName.trim());
            return;
        }

        record[key] = buildPastedEntry(tracker, rawValue);
    });

    if (!Object.keys(record).length) {
        showAlert(`None of those ${lines.length} names matched the ${tracker.label} data.`);
        return;
    }

    openTransferReview(buildTransferReview(tracker, record, unmatched, "pasted list", lines.length));
}

function buildPastedEntry(tracker, rawValue) {
    const value = Number.parseInt(String(rawValue ?? "").replace(/[,\s]/g, ""), 10);

    if (tracker.tickField) {
        return { ...tracker.entryDefaults, [tracker.tickField]: true };
    }

    if (Number.isFinite(value) && value > 0) {
        return { ...tracker.entryDefaults, kills: value };
    }

    // No number given: a bare name means the entry is finished.
    if (tracker.id === "bestiary") {
        return { ...tracker.entryDefaults, stage: STAGE_COMPLETE };
    }

    if (tracker.id === "charms") {
        return { ...tracker.entryDefaults, stage: 3 };
    }

    return { ...tracker.entryDefaults };
}

async function importTrackerFile(input, tracker) {
    const file = input.files?.[0];

    input.value = "";

    if (!file) {
        return;
    }

    try {
        const text = await file.text();
        const isJson = /\.json$/i.test(file.name) || /^[[{]/.test(text.trimStart());
        const items = getTrackerItems(tracker);
        const result = isJson
            ? importTrackerJson(text, items, tracker)
            : importTrackerCsv(text, items, tracker);

        if (!result.matched) {
            throw new Error(`No ${tracker.label} entry in that file matched the dataset.`);
        }

        openTransferReview(buildTransferReview(tracker, result.record, result.unmatched, file.name, result.matched));
    } catch (error) {
        showAlert(error.message);
    }
}



function findHuntById(huntId) {
    return state.hunts.find((hunt) => hunt.id === huntId);
}

/**
 * Renaming has to show up in the tab strip immediately, but a full re-render
 * while typing would destroy the field. So the one affected tab label is
 * updated in place, the same way updateCharmPlanResult() refreshes its tab.
 */
function syncHuntTabLabel(huntId) {
    const label = elements.huntTabStrip
        .querySelector(`[data-hunt-select="${huntId}"] .hunt-tab-label`);

    if (label) {
        label.textContent = getHuntLabelById(huntId);
    }
}

/**
 * Library text fields write straight to state on every keystroke and do not
 * re-render, so the caret is never disturbed while typing.
 */
function attachLibraryFieldEditors() {
    const savedTimers = new WeakMap();

    const bindField = (attribute, apply) => {
        elements.output.querySelectorAll(`[${attribute}]`).forEach((input) => {
            input.addEventListener("input", () => {
                const huntId = input.getAttribute(attribute);
                const hunt = findHuntById(huntId);

                if (!hunt) {
                    return;
                }

                apply(hunt, input.value);
                persistState();
                syncHuntTabLabel(huntId);

                input.classList.remove("is-saved");
                window.clearTimeout(savedTimers.get(input));
                savedTimers.set(input, window.setTimeout(() => {
                    input.classList.add("is-saved");
                    announce(`${getHuntLabelById(huntId)} saved.`);
                    window.setTimeout(() => input.classList.remove("is-saved"), 900);
                }, 350));
            });
        });
    };

    bindField("data-library-name", (hunt, value) => { hunt.name = value; });
    bindField("data-library-date", (hunt, value) => { hunt.huntedOn = value; });
    bindField("data-library-notes", (hunt, value) => { hunt.notes = value; });
}

function attachLibraryActions() {
    attachLibraryFieldEditors();

    elements.output.querySelectorAll("[data-library-sort]").forEach((button) => {
        button.addEventListener("click", () => {
            state.librarySort = {
                key: button.dataset.librarySort,
                direction: button.dataset.libraryDirection === "desc" ? "desc" : "asc"
            };
            renderApp();
        });
    });

    elements.output.querySelectorAll("[data-library-filter-respawn]").forEach((button) => {
        button.addEventListener("click", () => {
            state.libraryFilters.respawnMode = button.dataset.libraryFilterRespawn;
            renderApp();
        });
    });

    const search = document.getElementById("librarySearch");

    if (search) {
        search.addEventListener("input", () => {
            state.libraryFilters.search = search.value;
            renderSessionLibraryView();

            // Re-rendering replaces the field, so focus and caret are restored.
            const restored = document.getElementById("librarySearch");

            if (restored) {
                restored.focus();
                restored.setSelectionRange(restored.value.length, restored.value.length);
            }
        });
    }

    elements.output.querySelectorAll("[data-library-open]").forEach((button) => {
        button.addEventListener("click", () => selectHunt(button.dataset.libraryOpen));
    });

    elements.output.querySelectorAll("[data-library-delete]").forEach((button) => {
        button.addEventListener("click", () => closeHuntTab(button.dataset.libraryDelete));
    });

    const addButton = document.getElementById("libraryAddButton");

    if (addButton) {
        addButton.addEventListener("click", addHuntTab);
    }
}

function attachAllTabsActions() {
    const resetButton = document.getElementById("allTabsResetButton");

    if (resetButton) {
        resetButton.addEventListener("click", resetAllTabsTotals);
    }

    elements.output.querySelectorAll("[data-all-tabs-entry]").forEach((button) => {
        button.addEventListener("click", () => toggleAllTabsEntry(button.dataset.allTabsEntry));
    });
}

function attachResultActions() {
    const clearInputsButton = document.getElementById("clearInputsButton");

    if (clearInputsButton) {
        clearInputsButton.addEventListener("click", clearInputs);
    }

    elements.output.querySelectorAll("[data-bestiary-monster]").forEach((button) => {
        button.addEventListener("click", () => {
            captureActiveHuntInputs();

            const hunt = getActiveHunt();
            const monsterName = button.dataset.bestiaryMonster;
            const isSelected = hunt.selectedBestiaryMonsterNames.includes(monsterName);

            hunt.selectedBestiaryMonsterNames = isSelected
                ? hunt.selectedBestiaryMonsterNames.filter((name) => name !== monsterName)
                : [...hunt.selectedBestiaryMonsterNames, monsterName];

            renderApp();
            persistState();
        });
    });
}

function attachTaskSessionLinks() {
    elements.output.querySelectorAll("[data-task-session]").forEach((button) => {
        button.addEventListener("click", () => selectHunt(button.dataset.taskSession));
    });
}

function attachTaskActions() {
    const taskTotalInput = document.getElementById("taskTotalKills");

    elements.output.querySelectorAll("[data-task-monster]").forEach((button) => {
        button.addEventListener("click", () => {
            getActiveHunt().selectedTaskMonsterName = button.dataset.taskMonster;
            renderApp();
            persistState();
        });
    });

    if (!taskTotalInput) {
        return;
    }

    taskTotalInput.addEventListener("input", (event) => {
        getActiveHunt().taskTargetKills = event.target.value;
        persistState();
    });

    taskTotalInput.addEventListener("change", () => {
        renderApp();
    });

    taskTotalInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") {
            return;
        }

        event.preventDefault();
        renderApp();
    });
}

function processHuntLog(hunt, logText) {
    const bestiary = analyzeSession(logText, state.bestiaryData);
    const tasks = analyzeTaskSession(logText);
    const taskNames = new Set(tasks.monsters.map((monster) => monster.name));

    dropAllTabsEntriesOfHunt(hunt.id);
    hunt.sessionDuration = bestiary.sessionDuration;
    hunt.hasProcessedLog = true;

    // Stamp the archive date on first processing only, so a date the user
    // corrected in the library is never overwritten by re-processing.
    if (!hunt.huntedOn) {
        hunt.huntedOn = new Date().toISOString().slice(0, 10);
    }

    hunt.matchedMonsters = bestiary.monsters;
    hunt.selectedBestiaryMonsterNames = bestiary.monsters.map((monster) => monster.name);
    hunt.taskMonsters = tasks.monsters;
    hunt.selectedTaskMonsterName = taskNames.has(hunt.selectedTaskMonsterName)
        ? hunt.selectedTaskMonsterName
        : (tasks.monsters[0]?.name ?? "");
    state.isSessionInputOpen = false;

    renderApp();
    persistState();
    announce(bestiary.monsters.length
        ? `Analysis updated, ${bestiary.monsters.length} creatures matched.`
        : "No creatures matched the Bestiary dataset.");

    if (bestiary.sessionDuration === 0) {
        showAlert("No session duration found in the pasted text, so no time can be estimated.");
    }
}

function processLog() {
    captureVisibleInputs();

    const logText = getActiveHunt().sessionLog.trim();

    if (!logText) {
        state.isSessionInputOpen = true;
        renderApp();
        showAlert("Paste the Hunt Analyzer text before processing.");
        elements.sessionLog.focus();
        return;
    }

    setBusyState(true);
    processHuntLog(getActiveHunt(), logText);
    setBusyState(false);
}

function applyWorkspace(workspace) {
    state.mode = workspace.mode;
    state.trackerProgress = workspace.trackerProgress ?? createTrackerProgress();
    state.changeLog = workspace.changeLog ?? createChangeLog();
    state.trackerSelection = new Set();
    state.trackerSelectionMode = false;
    state.pendingUndoId = "";
    state.hunts = workspace.hunts;
    state.activeHuntId = workspace.activeHuntId;
    state.excludedAllTabsEntries = workspace.excludedAllTabsEntries;
    state.bestiaryView = workspace.bestiaryView;
    state.tasksView = workspace.tasksView;
    state.ignoredPlanHuntIds = workspace.ignoredPlanHuntIds;
    state.planRespawnMode = workspace.planRespawnMode;
    state.playTimeInput = workspace.playTimeInput;
    normalizeView();
}

/**
 * Boot order: the current app-level save, then — only when that key has never
 * been written — a one-time migration of the old single-workspace save into a
 * first character, then a fresh default character. The old key is left
 * untouched as a non-destructive backup, and the migrated or default result is
 * persisted immediately, before any render, so a crash mid-session can never
 * lose the one-time migration.
 */
function restoreAppState() {
    let resolved = restoreAppWorkspace(loadAppState());

    if (!resolved) {
        const legacyWorkspace = restoreWorkspace(loadWorkspaceState());
        const character = legacyWorkspace
            ? wrapLegacyWorkspaceAsCharacter(legacyWorkspace)
            : createDefaultCharacter();

        resolved = { characters: [character], activeCharacterId: character.id };
        saveAppState(resolved);
    }

    state.characters = resolved.characters;
    state.activeCharacterId = resolved.activeCharacterId;

    const active = state.characters.find((character) => character.id === state.activeCharacterId)
        || state.characters[0];

    applyWorkspace(active.workspace);

    return hasWorkspaceContent();
}

function downloadFile(text, fileName, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");

    downloadLink.href = url;
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    URL.revokeObjectURL(url);
}


async function initializeApp() {
    try {
        setBusyState(true);
        state.bestiaryData = await loadBestiaryData();
        state.trackerItems = await loadTrackerItems(state.bestiaryData);

        const hasRestoredContent = restoreAppState();
        renderApp();

        if (hasRestoredContent) {
            return;
        }

    } catch (error) {
        showAlert("Could not load Bestiary data. Refresh the page to try again.");
    } finally {
        setBusyState(false);
    }
}

elements.sessionLog.addEventListener("input", () => {
    const hunt = getActiveHunt();

    if (hunt) {
        hunt.sessionLog = elements.sessionLog.value;
    }
});
elements.sessionLog.addEventListener("change", persistState);
elements.pasteLogButton.addEventListener("click", pasteLog);
elements.clearLogButton.addEventListener("click", clearLog);
elements.compareHuntsButton.addEventListener("click", showComparison);
elements.sessionRegularButton.addEventListener("click", () => setSessionRespawnMode("regular"));
elements.sessionRapidButton.addEventListener("click", () => setSessionRespawnMode("rapid"));
elements.processLogButton.addEventListener("click", processLog);
elements.sessionToggle.addEventListener("click", () => {
    captureVisibleInputs();
    state.isSessionInputOpen = !state.isSessionInputOpen;
    renderApp();
    persistState();

    if (state.isSessionInputOpen) {
        elements.sessionLog.focus();
    }
});
elements.output.addEventListener("focusout", handleKillsCommit);
elements.output.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.classList?.contains("kills-input")) {
        event.preventDefault();
        event.target.blur();
    }
});
function navigateWorkspace(mode, view) {
    captureVisibleInputs();
    state.mode = mode;
    setModeView(view);
    // Navigating anywhere leaves the recording flow. Without this the landing keeps
    // rendering over whatever the player chose, and there is no way back out.
    leaveRecordFlow();
    state.selectedTrackerKey = "";
    state.isSessionInputOpen = false;
    renderApp();
    persistState();
}

/**
 * Everything the player could want to change, from every tracker, as one flat list
 * for the quick-add combobox. Each entry carries the controls that make sense for
 * its own shape, so a Bestiary creature offers tiles and a quest offers a tick.
 */
function buildQuickAddItems() {
    return TRACKERS.flatMap((tracker) => {
        const rows = buildTrackerRows(tracker);

        return rows.map((row) => {
            const controls = buildQuickControls(tracker, row);

            return {
                trackerId: tracker.id,
                trackerLabel: tracker.label,
                key: row.key,
                name: row.name,
                valueLabel: quickValueLabel(tracker, row),
                controls,
                countField: Object.keys(tracker.entryDefaults).includes("kills") ? "kills" : ""
            };
        });
    });
}

function quickValueLabel(tracker, row) {
    if (!row.known) {
        return "not recorded";
    }

    if (tracker.id === "bestiary") {
        return row.isComplete ? "complete" : `${formatNumber(row.kills)} / ${formatNumber(row.unlockTarget)}`;
    }

    if (tracker.id === "bosstiary") {
        return row.stageOptions?.find((stage) => stage.value === row.stage)?.label ?? "none";
    }

    if (tracker.id === "charms") {
        return row.stage ? `stage ${row.stage}` : "locked";
    }

    return tracker.tickField && row[tracker.tickField] ? "yes" : "no";
}

function buildQuickControls(tracker, row) {
    if (tracker.id === "bestiary") {
        return BESTIARY_STAGES.map((stage) => ({
            field: "stage",
            value: stage.value,
            label: stage.label,
            isCurrent: row.stage === stage.value
        }));
    }

    if (tracker.id === "bosstiary") {
        return (row.stageOptions ?? []).map((stage) => ({
            field: "stage",
            value: stage.value,
            label: stage.label,
            isCurrent: row.stage === stage.value
        }));
    }

    if (tracker.id === "charms") {
        return [0, 1, 2, 3].map((stage) => ({
            field: "stage",
            value: stage,
            label: stage === 0 ? "Locked" : `Stage ${stage}`,
            isCurrent: row.stage === stage
        }));
    }

    const tickField = tracker.tickField;

    if (!tickField) {
        return [];
    }

    return [
        { field: tickField, value: 1, label: "Yes", isCurrent: Boolean(row[tickField]) },
        { field: tickField, value: 0, label: "No", isCurrent: row.known && !row[tickField] }
    ];
}

/**
 * Quick add writes through the same path as the table, so it undoes the same way —
 * and then it does not navigate. Landing back where you were is the whole point.
 */
function applyQuickSet(item, field, value) {
    const tracker = getTracker(item.trackerId);
    const isBoolean = typeof tracker.entryDefaults[field] === "boolean";
    const changes = isBoolean ? { [field]: Boolean(value) } : { [field]: value };

    // Setting a tile by hand clears a count that would otherwise outrank it.
    if (field === "stage" && tracker.id === "bestiary") {
        changes.kills = 0;
    }

    const change = writeTrackerEntries(tracker, [item.key], () => changes, {
        kind: "entry",
        label: `${item.name} → ${isBoolean ? (value ? "yes" : "no") : formatNumber(value)}`
    });

    if (state.mode === "trackers" && state.activeTrackerId === tracker.id) {
        refreshTrackerRow(tracker, item.key);
    }

    showUndo(change);
}

function focusWorkspaceSearch(returnFocusSelector) {
    openQuickAdd({
        items: buildQuickAddItems(),
        onSet: applyQuickSet,
        returnFocusSelector
    });
}

document.addEventListener("keydown", (event) => {
    // The event target can be the document itself, which has no closest().
    const target = event.target instanceof Element ? event.target : null;
    const inField = (selector) => Boolean(target?.closest(selector));

    if (event.key === "/" && !inField("input, textarea, select, [contenteditable]")) {
        event.preventDefault();
        focusWorkspaceSearch();
        return;
    }

    if (event.key === "Escape" && isQuickAddOpen()) {
        closeQuickAdd();
        return;
    }

    // Undo is global: the change may have come from a table, a bulk mark, a unit or
    // an import, and they all restore the same way.
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z"
        && !inField("input, textarea, [contenteditable]")) {
        event.preventDefault();
        undoLatestChange();
    }
});

elements.detailCloseButton.addEventListener("click", () => {
    closeDetailPanel();
    if (state.mode === "trackers") {
        renderTrackerView();
    }
});
elements.newSessionButton.addEventListener("click", () => {
    if (state.mode !== "bestiary") {
        captureVisibleInputs();
        state.mode = "bestiary";
    }
    state.bestiaryView = "session";
    addHuntTab();
});
elements.output.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;

    if (target?.closest("[data-empty-open-session]")) {
        openCurrentSession();
    }
});

/* --------------------------------------------------------------------------
   Sidebar wiring
   -------------------------------------------------------------------------- */

elements.sidebarDashboardLink.addEventListener("click", () => {
    navigateWorkspace("dashboard");
    setSidebarOpen(false);
});
elements.sidebarSearchLink.addEventListener("click", () => {
    focusWorkspaceSearch();
    setSidebarOpen(false);
});
elements.sidebarTrackerList.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("[data-sidebar-tracker]");

    if (!button) {
        return;
    }

    navigateWorkspace("trackers", button.dataset.sidebarTracker);
    setSidebarOpen(false);
});
elements.sidebarPlanningList.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("[data-nav-planning]");

    if (!button) {
        return;
    }

    if (button.dataset.navPlanning === "taskSessions") {
        navigateWorkspace("tasks", "allSessions");
    } else {
        navigateWorkspace("bestiary", button.dataset.navPlanning);
    }

    setSidebarOpen(false);
});
elements.sidebarExportButton.addEventListener("click", exportAppData);
elements.sidebarImportButton.addEventListener("click", () => elements.sidebarImportInput.click());
elements.sidebarImportInput.addEventListener("change", () => {
    const file = elements.sidebarImportInput.files?.[0];

    if (file) {
        importAppData(file);
    }

    elements.sidebarImportInput.value = "";
});
elements.sidebarRecentChangesButton.addEventListener("click", () => {
    openRecentChanges();
    setSidebarOpen(false);
});
elements.sidebarClearDataButton.addEventListener("click", clearAllDataFlow);

elements.sidebarCharacterButton.addEventListener("click", () => {
    state.isCharacterMenuOpen = !state.isCharacterMenuOpen;
    renderApp();
});
elements.sidebarRenameButton.addEventListener("click", startRenameCharacter);
elements.sidebarDeleteCharacterButton.addEventListener("click", deleteCharacterFlow);
elements.sidebarAddCharacterButton.addEventListener("click", addCharacterFlow);
elements.sidebarCharacterInput.addEventListener("blur", commitRenameCharacter);
elements.sidebarCharacterInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        elements.sidebarCharacterInput.blur();
    }

    if (event.key === "Escape") {
        event.preventDefault();
        cancelRenameCharacter();
    }
});
elements.sidebarCharacterMenu.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;

    if (target?.closest("[data-sidebar-add-character]")) {
        addCharacterFlow();
        return;
    }

    const option = target?.closest("[data-sidebar-character]");

    if (option) {
        switchCharacter(option.dataset.sidebarCharacter);
    }
});
document.addEventListener("click", (event) => {
    if (!state.isCharacterMenuOpen) {
        return;
    }

    const target = event.target instanceof Element ? event.target : null;

    if (target?.closest("#sidebarCharacter")) {
        return;
    }

    state.isCharacterMenuOpen = false;
    renderApp();
});

elements.sidebarCollapseButton.addEventListener("click", () => setSidebarCollapsed(!state.isSidebarCollapsed));
elements.sidebarMenuToggle.addEventListener("click", () => {
    setSidebarOpen(!elements.appSidebar.classList.contains("is-open"));
});
elements.sidebarScrim.addEventListener("click", () => setSidebarOpen(false));

setSidebarCollapsed(loadSidebarCollapsed());

initializeApp();
