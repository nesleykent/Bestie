import { parseHuntSession } from "./session-parser.js";

export function analyzeTaskSession(logText, session = parseHuntSession(logText)) {
    return {
        sessionDuration: session.sessionDuration,
        monsters: session.monsters.map((monster) => ({ ...monster, displayName: monster.name }))
            .sort((left, right) => right.killsThisSession - left.killsThisSession || left.name.localeCompare(right.name))
    };
}

export function calculateTaskEstimate(monsters, selectedMonsterName, sessionDuration, taskTotalKills) {
    const selectedMonster = monsters.find((monster) => monster.name === selectedMonsterName) || null;
    const rawTarget = String(taskTotalKills ?? "").trim();
    const parsedTaskTotal = /^\d+$/.test(rawTarget) ? Number(rawTarget) : NaN;
    const validTarget = Number.isSafeInteger(parsedTaskTotal) && parsedTaskTotal >= 0;
    const totalKillsTarget = validTarget ? parsedTaskTotal : 0;

    if (!selectedMonster) {
        return {
            selectedMonster: null,
            taskTotalKills: totalKillsTarget,
            totalMonsterTypes: monsters.length
        };
    }

    const validKills = Number.isSafeInteger(selectedMonster.killsThisSession) && selectedMonster.killsThisSession >= 0;
    const killRatePerMinute = validKills && Number.isFinite(sessionDuration) && sessionDuration > 0
        ? (selectedMonster.killsThisSession / sessionDuration) : 0;
    const killRatePerHour = killRatePerMinute * 60;
    const remainingKills = Math.max(0, totalKillsTarget - selectedMonster.killsThisSession);
    const remainingTimeMinutes = remainingKills === 0 ? 0 : killRatePerMinute > 0 ? (remainingKills / killRatePerMinute) : null;
    const totalEstimatedTimeMinutes = totalKillsTarget === 0 ? 0 : killRatePerMinute > 0 ? (totalKillsTarget / killRatePerMinute) : null;

    return {
        selectedMonster,
        validTarget,
        taskTotalKills: totalKillsTarget,
        totalMonsterTypes: monsters.length,
        killRatePerHour,
        alreadyKilled: selectedMonster.killsThisSession,
        remainingKills,
        remainingTimeMinutes,
        totalEstimatedTimeMinutes
    };
}
