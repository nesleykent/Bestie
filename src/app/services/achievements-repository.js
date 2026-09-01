/**
 * Canonical achievements game data, read-only.
 *
 * The upstream dump carries a `checked` field per achievement, which belongs to
 * whoever exported it and is deliberately ignored — user progress lives in its
 * own store.
 *
 * Two upstream quirks are normalized here rather than in the tracker:
 *   - one achievement is typed "Quests" where the category list says "Quest"
 *   - one has no category at all
 * Both would otherwise show up as their own categories in the filter.
 */

const CATEGORY_ALIASES = { Quests: "Quest" };
const UNCATEGORIZED = "Misc.";

/** Display names for categories the API abbreviates. */
const CATEGORY_LABELS = { PaFS: "Paw and Fur Society" };

export const RARITY_ORDER = ["common", "uncommon", "semi_rare", "rare", "very_rare"];

export const RARITY_LABELS = {
    common: "Common",
    uncommon: "Uncommon",
    semi_rare: "Semi-Rare",
    rare: "Rare",
    very_rare: "Very Rare"
};

function normalizeCategory(type) {
    const name = String(type ?? "").trim();

    if (!name) {
        return UNCATEGORIZED;
    }

    return CATEGORY_ALIASES[name] ?? name;
}

export function categoryLabel(category) {
    return CATEGORY_LABELS[category] ?? category;
}

function normalizeAchievement(achievement) {
    const category = normalizeCategory(achievement.type);
    const stats = achievement.completion_stats ?? null;

    return {
        id: achievement.id,
        Name: String(achievement.name ?? "").trim(),
        // Points and rarity are genuinely absent on some entries, so they stay
        // nullable rather than being coerced to a misleading zero.
        points: Number.isFinite(Number(achievement.points)) ? Number(achievement.points) : 0,
        grade: Number(achievement.grade) || 1,
        category,
        categoryLabel: categoryLabel(category),
        // `secret` arrives as 0/1, not a boolean.
        isSecret: Boolean(Number(achievement.secret)),
        // The spoiler is how you actually get it, which is the useful text; the
        // description is flavour. Both may contain HTML and must be escaped.
        spoiler: achievement.spoiler ?? "",
        description: achievement.description ?? "",
        rarity: stats?.rarity ?? "",
        rarityPercent: Number.isFinite(Number(stats?.percentage)) ? Number(stats.percentage) : null,
        // Achievements in the Removed category cannot be earned any more, so they
        // are excluded from totals while staying visible under that filter.
        isObtainable: category !== "Removed",
        relatedAchievements: Array.isArray(achievement.related_achievements) ? achievement.related_achievements : []
    };
}

export async function loadAchievementsData() {
    const response = await fetch("./data/achievements.json");

    if (!response.ok) {
        throw new Error("Failed to load Achievements data.");
    }

    const payload = await response.json();
    const achievements = Array.isArray(payload?.data) ? payload.data : [];

    return achievements.map(normalizeAchievement);
}
