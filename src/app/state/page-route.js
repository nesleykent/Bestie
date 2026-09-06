import { getTrackerIds } from "../trackers/registry.js";

// URL adapter for the existing mode/view navigation, using static-host-safe hashes.
const VIEWS = {
    bestiary: ["session", "allSessions", "charmPlan", "opportunities", "library", "comparison"],
    tasks: ["session", "allSessions", "library"],
    trackers: [...getTrackerIds(), "changes"]
};

export function readPageRoute(hash) {
    const [path, query = ""] = String(hash).replace(/^#\/?/, "").split("?");
    const sessionId = new URLSearchParams(query).get("session");
    if (path === "weapon-proficiency") return { mode: "proficiency", view: "session", sessionId };
    const [mode, view] = path.split("/");
    if (VIEWS[mode]?.includes(view)) return { mode, view, sessionId };
    return { mode: "dashboard", view: "dashboard", sessionId: null };
}

export function buildPageRoute(mode, view, sessionId) {
    const path = mode === "proficiency" ? "weapon-proficiency" : mode === "dashboard" ? "dashboard" : `${mode}/${view}`;
    const query = view === "session" && sessionId ? `?${new URLSearchParams({ session: sessionId })}` : "";
    return `#${path}${query}`;
}
