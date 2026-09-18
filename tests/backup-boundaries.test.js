import test from "node:test";
import assert from "node:assert/strict";

import { validateWorkspaceBackup, isSafeKey } from "../src/app/state/backup-validation.js";
import { parseAppWorkspaceFile, serializeAppState } from "../src/app/state/app-workspace-transfer.js";
import { restoreAppWorkspace } from "../src/app/state/character-workspace.js";
import { createWorkspace } from "../src/app/state/hunt-workspace.js";
import { importTrackerJson } from "../src/app/state/tracker-transfer.js";
import { loadAppState, saveAppState, getStorageProblem } from "../src/app/state/local-store.js";
import { STAGE_COMPLETE } from "../src/app/trackers/bestiary.js";

function backup() {
    return { app: "bestie", version: 2, characters: [{ id: "c1", name: "Player", workspace: createWorkspace() }], activeCharacterId: "c1" };
}

// ---------------------------------------------------------------- malformed known fields

test("malformed toolInputs, weaponPlans, changeLog and processed-log fields are rejected before replacing a roster", () => {
    const cases = [
        (w) => { w.toolInputs = { stamina: 42 }; },
        (w) => { w.toolInputs = { constructor: "yes" }; },
        (w) => { w.weaponPlans = {}; },
        (w) => { w.weaponPlans = [{ id: "a" }, { id: "a" }]; },
        (w) => { w.weaponPlans = [{ id: "a", currentXP: 100 }]; },
        (w) => { w.changeLog = {}; },
        (w) => { w.changeLog = [{ trackerId: 1 }]; },
        (w) => { w.changeLog = [{ trackerId: "bestiary", label: "x", kind: 5 }]; },
        (w) => { w.changeLog = [{ trackerId: "bestiary", label: "x", entries: { Rat: { kills: 0, stage: 0, echoWarden: false, animusMastery: false, bookmark: false, reviewed: 1 } } }]; },
        (w) => { w.hunts[0].processedLog = 12; },
        (w) => { w.hunts[0].hasProcessedLog = "yes"; },
        (w) => { w.trackerProgress = { bestiary: { Rat: { kills: 0, stage: STAGE_COMPLETE + 1 } } }; },
        (w) => { w.trackerProgress = { bestiary: { Rat: { kills: {} } } }; }
    ];

    for (const mutate of cases) {
        const app = backup();
        mutate(app.characters[0].workspace);
        assert.throws(() => parseAppWorkspaceFile(JSON.stringify(app)));
    }
});

// ---------------------------------------------------------------- forward/legacy tolerance

test("unknown tracker data is rejected rather than silently discarded; legacy omissions remain valid", () => {
    for (const progress of [
        { futureTracker: { X: { done: true } } },
        { bestiary: { Rat: { kills: 5, futureFlag: true } } },
        { charms: { Dodge: { stage: 4 } } },
        { bosstiary: { Boss: { stage: 5 } } }
    ]) {
        const workspace = createWorkspace(); workspace.trackerProgress = progress;
        assert.throws(() => validateWorkspaceBackup(workspace));
    }
    for (const change of [
        { trackerId: "futureTracker", label: "Future", entries: {} },
        { trackerId: "bestiary", label: "Missing entries" },
        { trackerId: "bestiary", entries: {} },
        { trackerId: "bestiary", label: "x", entries: {}, units: { constructor: {} } }
    ]) {
        const workspace = createWorkspace(); workspace.changeLog = [change];
        assert.throws(() => validateWorkspaceBackup(workspace));
    }

    // The legacy pre-framework and pre-multi-character shapes, which never carried
    // toolInputs, weaponPlans or a changeLog at all, remain valid on their own.
    const legacy = createWorkspace();
    delete legacy.toolInputs;
    delete legacy.weaponPlans;
    delete legacy.changeLog;
    legacy.bestiaryProgress = { Rat: { kills: 3 } };
    assert.doesNotThrow(() => validateWorkspaceBackup(legacy));
});

