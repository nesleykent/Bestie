/** Validate a backup before any replacement. Legacy omitted fields remain valid. */
import { STAGE_COMPLETE } from "../trackers/bestiary.js";
import { getTrackerEntryDefaults, getTrackerIds } from "../trackers/registry.js";

export const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (path) => { throw new Error(`Invalid backup at ${path}. Your current data has not been changed.`); };
const count = (value) => (typeof value === "number" || typeof value === "string")
    && String(value).trim() !== "" && Number.isSafeInteger(Number(value)) && Number(value) >= 0;

/**
 * `__proto__`, `constructor` and `prototype` are plain strings almost everywhere
 * except as an object key assigned with `obj[key] = ...` — there they can replace
 * or poison the object's own prototype instead of creating a normal property.
 * Every identifier lifted out of a backup and later used as a dynamic key is
 * checked against this before anything touches live state.
 */
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
export const isSafeKey = (key) => typeof key === "string" && key.trim() !== "" && !RESERVED_KEYS.has(key.trim());

const STAGE_MAX = { bestiary: STAGE_COMPLETE, bosstiary: 4, charms: 3 };

export function validateBackupEnvelope(payload, maxVersion) {
    if (!isRecord(payload)) fail("workspace");
    if (payload.app && !["bestie", "bestiary-session-analyzer"].includes(payload.app)) {
        throw new Error("That file was exported by a different application.");
    }
    if (payload.version !== undefined && (!Number.isInteger(payload.version) || payload.version < 1 || payload.version > maxVersion)) {
        throw new Error("This backup version is not supported. Open it with a compatible Bestie version; your current data has not been changed.");
    }
}

/** Missing legacy fields are valid; unknown fields must not be silently discarded. */
function validateEntryFields(entryDefaults, entry, path, trackerId) {
    for (const field of Object.keys(entry)) {
        if (!Object.hasOwn(entryDefaults, field)) fail(`${path}.${field}`);
    }
    for (const [field, fallback] of Object.entries(entryDefaults)) {
        if (!(field in entry)) continue;
        const value = entry[field];
        if (typeof fallback === "number") {
            if (!count(value)) fail(`${path}.${field}`);
            if (field === "stage" && Number(value) > STAGE_MAX[trackerId]) fail(`${path}.${field}`);
        } else if (typeof value !== "boolean") {
            fail(`${path}.${field}`);
        }
    }
}

function validateProgress(progress, path, trackerDefaults) {
    if (!isRecord(progress)) fail(path);
    for (const [tracker, entries] of Object.entries(progress)) {
        if (!isSafeKey(tracker) || !isRecord(entries)) fail(`${path}.${tracker}`);
        const entryDefaults = Object.hasOwn(trackerDefaults, tracker) ? trackerDefaults[tracker] : null;
        if (!entryDefaults) fail(`${path}.${tracker}`);
        for (const [key, entry] of Object.entries(entries)) {
            if (!isSafeKey(key) || !isRecord(entry)) fail(`${path}.${tracker}.${key}`);
            if (!entryDefaults) fail(`${path}.${tracker}`);
            validateEntryFields(entryDefaults, entry, `${path}.${tracker}.${key}`, tracker);
        }
    }
}

/** Matches tool-workspace.js's own restoreToolInputs shape: string values, safe identifier keys. */
function validateToolInputs(toolInputs, path) {
    if (toolInputs === undefined) return;
    if (!isRecord(toolInputs)) fail(path);
    for (const [key, value] of Object.entries(toolInputs)) {
        if (!isSafeKey(key) || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key) || typeof value !== "string") fail(`${path}.${key}`);
    }
}

/** Matches weapon-plans.js's own restoreWeaponPlans shape. */
function validateWeaponPlans(plans, path) {
    if (plans === undefined) return;
    if (!Array.isArray(plans)) fail(path);
    const ids = new Set();
    plans.forEach((plan, index) => {
        const at = `${path}[${index}]`;
        if (!isRecord(plan)) fail(at);
        if (plan.id !== undefined) {
            if (!isSafeKey(plan.id) || ids.has(plan.id.trim())) fail(`${at}.id`);
            ids.add(plan.id.trim());
        }
        for (const field of ["name", "currentXP", "targetXP"]) {
            if (plan[field] !== undefined && typeof plan[field] !== "string") fail(`${at}.${field}`);
        }
    });
}

/**
 * A previous entry, exactly as change-log.js's applyUndo will write it straight
 * back into tracker progress. Restored entries are normalized before use. Undo trusts
 * this value completely, so it must already be well-formed before it is ever
 * accepted — an unvalidated entry here is a forged one waiting for the player to
 * click Undo.
 */
