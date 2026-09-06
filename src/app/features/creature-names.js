/** Shared exact-name matching. No guesses from experience, stats, or spelling. */
export function normalizeCreatureName(name) {
    return typeof name === "string" ? name.trim().replace(/\s+/g, " ").toLowerCase() : "";
}

export function findBestiaryCreature(name, bestiaryData) {
    const key = normalizeCreatureName(name);
    return key ? bestiaryData.find((entry) => normalizeCreatureName(entry.Name) === key) : undefined;
}
