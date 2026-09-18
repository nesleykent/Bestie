import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCharmAdvice } from '../src/app/features/charmwise.js';
import { loadCharmsData } from '../src/app/services/charms-repository.js';
import { loadBestiaryData } from '../src/app/services/bestiary-repository.js';
import { setEntry } from '../src/app/state/tracker-progress.js';
import { charmsTracker } from '../src/app/trackers/charms.js';
import { bestiaryTracker } from '../src/app/trackers/bestiary.js';
async function fixture(t) {
 t.mock.method(globalThis,'fetch',async url=>({ok:true,json:async()=>JSON.parse(await readFile(new URL('../src/'+url.replace('./',''),import.meta.url),'utf8'))}));
 return {charms:await loadCharmsData(),creatures:await loadBestiaryData(),progress:{}};
}
test('unknown stages stay unknown even with manually confirmed funds, including zero',async t=>{
 const input=await fixture(t);const result=buildCharmAdvice({...input,availablePoints:100000,availableEchoes:0});
 assert.equal(result.unknownStages,25);assert.equal(result.budgets.points.confirmed,true);assert.equal(result.budgets.echoes.amount,0);
 assert.ok(result.candidates.every(row=>row.affordable===null));assert.equal(result.budgets.echoes.source,'manual available balance');
 assert.equal(buildCharmAdvice(input).budgets.points.confirmed,false);
});
test('reviewed locked stages, stage upgrade costs and separate currencies use actual dataset',async t=>{
 const input=await fixture(t);const major=input.charms.find(c=>c.Name==='Freeze');const minor=input.charms.find(c=>c.type==='Minor');
 setEntry(input.progress,'charms',major.Name,charmsTracker.entryDefaults,{reviewed:true});
 setEntry(input.progress,'charms',minor.Name,charmsTracker.entryDefaults,{reviewed:true});
 let result=buildCharmAdvice({...input,availablePoints:major.stages[0].cost,availableEchoes:0});
 assert.equal(result.candidates.find(r=>r.name===major.Name).affordable,true);
 assert.equal(result.candidates.find(r=>r.name===minor.Name).affordable,false);
 setEntry(input.progress,'charms',major.Name,charmsTracker.entryDefaults,{stage:2});
 result=buildCharmAdvice({...input,promoted:true});
 const row=result.candidates.find(r=>r.name===major.Name);
 assert.equal(row.next.cost,major.stages[2].cost);assert.equal(result.spent,major.stages[0].cost+major.stages[1].cost);
 assert.equal(result.echoesGenerated,250);assert.equal(result.budgets.points.overspent,true);
 assert.equal(result.budgets.echoes.confirmed,false);
});
test('creature affinity preserves immunity and earned funds require completion; advice never mutates records',async t=>{
 const input=await fixture(t);const c=input.creatures.find(c=>c.Name==='Toad');
 setEntry(input.progress,'bestiary',c.Name,bestiaryTracker.entryDefaults,{kills:c['Kills to Unlock']});
 const before=structuredClone(input);
 const result=buildCharmAdvice({...input,creatureName:'Toad'});
 assert.equal(result.earned,c.Charms);assert.equal(result.creatureProgress.isComplete,true);
 for(const row of result.candidates.filter(c=>c.element))assert.equal(row.affinity,c.combat.resistances[row.element]??null);
 assert.deepEqual(input,before);
 const synthetic={...c,combat:{resistances:{fire:0}}};
 const immune=buildCharmAdvice({...input,creatures:[synthetic],creatureName:c.Name}).candidates.find(r=>r.name==='Enflame');
 assert.equal(immune.affinity,0);assert.match(immune.reasons.join(' '),/immune/);
});
test('invalid budgets and intent reject rather than producing an affordable recommendation',async t=>{
 const input=await fixture(t);
 for(const value of [-1,NaN,Infinity,1.1,Number.MAX_SAFE_INTEGER+1,'100'])assert.throws(()=>buildCharmAdvice({...input,availablePoints:value}));
 assert.throws(()=>buildCharmAdvice({...input,intent:'best'}));
});
