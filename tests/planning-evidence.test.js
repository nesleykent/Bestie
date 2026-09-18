import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeProgressEvidence,
    recalculateProgress,
    isBestiaryEntryComplete
} from '../src/app/features/session-analysis.js';
import { buildOpportunityAnalysis } from '../src/app/features/opportunity-analysis.js';
import { buildAllTabsAnalysis, aggregateAllTabsSummary } from '../src/app/features/hunt-comparison.js';
import { planCharmTime } from '../src/app/features/charm-plan.js';

const creature = (name, killsToUnlock, charms) => ({ Name: name, "Kills to Unlock": killsToUnlock, Charms: charms });
const monster = (name, charms, killsToUnlock, totalKills, timeRemainingMinutes) => ({ name, charms, killsToUnlock, totalKills, timeRemainingMinutes });

test('normalizeProgressEvidence treats a bare number as known-exact and rejects malformed evidence fields', () => {
    assert.deepEqual(normalizeProgressEvidence(5), { kills: 5, known: true, isFloor: false, killsCeiling: null });
    assert.deepEqual(normalizeProgressEvidence(undefined), { kills: 0, known: true, isFloor: false, killsCeiling: null });
    assert.deepEqual(
        normalizeProgressEvidence({ kills: 'oops', known: false, isFloor: true, killsCeiling: 'nope' }),
        { kills: 0, known: false, isFloor: false, killsCeiling: null },
        'a floor cannot exist without known progress, and junk fields fall back to safe defaults'
    );
});

test('unknown Bestiary progress is bounded, not silently exact zero, and stays distinct from a reviewed zero', () => {
    const rat = creature('Rat', 500, 10);
    const monsters = [{ name: 'Rat', killsThisSession: 50 }];
    const sessionDuration = 60; // 1 kill/min measured this session

    const unknown = recalculateProgress(monsters, [rat], sessionDuration, { Rat: { kills: 0, known: false } })[0];
    const reviewedZero = recalculateProgress(monsters, [rat], sessionDuration, { Rat: { kills: 0, known: true } })[0];
    const legacy = recalculateProgress(monsters, [rat], sessionDuration, { Rat: 0 })[0];

    // Unrecorded: the pessimistic field is unchanged (still "assume nothing done"),
    // but it is explicitly tagged unknown, and the lower bound admits it could
    // already be complete.
    assert.equal(unknown.progressKnown, false);
    assert.equal(unknown.remainingKills, 500);
    assert.equal(unknown.remainingKillsAtLeast, 0);
    assert.equal(unknown.timeRemainingMinutesAtLeast, 0);

    // A reviewed zero is a confirmed fact: nothing is hidden, so the lower bound
    // agrees with the upper bound.
    assert.equal(reviewedZero.progressKnown, true);
    assert.equal(reviewedZero.remainingKillsAtLeast, 500);
    assert.equal(reviewedZero.timeRemainingMinutesAtLeast, reviewedZero.timeRemainingMinutes);

    // A bare number — every existing caller — is still read as known-exact, byte
    // for byte the same numbers as before this change.
    assert.deepEqual([legacy.remainingKills, legacy.remainingKillsAtLeast, legacy.progressKnown], [500, 500, true]);
    assert.equal(legacy.timeRemainingMinutes, reviewedZero.timeRemainingMinutes);
});

test('a stage-only tile reports a bounded remaining range instead of one exact number', () => {
    const toad = creature('Toad', 500, 20);
    const monsters = [{ name: 'Toad', killsThisSession: 25 }];
    const sessionDuration = 50; // 0.5 kill/min

    const floored = recalculateProgress(monsters, [toad], sessionDuration, {
        Toad: { kills: 250, known: true, isFloor: true, killsCeiling: 499 }
    })[0];

    assert.equal(floored.isProgressFloor, true);
    assert.equal(floored.remainingKills, 250, 'pessimistic: as if sitting exactly at the floor');
    assert.equal(floored.remainingKillsAtLeast, 1, 'optimistic: could be one kill short of the next tile');
    assert.equal(floored.timeRemainingMinutesAtLeast, 1 / 0.5);
    assert.equal(floored.timeRemainingMinutes, 250 / 0.5);
    assert.ok(floored.timeRemainingMinutesAtLeast <= floored.timeRemainingMinutes);
});

