/** Validate a backup before any replacement. Legacy omitted fields remain valid. */
export const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (path) => { throw new Error(`Invalid backup at ${path}. Your current data has not been changed.`); };
const count = (value) => (typeof value === "number" || typeof value === "string")
    && String(value).trim() !== "" && Number.isSafeInteger(Number(value)) && Number(value) >= 0;

export function validateBackupEnvelope(payload, maxVersion) {
    if (!isRecord(payload)) fail("workspace");
    if (payload.app && !["bestie", "bestiary-session-analyzer"].includes(payload.app)) {
        throw new Error("That file was exported by a different application.");
    }
    if (payload.version !== undefined && (!Number.isInteger(payload.version) || payload.version < 1 || payload.version > maxVersion)) {
        throw new Error("This backup version is not supported. Open it with a compatible Bestie version; your current data has not been changed.");
    }
}

function validateProgress(progress, path) {
    if (!isRecord(progress)) fail(path);
    for (const [tracker, entries] of Object.entries(progress)) {
        if (!isRecord(entries)) fail(`${path}.${tracker}`);
        for (const [key, entry] of Object.entries(entries)) {
            if (!key.trim() || !isRecord(entry)) fail(`${path}.${tracker}.${key}`);
            for (const [field, value] of Object.entries(entry)) {
                if (typeof value !== "boolean" && !count(value)) fail(`${path}.${tracker}.${key}.${field}`);
            }
        }
    }
}

export function validateWorkspaceBackup(workspace, path = "workspace") {
    if (!isRecord(workspace) || !Array.isArray(workspace.hunts) || !workspace.hunts.length) fail(`${path}.hunts`);
    const ids = new Set();
    for (const [index, hunt] of workspace.hunts.entries()) {
        const at = `${path}.hunts[${index}]`;
        if (!isRecord(hunt)) fail(at);
        if (hunt.id !== undefined) {
            if (typeof hunt.id !== "string" || !hunt.id.trim() || ids.has(hunt.id.trim())) fail(`${at}.id`);
            ids.add(hunt.id.trim());
        }
        for (const field of ["name", "huntedOn", "notes", "sessionLog", "selectedTaskMonsterName"]) {
            if (hunt[field] !== undefined && typeof hunt[field] !== "string") fail(`${at}.${field}`);
        }
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
    for (const field of ["trackerProgress", "bestiaryProgress"]) {
        if (workspace[field] !== undefined) {
            validateProgress(field === "bestiaryProgress" ? { bestiary: workspace[field] } : workspace[field], `${path}.${field}`);
        }
    }
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
