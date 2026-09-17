import test from "node:test";
import assert from "node:assert/strict";
import { parseAppWorkspaceFile, serializeAppState } from "../src/app/state/app-workspace-transfer.js";
import { createWorkspace } from "../src/app/state/hunt-workspace.js";
import { restoreAppWorkspace } from "../src/app/state/character-workspace.js";
import { loadAppState, loadWorkspaceState, saveAppState, clearAllStoredState, getStorageProblem } from "../src/app/state/local-store.js";

const backup = () => ({ app: "bestie", version: 2, characters: [{ id: "c1", name: "Player", workspace: createWorkspace() }], activeCharacterId: "c1" });

test("malformed and future backups are rejected before replacing a roster", () => {
    for (const payload of [null, [], { characters: [] }, { characters: [null] }, { characters: [{}] }, { characters: [{ workspace: { hunts: [null] } }] }, { ...backup(), version: 99 }]) {
        assert.throws(() => parseAppWorkspaceFile(JSON.stringify(payload)));
    }
    for (const row of [null, {}, { name: "Rat", killsThisSession: -1 }, { name: "Rat", killsThisSession: 1.2 }, { name: "Rat", killsThisSession: "12junk" }]) {
        const app = backup(); app.characters[0].workspace.hunts[0].taskMonsters = [row];
        assert.throws(() => parseAppWorkspaceFile(JSON.stringify(app)));
    }
    const duplicate = backup(); duplicate.characters.push(duplicate.characters[0]);
    assert.throws(() => parseAppWorkspaceFile(JSON.stringify(duplicate)), /unique/);
});

test("current and legacy backup formats preserve reviewed zero, stages, draft and processed evidence", () => {
    const app = backup(), workspace = app.characters[0].workspace;
    workspace.trackerProgress = { bestiary: { Rat: { kills: 0, stage: 1, reviewed: true } } };
    workspace.hunts[0].sessionLog = "unfinished draft";
    workspace.hunts[0].taskMonsters = [{ name: "rat", killsThisSession: 25 }];
    workspace.hunts[0].sessionDuration = 30;
    const restored = restoreAppWorkspace(parseAppWorkspaceFile(serializeAppState(app, "2026-09-17")));
    assert.equal(restored.characters[0].workspace.trackerProgress.bestiary.Rat.reviewed, true);
    assert.equal(restored.characters[0].workspace.hunts[0].taskMonsters[0].killsThisSession, 25);
    for (const old of [workspace, { app: "bestiary-session-analyzer", version: 1, workspace }]) {
        assert.equal(parseAppWorkspaceFile(JSON.stringify(old)).characters[0].workspace.hunts[0].sessionLog, "unfinished draft");
    }
});

function storage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), values };
}

test("unavailable storage getters never crash boot or claim successful saving", () => {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("disabled"); } });
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get() { throw new Error("disabled"); } });
    assert.equal(loadAppState(), null);
    assert.equal(loadWorkspaceState(), null);
    assert.equal(saveAppState(backup()), false);
    assert.match(getStorageProblem(), /backup/);
    assert.equal(clearAllStoredState(), false);
    delete globalThis.localStorage; delete globalThis.sessionStorage;
});

test("corrupt saved data is not overwritten and explicit clearing removes legacy keys only", () => {
    globalThis.localStorage = storage({ "bestie-app-v1": "{broken", "bestie-sidebar-collapsed": "1", unrelated: "keep" });
    globalThis.sessionStorage = storage({ "bestiary-session-analyzer-v5": "{}" });
    assert.equal(loadAppState(), null);
    assert.equal(saveAppState(backup()), false);
    assert.equal(localStorage.getItem("bestie-app-v1"), "{broken");
    assert.equal(clearAllStoredState(), true);
    assert.deepEqual([...localStorage.values], [["unrelated", "keep"]]);
    assert.equal(sessionStorage.values.size, 0);
    assert.equal(saveAppState(backup()), true);
    delete globalThis.localStorage; delete globalThis.sessionStorage;
});

test("quota failure is reported and failed clear still attempts other Bestie keys", () => {
    globalThis.localStorage = storage({ "bestie-app-v1": "{}", "bestie-workspace-v1": "{}" });
    globalThis.sessionStorage = storage();
    localStorage.setItem = () => { throw new Error("quota"); };
    assert.equal(saveAppState(backup()), false);
    const remove = localStorage.removeItem;
    localStorage.removeItem = (key) => { if (key === "bestie-app-v1") throw new Error("blocked"); remove(key); };
    assert.equal(clearAllStoredState(), false);
    assert.equal(localStorage.getItem("bestie-workspace-v1"), null);
    assert.match(getStorageProblem(), /could not be cleared/);
    delete globalThis.localStorage; delete globalThis.sessionStorage;
});

test("damaged stored kill rows cannot crash restoration or create confident proficiency evidence", async () => {
    const { restoreWorkspace } = await import("../src/app/state/hunt-workspace.js");
    const { recalculateProgress } = await import("../src/app/features/session-analysis.js");
    const restored = restoreWorkspace({ hunts: [{ matchedMonsters: [null, { name: "Removed creature", killsThisSession: 2 }], taskMonsters: [null], sessionDuration: -10 }] });
    assert.equal(restored.hunts[0].sessionDuration, 0);
    assert.equal(restored.hunts[0].matchedMonsters.length, 1);
    assert.match(restored.hunts[0].parseIssues[0], /Invalid stored/);
    assert.deepEqual(recalculateProgress(restored.hunts[0].matchedMonsters, [], 30, {}), []);
});
