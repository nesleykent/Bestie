import { findBestiaryCreature, findBosstiaryBoss } from "./creature-names.js";
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

/** Bosses are rewarded by Bosstiary category, not by a Bestiary difficulty. */
export const PROFICIENCY_BY_BOSS_CATEGORY = Object.freeze({
    bane: 500,
    archfoe: 5000,
    nemesis: 15000
});

/** Every classification a row can carry, ordered by reward — the breakdown sorts on this. */
export const PROFICIENCY_ORDER = Object.freeze([
    ...Object.keys(PROFICIENCY_BY_DIFFICULTY),
    ...Object.keys(PROFICIENCY_BY_BOSS_CATEGORY)
]);

const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
const safeRatio = (total, divisor) => {
    const value = total / divisor;
    return Number.isFinite(total) && total >= 0 && Number.isFinite(divisor) && divisor > 0 && Number.isFinite(value)
        ? value : null;
};
const classificationKey = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
const lookUp = (table, value) => {
    const key = classificationKey(value);
    return Object.hasOwn(table, key) ? table[key] : null;
};
const multiply = (kills, perKill) => {
    if (!isCount(kills) || perKill === null) return null;
    const total = kills * perKill;
    return isCount(total) ? total : null;
};

export function getProficiencyPerKill(difficulty) {
    return lookUp(PROFICIENCY_BY_DIFFICULTY, difficulty);
}

export function getBossProficiencyPerKill(category) {
    return lookUp(PROFICIENCY_BY_BOSS_CATEGORY, category);
}

export function calculateCreatureProficiency(kills, difficulty) {
    return multiply(kills, getProficiencyPerKill(difficulty));
}

export function calculateBossProficiency(kills, category) {
    return multiply(kills, getBossProficiencyPerKill(category));
}

/**
 * Bestiary-only callers still pass a plain array; a session that can contain
 * bosses passes both catalogues as one object. No second parser, no second
 * normalization — the same canonical `Name` matching serves both.
 */
function toCatalogues(sources) {
    return Array.isArray(sources) || !sources
        ? { bestiary: sources, bosstiary: [] }
        : { bestiary: sources.bestiary, bosstiary: sources.bosstiary };
}

const UNRESOLVED = Object.freeze({ source: null, classification: null, perKill: null });

/**
 * One logged name → one classification. The Bestiary is checked first, so every
 * regular creature resolves exactly as it did before bosses existed; the
 * Bosstiary answers for the rest. The two datasets share no names, so the order
 * fixes precedence without ever hiding a boss.
 *
 * `classification` is null whenever the reward is unknown, so no row can display
 * a category it was not paid for.
 */
export function resolveProficiencyClassification(name, sources) {
    const { bestiary, bosstiary } = toCatalogues(sources);
    const creature = findBestiaryCreature(name, bestiary);
    if (creature) {
        const difficulty = classificationKey(creature.Difficulty);
        const perKill = getProficiencyPerKill(difficulty);
        return { name: creature.Name, source: "bestiary", classification: perKill === null ? null : difficulty, perKill };
    }
    const boss = findBosstiaryBoss(name, bosstiary);
    if (boss) {
        const category = classificationKey(boss.category);
        const perKill = getBossProficiencyPerKill(category);
        return { name: boss.Name, source: "bosstiary", classification: perKill === null ? null : category, perKill };
    }
    return { name: null, ...UNRESOLVED };
}

function describeIssue(kills, { source, perKill }) {
    if (kills === null) return "Invalid kills";
    if (source === null) return "Unclassified creature";
    if (perKill === null) return source === "bosstiary" ? "Unclassified boss category" : "Unclassified difficulty";
    return "";
}

/** Duration is in minutes, like the existing normalized session. null means unavailable. */
export function calculateProficiencyPerHour(total, durationMinutes) {
    return Number.isFinite(durationMinutes) ? safeRatio(total, durationMinutes / 60) : null;
}

export function calculateCreatureContribution(total, sessionTotal) {
    if (total === null || sessionTotal === null) return null;
    return sessionTotal === 0 ? 0 : safeRatio(total, sessionTotal / 100);
}

export function calculateSessionProficiency(creatures = [], sources = [], durationMinutes = 0, issues = []) {
    const warnings = [...issues];
    if (!Array.isArray(creatures)) {
        creatures = [];
        warnings.push("Invalid creature list.");
    }
    const rows = creatures.map((monster) => {
        const name = typeof monster?.name === "string" && monster.name.trim() ? monster.name.trim() : "Unnamed creature";
        const match = resolveProficiencyClassification(name, sources);
        const kills = isCount(monster?.killsThisSession) ? monster.killsThisSession : null;
        const total = multiply(kills, match.perKill);
        const issue = describeIssue(kills, match) || (total === null ? "XP exceeds safe integer range" : "");
        if (issue) warnings.push(`${name}: ${issue}.`);
        return {
            name: match.name ?? name, source: match.source, classification: match.classification,
            kills, perKill: match.perKill, total, issue
        };
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
export function getHuntProficiency(hunt, sources) {
    if (!hunt?.hasProcessedLog) return calculateSessionProficiency([], sources);
    if (hunt.taskMonsters?.length || Array.isArray(hunt.parseIssues)) {
        return calculateSessionProficiency(hunt.taskMonsters, sources, hunt.sessionDuration, hunt.parseIssues ?? []);
    }
    if (hunt.sessionLog?.trim()) {
        const session = parseHuntSession(hunt.sessionLog);
        return calculateSessionProficiency(session.monsters, sources, session.sessionDuration, session.issues);
    }
    return calculateSessionProficiency(hunt.matchedMonsters ?? [], sources, hunt.sessionDuration,
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
