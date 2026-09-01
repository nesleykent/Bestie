/**
 * Canonical Cyclopedia Map data, read-only: 20 areas and the 171 subareas that
 * make them up, plus the achievement each completed area awards.
 *
 * The dataset nests subareas inside areas, but progress is recorded per subarea,
 * so it is flattened to one item per subarea. Every subarea name is unique across
 * all 20 areas, which is what makes the name a safe key.
 *
 * `creatureCount` is a join against the Bestiary dataset: 146 of the 171 subareas
 * are also Bestiary location names, so a subarea can say how much Bestiary work
 * lives there. The other 25 are city and interior areas with no spawns listed;
 * they carry null rather than a misleading zero.
 */

function countCreaturesByLocation(bestiaryItems) {
    const counts = new Map();

    bestiaryItems.forEach((creature) => {
        (creature.locationList ?? []).forEach((location) => {
            counts.set(location, (counts.get(location) ?? 0) + 1);
        });
    });

    return counts;
}

export async function loadMeasuringTibiaData(bestiaryItems = []) {
    const response = await fetch("./data/measuring-tibia.json");

    if (!response.ok) {
        throw new Error("Failed to load Cyclopedia Map data.");
    }

    const payload = await response.json();
    const areas = Array.isArray(payload?.areas) ? payload.areas : [];
    const creatureCounts = countCreaturesByLocation(bestiaryItems);

    return areas.flatMap((area) => area.subareas.map((subarea) => ({
        Name: subarea,
        area: area.area,
        // Every subarea of an area contributes to the same achievement, which is
        // what lets a completed area satisfy it.
        areaAchievement: area.achievement,
        areaSubareaCount: area.subareas.length,
        creatureCount: creatureCounts.get(subarea) ?? null
    })));
}
