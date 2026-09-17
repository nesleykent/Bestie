import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { experienceForLevel, levelForExperience, projectExperience, parseStamina, staminaRecovery, staminaUsage, elementalDamage } from "../src/app/features/calculators.js";
import { loadBestiaryData } from "../src/app/services/bestiary-repository.js";
import { createWorkspace, restoreWorkspace } from "../src/app/state/hunt-workspace.js";
import { readPageRoute, buildPageRoute } from "../src/app/state/page-route.js";

test("XP formula agrees with published level table and an independently accumulated per-level cost", () => {
    for (const [level, xp] of [[1,0],[2,100],[3,200],[8,4200],[20,98800],[100,15694800]]) {
        assert.equal(experienceForLevel(level), xp);
        assert.equal(levelForExperience(xp), level);
        if (xp) assert.equal(levelForExperience(xp - 1), level - 1);
    }
    let accumulated = 0;
    for (let level = 1; level <= 1000; level++) {
        assert.equal(experienceForLevel(level), accumulated);
        accumulated += 50 * level * level - 150 * level + 200;
    }
    const nearLimit = levelForExperience(Number.MAX_SAFE_INTEGER);
    assert.ok(experienceForLevel(nearLimit) <= Number.MAX_SAFE_INTEGER);
    for (const value of [-1, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) assert.throws(() => experienceForLevel(value));
});
test("XP projections preserve partial levels and unavailable rate rather than zero time", () => {
    const result = projectExperience({ experience: 150, targetLevel: 3, hourlyRate: 100 });
    assert.deepEqual(result, {level:2, targetExperience:200, remaining:50, progress:0.5, hours:0.5});
    assert.equal(projectExperience({experience:0, targetLevel:8}).hours, null);
    assert.equal(projectExperience({experience:4200, targetLevel:8}).hours, 0);
    assert.throws(() => projectExperience({experience:0, targetLevel:8, hourlyRate:-1}));
});
test("stamina recovery splits the 39-hour boundary and counts one explicit delay", () => {
    assert.equal(staminaRecovery({current:parseStamina("39:00")}).minutes, 1090);
    assert.equal(staminaRecovery({current:parseStamina("38:30"),target:parseStamina("39:30")}).minutes, 280);
    assert.equal(staminaRecovery({current:0}).minutes, 8110);
    assert.equal(staminaRecovery({current:2520}).minutes, 0);
    assert.equal(staminaRecovery({current:2519,delay:0}).minutes, 6);
    for (const invalid of ["42:01","43:00","01:60","-1:00","39:00junk", "1.5"]) assert.throws(() => parseStamina(invalid));
    assert.throws(() => staminaRecovery({current:1,delay:11}));
});
test("elemental calculation uses actual source percent received and never invents missing resistance", async context => {
    const payload = JSON.parse(await readFile(new URL('../src/data/bestiary.json',import.meta.url)));
    context.mock.method(globalThis,"fetch",async()=>({ok:true,json:async()=>payload}));
    const creatures = await loadBestiaryData();
    const toad = creatures.find(row=>row.Name === "Toad");
    assert.equal(toad.combat.hitpoints, 135);
    const actual = elementalDamage(toad, {physical:100, fire:100, earth:100});
    assert.equal(actual.total, 290);
    assert.deepEqual(actual.rows.map(row=>row.damage), [100,110,80]);
    assert.equal(elementalDamage({combat:{resistances:{fire:0}}}, {fire:999}).total, 0);
    assert.equal(elementalDamage({combat:{resistances:{}}}, {fire:0}).total, 0);
    assert.equal(elementalDamage({combat:{resistances:{}}}, {fire:1}).total, null);
    assert.throws(()=>elementalDamage(toad,{fire:-1}));
});
test("tool drafts survive workspace restoration and direct routes without changing hunt data", () => {
    const workspace = createWorkspace();
    workspace.mode = "tools"; workspace.toolView="stamina"; workspace.toolInputs={staminaCurrent:"38:30",xpRate:"bad draft"};
    const restored = restoreWorkspace(JSON.parse(JSON.stringify(workspace)));
    assert.deepEqual(restored.toolInputs,workspace.toolInputs);
    assert.deepEqual(restored.hunts,workspace.hunts);
    assert.equal(restored.mode,"tools");
    for (const view of ["experience","stamina","elemental"]) assert.deepEqual(readPageRoute(buildPageRoute("tools",view)),{mode:"tools",view,sessionId:null});
});

test("stamina usage reports exhausted time and bonus threshold without negative stamina", () => {
 assert.deepEqual(staminaUsage(2400,90),{after:2310,available:2400,bonusAvailable:60,unsupportedMinutes:0});
 assert.deepEqual(staminaUsage(10,20),{after:0,available:10,bonusAvailable:0,unsupportedMinutes:10});
 assert.throws(()=>staminaUsage(100,-1));
});