// ---------------------------------------------------------------- reserved prototype identifiers

test("reserved JS prototype identifiers are rejected wherever a backup key becomes a dynamic property", () => {
    assert.equal(isSafeKey("__proto__"), false);
    assert.equal(isSafeKey("constructor"), false);
    assert.equal(isSafeKey("prototype"), false);
    assert.equal(isSafeKey("Rat"), true);

    const cases = [
        (w) => { w.hunts[0].id = "constructor"; },
        (w) => { w.trackerProgress = { bestiary: { constructor: { kills: 1 } } }; },
        (w) => { w.trackerProgress = { prototype: { X: { done: true } } }; },
        (w) => { w.toolInputs = { prototype: "x" }; },
        (w) => { w.weaponPlans = [{ id: "constructor" }]; },
        (w) => { w.changeLog = [{ trackerId: "bestiary", label: "x", entries: { constructor: null } }]; }
    ];

    for (const mutate of cases) {
        const app = backup();
        mutate(app.characters[0].workspace);
        assert.throws(() => parseAppWorkspaceFile(JSON.stringify(app)));
    }

    assert.equal(Object.prototype.polluted, undefined);
});

// ---------------------------------------------------------------- valid roundtrip

test("current and legacy backup formats roundtrip full tool inputs, weapon plans, undo history and tracker progress exactly", () => {
    const app = backup();
    const workspace = app.characters[0].workspace;

    workspace.toolInputs = { stamina: "40:00", elementalDamage: "1250" };
    workspace.weaponPlans = [
        { id: "weapon-1", name: "Main", currentXP: "1000", targetXP: "5000" },
        { id: "weapon-2", name: "Alt", currentXP: "0", targetXP: "" }
    ];
    workspace.activeWeaponPlanId = "weapon-2";
    workspace.trackerProgress = {
        bestiary: { Rat: { kills: 12, stage: 0, echoWarden: false, animusMastery: false, bookmark: true, reviewed: false } },
        quests: { "The Ape City": { completed: true, bookmark: false, reviewed: false } }
    };
    workspace.changeLog = [{
        kind: "entry",
        trackerId: "bestiary",
        label: "Update Rat total kills",
        entries: { Rat: null },
        units: {}
    }];
    workspace.hunts[0].sessionLog = "unfinished draft";
    workspace.hunts[0].processedLog = "processed text";
    workspace.hunts[0].hasProcessedLog = true;

    const restored = restoreAppWorkspace(parseAppWorkspaceFile(serializeAppState(app, "2026-09-17")));
    const restoredWorkspace = restored.characters[0].workspace;

    assert.deepEqual(restoredWorkspace.toolInputs, { stamina: "40:00", elementalDamage: "1250" });
    assert.deepEqual(restoredWorkspace.weaponPlans.map((plan) => [plan.id, plan.currentXP, plan.targetXP]), [
        ["weapon-1", "1000", "5000"],
        ["weapon-2", "0", ""]
    ]);
    assert.equal(restoredWorkspace.activeWeaponPlanId, "weapon-2");
    assert.equal(restoredWorkspace.trackerProgress.bestiary.Rat.kills, 12);
    assert.equal(restoredWorkspace.trackerProgress.bestiary.Rat.bookmark, true);
    assert.equal(restoredWorkspace.trackerProgress.quests["The Ape City"].completed, true);
    assert.equal(restoredWorkspace.changeLog.length, 1);
    assert.equal(restoredWorkspace.changeLog[0].label, "Update Rat total kills");
    assert.equal(restoredWorkspace.changeLog[0].entries.Rat, null);
    assert.equal(restoredWorkspace.hunts[0].processedLog, "processed text");
    assert.equal(restoredWorkspace.hunts[0].hasProcessedLog, true);

    // The pre-multi-character export never carried a changeLog or weaponPlans at
    // the top level under this name, only a bare workspace — still valid on its own.
    const legacyFile = { app: "bestiary-session-analyzer", version: 1, workspace };
    const legacyParsed = parseAppWorkspaceFile(JSON.stringify(legacyFile));
    assert.equal(legacyParsed.characters[0].workspace.toolInputs.stamina, "40:00");
});

