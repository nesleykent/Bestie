import { createWorkspace, huntHasContent } from './hunt-workspace.js';
import { TRACKERS } from '../trackers/registry.js';
import { pushChange } from './change-log.js';

export function dataScopes(workspace) {
 return [
  ...TRACKERS.map(tracker=>({id:`tracker:${tracker.id}`,label:tracker.label,count:Object.keys(workspace.trackerProgress?.[tracker.id]??{}).length,unit:'records'})),
  {id:'sessions',label:'Hunt sessions',count:workspace.hunts.filter(huntHasContent).length,unit:'saved sessions'},
  {id:'plans',label:'Planning inputs and weapon plans',count:workspace.weaponPlans.length,unit:'weapon plans'},
  {id:'tools',label:'Tool inputs, prices and processed Morning Tibia',count:Object.keys(workspace.toolInputs??{}).length,unit:'saved fields'}
 ];
}
/** Clear only explicitly selected scopes; tracker clears participate in the existing undo trail. */
export function clearWorkspaceScopes(workspace, scopes) {
 const allowed=new Set(dataScopes(workspace).map(s=>s.id));
 if(!Array.isArray(scopes)||!scopes.length||scopes.some(s=>!allowed.has(s)))throw new Error('Select at least one valid data scope.');
 const next=structuredClone(workspace), defaults=createWorkspace();
 for(const scope of new Set(scopes)) {
  if(scope.startsWith('tracker:')) {
   const id=scope.slice(8), entries=next.trackerProgress[id];
   if(entries&&Object.keys(entries).length){pushChange(next.changeLog,{kind:'bulk',trackerId:id,label:`Clear ${TRACKERS.find(t=>t.id===id).label}`,entries});delete next.trackerProgress[id];}
  }else if(scope==='sessions') {
   next.hunts=defaults.hunts;next.activeHuntId=defaults.activeHuntId;next.excludedAllTabsEntries=[];next.ignoredPlanHuntIds=[];
   delete next.toolInputs.groundSessions;
  }else if(scope==='plans') {
   next.weaponPlans=defaults.weaponPlans;next.activeWeaponPlanId=defaults.activeWeaponPlanId;next.playTimeInput='';next.ignoredPlanHuntIds=[];next.planRespawnMode='regular';
  }else if(scope==='tools')next.toolInputs={};
 }
 return next;
}
