import test from 'node:test';
import assert from 'node:assert/strict';
import { getFullHuntAnalysis, compareHuntMetrics } from '../src/app/features/hunt-analysis.js';
import { renderHuntAnalysis } from '../src/app/ui/render-hunt-analysis.js';
import { createWorkspace, restoreWorkspace } from '../src/app/state/hunt-workspace.js';
import { readPageRoute, buildPageRoute } from '../src/app/state/page-route.js';
const log='Session: 01:00h\nXP Gain: 1000\nLoot: 100\nSupplies: 200\nKilled Monsters:\n5x Rat\nLooted Items:\n2x <img src=x>';
const hunt=(id='a',mode='regular')=>({id,name:'<script>name</script>',respawnMode:mode,sessionLog:log,processedLog:log});
test('full measurements remain stable during draft edits and across persistence',()=>{
    const workspace=createWorkspace();Object.assign(workspace.hunts[0],hunt());workspace.hunts[0].sessionLog='unfinished';
    const restored=restoreWorkspace(JSON.parse(JSON.stringify(workspace))).hunts[0];
    const result=getFullHuntAnalysis(restored);assert.equal(result.metrics.experience,1000);assert.equal(result.profitPerHour,-100);assert.equal(result.hasDraft,true);
    assert.equal(getFullHuntAnalysis({sessionLog:log}),null);
});
test('rankings preserve negative profit, exclude missing metrics and separate spawn modes',()=>{
    const a=hunt(),b=hunt('b','rapid'),missing={...hunt('c'),processedLog:'Session: 01:00h\nKilled Monsters:\n1x Rat\nLooted Items:'};
    assert.deepEqual(compareHuntMetrics([a,b,missing],'regular','profitPerHour').map(row=>[row.hunt.id,row.value]),[['a',-100]]);
    assert.deepEqual(compareHuntMetrics([a],'regular','constructor'),[]);
});
test('analysis renders literal user content and distinguishes unavailable, reported and calculated values',()=>{
    const container={};renderHuntAnalysis(container,hunt(),[hunt()]);assert.match(container.innerHTML,/Not reported/);assert.match(container.innerHTML,/Calculated from reported totals/);assert.doesNotMatch(container.innerHTML,/<img|<script>|NaN|undefined/);
    assert.deepEqual(readPageRoute(buildPageRoute('analysis','session','hunt-1')),{mode:'analysis',view:'session',sessionId:'hunt-1'});
});