function validateChangeEntries(entries, entryDefaults, path, trackerId) {
    if (!isRecord(entries)) fail(path);
    for (const [key, value] of Object.entries(entries)) {
        if (!isSafeKey(key)) fail(`${path}.${key}`);
        if (value === null) continue;
        if (!isRecord(value)) fail(`${path}.${key}`);
        if (entryDefaults) validateEntryFields(entryDefaults, value, `${path}.${key}`, trackerId);
    }
}

/** Matches change-log.js's own restoreChangeLog shape. */
function validateChangeLog(changeLog, path, trackerDefaults, trackerIds) {
    if (changeLog === undefined) return;
    if (!Array.isArray(changeLog)) fail(path);
    changeLog.forEach((change, index) => {
        const at = `${path}[${index}]`;
        if (!isRecord(change)) fail(at);
        if (!trackerIds.includes(change.trackerId)) fail(`${at}.trackerId`);
        if (typeof change.label !== "string") fail(`${at}.label`);
        if (change.kind !== undefined && typeof change.kind !== "string") fail(`${at}.kind`);
        {
            const entryDefaults = trackerIds.includes(change.trackerId) ? trackerDefaults[change.trackerId] : null;
            validateChangeEntries(change.entries, entryDefaults, `${at}.entries`, change.trackerId);
        }
        if (change.units !== undefined) {
            if (!isRecord(change.units)) fail(`${at}.units`);
            for (const [key, value] of Object.entries(change.units)) {
                if (!isSafeKey(key) || (value !== null && !isRecord(value))) fail(`${at}.units.${key}`);
            }
        }
    });
}

export function validateWorkspaceBackup(workspace, path = "workspace") {
    if (!isRecord(workspace) || !Array.isArray(workspace.hunts) || !workspace.hunts.length) fail(`${path}.hunts`);
    const ids = new Set();
    for (const [index, hunt] of workspace.hunts.entries()) {
        const at = `${path}.hunts[${index}]`;
        if (!isRecord(hunt)) fail(at);
        if (hunt.id !== undefined) {
            if (!isSafeKey(hunt.id) || ids.has(hunt.id.trim())) fail(`${at}.id`);
            ids.add(hunt.id.trim());
        }
        for (const field of ["name", "huntedOn", "notes", "sessionLog", "selectedTaskMonsterName"]) {
            if (hunt[field] !== undefined && typeof hunt[field] !== "string") fail(`${at}.${field}`);
        }
        if (hunt.processedLog !== undefined && hunt.processedLog !== null && typeof hunt.processedLog !== "string") fail(`${at}.processedLog`);
        if (hunt.hasProcessedLog !== undefined && typeof hunt.hasProcessedLog !== "boolean") fail(`${at}.hasProcessedLog`);
        if (hunt.sessionDuration !== undefined && !count(hunt.sessionDuration)) fail(`${at}.sessionDuration`);
        for (const field of ["matchedMonsters", "taskMonsters"]) {
            if (hunt[field] === undefined) continue;
            if (!Array.isArray(hunt[field])) fail(`${at}.${field}`);
            for (const row of hunt[field]) {
                if (!isRecord(row) || typeof row.name !== "string" || !row.name.trim() || !count(row.killsThisSession)) fail(`${at}.${field}`);
            }
        }
        for (const field of ["parseIssues", "selectedBestiaryMonsterNames"]) {
            if (hunt[field] != null && (!Array.isArray(hunt[field]) || hunt[field].some((value) => typeof value !== "string"))) fail(`${at}.${field}`);
        }
    }

    const trackerDefaults = getTrackerEntryDefaults();
    for (const field of ["trackerProgress", "bestiaryProgress"]) {
        if (workspace[field] !== undefined) {
            validateProgress(field === "bestiaryProgress" ? { bestiary: workspace[field] } : workspace[field], `${path}.${field}`, trackerDefaults);
        }
    }

    validateToolInputs(workspace.toolInputs, `${path}.toolInputs`);
    validateWeaponPlans(workspace.weaponPlans, `${path}.weaponPlans`);
    validateChangeLog(workspace.changeLog, `${path}.changeLog`, trackerDefaults, getTrackerIds());

    return workspace;
}

export function summarizeAppBackup(app) {
    return app.characters.reduce((summary, character) => {
        summary.characters += 1;
        summary.sessions += character.workspace.hunts.length;
        summary.records += Object.values(character.workspace.trackerProgress ?? {}).reduce((total, rows) => total + Object.keys(rows).length, 0);
        return summary;
    }, { characters: 0, sessions: 0, records: 0 });
}
