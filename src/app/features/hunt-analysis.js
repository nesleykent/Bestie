import { parseHuntSession } from "./session-parser.js";

/** Derived on demand from the last processed text, never from an unfinished draft. */
export function getFullHuntAnalysis(hunt) {
    if (typeof hunt.processedLog !== "string") return null;
    const session = parseHuntSession(hunt.processedLog);
    return {
        ...session,
        profitPerHour: session.metrics.balance !== null && session.sessionDuration > 0
            ? session.metrics.balance * 60 / session.sessionDuration : null,
        hasDraft: hunt.sessionLog.trim() !== hunt.processedLog.trim()
    };
}

export function compareHuntMetrics(hunts, respawnMode, metric = "xpPerHour") {
    const allowed = new Set(["xpPerHour", "rawXpPerHour", "profitPerHour", "damagePerHour", "healingPerHour"]);
    if (!allowed.has(metric)) return [];
    return hunts.filter((hunt) => hunt.respawnMode === respawnMode).flatMap((hunt) => {
        const analysis = getFullHuntAnalysis(hunt);
        const value = metric === "profitPerHour" ? analysis?.profitPerHour : analysis?.metrics[metric];
        return !analysis || !Number.isFinite(value) || analysis.metricIssues.length ? [] : [{ hunt, analysis, value }];
    }).sort((a, b) => b.value - a.value || a.hunt.id.localeCompare(b.hunt.id));
}
