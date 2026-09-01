import { restoreTrackerProgress } from "./tracker-progress.js";
import { restoreChangeLog } from "./change-log.js";
import { getTrackerEntryDefaults, getTrackerIds } from "../trackers/registry.js";

let huntSequence = 0;

const BESTIARY_VIEWS = ["session", "allSessions", "charmPlan", "comparison", "library", "opportunities"];
const TASKS_VIEWS = ["session", "allSessions", "library"];
const RESPAWN_MODES = ["regular", "rapid"];
const MODES = ["bestiary", "trackers", "tasks", "dashboard"];

function normalizeRespawnMode(value) {
    return RESPAWN_MODES.includes(value) ? value : "regular";
}

function nextHuntId() {
    huntSequence += 1;
    return `hunt-${huntSequence}`;
}

export function createHunt() {
    return {
        id: nextHuntId(),
        // Archive metadata. `name` is empty until the user renames the session,
        // so the positional "Session N" label stays the default.
        name: "",
        huntedOn: "",
        notes: "",
        respawnMode: "regular",
        sessionLog: "",
        sessionDuration: 0,
        hasProcessedLog: false,
        matchedMonsters: [],
        selectedBestiaryMonsterNames: [],
        taskMonsters: [],
        selectedTaskMonsterName: "",
        taskTargetKills: ""
    };
}

export function createWorkspace() {
    const hunt = createHunt();

    return {
        // The Dashboard is the app's homepage — where a brand-new character lands.
        mode: "dashboard",
        trackerProgress: {},
        // The undo trail. Empty for a new workspace.
        changeLog: [],
        hunts: [hunt],
        activeHuntId: hunt.id,
        bestiaryView: "session",
        tasksView: "session",
        excludedAllTabsEntries: [],
        ignoredPlanHuntIds: [],
        planRespawnMode: "regular",
        playTimeInput: ""
    };
}

/**
 * A session's display label. A user-supplied name wins; otherwise the label is
 * positional, so unnamed sessions renumber themselves when one is deleted.
 */
export function getHuntLabel(index, hunt) {
    const name = typeof hunt?.name === "string" ? hunt.name.trim() : "";

    return name || `Session ${index + 1}`;
}

export function addHunt(hunts) {
    const hunt = createHunt();

    return {
        hunt,
        hunts: [...hunts, hunt]
    };
}

/**
 * Clearing the log discards the analysis, not the archive metadata — the name,
 * date and notes describe the hunt itself and survive re-pasting its text.
 */
export function resetHunt(hunt) {
    return {
        ...createHunt(),
        id: hunt.id,
        name: hunt.name,
        huntedOn: hunt.huntedOn,
        notes: hunt.notes,
        respawnMode: hunt.respawnMode
    };
}

export function removeHunt(hunts, huntId, activeHuntId) {
    const removedIndex = hunts.findIndex((hunt) => hunt.id === huntId);

    if (hunts.length < 2 || removedIndex === -1) {
        return { hunts, activeHuntId };
    }

    const remainingHunts = hunts.filter((hunt) => hunt.id !== huntId);

    if (huntId !== activeHuntId) {
        return { hunts: remainingHunts, activeHuntId };
    }

    const nextIndex = Math.min(removedIndex, remainingHunts.length - 1);

    return {
        hunts: remainingHunts,
        activeHuntId: remainingHunts[nextIndex].id
    };
}

function adoptSavedHuntId(savedId, generatedId, adoptedIds) {
    const trimmedSavedId = typeof savedId === "string" ? savedId.trim() : "";
    const id = trimmedSavedId && !adoptedIds.has(trimmedSavedId) ? trimmedSavedId : generatedId;

    adoptedIds.add(id);

    return id;
}

