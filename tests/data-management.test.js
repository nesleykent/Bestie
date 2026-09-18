import test from 'node:test';import assert from 'node:assert/strict';
import {createWorkspace,restoreWorkspace} from '../src/app/state/hunt-workspace.js';
import {dataScopes,clearWorkspaceScopes} from '../src/app/state/data-management.js';
import {applyUndo} from '../src/app/state/change-log.js';
test('selected tracker clearing is isolated, immutable and exactly undoable',()=>{
 const w=createWorkspace();w.trackerProgress={bestiary:{Rat:{reviewed:true,kills:0}},charms:{Freeze:{stage:1}}};const before=structuredClone(w);
 const next=clearWorkspaceScopes(w,['tracker:bestiary']);assert.equal(next.trackerProgress.bestiary,undefined);assert.deepEqual(next.trackerProgress.charms,w.trackerProgress.charms);assert.deepEqual(w,before);
 applyUndo(next.changeLog[0],next.trackerProgress,{});assert.deepEqual(next.trackerProgress,w.trackerProgress);
});
test('sessions clear removes dangling hunt associations and keeps unrelated inputs and records',()=>{
 const w=createWorkspace();w.hunts[0].sessionLog='draft';w.toolInputs={groundSessions:'{"one":"place"}',xpLevel:'100'};w.ignoredPlanHuntIds=[w.hunts[0].id];w.excludedAllTabsEntries=['one'];w.trackerProgress={charms:{Freeze:{stage:1}}};
 assert.equal(dataScopes(w).find(s=>s.id==='sessions').count,1);const next=clearWorkspaceScopes(w,['sessions']);assert.equal(next.hunts.length,1);assert.equal(next.hunts[0].sessionLog,'');assert.notEqual(next.activeHuntId,w.activeHuntId);assert.deepEqual(next.toolInputs,{xpLevel:'100'});assert.deepEqual(next.trackerProgress,w.trackerProgress);assert.deepEqual(next.ignoredPlanHuntIds,[]);
});
test('tool and plan scopes are explicit and restored data pages retain routes',()=>{
 const w=createWorkspace();w.toolInputs={xpLevel:'99'};w.playTimeInput='02:00';w.mode='data';w.dataView='manage';
 const next=clearWorkspaceScopes(w,['tools']);assert.deepEqual(next.toolInputs,{});assert.equal(next.playTimeInput,'02:00');assert.equal(restoreWorkspace(next).mode,'data');
 assert.equal(clearWorkspaceScopes(w,['plans']).playTimeInput,'');assert.throws(()=>clearWorkspaceScopes(w,[]));assert.throws(()=>clearWorkspaceScopes(w,['all']));
});
