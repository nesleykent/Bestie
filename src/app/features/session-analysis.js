import { parseHuntSession } from "./session-parser.js";
import { findBestiaryCreature } from "./creature-names.js";

function buildMonsterProgress(entry, killsThisSession, sessionDuration, totalKills = 0) {
    const killsToUnlock = Number(entry["Kills to Unlock"]) || 0;
    const charms = Number(entry.Charms) || 0;
    const killRate = sessionDuration > 0 ? (killsThisSession / sessionDuration) : 0;
    const remainingKills = Math.max(0, killsToUnlock - totalKills);
    const timeRemainingMinutes = remainingKills === 0
        ? 0
        : (killRate > 0 ? (remainingKills / killRate) : Number.POSITIVE_INFINITY);
    const charmsPerHour = Number.isFinite(timeRemainingMinutes) && timeRemainingMinutes > 0
        ? (charms / timeRemainingMinutes) * 60
        : 0;

    return {
        name: entry.Name,
        wikiLink: `https://tibia.fandom.com/wiki/${entry.Name.replace(/\s/g, "_")}`,
        charms,
        killsThisSession,
        totalKills,
        killsToUnlock,
        killRate,
        remainingKills,
        timeRemainingMinutes,
        charmsPerHour
    };
}

export function isBestiaryEntryComplete(monster) {
    return (monster.totalKills || 0) >= monster.killsToUnlock;
}

export function summarizeBestiaryMonsters(monsters) {
    const totals = monsters.reduce((summary, monster) => {
        summary.totalCharms += isBestiaryEntryComplete(monster) ? 0 : monster.charms;
        summary.maxTimeRemainingMinutes = Math.max(
            summary.maxTimeRemainingMinutes,
            monster.timeRemainingMinutes
        );
        return summary;
    }, {
        maxTimeRemainingMinutes: 0,
        totalCharms: 0
    });

    return {
        ...totals,
        totalCharmsPerHour: Number.isFinite(totals.maxTimeRemainingMinutes) && totals.maxTimeRemainingMinutes > 0
            ? (totals.totalCharms / totals.maxTimeRemainingMinutes) * 60
            : 0
    };
}

export function analyzeSession(logText, bestiaryData, session = parseHuntSession(logText)) {
    const monsters = session.monsters.map(({ name, killsThisSession }) => {
        const entry = findBestiaryCreature(name, bestiaryData);
        return entry ? buildMonsterProgress(entry, killsThisSession, session.sessionDuration) : null;
    }).filter(Boolean);
    return { sessionDuration: session.sessionDuration, monsters };
}

export function recalculateProgress(monsters, bestiaryData, sessionDuration, totalKillsByName) {
    return monsters.map((monster) => {
        const bestiaryEntry = bestiaryData.find((entry) => entry.Name === monster.name);
        const totalKills = Number(totalKillsByName[monster.name] || 0);

        return buildMonsterProgress(bestiaryEntry, monster.killsThisSession, sessionDuration, totalKills);
    });
}
