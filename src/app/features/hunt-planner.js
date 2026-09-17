import { getFullHuntAnalysis } from "./hunt-analysis.js";

const VOCATIONS = ["knight", "paladin", "sorcerer", "druid", "monk"];
const PROMOTIONS = {"elite knight":"knight","royal paladin":"paladin","master sorcerer":"sorcerer","elder druid":"druid","exalted monk":"monk"};
export function normalizeVocation(value) {
    const text = String(value ?? "").trim().toLowerCase();
    if (!text || text === "all") return null;
    const vocation = PROMOTIONS[text] ?? text;
    if (!VOCATIONS.includes(vocation)) throw new Error("Choose a supported vocation.");
    return vocation;
}
export function parseMinLevel(value) {
    const match = /^(\d+)\+$/.exec(String(value).trim());
    return match && Number.isSafeInteger(Number(match[1])) && Number(match[1]) > 0 ? Number(match[1]) : null;
}
export function parseReferenceRate(value) {
    if (value === "-" || value === "" || value == null) return null;
    const match = /^(-?\d+(?:\.\d+)?)(k|kk)?$/i.exec(String(value).trim());
    if (!match) throw new Error(`Unsupported reference rate: ${value}`);
    const rate = Number(match[1]) * (match[2]?.toLowerCase() === "kk" ? 1_000_000 : match[2] ? 1000 : 1);
    if (!Number.isFinite(rate) || Math.abs(rate) > Number.MAX_SAFE_INTEGER) throw new Error("Reference rate exceeds supported range.");
    return rate;
}
export function filterHuntGrounds(grounds, {level = null,vocation = null,partySize = "all",query = ""} = {}) {
    const voc = normalizeVocation(vocation);
    if (level !== null && (!Number.isSafeInteger(level) || level < 1)) throw new Error("Level must be a positive whole number.");
    if (!["all","solo","team"].includes(partySize)) throw new Error("Choose solo, team, or all hunts.");
    const text = String(query).trim().toLowerCase();
    return grounds.filter(row => (!voc || row.vocation === voc || row.partySize === "team")
        && (partySize === "all" || partySize === row.partySize)
        && (level === null || (parseMinLevel(row.minLevel) !== null && parseMinLevel(row.minLevel) <= level))
        && (!text || `${row.place} ${row.context}`.toLowerCase().includes(text)));
}
function measuredRate(groundId, hunts, links, metric, respawnMode) {
    const sessions = [];
    let weighted = 0; let minutes = 0;
    for (const hunt of hunts) {
        if (links[hunt.id] !== groundId || (hunt.respawnMode ?? "regular") !== respawnMode) continue;
        const analysis = getFullHuntAnalysis(hunt);
        if (!analysis || analysis.metricIssues.length || analysis.sessionDuration <= 0) continue;
        const value = metric === "experience" ? analysis.metrics.rawXpPerHour : analysis.profitPerHour;
        if (value === null || !Number.isFinite(value)) continue;
        weighted += value * analysis.sessionDuration; minutes += analysis.sessionDuration;
        sessions.push({id:hunt.id,name:hunt.name,minutes:analysis.sessionDuration,hasDraft:analysis.hasDraft});
    }
    return {value:minutes ? weighted / minutes : null,minutes,sessions};
}
/** Local evidence is never blended with reference rates, nor used as creature kill rates. */
export function rankHuntGrounds(grounds, options = {}, {hunts = [], links = {}} = {}) {
    const {objective = "experience", evidence = "reference", respawnMode = "regular"} = options;
    if (!["experience","profit"].includes(objective)) throw new Error("Choose experience or profit as the objective.");
    if (!["reference","measured"].includes(evidence)) throw new Error("Choose reference or measured evidence.");
    if (!["regular","rapid"].includes(respawnMode)) throw new Error("Choose a supported respawn mode.");
    return filterHuntGrounds(grounds,options).map(ground=>{
        const reference = parseReferenceRate(objective === "experience" ? ground.referenceRawExperiencePerHour : ground.referenceProfitPerHour);
        const measured = measuredRate(ground.id,hunts,links,objective,respawnMode);
        const value = evidence === "reference" ? reference : measured.value;
        return {ground,value,reference,measured,evidence,reasons:[`Source recommends level ${ground.minLevel}`, ground.partySize === "team" ? "Team composition unspecified by source" : `${ground.vocation} solo`,value === null ? "No rate for the selected evidence" : evidence === "reference" ? "Curated reference rate; conditions may differ" : `${measured.sessions.length} explicitly linked sessions; duration-weighted rate`]};
    }).sort((a,b)=>(a.value === null)-(b.value === null) || (b.value ?? 0)-(a.value ?? 0) || a.ground.place.localeCompare(b.ground.place) || a.ground.id.localeCompare(b.ground.id));
}
