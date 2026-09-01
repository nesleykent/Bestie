const STORAGE_KEY = "bestie-workspace-v1";
const APP_STORAGE_KEY = "bestie-app-v1";
const LEGACY_STORAGE_KEY = "bestiary-session-analyzer-v6";
const LEGACY_SESSION_KEY = "bestiary-session-analyzer-v5";
const LEGACY_APP_STORAGE_KEY = "bestiary-session-analyzer-app-v1";

/**
 * Workspace persistence.
 *
 * This deliberately uses localStorage rather than sessionStorage: the workspace
 * now holds a Bestiary progress record and a session archive, and losing either
 * one because a tab was closed would make the app useless as a manager.
 *
 * Every access is guarded. Storage throws rather than returning null when it is
 * disabled (Safari private browsing) or full, and a corrupt value must degrade
 * to "no saved workspace" instead of breaking the whole app on boot.
 */

function readRaw(storage, key) {
    try {
        return storage.getItem(key);
    } catch (error) {
        return null;
    }
}

function migrateLegacyState() {
    const legacyRaw = readRaw(localStorage, LEGACY_STORAGE_KEY)
        ?? readRaw(sessionStorage, LEGACY_SESSION_KEY);

    if (!legacyRaw) {
        return null;
    }

    try {
        localStorage.setItem(STORAGE_KEY, legacyRaw);
    } catch (error) {
        // Migration is best effort; the parsed value below is still returned.
    }

    return legacyRaw;
}

export function saveWorkspaceState(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
    } catch (error) {
        return false;
    }
}

export function loadWorkspaceState() {
    const rawState = readRaw(localStorage, STORAGE_KEY) ?? migrateLegacyState();

    if (!rawState) {
        return null;
    }

    try {
        return JSON.parse(rawState);
    } catch (error) {
        return null;
    }
}

/**
 * The Bestie application workspace (every character). It has a separate key
 * from the single-character workspace and migrates the previous application's
 * multi-character key the first time Bestie loads it.
 */
export function saveAppState(state) {
    try {
        localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(state));
        return true;
    } catch (error) {
        return false;
    }
}

export function loadAppState() {
    const currentRaw = readRaw(localStorage, APP_STORAGE_KEY);
    const legacyRaw = currentRaw ? null : readRaw(localStorage, LEGACY_APP_STORAGE_KEY);
    const rawState = currentRaw ?? legacyRaw;

    if (!rawState) {
        return null;
    }

    if (!currentRaw && legacyRaw) {
        try {
            localStorage.setItem(APP_STORAGE_KEY, legacyRaw);
        } catch (error) {
            // Migration is best effort; the parsed legacy value is still used.
        }
    }

    try {
        return JSON.parse(rawState);
    } catch (error) {
        return null;
    }
}

/**
 * Erases every trace this app has left in the browser — the current app
 * state, the pre-multi-character save it may have migrated from, and the
 * legacy session-storage key that save itself could still be waiting to
 * migrate from. A page reload after this boots as if the app were never
 * used, which is the whole point of the action.
 */
export function clearAllStoredState() {
    try {
        localStorage.removeItem(APP_STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_APP_STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        sessionStorage.removeItem(LEGACY_SESSION_KEY);
        return true;
    } catch (error) {
        return false;
    }
}
