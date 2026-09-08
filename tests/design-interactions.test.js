import test from "node:test";
import assert from "node:assert/strict";
import { renderProficiency } from "../src/app/ui/render-proficiency.js";
import { calculateSessionProficiency } from "../src/app/features/weapon-proficiency.js";
import { createWorkspace } from "../src/app/state/hunt-workspace.js";
import { renderTracker } from "../src/app/ui/render-tracker.js";
import { buildInitialFilters } from "../src/app/trackers/registry.js";
import { achievementsTracker } from "../src/app/trackers/achievements.js";
import { formatSessionDate, renderSessionLibrary } from "../src/app/ui/render-session-library.js";
import { tickControl } from "../src/app/ui/render-controls.js";

test("proficiency shows all contributions and calculation context without hiding rows", () => {
    const bestiary = Array.from({length:7}, (_, i) => ({Name:`Creature ${i}`, Difficulty:"Easy"}));
    const session = calculateSessionProficiency(bestiary.map((item) => ({name:item.Name, killsThisSession:10})), bestiary, 60);
    const container = {};
    renderProficiency(container, session, {processed:true,sort:{key:"total",direction:"desc"},plans:createWorkspace().weaponPlans,activeId:"weapon-1",projectionCreature:""});
    assert.doesNotMatch(container.innerHTML, /data-proficiency-extra|<details|<summary|proficiencyExpand/);
    assert.match(container.innerHTML, /4,900/);
    for (const item of bestiary) assert.ok(container.innerHTML.includes(item.Name));
});

test("filters expose each active criterion as a removable action in normal flow", () => {
    const tracker = achievementsTracker;
    const filters = {...buildInitialFilters(tracker),search:'<test>',secretOnly:true};
    const container = {};
    renderTracker(container,{tracker,filters,rows:[],items:[],sort:{key:'name'},page:{total:0},totals:{answer:{label:'Points',value:'0'},stats:[]}});
    assert.match(container.innerHTML,/data-tracker-remove-filter="search"/);
    assert.match(container.innerHTML,/data-tracker-remove-filter="secretOnly"/);
    assert.match(container.innerHTML,/data-tracker-facet="secretOnly" data-tracker-facet-value="false" aria-pressed="true"/);
    assert.match(container.innerHTML,/&lt;test&gt;/);
    assert.doesNotMatch(container.innerHTML,/filter-disclosure|popover|<dialog/);
});

test("state buttons carry one accessible pressed state without redundant indicator inputs", () => {
    for (const done of [false,true]) {
        const markup = tickControl({name:'Sample',key:'sample',done},'done',{yesLabel:'Earned'});
        assert.match(markup,new RegExp(`aria-pressed="${done}"`));
        assert.doesNotMatch(markup,/<input|radio_button|check_circle/);
    }
});


test("session history retains analysis values and edit targets in its compact records", () => {
    const container = {};
    renderSessionLibrary(container, [{id:"hunt-1",label:"Hunt <one>",name:"Hunt <one>",huntedOn:"2026-09-07",notes:"Route & team",duration:60,respawnModeLabel:"Regular",hasProcessedLog:true,proficiencyTotal:34000,proficiencyRate:34000,charmPoints:75,charmRate:3,kills:500,creatureCount:7,canDelete:true}], {key:"label",direction:"asc"}, {search:"",respawnMode:"all"}, {shown:1,total:1,comparable:1});
    for (const value of ["34,000", "75", "500", "7 creatures", "Route &amp; team", "Hunt &lt;one&gt;"]) assert.ok(container.innerHTML.includes(value));
    for (const field of ["name", "date", "notes"]) assert.match(container.innerHTML, new RegExp(`data-library-${field}="hunt-1"`));
    assert.match(container.innerHTML, /data-proficiency-open="hunt-1"/);
    assert.match(container.innerHTML, /id="libraryCompareButton"[^>]+disabled/);
    assert.doesNotMatch(container.innerHTML, /<details|<summary/);
    assert.equal(formatSessionDate(""), "Undated");
    assert.equal(formatSessionDate("2026-09-07"), new Intl.DateTimeFormat(undefined, {dateStyle:"medium"}).format(new Date("2026-09-07T12:00:00")));
});
