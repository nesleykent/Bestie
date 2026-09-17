import test from 'node:test';
import assert from 'node:assert/strict';
import { planCharmTime, parsePlayTimeMinutes } from '../src/app/features/charm-plan.js';
import { calculateTaskEstimate } from '../src/app/features/task-analysis.js';
import { renderTaskResults } from '../src/app/ui/render-task-results.js';
import { renderTaskSessions } from '../src/app/ui/render-task-sessions.js';
const monster=(name, minutes, charms)=>({name,timeRemainingMinutes:minutes,charms,totalKills:0,killsToUnlock:100});
const group=(id,monsters)=>({id,label:id,monsters});

test('play time requires a complete finite valid expression',()=>{
    for (const value of ['-1h','-30 min','junk 2h','1h garbage','1:60','Infinity','0','1h -30min','1e300 h','9'.repeat(400)]) assert.equal(parsePlayTimeMinutes(value),null,value);
    for (const value of ['90 min','1.5 h','1,5h','1:30','1h 30min','1h30','1.5']) assert.equal(parsePlayTimeMinutes(value),90,value);
});
test('plan uses simultaneous progress, sequential sessions and shortest equal reward',()=>{
    const a=group('A',[monster('Rat',10,5),monster('Dragon',30,15)]);
    const b=group('B',[monster('Cyclops',20,20)]);
    assert.equal(planCharmTime([a,b],50).charms,40);
    const tied=planCharmTime([a,b],30);assert.equal(tied.charms,25);assert.equal(tied.timeUsedMinutes,30);
    const single=planCharmTime([a,b],20);assert.equal(single.charms,20);assert.equal(single.timeUsedMinutes,20);
    assert.equal(planCharmTime([],0).completedCount,0);
    for(const value of [-1,NaN,Infinity]) assert.throws(()=>planCharmTime([a],value),RangeError);
});
test('overlapping sessions never award the same creature twice and preserve alternatives',()=>{
    const groups=[group('A',[monster('Shared',10,25),monster('A-only',20,5)]),group('B',[monster('Shared',5,25),monster('B-only',15,20)])];
    const result=planCharmTime(groups,35);
    assert.equal(result.charms,50);assert.equal(result.completedCount,3);
    assert.equal(new Set(result.entries.map(x=>x.name)).size,3);
    assert.equal(result.route.reduce((sum,x)=>sum+x.charms,0),50);
});
test('optimizer matches an independent exhaustive allocation oracle for varied overlaps',()=>{
    for(let seed=1;seed<=30;seed++) {
        const groups=Array.from({length:3},(_,g)=>group(String(g),Array.from({length:3},(_,n)=>monster(`m${(seed+g+n)%5}`, 5+((seed*(n+1)+g*3)%4)*5, ((seed+g+n)%5+1)*5))));
        // Reward is canonical by creature in every session.
        const rewards=new Map(groups.flatMap(g=>g.monsters).map(m=>[m.name,Number(m.name.slice(1))*5+5]));
        groups.forEach(g=>g.monsters.forEach(m=>m.charms=rewards.get(m.name)));
        for(const budget of [10,20,35,60]) {
            let best={charms:0,time:0};
            const visit=(i,time,completed)=>{
                if(time>budget)return;
                if(i===groups.length){const charms=[...completed].reduce((sum,name)=>sum+rewards.get(name),0);if(charms>best.charms||(charms===best.charms&&time<best.time))best={charms,time};return;}
                for(const duration of new Set([0,...groups[i].monsters.map(m=>m.timeRemainingMinutes)])) visit(i+1,time+duration,new Set([...completed,...groups[i].monsters.filter(m=>m.timeRemainingMinutes<=duration).map(m=>m.name)]));
            };
            visit(0,0,new Set());const actual=planCharmTime(groups,budget);
            assert.deepEqual([actual.charms,actual.timeUsedMinutes],[best.charms,best.time]);
        }
    }
});
test('tasks distinguish unavailable rates from completed targets and reject partial numeric strings',()=>{
    const rows=[{name:'rat',displayName:'Rat',killsThisSession:0}];
    assert.equal(calculateTaskEstimate(rows,'rat',60,100).remainingTimeMinutes,null);
    rows[0].killsThisSession=100;
    assert.equal(calculateTaskEstimate(rows,'rat',0,100).remainingTimeMinutes,0);
    assert.equal(calculateTaskEstimate(rows,'rat',0,200).remainingTimeMinutes,null);
    for(const target of ['100oops', '-10','1.5','Infinity']) assert.equal(calculateTaskEstimate(rows,'rat',60,target).validTarget,false);
});
test('task creature names are escaped in detail and summary output',()=>{
    const rows=[{name:'<img src=x>',displayName:'<img src=x>',killsThisSession:1}], estimate=calculateTaskEstimate(rows,rows[0].name,60,5),container={};
    renderTaskResults(container,rows,estimate,60,'Regular');assert.doesNotMatch(container.innerHTML,/<img/);assert.match(container.innerHTML,/&lt;img/);
    renderTaskSessions(container,[{id:'a',label:'A',estimate,respawnModeLabel:'Regular'}]);assert.doesNotMatch(container.innerHTML,/<img/);
});
