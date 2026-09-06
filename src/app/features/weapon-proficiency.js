import { findBestiaryCreature } from "./creature-names.js";
import { parseHuntSession } from "./session-parser.js";

/** The sole Difficulty → Proficiency XP mapping. Normal creature XP is never used. */
export const PROFICIENCY_BY_DIFFICULTY = Object.freeze({
    harmless: 1,
    trivial: 30,
    easy: 70,
    medium: 100,
    hard: 165,
    challenging: 240
});

const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
const safeRatio = (total, divisor) => {
    const value = total / divisor;
    return Number.isFinite(total) && total >= 0 && Number.isFinite(divisor) && divisor > 0 && Number.isFinite(value)
        ? value : null;
};

export function getProficiencyPerKill(difficulty) {
    const key = typeof difficulty === "string" ? difficulty.trim().toLowerCase() : "";
    return Object.hasOwn(PROFICIENCY_BY_DIFFICULTY, key) ? PROFICIENCY_BY_DIFFICULTY[key] : null;
}

export function calculateCreatureProficiency(kills, difficulty) {
    const perKill = getProficiencyPerKill(difficulty);
    if (!isCount(kills) || perKill === null) return null;
    const total = kills * perKill;
    return isCount(total) ? total : null;
}

/** Duration is in minutes, like the existing normalized session. null means unavailable. */
export function calculateProficiencyPerHour(total, durationMinutes) {
    return Number.isFinite(durationMinutes) ? safeRatio(total, durationMinutes / 60) : null;
}

export function calculateCreatureContribution(total, sessionTotal) {
    if (total === null || sessionTotal === null) return null;
    return sessionTotal === 0 ? 0 : safeRatio(total, sessionTotal / 100);
}

export function calculateSessionProficiency(creatures = [], bestiaryData = [], durationMinutes = 0, issues = []) {
    const warnings = [...issues];
    if (!Array.isArray(creatures)) {
        creatures = [];
        warnings.push("Invalid creature list.");
    }
    const rows = creatures.map((monster) => {
        const name = typeof monster?.name === "string" && monster.name.trim() ? monster.name.trim() : "Unnamed creature";
        const creature = findBestiaryCreature(name, bestiaryData);
        const difficulty = typeof creature?.Difficulty === "string" ? creature.Difficulty.trim().toLowerCase() : "";
        const perKill = getProficiencyPerKill(difficulty);
        const kills = isCount(monster?.killsThisSession) ? monster.killsThisSession : null;
        const total = calculateCreatureProficiency(kills, difficulty);
        const issue = kills === null ? "Invalid kills" : !creature ? "Unclassified creature"
            : perKill === null ? "Unclassified difficulty" : total === null ? "XP exceeds safe integer range" : "";
        if (issue) warnings.push(`${name}: ${issue}.`);
        return { name: creature?.Name ?? name, difficulty: perKill === null ? null : difficulty, kills, perKill, total, issue };
    });
    const sum = rows.reduce((value, row) => value + (row.total ?? 0), 0);
    const total = isCount(sum) ? sum : null;
    const killSum = rows.reduce((value, row) => value + (row.kills ?? 0), 0);
    if (total === null) warnings.push("Session XP exceeds the supported integer range.");
    if (!isCount(killSum)) warnings.push("Session kills exceed the supported integer range.");
    const perHour = calculateProficiencyPerHour(total, durationMinutes);
    const duration = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : null;
    return {
        rows: rows.map((row) => ({ ...row, contribution: calculateCreatureContribution(row.total, total) })),
        total, perHour, duration, kills: isCount(killSum) ? killSum : null,
        warnings, isPartial: warnings.length > 0
    };
}

/** Reuse shared kill evidence. Older saves fall back to the existing parser or matched rows. */
export function getHuntProficiency(hunt, bestiaryData) {
    if (!hunt?.hasProcessedLog) return calculateSessionProficiency([], bestiaryData);
    if (hunt.taskMonsters?.length || Array.isArray(hunt.parseIssues)) {
        return calculateSessionProficiency(hunt.taskMonsters, bestiaryData, hunt.sessionDuration, hunt.parseIssues ?? []);
    }
    if (hunt.sessionLog?.trim()) {
        const session = parseHuntSession(hunt.sessionLog);
        return calculateSessionProficiency(session.monsters, bestiaryData, session.sessionDuration, session.issues);
    }
    return calculateSessionProficiency(hunt.matchedMonsters ?? [], bestiaryData, hunt.sessionDuration,
        ["Legacy session has no complete kill evidence; showing saved matched creatures only."]);
}

/** User-entered XP targets; official weapon milestones can supply targetXP later. */
export function calculateWeaponProjection({ currentXP, targetXP }, session, perKill = null) {
    if (!isCount(currentXP) || !isCount(targetXP)) return null;
    const remainingXP = Math.max(0, targetXP - currentXP);
    const divide = (divisor) => remainingXP === 0 ? 0 : safeRatio(remainingXP, divisor);
    const canProject = !session.isPartial;
    const kills = divide(perKill);
    return {
        remainingXP,
        hoursRemaining: canProject ? divide(session.perHour) : null,
        sessionsRemaining: canProject ? divide(session.total) : null,
        killsRemaining: kills !== null && Number.isSafeInteger(Math.ceil(kills)) ? Math.ceil(kills) : null,
        progress: targetXP === 0 ? 1 : Math.min(1, currentXP / targetXP)
    };
}
