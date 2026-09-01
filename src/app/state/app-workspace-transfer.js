import { parseWorkspaceFile } from "./workspace-transfer.js";

const EXPORT_APP_ID = "bestie";
const LEGACY_EXPORT_APP_ID = "bestiary-session-analyzer";
const EXPORT_VERSION = 2;

export function serializeAppState(appState, exportedAt) {
    return JSON.stringify({
        app: EXPORT_APP_ID,
        version: EXPORT_VERSION,
        exportedAt,
        characters: appState.characters,
        activeCharacterId: appState.activeCharacterId
    }, null, 2);
}

/**
 * Accepts both the current multi-character export and the single-workspace
 * files this app produced before multi-character support existed. A legacy
 * file is wrapped as one character rather than rejected, reusing
 * parseWorkspaceFile's own validation so the two formats agree on what counts
 * as a valid workspace.
 */
export function parseAppWorkspaceFile(rawText) {
    let payload;

    try {
        payload = JSON.parse(rawText);
    } catch (error) {
        throw new Error("That file is not valid JSON.");
    }

    if (payload?.app && ![EXPORT_APP_ID, LEGACY_EXPORT_APP_ID].includes(payload.app)) {
        throw new Error("That file was exported by a different application.");
    }

    if (Array.isArray(payload?.characters) && payload.characters.length) {
        return {
            characters: payload.characters,
            activeCharacterId: payload.activeCharacterId
        };
    }

    const workspace = parseWorkspaceFile(rawText);

    return {
        characters: [{ name: "", workspace }],
        activeCharacterId: undefined
    };
}

export function buildAppExportFileName(exportedAt) {
    return `bestie-sessions-${String(exportedAt).slice(0, 10)}.json`;
}
