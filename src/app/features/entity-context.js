import { WIKI_LINKS } from "../../data/wiki-links.js";

/** Read-only inspector context. Links are navigation, never completion rules. */

function safeUrl(value) {
    try {
        const url = new URL(String(value));
        return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch {
        return null;
    }
}

function plainText(value) {
    return String(value ?? "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();
}

function sourceLinks(item) {
    const sources = [];
    for (const resource of item.externalResources ?? []) {
        const url = safeUrl(resource.url);
        if (url) sources.push({ label: plainText(resource.title || resource.platform_label || "External source"), url });
    }
    // The source occasionally embeds real links in earning instructions. Keep
    // their context label: a quest link is not the achievement's own Wiki page.
    for (const match of String(item.spoiler ?? "").matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const url = safeUrl(match[1]);
        if (url) {
            const prefix = new URL(url).hostname === "tibia.fandom.com" ? "Wiki" : "Source";
            sources.push({ label: `${prefix}: ${plainText(match[2]) || "Related reference"}`, url });
        }
    }
    return sources;
}

// Catalog arrays and their items are immutable after loading. Reuse compiled
// matchers and parsed rewards across inspectors; progress is not cached here.
const rewardCatalogs = new WeakMap();

function namedRewards(quest, achievements) {
    let catalog = rewardCatalogs.get(achievements);
    if (!catalog) {
        const names = [...achievements].sort((a, b) => b.Name.length - a.Name.length);
        const alternatives = names.map(item => item.Name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") || "(?!)";
        catalog = {
            pattern: new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:(${alternatives})\\s+achievements?\\b|achievements?\\s+["“]?(${alternatives})(?=$|[^\\p{L}\\p{N}]))`, "giu"),
            names: new Map(names.map(item => [item.Name.toLowerCase(), item.Name])),
            rewards: new WeakMap()
        };
        rewardCatalogs.set(achievements, catalog);
    }
    if (catalog.rewards.has(quest)) return catalog.rewards.get(quest);
    const text = plainText(quest.rewards);
    const matched = new Set();
    // Longer canonical names win over overlapping shorter names (e.g. an
    // explicit “achievement Fire Walker” must not also link an item “Fire”).
    for (const match of text.matchAll(catalog.pattern)) {
        matched.add(catalog.names.get((match[1] || match[2]).toLowerCase()));
    }
    catalog.rewards.set(quest, matched);
    return matched;
}

function linkedQuest(achievement, quest) {
    return sourceLinks(achievement).some(({ url }) => {
        const parsed = new URL(url);
        if (parsed.hostname !== "tibia.fandom.com" || !parsed.pathname.startsWith("/wiki/")) return false;
        let title;
        try { title = decodeURIComponent(parsed.pathname.slice(6)).replaceAll("_", " "); } catch { return false; }
        return title === quest.Name || title === `${quest.Name} Quest`;
    });
}

/** Accepts already-loaded, normalized tracker items; does not fetch or mutate. */
export function getEntityContext(trackerId, itemKey, itemsByTracker, wikiLink) {
    const items = (id) => itemsByTracker[id] ?? [];
    const item = items(trackerId).find((candidate) => candidate.Name === itemKey);
    if (!item) return { sources: [], relations: [] };

    const sources = sourceLinks(item);
    const directUrl = safeUrl(item.sourceUrl);
    if (directUrl) sources.unshift({ label: "Open source", url: directUrl });
    const wikiUrl = safeUrl(WIKI_LINKS[trackerId]?.[item.Name] || wikiLink || item.wikiLink);
    if (wikiUrl) sources.unshift({ label: "Open Tibia Wiki", url: wikiUrl });

    const relations = [];
    const add = (id, target, reason, kind = "context") => {
        if (target && !(id === trackerId && target.Name === item.Name)) {
            relations.push({ trackerId: id, key: target.Name, label: target.Name, reason, kind });
        }
    };
    if (trackerId === "measuringTibia") {
        add("achievements", items("achievements").find((target) => target.Name === item.areaAchievement), `Earned by discovering every subarea of ${item.area}`, "reward");
        for (const creature of items("bestiary")) {
            if (creature.locationList?.includes(item.Name)) add("bestiary", creature, `Listed in ${item.Name}`);
        }
        for (const boss of items("bosstiary")) {
            if (boss.locationSummary === item.Name) add("bosstiary", boss, `Listed in ${item.Name}`);
        }
    }
    if (trackerId === "bestiary" || trackerId === "bosstiary") {
        for (const subarea of items("measuringTibia")) {
            if (trackerId === "bestiary" ? item.locationList?.includes(subarea.Name) : item.locationSummary === subarea.Name) {
                add("measuringTibia", subarea, "Listed location");
            }
        }
    }
    if (trackerId === "achievements") {
        for (const subarea of items("measuringTibia")) {
            if (subarea.areaAchievement === item.Name) add("measuringTibia", subarea, `Required for discovering ${subarea.area}`, "requirement");
        }
        for (const name of item.relatedAchievements ?? []) {
            add("achievements", items("achievements").find((target) => target.Name === name), "Related in achievement source");
        }
    }
    if (trackerId === "achievements" || trackerId === "quests") {
        const achievements = trackerId === "achievements" ? [item] : items("achievements");
        const quests = trackerId === "quests" ? [item] : items("quests");
        for (const quest of quests) {
            const rewards = namedRewards(quest, items("achievements"));
            for (const achievement of achievements) {
                const reward = rewards.has(achievement.Name);
                if (!reward && !linkedQuest(achievement, quest)) continue;
                add(trackerId === "quests" ? "achievements" : "quests", trackerId === "quests" ? achievement : quest,
                    reward ? "Named in quest rewards; see achievement requirements" : "Referenced in earning instructions; quest completion alone may not earn this achievement",
                    reward ? "reward" : "context");
            }
        }
    }
    return {
        sources: sources.filter((source, index) => sources.findIndex((candidate) => candidate.url === source.url) === index),
        relations: relations.filter((relation, index) => relations.findIndex((candidate) => candidate.trackerId === relation.trackerId && candidate.key === relation.key) === index)
    };
}
