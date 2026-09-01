import { achievementsTracker } from "./achievements.js";
import { bestiaryTracker } from "./bestiary.js";
import { bosstiaryTracker } from "./bosstiary.js";
import { charmsTracker } from "./charms.js";
import { measuringTibiaTracker } from "./measuring-tibia.js";
import { questsTracker } from "./quests.js";
import { titlesTracker } from "./titles.js";

/**
 * Every tracker, in navigation order. Adding one means adding a definition and a
 * dataset — not a new view, a new store or new navigation.
 */
export const TRACKERS = [
    achievementsTracker,
    bestiaryTracker,
    bosstiaryTracker,
    charmsTracker,
    measuringTibiaTracker,
    questsTracker,
    titlesTracker
];

export function getTracker(trackerId) {
    return TRACKERS.find((tracker) => tracker.id === trackerId) ?? bestiaryTracker;
}

export function getTrackerIds() {
    return TRACKERS.map((tracker) => tracker.id);
}

/** The entry shape of every tracker, for the progress store to normalize against. */
export function getTrackerEntryDefaults() {
    return TRACKERS.reduce((defaults, tracker) => {
        defaults[tracker.id] = tracker.entryDefaults;
        return defaults;
    }, {});
}

export function buildInitialFilters(tracker) {
    return tracker.facets.reduce((filters, facet) => {
        filters[facet.key] = facet.kind === "check" ? false : (facet.kind === "search" ? "" : "all");
        return filters;
    }, {});
}
