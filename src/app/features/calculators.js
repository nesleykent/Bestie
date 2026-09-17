/** Independent arithmetic; source contracts and limits: docs/calculator-sources.md. */
export const ELEMENTS = ["physical", "earth", "fire", "death", "energy", "holy", "ice"];
const safeInteger = (value, label, min = 0) => {
    if (!Number.isSafeInteger(value) || value < min) throw new Error(`${label} must be a whole number of at least ${min}.`);
    return value;
};
const xpBig = (level) => {
    const l = BigInt(level);
    return 50n * (l * l * l - 6n * l * l + 17n * l - 12n) / 3n;
};
export function experienceForLevel(level) {
    safeInteger(level, "Level", 1);
    const xp = xpBig(level);
    if (xp > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Level exceeds the supported exact experience range.");
    return Number(xp);
}
export function levelForExperience(experience) {
    safeInteger(experience, "Experience");
    let lo = 1;
    let hi = 2;
    const xp = BigInt(experience);
    while (xpBig(hi) <= xp) hi *= 2;
    while (lo + 1 < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (xpBig(mid) <= xp) lo = mid;
        else hi = mid;
    }
    return lo;
}
export function projectExperience({ experience, targetLevel, hourlyRate = null }) {
    const level = levelForExperience(experience);
    const targetExperience = experienceForLevel(targetLevel);
    if (hourlyRate !== null && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) throw new Error("XP/h must be a nonnegative number.");
    const remaining = Math.max(0, targetExperience - experience);
    const next = xpBig(level + 1);
    const start = xpBig(level);
    return { level, targetExperience, remaining, progress: Number(BigInt(experience) - start) / Number(next - start),
        hours: remaining === 0 ? 0 : hourlyRate > 0 ? remaining / hourlyRate : null };
}
export function parseStamina(text) {
    const match = /^(\d{1,2}):([0-5]\d)$/.exec(String(text).trim());
    if (!match) throw new Error("Use stamina hours:minutes, from 00:00 to 42:00.");
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    if (minutes > 2520) throw new Error("Stamina cannot exceed 42:00.");
    return minutes;
}
export function staminaRecovery({ current, target = 2520, delay = 10 }) {
    safeInteger(current, "Current stamina"); safeInteger(target, "Target stamina"); safeInteger(delay, "Delay");
    if (current > 2520 || target > 2520) throw new Error("Stamina cannot exceed 42:00.");
    if (delay > 10) throw new Error("Remaining recovery delay must be between 0 and 10 minutes.");
    const normal = Math.max(0, Math.min(target, 2340) - Math.min(current, 2340));
    const bonus = Math.max(0, target - Math.max(current, 2340));
    return { normal, bonus, delay: target > current ? delay : 0, minutes: normal * 3 + bonus * 6 + (target > current ? delay : 0) };
}
export function staminaUsage(current, huntMinutes) {
    safeInteger(current, "Current stamina"); safeInteger(huntMinutes, "Planned hunting time");
    if (current > 2520) throw new Error("Stamina cannot exceed 42:00.");
    return { after: Math.max(0, current - huntMinutes), available: current,
        bonusAvailable: Math.max(0, current - 2340), unsupportedMinutes: Math.max(0, huntMinutes - current) };
}
/** Dataset resistance values mean percent damage RECEIVED (100 neutral, 0 immune). */
export function elementalDamage(creature, components) {
    if (!creature) throw new Error("Choose a creature from the Bestiary dataset.");
    const rows = Object.entries(components).map(([element, base]) => {
        if (!ELEMENTS.includes(element) || !Number.isFinite(base) || base < 0) throw new Error("Damage components must be nonnegative numbers for supported elements.");
        const percent = creature.combat?.resistances?.[element] ?? null;
        const damage = percent === null ? null : base * percent / 100;
        if (damage !== null && !Number.isFinite(damage)) throw new Error("Damage exceeds the supported numeric range.");
        return { element, base, percent, damage };
    });
    const unknown = rows.filter(row => row.base > 0 && row.damage === null).map(row => row.element);
    const total = unknown.length ? null : rows.reduce((sum, row) => sum + (row.damage ?? 0), 0);
    if (total !== null && !Number.isFinite(total)) throw new Error("Damage exceeds the supported numeric range.");
    return { rows, unknown, total };
}
