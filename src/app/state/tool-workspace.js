export const TOOL_VIEWS = ["experience", "stamina", "elemental", "markers", "morning", "hunts", "charms"];
export function restoreToolInputs(saved) {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter(([key, value]) =>
        /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key) && typeof value === "string"));
}