// ---------------------------------------------------------------- JSON boolean transfer

test("a JSON import never reads the literal string \"false\" as a truthy boolean", () => {
    const items = [{ Name: "Widget" }];
    const fakeTracker = {
        id: "fake",
        entryDefaults: { flag: true },
        itemKey: (item) => item.Name,
        transfer: {
            readJsonRow: (item) => ({ flag: item.flag })
        }
    };

    const payload = { data: [{ name: "Widget", flag: "false" }] };
    const imported = importTrackerJson(JSON.stringify(payload), items, fakeTracker);

    assert.equal(imported.matched, 1);
    // "false" differs from the default (true) once correctly read as false, so it
    // is recorded rather than silently matching the default and being dropped.
    assert.deepEqual(imported.record.Widget, { flag: false });
});

// ---------------------------------------------------------------- corrupt-shape local storage

function storage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), values };
}

test("valid JSON with a corrupt app-state shape pauses saving exactly like unreadable JSON", () => {
    globalThis.localStorage = storage({ "bestie-app-v1": JSON.stringify({ characters: [] }) });
    globalThis.sessionStorage = storage();

    assert.equal(loadAppState(), null);
    assert.equal(saveAppState(backup()), false);
    assert.match(getStorageProblem(), /original is preserved/);
    assert.equal(localStorage.getItem("bestie-app-v1"), JSON.stringify({ characters: [] }), "the original corrupt-shape value is never overwritten");

    delete globalThis.localStorage;
    delete globalThis.sessionStorage;
});

test('actual Bestiary vendor JSON booleans preserve false/zero and reject ambiguous values',async()=>{
 const {bestiaryTracker}=await import('../src/app/trackers/bestiary.js');const items=[{Name:'Rat'}];
 for(const value of ['false','0','no',false,0]){
  const result=importTrackerJson(JSON.stringify({data:[{name:'Rat',user_data:{kills:1,echo_warden:value,animus_mastery:value}}]}),items,bestiaryTracker);
  assert.equal(result.record.Rat.echoWarden,false);assert.equal(result.record.Rat.animusMastery,false);
 }
 assert.throws(()=>importTrackerJson(JSON.stringify({data:[{name:'Rat',user_data:{echo_warden:'maybe'}}]}),items,bestiaryTracker),/boolean/);
 const app=backup();app.characters[0].id=' __proto__ ';assert.throws(()=>parseAppWorkspaceFile(JSON.stringify(app)));
});


test("legacy numeric undo entries normalize before they can be restored", async () => {
    const { applyUndo } = await import("../src/app/state/change-log.js");
    const app = backup();
    app.characters[0].workspace.changeLog = [{ trackerId: "bestiary", label: "Legacy", entries: { Rat: { kills: "12" } } }];
    const restored = restoreAppWorkspace(parseAppWorkspaceFile(JSON.stringify(app))).characters[0].workspace;
    applyUndo(restored.changeLog[0], restored.trackerProgress, {});
    assert.equal(restored.trackerProgress.bestiary.Rat.kills, 12);
    assert.equal(restored.trackerProgress.bestiary.Rat.reviewed, false);
});

test("nested corrupt browser progress is retained with automatic saving paused", () => {
    const app = backup(); app.characters[0].workspace.trackerProgress = { bestiary: { Rat: { kills: -1 } } };
    const original = JSON.stringify(app);
    globalThis.localStorage = storage({ "bestie-app-v1": original });
    globalThis.sessionStorage = storage();
    assert.equal(loadAppState(), null);
    assert.equal(saveAppState(backup()), false);
    assert.equal(localStorage.getItem("bestie-app-v1"), original);
    delete globalThis.localStorage; delete globalThis.sessionStorage;
});
