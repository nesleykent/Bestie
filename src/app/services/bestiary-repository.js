/**
 * Canonical game data. This is read-only: the upstream dump carries a
 * `user_data` block per creature, but that belongs to whoever exported it and
 * is deliberately ignored here. All user progress lives in its own store.
 */

function splitLocations(locations) {
    return String(locations ?? "")
        .split(",")
        .map((location) => location.trim())
        .filter(Boolean);
}

function normalizeCreature(creature) {
    const charm = creature.charm_details ?? {};
    const echo = creature.echo_warden_details ?? {};

    return {
        ID: creature.id,
        Name: String(creature.name ?? "").trim(),
        Class: creature.class?.name ?? "",
        Difficulty: creature.difficulty ?? "",
        Occurrence: creature.occurrence ?? "",
        Charms: Number(charm.charm_points ?? 0),
        "Stage 1": Number(charm.first_stage ?? 0),
        "Stage 2": Number(charm.second_stage ?? 0),
        "Kills to Unlock": Number(charm.third_stage ?? 0),
        Locations: creature.locations ?? "",
        locationList: splitLocations(creature.locations),
        // Echo Warden is a separate charm-point pool. Eligibility is the gate:
        // ineligible creatures still carry a point value upstream.
        echoWarden: {
            eligible: Boolean(echo.can_be_echo_warden),
            points: Number(echo.charm_points ?? 0)
        },
        isPremium: Boolean(creature.is_premium),
        canBeBoosted: Boolean(creature.can_be_boosted),
        releasedIn: creature.released_in ?? ""
    };
}

export async function loadBestiaryData() {
    const response = await fetch("./data/bestiary.json");

    if (!response.ok) {
        throw new Error("Failed to load Bestiary data.");
    }

    const payload = await response.json();
    const creatures = Array.isArray(payload?.data) ? payload.data : [];

    return creatures.map(normalizeCreature);
}
