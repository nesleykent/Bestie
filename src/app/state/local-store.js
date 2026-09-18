import { isRecord, validateWorkspaceBackup, isSafeKey } from "./backup-validation.js";

const STORAGE_KEY = "bestie-workspace-v1";
const APP_STORAGE_KEY = "bestie-app-v1";
const LEGACY_STORAGE_KEY = "bestiary-session-analyzer-v6";
const LEGACY_SESSION_KEY = "bestiary-session-analyzer-v5";
const LEGACY_APP_STORAGE_KEY = "bestiary-session-analyzer-app-v1";
const SIDEBAR_COLLAPSED_KEY = "bestie-sidebar-collapsed";
let storageProblem = "";
const corruptKeys = new Set();

export function getStorageProblem() { return storageProblem; }

// Accessing window.localStorage itself can throw, before getItem is reached.
function readRaw(storageName, key) {
    try { return globalThis[storageName].getItem(key); }
    catch { storageProblem = "Browser storage is unavailable. Changes are kept only in this tab; export a backup before closing it."; return null; }
}

/**
 * `shapeField` names the array whose absence is the same bail-out condition
 * restoreWorkspace/restoreAppWorkspace already use to give up and return null
 * (no hunts, no characters). Valid JSON shaped that way would otherwise sail
 * through as "readable", get silently replaced by a fresh empty state, and
 * then get overwritten for good on the very next save — the same data loss a
 * corrupt-JSON key is already guarded against below.
 */
function hasRestorableShape(value, shapeField) {
    return !shapeField || (Array.isArray(value[shapeField]) && value[shapeField].length > 0);
}

function readState(storageName, key, shapeField) {
    const raw = readRaw(storageName, key);
    if (raw === null) return null;
    try {
        const value = JSON.parse(raw);
        if (!isRecord(value) || !hasRestorableShape(value, shapeField)) throw new Error("Invalid state");
        if(shapeField==='hunts')validateWorkspaceBackup(value);
        if(shapeField==='characters'){
            const ids=new Set();
            for(const character of value.characters){
                if(!isRecord(character)||(character.name!==undefined&&typeof character.name!=="string"))throw new Error("Invalid character");
                if(character.id!==undefined){if(!isSafeKey(character.id)||ids.has(character.id.trim()))throw new Error("Invalid character id");ids.add(character.id.trim());}
                validateWorkspaceBackup(character.workspace);
            }
        }
        return value;
    } catch {
        corruptKeys.add(key);
        storageProblem = "Saved browser data could not be read. The original is preserved; automatic saving is paused. Restore a valid backup or explicitly clear data to resume saving.";
        return null;
    }
}

function saveState(key, state, { allowReplacement = false } = {}) {
    if (corruptKeys.size && !allowReplacement) return false;
    try {
        globalThis.localStorage.setItem(key, JSON.stringify(state));
        if (allowReplacement) corruptKeys.clear();
        storageProblem = "";
        return true;
    } catch {
        storageProblem = "Changes could not be saved in this browser. Export a backup before closing the tab, then check available storage.";
        return false;
    }
}

export function saveWorkspaceState(state) { return saveState(STORAGE_KEY, state); }
export function saveAppState(state, options) { return saveState(APP_STORAGE_KEY, state, options); }

export function loadWorkspaceState() {
    for (const [storage, key] of [["localStorage", STORAGE_KEY], ["localStorage", LEGACY_STORAGE_KEY], ["sessionStorage", LEGACY_SESSION_KEY]]) {
        const value = readState(storage, key, "hunts");
        if (value) {
            if (key !== STORAGE_KEY) saveWorkspaceState(value);
            return value;
        }
        if (corruptKeys.has(key)) return null;
    }
    return null;
}

export function loadAppState() {
    const current = readState("localStorage", APP_STORAGE_KEY, "characters");
    if (current || corruptKeys.has(APP_STORAGE_KEY)) return current;
    const legacy = readState("localStorage", LEGACY_APP_STORAGE_KEY, "characters");
    if (legacy) saveAppState(legacy);
    return legacy;
}

export function loadSidebarCollapsed() {
    return readRaw("localStorage", SIDEBAR_COLLAPSED_KEY) === "1";
}
export function saveSidebarCollapsed(isCollapsed) {
    try { globalThis.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isCollapsed ? "1" : "0"); }
    catch { /* A view preference must not block data operations. */ }
}

/** Remove only Bestie's keys; attempt every key even when one removal fails. */
export function clearAllStoredState() {
    let success = true;
    for (const [storage, keys] of [
        ["localStorage", [APP_STORAGE_KEY, STORAGE_KEY, LEGACY_APP_STORAGE_KEY, LEGACY_STORAGE_KEY, SIDEBAR_COLLAPSED_KEY]],
        ["sessionStorage", [LEGACY_SESSION_KEY]]
    ]) {
        for (const key of keys) {
            try { globalThis[storage].removeItem(key); corruptKeys.delete(key); }
            catch { success = false; }
        }
    }
    storageProblem = success ? "" : "Some browser data could not be cleared. Your open workspace is unchanged; check browser storage access before trying again.";
    return success;
}
