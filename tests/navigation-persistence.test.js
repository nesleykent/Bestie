import test from "node:test";
import assert from "node:assert/strict";
import { buildPageRoute, readPageRoute } from "../src/app/state/page-route.js";
import { createWorkspace, restoreWorkspace } from "../src/app/state/hunt-workspace.js";
import { restoreWeaponPlans } from "../src/app/state/weapon-plans.js";
import { restoreAppWorkspace } from "../src/app/state/character-workspace.js";
import { parseAppWorkspaceFile, serializeAppState } from "../src/app/state/app-workspace-transfer.js";
import { buildProficiencyComparison, renderProficiency } from "../src/app/ui/render-proficiency.js";
import { calculateSessionProficiency } from "../src/app/features/weapon-proficiency.js";
import { parseHuntSession } from "../src/app/features/session-parser.js";
import { summarizeBestiaryMonsters } from "../src/app/features/session-analysis.js";
import { analyzeTaskSession, calculateTaskEstimate } from "../src/app/features/task-analysis.js";
import { buildHuntComparison } from "../src/app/features/hunt-comparison.js";
import { parsePlayTimeMinutes } from "../src/app/features/charm-plan.js";

test("dedicated direct route and all existing mode/view routes round-trip", () => {
    assert.equal(readPageRoute("#weapon-proficiency").mode, "proficiency");
    for (const [mode, view] of [["proficiency", "session"], ["bestiary", "library"], ["bestiary", "comparison"], ["bestiary", "charmPlan"], ["tasks", "session"], ["trackers", "bestiary"], ["trackers", "changes"]]) {
        const route = readPageRoute(buildPageRoute(mode, view, "hunt-2 /?#"));
        assert.equal(route.mode, mode);
        assert.equal(route.view, view);
        assert.equal(route.sessionId, view === "session" ? "hunt-2 /?#" : null);
    }
    assert.equal(readPageRoute("#not-a-page").mode, "dashboard");
    assert.equal(readPageRoute("").mode, "dashboard");
});
test("workspace restore, export/import, legacy defaults and character isolation", () => {
    const a = createWorkspace();
    a.weaponPlans[0] = { id: "weapon-1", name: "Weapon A", currentXP: "1840000", targetXP: "3000000" };
    a.mode = "proficiency";
    a.hunts[0].parseIssues = ["Invalid count"];
    const b = createWorkspace();
    assert.equal(b.weaponPlans[0].name, "");
    const saved = { characters: [{ id: "character-1", name: "A", workspace: a }, { id: "character-2", name: "B", workspace: b }], activeCharacterId: "character-1" };
    const restored = restoreAppWorkspace(parseAppWorkspaceFile(serializeAppState(saved, "2026-09-06")));
    assert.deepEqual(restored.characters[0].workspace.weaponPlans, a.weaponPlans);
    assert.equal(restored.characters[0].workspace.mode, "proficiency");
    assert.deepEqual(restored.characters[0].workspace.hunts[0].parseIssues, ["Invalid count"]);
    const old = restoreWorkspace({ hunts: [{ id: "hunt-8", matchedMonsters: [], sessionLog: "", sessionDuration: 0 }] });
    assert.equal(old.weaponPlans.length, 1);
    assert.equal(old.hunts[0].parseIssues, null);
    assert.equal(restoreWeaponPlans([null]).length, 1);
});
test("proficiency page has complete breakdown, scoped sortable headers and escaped unknown names", () => {
    const result = calculateSessionProficiency([{ name: '<img src=x onerror="bad()">', killsThisSession: 1 }], [], 90);
    const container = {};
    renderProficiency(container, result, { processed: true, sort: { key: "total", direction: "desc" }, plans: createWorkspace().weaponPlans, activeId: "weapon-1", projectionCreature: "" });
    assert.match(container.innerHTML, /Unclassified/);
    assert.match(container.innerHTML, /Known subtotal/);
    assert.match(container.innerHTML, /aria-sort="descending"/);
    assert.match(container.innerHTML, /&lt;img/);
    assert.doesNotMatch(container.innerHTML, /<img|NaN|Infinity|undefined/);
});
test("bosses render in the breakdown with their Bosstiary category and reward", () => {
    const sources = { bestiary: [{ Name: "Rotten Golem", Difficulty: "Challenging" }], bosstiary: [{ Name: "Ferumbras", category: "Nemesis" }, { Name: "Annihilon", category: "Bane" }] };
    const result = calculateSessionProficiency([{ name: "Rotten Golem", killsThisSession: 10 }, { name: "Ferumbras", killsThisSession: 1 }, { name: "Annihilon", killsThisSession: 2 }], sources, 60);
    const container = {};
    renderProficiency(container, result, { processed: true, sort: { key: "classification", direction: "asc" }, plans: createWorkspace().weaponPlans, activeId: "weapon-1", projectionCreature: "" });
    assert.match(container.innerHTML, /Ferumbras<\/th><td>Nemesis<span class="row-aside">Bosstiary<\/span>/);
    assert.match(container.innerHTML, /Annihilon<\/th><td>Bane<span class="row-aside">Bosstiary<\/span>/);
    assert.match(container.innerHTML, /Rotten Golem<\/th><td>Challenging<\/td>/);
    // Ascending by classification puts the Challenging creature ahead of Bane, then Nemesis.
    assert.match(container.innerHTML, /Rotten Golem[\s\S]*Annihilon[\s\S]*Ferumbras/);
    assert.match(container.innerHTML, /Session total<\/th><td><\/td><td class="is-num">13<\/td><td><\/td><td class="is-num">18,400<\/td>/);
    assert.match(container.innerHTML, /Nemesis: 15,000 XP\/kill/);
    assert.doesNotMatch(container.innerHTML, /Unclassified|NaN|undefined/);
});
test("comparison never rewards partial sessions and escapes session names", () => {
    const markup = buildProficiencyComparison([
        { id: "a", label: "<script>bad</script>", proficiency: { perHour: 999, total: 999, duration: 60, kills: 10, isPartial: true } },
        { id: "b", label: "Complete", proficiency: { perHour: 165, total: 165, duration: 60, kills: 1, isPartial: false } }
    ]);
    assert.doesNotMatch(markup, /<script>/);
    assert.match(markup, /Complete<\/button>.*Best proficiency/);
});
test("existing Bestiary, Tasks, charm time parsing and comparison contracts", () => {
    const log = "Session: 01:30h\nKilled Monsters:\n250x Rotworm\n500x Cyclops\nLooted Items:";
    const parsed = parseHuntSession(log);
    const task = analyzeTaskSession(log, parsed);
    assert.equal(task.sessionDuration, 90);
    const estimate = calculateTaskEstimate(task.monsters, "cyclops", 90, 1000);
    assert.equal(estimate.remainingKills, 500);
    assert.equal(estimate.remainingTimeMinutes, 90);
    assert.equal(parsePlayTimeMinutes("1.5 h"), 90);
    const summary = summarizeBestiaryMonsters([{ totalKills: 0, killsToUnlock: 1000, charms: 15, timeRemainingMinutes: 30 }]);
    assert.equal(summary.totalCharmsPerHour, 30);
    assert.equal(buildHuntComparison([{ id: "a", label: "A", summary }, { id: "b", label: "B", summary: null }]).bestRow.id, "a");
});

test("shared session tab names and IDs remain text, including in the proficiency page", async () => {
    const { renderHuntTabs } = await import("../src/app/ui/render-hunt-tabs.js");
    const container = {};
    renderHuntTabs(container, [], [{ id: 'x" onclick="bad()', label: '<img src=x onerror="bad()">', meta: "138,000 Proficiency XP/h", isActive: true }, { id: "b", label: "Other", meta: "" }]);
    assert.doesNotMatch(container.innerHTML, /<img|data-hunt-select="x" onclick/);
    assert.match(container.innerHTML, /&lt;img/);
});

test("session changes replace the URL without becoming page-history entries", () => {
    const first = buildPageRoute("proficiency", "session", "hunt-1");
    const second = buildPageRoute("proficiency", "session", "hunt-2");
    assert.equal(buildPageRoute("proficiency", "session", null), "#weapon-proficiency");
    assert.equal(readPageRoute(first).mode, readPageRoute(second).mode);
    assert.equal(readPageRoute(first).view, readPageRoute(second).view);
});
