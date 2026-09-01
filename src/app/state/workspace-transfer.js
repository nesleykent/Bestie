const EXPORT_APP_ID = "bestie";
const LEGACY_EXPORT_APP_ID = "bestiary-session-analyzer";
const EXPORT_VERSION = 1;

export function serializeWorkspace(workspace, exportedAt) {
    return JSON.stringify({
        app: EXPORT_APP_ID,
        version: EXPORT_VERSION,
        exportedAt,
        workspace
    }, null, 2);
}

export function parseWorkspaceFile(rawText) {
    let payload;

    try {
        payload = JSON.parse(rawText);
    } catch (error) {
        throw new Error("That file is not valid JSON.");
    }

    if (payload?.app && ![EXPORT_APP_ID, LEGACY_EXPORT_APP_ID].includes(payload.app)) {
        throw new Error("That file was exported by a different application.");
    }

    const workspace = payload?.workspace && typeof payload.workspace === "object"
        ? payload.workspace
        : payload;

    if (!workspace || typeof workspace !== "object" || !Array.isArray(workspace.hunts) || !workspace.hunts.length) {
        throw new Error("That file does not contain any exported sessions.");
    }

    return workspace;
}

export function buildExportFileName(exportedAt) {
    return `bestie-sessions-${String(exportedAt).slice(0, 10)}.json`;
}