function normalizeHunt(savedHunt, adoptedIds) {
    const matchedMonsters = Array.isArray(savedHunt?.matchedMonsters) ? savedHunt.matchedMonsters : [];
    const hunt = createHunt();

    return {
        ...hunt,
        id: adoptSavedHuntId(savedHunt?.id, hunt.id, adoptedIds),
        name: typeof savedHunt?.name === "string" ? savedHunt.name : "",
        huntedOn: typeof savedHunt?.huntedOn === "string" ? savedHunt.huntedOn : "",
        notes: typeof savedHunt?.notes === "string" ? savedHunt.notes : "",
        respawnMode: normalizeRespawnMode(savedHunt?.respawnMode),
        sessionLog: typeof savedHunt?.sessionLog === "string" ? savedHunt.sessionLog : "",
        sessionDuration: Number(savedHunt?.sessionDuration) || 0,
        hasProcessedLog: Boolean(savedHunt?.hasProcessedLog),
        matchedMonsters,
        selectedBestiaryMonsterNames: Array.isArray(savedHunt?.selectedBestiaryMonsterNames)
            ? savedHunt.selectedBestiaryMonsterNames
            : matchedMonsters.map((monster) => monster.name),
        taskMonsters: Array.isArray(savedHunt?.taskMonsters) ? savedHunt.taskMonsters : [],
        selectedTaskMonsterName: savedHunt?.selectedTaskMonsterName || "",
        taskTargetKills: savedHunt?.taskTargetKills ?? ""
    };
}

function reserveSavedHuntIds(savedHunts) {
    savedHunts.forEach((savedHunt) => {
        const savedSequence = Number.parseInt(String(savedHunt?.id).replace("hunt-", ""), 10);

        if (Number.isFinite(savedSequence) && savedSequence > huntSequence) {
            huntSequence = savedSequence;
        }
    });
}

function normalizeView(savedView, allowedViews) {
    return allowedViews.includes(savedView) ? savedView : "session";
}

function normalizeMode(savedMode) {
    return MODES.includes(savedMode) ? savedMode : "dashboard";
}

export function restoreWorkspace(savedState) {
    const savedHunts = Array.isArray(savedState?.hunts) ? savedState.hunts : [];

    if (!savedHunts.length) {
        return null;
    }

    reserveSavedHuntIds(savedHunts);

    const adoptedIds = new Set();
    const hunts = savedHunts.map((savedHunt) => normalizeHunt(savedHunt, adoptedIds));
    const savedActiveIndex = savedHunts.findIndex((hunt) => hunt?.id === savedState?.activeHuntId);
    const savedExcludedEntries = Array.isArray(savedState?.excludedAllTabsEntries)
        ? savedState.excludedAllTabsEntries.filter((entryKey) => typeof entryKey === "string")
        : [];
    const savedIgnoredPlanHuntIds = Array.isArray(savedState?.ignoredPlanHuntIds)
        ? savedState.ignoredPlanHuntIds.filter((huntId) => typeof huntId === "string")
        : [];

    return {
        mode: normalizeMode(savedState?.mode),
        // `bestiaryProgress` is the pre-framework shape, when Bestiary was the
        // only tracker and its record sat at the top level.
        trackerProgress: restoreTrackerProgress(
            savedState?.trackerProgress,
            getTrackerEntryDefaults(),
            savedState?.bestiaryProgress
        ),
        changeLog: restoreChangeLog(savedState?.changeLog, getTrackerIds()),
        hunts,
        activeHuntId: hunts[savedActiveIndex === -1 ? 0 : savedActiveIndex].id,
        bestiaryView: normalizeView(savedState?.bestiaryView, BESTIARY_VIEWS),
        tasksView: normalizeView(savedState?.tasksView, TASKS_VIEWS),
        excludedAllTabsEntries: savedExcludedEntries,
        ignoredPlanHuntIds: savedIgnoredPlanHuntIds,
        planRespawnMode: normalizeRespawnMode(savedState?.planRespawnMode),
        playTimeInput: typeof savedState?.playTimeInput === "string" ? savedState.playTimeInput : ""
    };
}

export function huntHasContent(hunt) {
    return Boolean(hunt.sessionLog.trim() || hunt.matchedMonsters.length || hunt.taskMonsters.length);
}

export function hasBestiaryAnalysis(hunt) {
    return hunt.matchedMonsters.length > 0;
}

export function hasTaskAnalysis(hunt) {
    return hunt.taskMonsters.length > 0;
}
