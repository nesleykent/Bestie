import { normalizeCreatureName } from "./creature-names.js";

export function extractSessionDuration(logText) {
    const match = String(logText ?? "").match(/^\s*Session:\s*(\d+):(\d{1,2})h\s*$/im);
    if (!match || Number(match[2]) >= 60) return 0;
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    return Number.isSafeInteger(minutes) ? minutes : 0;
}

const UNSIGNED_TOTAL = /^(?:\d+|\d{1,3}(?:,\d{3})+)$/;
const SIGNED_TOTAL = /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)$/;

// Order only matters for readability: every pattern is anchored, so "Raw XP Gain"
// can never satisfy the plain "XP Gain" pattern and vice versa.
const METRIC_FIELDS = [
    ["rawExperience", /^\s*Raw XP Gain\s*:\s*(.*?)\s*$/i, false],
    ["experience", /^\s*XP Gain\s*:\s*(.*?)\s*$/i, false],
    ["rawXpPerHour", /^\s*Raw XP\/h\s*:\s*(.*?)\s*$/i, false],
    ["xpPerHour", /^\s*XP\/h\s*:\s*(.*?)\s*$/i, false],
    ["loot", /^\s*Loot\s*:\s*(.*?)\s*$/i, false],
    ["supplies", /^\s*Supplies\s*:\s*(.*?)\s*$/i, false],
    ["balance", /^\s*Balance\s*:\s*(.*?)\s*$/i, true],
    ["damagePerHour", /^\s*Damage\/h\s*:\s*(.*?)\s*$/i, false],
    ["damage", /^\s*Damage\s*:\s*(.*?)\s*$/i, false],
    ["healingPerHour", /^\s*Healing\/h\s*:\s*(.*?)\s*$/i, false],
    ["healing", /^\s*Healing\s*:\s*(.*?)\s*$/i, false]
];

const METRIC_LABELS = {
    experience: "XP Gain", rawExperience: "Raw XP Gain", xpPerHour: "XP/h", rawXpPerHour: "Raw XP/h",
    loot: "Loot", supplies: "Supplies", balance: "Balance",
    damage: "Damage", damagePerHour: "Damage/h", healing: "Healing", healingPerHour: "Healing/h"
};

const HOURLY_RATES = [["xpPerHour", "experience"], ["rawXpPerHour", "rawExperience"], ["damagePerHour", "damage"], ["healingPerHour", "healing"]];

/** Parses an English-client integer total (comma-grouped, optionally signed). Malformed or unsafe values become null. */
function parseIntegerMetric(rawValue, label, signed, metricIssues) {
    const trimmed = String(rawValue ?? "").trim();
    if (!(signed ? SIGNED_TOTAL : UNSIGNED_TOTAL).test(trimmed)) {
        metricIssues.push(`Malformed ${label} value: ${trimmed}`);
        return null;
    }
    const value = Number(trimmed.replace(/,/g, ""));
    if (!Number.isSafeInteger(value)) {
        metricIssues.push(`${label} value outside the supported integer range: ${trimmed}`);
        return null;
    }
    return value;
}

function emptyMetrics() {
    return Object.fromEntries(Object.keys(METRIC_LABELS).map((field) => [field, null]));
}

/** One parser for Bestiary, Tasks and Weapon Proficiency, including diagnostics. */
export function parseHuntSession(logText) {
    const killedMonsters = new Map();
    const lootedItems = new Map();
    const issues = [];
    const metricIssues = [];
    const metrics = emptyMetrics();
    const reportedMetrics = new Set();
    let killSection = false;
    let lootSection = false;
    let foundKillSection = false;

    String(logText ?? "").split(/\r?\n/).forEach((line) => {
        if (/^\s*Killed Monsters:\s*$/i.test(line)) {
            killSection = true;
            lootSection = false;
            foundKillSection = true;
            return;
        }
        if (/^\s*Looted Items:\s*$/i.test(line)) {
            killSection = false;
            lootSection = true;
            return;
        }

        if (killSection) {
            if (!line.trim()) return;
            const match = line.match(/^\s*(\d+)x\s+(.+?)\s*$/i);
            if (!match) {
                issues.push(`Unrecognized kill entry: ${line.trim()}`);
                return;
            }
            const count = Number(match[1]);
            const name = normalizeCreatureName(match[2]);
            const total = (killedMonsters.get(name) ?? 0) + count;
            if (!Number.isSafeInteger(total)) {
                issues.push(`Kill count outside the supported integer range: ${name}`);
                return;
            }
            killedMonsters.set(name, total);
            return;
        }

        if (lootSection) {
            if (!line.trim()) return;
            const match = line.match(/^\s*(\d+)x\s+(.+?)\s*$/i);
            if (!match) {
                metricIssues.push(`Unrecognized loot entry: ${line.trim()}`);
                return;
            }
            const count = Number(match[1]);
            const name = match[2].trim().replace(/\s+/g, " ");
            const total = (lootedItems.get(name) ?? 0) + count;
            if (!Number.isSafeInteger(total)) {
                metricIssues.push(`Loot count outside the supported integer range: ${name}`);
                return;
            }
            lootedItems.set(name, total);
            return;
        }

        for (const [field, pattern, signed] of METRIC_FIELDS) {
            const match = line.match(pattern);
            if (!match) continue;
            if (reportedMetrics.has(field)) {
                metricIssues.push(`Repeated ${METRIC_LABELS[field]} measurement; review the pasted log.`);
                return;
            }
            reportedMetrics.add(field);
            metrics[field] = parseIntegerMetric(match[1], METRIC_LABELS[field], signed, metricIssues);
            return;
        }
    });
    if (!foundKillSection) issues.push("Killed Monsters section not found.");

    const hasSessionLabel = /^\s*Session\s*:/im.test(String(logText ?? ""));
    const durationMatch = String(logText ?? "").match(/^\s*Session:\s*(\d+):(\d{1,2})h\s*$/im);
    if (hasSessionLabel && (!durationMatch || Number(durationMatch[2]) >= 60 || !Number.isSafeInteger(Number(durationMatch[1]) * 60 + Number(durationMatch[2])))) {
        metricIssues.push("Malformed session duration.");
    }

    const sessionDuration = extractSessionDuration(logText);
    const hours = sessionDuration > 0 ? sessionDuration / 60 : null;
    const derivedMetrics = [];

    if (!reportedMetrics.has("balance") && metrics.loot !== null && metrics.supplies !== null) {
        metrics.balance = metrics.loot - metrics.supplies;
        derivedMetrics.push("balance");
    }
    for (const [rate, total] of HOURLY_RATES) {
        if (reportedMetrics.has(rate) || metrics[total] === null || !hours) continue;
        const derived = metrics[total] / hours;
        if (Number.isFinite(derived) && derived <= Number.MAX_SAFE_INTEGER) {
            metrics[rate] = derived;
            derivedMetrics.push(rate);
        }
    }

    return {
        sessionDuration,
        monsters: [...killedMonsters].map(([name, killsThisSession]) => ({ name, killsThisSession })),
        issues,
        metrics,
        derivedMetrics,
        drops: [...lootedItems].map(([name, count]) => ({ name, count })),
        metricIssues
    };
}

export function extractKilledMonsters(logText) {
    return Object.fromEntries(parseHuntSession(logText).monsters.map(({ name, killsThisSession }) => [name, killsThisSession]));
}
