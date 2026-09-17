import { isRecord, validateBackupEnvelope, validateWorkspaceBackup } from "./backup-validation.js";
import { parseWorkspaceFile } from "./workspace-transfer.js";

const EXPORT_APP_ID = "bestie";
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

    validateBackupEnvelope(payload, EXPORT_VERSION);

    if (payload.characters !== undefined) {
        if (!Array.isArray(payload.characters) || !payload.characters.length) {
            throw new Error("That file has no characters to import.");
        }
        const ids = new Set();
        payload.characters.forEach((character, index) => {
            if (!isRecord(character) || (character.name !== undefined && typeof character.name !== "string")) {
                throw new Error(`Invalid character at position ${index + 1}. Your current data has not been changed.`);
            }
            if (character.id !== undefined) {
                if (typeof character.id !== "string" || !character.id.trim() || ids.has(character.id.trim())) {
                    throw new Error("Backup character IDs must be unique, non-empty text.");
                }
                ids.add(character.id.trim());
            }
            validateWorkspaceBackup(character.workspace, `characters[${index}].workspace`);
        });
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
