/**
 * Canonical quest game data, read-only. The upstream `checked` field belongs to
 * whoever exported it and is ignored; user progress lives in its own store.
 *
 * Quests group under a questlog entry — 237 quests across 94 questlogs — because
 * one questlog can cover several distinct quests.
 */

function normalizeQuest(quest) {
    return {
        id: quest.id,
        Name: String(quest.name ?? "").trim(),
        rewards: (quest.rewards || "").trim(),
        questlog: (quest.questlog_name || quest.questlog || "").trim()
    };
}

export async function loadQuestsData() {
    const response = await fetch("./data/quests.json");

    if (!response.ok) {
        throw new Error("Failed to load Quests data.");
    }

    const payload = await response.json();
    const quests = Array.isArray(payload?.data) ? payload.data : [];

    return quests.map(normalizeQuest);
}