test('completion detection is unaffected by evidence shape and survives progress being undone to a lower tile', () => {
    const toad = creature('Toad', 500, 20);
    const monsters = [{ name: 'Toad', killsThisSession: 0 }];

    const complete = recalculateProgress(monsters, [toad], 60, { Toad: { kills: 500, known: true, isFloor: false, killsCeiling: null } })[0];
    assert.equal(isBestiaryEntryComplete(complete), true);

    // Undo: back to an earlier floor tile that no longer reaches the target.
    const undone = recalculateProgress(monsters, [toad], 60, { Toad: { kills: 250, known: true, isFloor: true, killsCeiling: 499 } })[0];
    assert.equal(isBestiaryEntryComplete(undone), false);
    assert.equal(undone.remainingKills, 250);
});

test('all-session totals pay a shared creature once and keep a coherent combined time, not a naive sum', () => {
    const huntA = { id: 'a', label: 'Hunt A', monsters: [monster('Shared', 25, 100, 0, 40), monster('OnlyA', 5, 50, 0, 10)] };
    const huntB = { id: 'b', label: 'Hunt B', monsters: [monster('Shared', 25, 100, 0, 15), monster('OnlyB', 20, 50, 0, 30)] };

    const analysis = buildAllTabsAnalysis([huntA, huntB], []);
    const summary = aggregateAllTabsSummary(analysis.participatingHunts);

    assert.equal(summary.totalCharms, 50, 'Shared is only rewarded once, from the hunt it first appears in');
    assert.equal(summary.totalTimeMinutes, 70, 'Hunt A keeps Shared\'s time; Hunt B only owes its own remaining creature');
});

test('an already-complete creature never pays out twice across hunts either', () => {
    const huntA = { id: 'a', label: 'Hunt A', monsters: [monster('Done', 25, 100, 100, 0)] };
    const huntB = { id: 'b', label: 'Hunt B', monsters: [monster('Done', 25, 100, 100, 0)] };

    const analysis = buildAllTabsAnalysis([huntA, huntB], []);
    const summary = aggregateAllTabsSummary(analysis.participatingHunts);

    assert.equal(summary.totalCharms, 0);
    assert.equal(summary.totalTimeMinutes, 0);
});

test('a zero measured kill rate makes the combined time infinite and the charm rate zero, without breaking the charm total', () => {
    const huntA = { id: 'a', label: 'Hunt A', monsters: [monster('Stuck', 15, 50, 0, Number.POSITIVE_INFINITY)] };
    const huntB = { id: 'b', label: 'Hunt B', monsters: [monster('Fine', 10, 50, 0, 20)] };

    const analysis = buildAllTabsAnalysis([huntA, huntB], []);
    const summary = aggregateAllTabsSummary(analysis.participatingHunts);

    assert.equal(summary.totalCharms, 25);
    assert.equal(summary.totalTimeMinutes, Number.POSITIVE_INFINITY);
    assert.equal(summary.charmRate, 0);
});

