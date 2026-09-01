import { extractKilledMonsters, extractSessionDuration } from "./session-parser.js";

function toTaskMonsters(killedMonsters) {
    return Object.entries(killedMonsters)
        .map(([name, killsThisSession]) => ({
            name,
            displayName: name,
            killsThisSession
        }))
        .sort((left, right) => right.killsThisSession - left.killsThisSession || left.name.localeCompare(right.name));
}

export function analyzeTaskSession(logText) {
    const sessionDuration = extractSessionDuration(logText);
    const killedMonsters = extractKilledMonsters(logText);
    const monsters = toTaskMonsters(killedMonsters);

    return {
        sessionDuration,
        monsters
    };
}

export function calculateTaskEstimate(monsters, selectedMonsterName, sessionDuration, taskTotalKills) {
    const selectedMonster = monsters.find((monster) => monster.name === selectedMonsterName) || null;
    const parsedTaskTotal = Number.parseInt(taskTotalKills, 10);
    const totalKillsTarget = Number.isFinite(parsedTaskTotal) ? Math.max(0, parsedTaskTotal) : 0;

    if (!selectedMonster) {
        return {
            selectedMonster: null,
            taskTotalKills: totalKillsTarget,
            totalMonsterTypes: monsters.length
        };
    }

    const killRatePerMinute = sessionDuration > 0 ? (selectedMonster.killsThisSession / sessionDuration) : 0;
    const killRatePerHour = killRatePerMinute * 60;
    const remainingKills = Math.max(0, totalKillsTarget - selectedMonster.killsThisSession);
    const remainingTimeMinutes = killRatePerMinute > 0 ? (remainingKills / killRatePerMinute) : 0;
    const totalEstimatedTimeMinutes = killRatePerMinute > 0 ? (totalKillsTarget / killRatePerMinute) : 0;

    return {
        selectedMonster,
        taskTotalKills: totalKillsTarget,
        totalMonsterTypes: monsters.length,
        killRatePerHour,
        alreadyKilled: selectedMonster.killsThisSession,
        remainingKills,
        remainingTimeMinutes,
        totalEstimatedTimeMinutes
    };
}
