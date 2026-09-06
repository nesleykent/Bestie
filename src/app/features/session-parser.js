import { normalizeCreatureName } from "./creature-names.js";

export function extractSessionDuration(logText) {
    const match = String(logText ?? "").match(/Session:\s*(\d+):(\d{1,2})h/i);
    if (!match || Number(match[2]) >= 60) return 0;
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    return Number.isSafeInteger(minutes) ? minutes : 0;
}

/** One parser for Bestiary, Tasks and Weapon Proficiency, including diagnostics. */
export function parseHuntSession(logText) {
    const killedMonsters = new Map();
    const issues = [];
    let capturing = false;
    let foundSection = false;

    String(logText ?? "").split(/\r?\n/).forEach((line) => {
        if (/^\s*Killed Monsters:\s*$/i.test(line)) {
            capturing = true;
            foundSection = true;
            return;
        }
        if (/^\s*Looted Items:/i.test(line)) capturing = false;
        if (!capturing || !line.trim()) return;
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
    });
    if (!foundSection) issues.push("Killed Monsters section not found.");
    return {
        sessionDuration: extractSessionDuration(logText),
        monsters: [...killedMonsters].map(([name, killsThisSession]) => ({ name, killsThisSession })),
        issues
    };
}

export function extractKilledMonsters(logText) {
    return Object.fromEntries(parseHuntSession(logText).monsters.map(({ name, killsThisSession }) => [name, killsThisSession]));
}