test('opportunities separate unknown progress from a confirmed never-hunted zero, and never rank unknown as finishable', () => {
    const creatures = [
        creature('Ghost', 100, 15), // never recorded, though a session happens to measure its rate
        creature('Wisp', 100, 8)    // confirmed zero, never hunted
    ];
    const killsByName = {
        Ghost: { kills: 0, known: false },
        Wisp: { kills: 0, known: true }
    };
    const sessions = [{ id: 's1', label: 'Session 1', monsters: [{ name: 'Ghost', killRate: 2 }] }];

    const analysis = buildOpportunityAnalysis(creatures, killsByName, sessions);

    assert.equal(analysis.totals.unknownProgress, 1);
    assert.equal(analysis.totals.charmsUnknownProgress, 15);
    assert.equal(analysis.totals.neverHunted, 1);
    assert.equal(analysis.totals.charmsNeverHunted, 8);
    assert.equal(analysis.totals.charmsUnclaimed, 15 + 8);
    assert.equal(analysis.finishable.some((entry) => entry.name === 'Ghost'), false, 'a measured rate cannot make unknown progress finishable');
    assert.deepEqual(analysis.unknownProgress.map((entry) => entry.name), ['Ghost']);
    assert.equal(analysis.quickWins.some((entry) => entry.name === 'Ghost'), false, '"started" requires a confirmed count');
});

test('finishable time only trusts a rate measured under the requested respawn mode, when one is requested', () => {
    const creatures = [creature('Bear', 100, 12)];
    const killsByName = { Bear: 0 };
    const sessions = [
        { id: 'r1', label: 'Regular', respawnMode: 'regular', monsters: [{ name: 'Bear', killRate: 1 }] },
        { id: 'p1', label: 'Rapid', respawnMode: 'rapid', monsters: [{ name: 'Bear', killRate: 5 }] }
    ];

    const pooled = buildOpportunityAnalysis(creatures, killsByName, sessions);
    assert.equal(pooled.finishable[0].killRate, 5, 'default/legacy behavior still pools every mode\'s best-ever rate');

    const regularOnly = buildOpportunityAnalysis(creatures, killsByName, sessions, { respawnMode: 'regular' });
    assert.equal(regularOnly.finishable[0].killRate, 1);

    const noRapidSession = buildOpportunityAnalysis(creatures, killsByName, [sessions[0]], { respawnMode: 'rapid' });
    assert.equal(noRapidSession.finishable.length, 0, 'a mode with no measured rate is excluded, not substituted from another mode');
});

test('the charm plan tags unknown and floor-based estimates without changing the optimizer\'s totals', () => {
    const known = { name: 'Known', timeRemainingMinutes: 10, charms: 10, totalKills: 90, killsToUnlock: 100 };
    const unknown = { name: 'Unknown', timeRemainingMinutes: 20, charms: 20, totalKills: 0, killsToUnlock: 100, progressKnown: false };
    const floored = { name: 'Floored', timeRemainingMinutes: 15, charms: 15, totalKills: 50, killsToUnlock: 100, isProgressFloor: true };
    const group = { id: 'g', label: 'g', monsters: [known, unknown, floored] };

    const plan = planCharmTime([group], 45);

    assert.equal(plan.charms, 45, 'each creature is still counted exactly once');
    assert.equal(plan.hasBoundedEstimates, true);
    assert.equal(plan.entries.find((entry) => entry.name === 'Unknown').progressKnown, false);
    assert.equal(plan.entries.find((entry) => entry.name === 'Floored').isProgressFloor, true);
    assert.equal(plan.entries.find((entry) => entry.name === 'Known').progressKnown, true);

    const legacyOnly = planCharmTime([{ id: 'g', label: 'g', monsters: [known] }], 10);
    assert.equal(legacyOnly.hasBoundedEstimates, false, 'a plan built entirely from legacy monsters carries no uncertainty tag');
});

test('exact session totals override old stage tiles, preserve known zero and reject malformed counts', async()=>{
 const {parseBestiaryTotalInput}=await import('../src/app/state/bestiary-total-input.js');
 assert.deepEqual(parseBestiaryTotalInput('0'),{kills:0,stage:1,reviewed:true});
 assert.deepEqual(parseBestiaryTotalInput('12'),{kills:12,stage:0,reviewed:true});
 assert.deepEqual(parseBestiaryTotalInput(''),{kills:0,stage:0,reviewed:false});
 for(const raw of ['-1','1.5','12junk','9007199254740992'])assert.throws(()=>parseBestiaryTotalInput(raw));
});
