/**
 * Canonical Bosstiary game data, read-only. The upstream `user_data` block belongs
 * to whoever exported it and is ignored; user progress lives in its own store.
 *
 * A boss has three stages — Prowess, Expertise, Mastery — each with its own kill
 * threshold and its own points. Unlike the Bestiary, where charm points arrive
 * only on the final unlock, boss points accrue at every stage reached, and the
 * three always sum to the boss's total.
 */

export const BOSS_STAGES = ["prowess", "expertise", "mastery"];

export const BOSS_STAGE_LABELS = {
    prowess: "Prowess",
    expertise: "Expertise",
    mastery: "Mastery"
};

function normalizeBoss(boss) {
    return {
        id: boss.id,
        Name: String(boss.name ?? "").trim(),
        category: boss.category ?? "",
        totalPoints: Number(boss.total_boss_points) || 0,
        stages: BOSS_STAGES.map((stage) => ({
            stage,
            label: BOSS_STAGE_LABELS[stage],
            kills: Number(boss[`${stage}_kills`]) || 0,
            points: Number(boss[`${stage}_points`]) || 0
        })),
        locationSummary: boss.location_summary ?? "",
        notes: boss.notes ?? "",
        isPremium: Boolean(Number(boss.is_premium))
    };
}

export async function loadBosstiaryData() {
    const response = await fetch("./data/bosstiary.json");

    if (!response.ok) {
        throw new Error("Failed to load Bosstiary data.");
    }

    const payload = await response.json();
    const bosses = Array.isArray(payload?.data) ? payload.data : [];

    return bosses.map(normalizeBoss);
}
