/**
 * Canonical charm game data, read-only. The upstream `stage` and `checked` fields
 * belong to whoever exported them and are ignored; user progress lives in its own
 * store.
 *
 * A charm has three stages, each with its own cost and effect value. Costs are
 * per stage, so unlocking stage 3 means having paid all three.
 */

function normalizeCharm(charm) {
    const stages = Array.isArray(charm.stages) ? charm.stages : [];
    let cumulative = 0;

    return {
        id: charm.id,
        Name: String(charm.name ?? "").trim(),
        type: charm.type ?? "",
        // The effect text carries a {{}} placeholder for the stage's value.
        effect: charm.effect ?? "",
        stages: stages.map((stage, index) => {
            cumulative += Number(stage.cost) || 0;

            return {
                stage: index + 1,
                cost: Number(stage.cost) || 0,
                cumulativeCost: cumulative,
                value: Number(stage.value) || 0
            };
        }),
        totalCost: Number(charm.total_cost) || cumulative
    };
}

export async function loadCharmsData() {
    const response = await fetch("./data/charms.json");

    if (!response.ok) {
        throw new Error("Failed to load Charms data.");
    }

    const payload = await response.json();
    const charms = Array.isArray(payload?.data) ? payload.data : [];

    return charms.map(normalizeCharm);
}
