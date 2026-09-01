/**
 * Canonical titles game data, read-only. The upstream `checked` field belongs to
 * whoever exported it and is ignored; user progress lives in its own store.
 *
 * A title is either permanent or losable, which is the only dimension it has
 * beyond how you earn it.
 */

function normalizeTitle(title) {
    return {
        id: title.id,
        Name: String(title.name ?? "").trim(),
        // Some titles explain themselves in `description`, others only in
        // `spoiler`; the reader wants whichever exists.
        requirement: (title.spoiler || title.description || "").trim(),
        isPermanent: Boolean(Number(title.is_permanent))
    };
}

export async function loadTitlesData() {
    const response = await fetch("./data/titles.json");

    if (!response.ok) {
        throw new Error("Failed to load Titles data.");
    }

    const payload = await response.json();
    const titles = Array.isArray(payload?.data) ? payload.data : [];

    return titles.map(normalizeTitle);
}
