/** Shared exact-name matching. No guesses from experience, stats, or spelling. */
export function normalizeCreatureName(name) {
    return typeof name === "string" ? name.trim().replace(/\s+/g, " ").toLowerCase() : "";
}

/** Bestiary and Bosstiary entries are both normalized to a canonical `Name`, so one matcher serves both. */
function findNamedEntry(name, entries) {
    const key = normalizeCreatureName(name);
    return key && Array.isArray(entries)
        ? entries.find((entry) => normalizeCreatureName(entry?.Name) === key) : undefined;
}

export function findBestiaryCreature(name, bestiaryData) {
    return findNamedEntry(name, bestiaryData);
}

export function findBosstiaryBoss(name, bosstiaryData) {
    return findNamedEntry(name, bosstiaryData);
}
