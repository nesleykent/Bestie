import { getEntry, isKnownEntry } from "../state/tracker-progress.js";
import { charmsTracker, deriveCharmRow, PROMOTION_ECHOES } from "../trackers/charms.js";
import { bestiaryTracker, deriveBestiaryRow } from "../trackers/bestiary.js";

const ELEMENTS = {Curse:"death","Divine Wrath":"holy",Enflame:"fire",Freeze:"ice",Poison:"earth",Wound:"physical",Zap:"energy"};
const DEFENSIVE = new Set(["Dodge","Parry","Adrenaline Burst","Bless","Cleanse","Numb","Void Inversion"]);
function manualBudget(value, label) {
    if (value === null || value === undefined || value === "") return null;
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a nonnegative whole number.`);
    return value;
}
/** Recommendations expose assumptions and never spend points or alter tracker records. */
export function buildCharmAdvice({charms,creatures,progress,creatureName="",availablePoints=null,availableEchoes=null,promoted=false,intent="damage"}) {
    if (!["damage","defence","utility"].includes(intent)) throw new Error("Choose a supported charm objective.");
    const charmRows=charms.map(charm=>{
        const entry=getEntry(progress,"charms",charm.Name,charmsTracker.entryDefaults);
        return {...deriveCharmRow(charm,entry),known:isKnownEntry(charmsTracker.entryDefaults,entry)};
    });
    const bestiaryRows=creatures.map(creature=>{
        const entry=getEntry(progress,"bestiary",creature.Name,bestiaryTracker.entryDefaults);
        return {...deriveBestiaryRow(creature,entry),known:entry.kills>0 || entry.stage>0 || Boolean(entry.reviewed)};
    });
    const earned=bestiaryTracker.providesBudget(bestiaryRows).earned;
    const spent=charmRows.filter(row=>row.currency==="points").reduce((sum,row)=>sum+row.spent,0);
    const echoesGenerated=charmRows.reduce((sum,row)=>sum+row.echoesGenerated,0)+(promoted?PROMOTION_ECHOES:0);
    const echoesSpent=charmRows.filter(row=>row.currency==="echoes").reduce((sum,row)=>sum+row.spent,0);
    const budgets={};
    for(const [currency,manual,recorded,complete] of [
        ["points",manualBudget(availablePoints,"Available charm points"),earned-spent,bestiaryRows.every(row=>row.known)&&charmRows.filter(row=>row.currency==="points").every(row=>row.known)],
        ["echoes",manualBudget(availableEchoes,"Available echoes"),echoesGenerated-echoesSpent,charmRows.every(row=>row.known)]
    ]) budgets[currency]={amount:manual ?? Math.max(0,recorded),recorded,confirmed:manual!==null||complete,source:manual!==null?"manual available balance":"recorded progress",overspent:recorded<0};
    const creature=creatures.find(row=>row.Name===creatureName) ?? null;
    const creatureProgress=bestiaryRows.find(row=>row.name===creatureName) ?? null;
    const candidates=charmRows.map(row=>{
        const element=ELEMENTS[row.name] ?? null;
        const affinity=element && creature ? creature.combat?.resistances?.[element] ?? null : null;
        const relevance= intent === "damage" ? (row.type==="Major"&&!DEFENSIVE.has(row.name)) : intent === "defence" ? DEFENSIVE.has(row.name) : row.type==="Minor"&&!DEFENSIVE.has(row.name);
        const next=row.stages[row.stage] ?? null;
        const current=row.stages[row.stage-1] ?? null;
        const affordable=next && row.known && budgets[row.currency].confirmed ? next.cost<=budgets[row.currency].amount : null;
        const reasons=[];
        if(!row.known)reasons.push("Record the current stage before deciding whether this is an unlock or upgrade.");
        if(element)reasons.push(affinity===null?"Choose a creature with known elemental data to compare affinity.":`${element}: target receives ${affinity}% damage; ${affinity===0?"immune to this element":affinity>100?"weak to this element":affinity<100?"resists this element":"neutral"}.`);
        else if(row.name==="Low Blow"||row.name==="Savage Blow")reasons.push("Critical benefit depends on existing critical chance, critical damage and attack damage.");
        else if(row.name==="Overpower"||row.name==="Overflux")reasons.push("Benefit depends on maximum health or mana; no resource stat is inferred.");
        else if(row.name==="Carnage")reasons.push("On-kill area effect: value depends on kill frequency and nearby targets.");
        else if(DEFENSIVE.has(row.name))reasons.push("Defensive value depends on the selected creature’s attacks and the effects you need to avoid.");
        else reasons.push("Utility value depends on your loot, sustain and hunting needs; effects are shown directly.");
        if(next)reasons.push(`${next.cost} ${row.currency === "points"?"charm points":"echoes"} for ${row.known?`stage ${row.stage+1}`:"the first stage if currently locked"}.`);
        return {...row,element,affinity,relevance,next,current,affordable,reasons};
    }).sort((a,b)=>Number(b.relevance)-Number(a.relevance) || Number(b.affordable===true)-Number(a.affordable===true) || (b.affinity??-1)-(a.affinity??-1) || a.nextCost-b.nextCost || a.name.localeCompare(b.name));
    return {budgets,earned,spent,echoesGenerated,echoesSpent,creature,creatureProgress,candidates,
        unknownStages:charmRows.filter(row=>!row.known).length,unknownBestiary:bestiaryRows.filter(row=>!row.known).length};
}
