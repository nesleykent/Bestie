import test from "node:test";
import assert from "node:assert/strict";
import {
    IMBUEMENTS, TIER_ORDER, TIER_FEES, TIER_TOKEN_COST, ACTIVE_DURATION_HOURS, GOLD_TOKEN_ITEM_ID,
    listImbuements, getImbuement, listFlaggedImbuements, getIncrementalMaterials, getCumulativeMaterials,
    getAcquisitionOptions, selectCheapestOption, calculateTier, calculateImbuement, costPerActiveHour,
    priceCustomRecipe, evaluateBreakEven,
} from "../src/app/features/imbuements.js";

// ---------------------------------------------------------------- catalog shape

test("catalog constants match the official 2025-06-12 fixed-fee, 100%-success contract", () => {
    assert.equal(ACTIVE_DURATION_HOURS, 20);
    assert.deepEqual(TIER_ORDER, ["basic", "intricate", "powerful"]);
    assert.deepEqual(TIER_FEES, { basic: 7500, intricate: 60000, powerful: 250000 });
    assert.deepEqual(TIER_TOKEN_COST, { basic: 2, intricate: 4, powerful: 6 });
    assert.equal(GOLD_TOKEN_ITEM_ID, "gold-token");
});

test("24 comprehensive recipes (including Punch); only Vampirism, Void and Strike support gold-token exchange", () => {
    assert.equal(listImbuements().length, 24);
    const tokenSupported = IMBUEMENTS.filter((entry) => entry.supportsGoldTokenExchange).map((entry) => entry.id).sort();
    assert.deepEqual(tokenSupported, ["strike", "vampirism", "void"]);
    assert.equal(getImbuement("punch").supportsGoldTokenExchange, false);
});

test("every tier of every imbuement has exactly one added material with a positive integer quantity", () => {
    for (const entry of IMBUEMENTS) {
        for (const tierId of TIER_ORDER) {
            const added = entry.tiers[tierId].addedMaterials;
            assert.equal(added.length, 1, `${entry.id} ${tierId}`);
            assert.ok(Number.isSafeInteger(added[0].quantity) && added[0].quantity > 0, `${entry.id} ${tierId} quantity`);
        }
    }
});

test("listFlaggedImbuements is empty: the former Strike disagreement was resolved by TibiaWiki's 2025-07-21 correction", () => {
    assert.deepEqual(listFlaggedImbuements(), []);
    assert.equal(getImbuement("strike").tiers.powerful.bonus, "+40% damage (5% chance)");
});

test("Punch: cumulative recipe, Fist Fighting bonuses, no token exchange", () => {
    const punch = getImbuement("punch");
    assert.equal(punch.effect, "Fist Fighting");
    assert.equal(punch.supportsGoldTokenExchange, false);
    assert.deepEqual(getIncrementalMaterials("punch", "basic").map((m) => [m.itemId, m.quantity]), [["tarantula-egg", 25]]);
    assert.deepEqual(getIncrementalMaterials("punch", "intricate").map((m) => [m.itemId, m.quantity]), [["mantassin-tail", 20]]);
    assert.deepEqual(getIncrementalMaterials("punch", "powerful").map((m) => [m.itemId, m.quantity]), [["gold-brocaded-cloth", 15]]);
    const cumulativePowerful = getCumulativeMaterials("punch", "powerful");
    assert.deepEqual(new Map(cumulativePowerful.map((m) => [m.itemId, m.quantity])),
        new Map([["tarantula-egg", 25], ["mantassin-tail", 20], ["gold-brocaded-cloth", 15]]));
    assert.equal(getAcquisitionOptions("punch", "powerful", {}).length, 1); // market-only, no token/hybrid options
});

test("getImbuement rejects an unknown id", () => {
    assert.throws(() => getImbuement("not-a-real-imbuement"), /Unknown imbuement/);
});

// ---------------------------------------------------------------- incremental vs cumulative

test("cumulative materials independently sum every tier's incremental materials, per item id", () => {
    for (const entry of IMBUEMENTS) {
        for (const tierId of TIER_ORDER) {
            const uptoIndex = TIER_ORDER.indexOf(tierId);
            // Independent hand-reduction, not a call into the module's own merge logic.
            const expected = new Map();
            for (const t of TIER_ORDER.slice(0, uptoIndex + 1)) {
                for (const material of entry.tiers[t].addedMaterials) {
                    expected.set(material.itemId, (expected.get(material.itemId) ?? 0) + material.quantity);
                }
            }
            const cumulative = getCumulativeMaterials(entry.id, tierId);
            assert.equal(cumulative.length, expected.size, `${entry.id} ${tierId} distinct item count`);
            for (const material of cumulative) assert.equal(material.quantity, expected.get(material.itemId), `${entry.id} ${tierId} ${material.itemId}`);
        }
    }
});

test("Vampirism: incremental vs cumulative material counts at each tier", () => {
    assert.deepEqual(getIncrementalMaterials("vampirism", "basic").map((m) => [m.itemId, m.quantity]), [["vampire-teeth", 25]]);
    assert.deepEqual(getIncrementalMaterials("vampirism", "powerful").map((m) => [m.itemId, m.quantity]), [["piece-of-dead-brain", 5]]);
    const cumulativePowerful = getCumulativeMaterials("vampirism", "powerful");
    assert.equal(cumulativePowerful.length, 3);
    assert.deepEqual(new Map(cumulativePowerful.map((m) => [m.itemId, m.quantity])),
        new Map([["vampire-teeth", 25], ["bloody-pincers", 15], ["piece-of-dead-brain", 5]]));
});

test("getIncrementalMaterials and getCumulativeMaterials reject an invalid tier", () => {
    assert.throws(() => getIncrementalMaterials("vampirism", "legendary"), /Tier must be one of/);
    assert.throws(() => getCumulativeMaterials("vampirism", "legendary"), /Tier must be one of/);
});

// ---------------------------------------------------------------- pricing: missing, zero, negative

test("a missing price makes only the options that need it incomplete (total null)", () => {
    const options = getAcquisitionOptions("vampirism", "basic", { "vampire-teeth": 100 });
    const market = options.find((o) => o.method === "market");
    assert.equal(market.total, 25 * 100 + TIER_FEES.basic);
    const tokens = options.find((o) => o.method === "tokens");
    assert.equal(tokens.total, null);
    assert.deepEqual(tokens.missingItems, ["Gold Token"]);
});

test("a zero manual price is treated as an explicitly known price of zero, not as unknown", () => {
    const withZero = getAcquisitionOptions("vampirism", "basic", { "vampire-teeth": 0 });
    const market = withZero.find((o) => o.method === "market");
    assert.deepEqual(market.missingItems, []);
    assert.equal(market.total, TIER_FEES.basic); // 25 * 0 + fee: the material itself is free
    assert.equal(market.materials[0].unitPrice, 0);
    assert.equal(market.materials[0].subtotal, 0);
});

test("a genuinely missing price (absent, null or undefined) is unknown and leaves the total null", () => {
    for (const prices of [{}, { "vampire-teeth": null }, { "vampire-teeth": undefined }]) {
        const market = getAcquisitionOptions("vampirism", "basic", prices).find((o) => o.method === "market");
        assert.equal(market.total, null);
        assert.deepEqual(market.missingItems, ["Vampire Teeth"]);
    }
});

test("a negative or non-finite manual price is rejected, not treated as unknown", () => {
    assert.throws(() => getAcquisitionOptions("vampirism", "basic", { "vampire-teeth": -5 }), /cannot be negative/);
    assert.throws(() => getAcquisitionOptions("vampirism", "basic", { "vampire-teeth": NaN }), /must be a finite number/);
    assert.throws(() => getAcquisitionOptions("vampirism", "basic", { "vampire-teeth": Infinity }), /must be a finite number/);
});

// ---------------------------------------------------------------- token hybrids, optimized

test("Powerful Vampirism: market, tokens and both hybrids are all present, priced independently, market cheapest", () => {
    const prices = { "vampire-teeth": 100, "bloody-pincers": 200, "piece-of-dead-brain": 300, [GOLD_TOKEN_ITEM_ID]: 5000 };
    const options = getAcquisitionOptions("vampirism", "powerful", prices);
    assert.equal(options.length, 4);
    const byMethod = Object.fromEntries(options.map((o) => [o.hybridFromTier ? `hybrid-${o.hybridFromTier}` : o.method, o]));

    assert.equal(byMethod.market.total, 25 * 100 + 15 * 200 + 5 * 300 + TIER_FEES.powerful); // 257000
    assert.equal(byMethod.tokens.total, 6 * 5000 + TIER_FEES.powerful); // 280000
    assert.equal(byMethod["hybrid-basic"].total, 2 * 5000 + 15 * 200 + 5 * 300 + TIER_FEES.powerful); // 264500
    assert.equal(byMethod["hybrid-intricate"].total, 4 * 5000 + 5 * 300 + TIER_FEES.powerful); // 271500

    assert.deepEqual(selectCheapestOption(options), byMethod.market);
});

test("Powerful Vampirism: an expensive basic-tier item flips the cheapest option to the basic-tier hybrid", () => {
    const prices = { "vampire-teeth": 2000, "bloody-pincers": 200, "piece-of-dead-brain": 300, [GOLD_TOKEN_ITEM_ID]: 5000 };
    const result = calculateTier("vampirism", "powerful", prices);
    assert.equal(result.cheapest.method, "hybrid");
    assert.equal(result.cheapest.hybridFromTier, "basic");
    assert.equal(result.cheapest.total, 264500);
    assert.equal(result.cheapest.costPerHour, 264500 / 20);
    assert.equal(result.canCalculate, true);
    assert.deepEqual(result.missingPrices, []);
});

test("a hybrid option never double-counts the covered tier's own materials", () => {
    const options = getAcquisitionOptions("vampirism", "powerful", {});
    const hybridFromBasic = options.find((o) => o.hybridFromTier === "basic");
    // Basic's own material (vampire-teeth) must not appear in the hybrid's market top-up list.
    assert.ok(!hybridFromBasic.materials.some((m) => m.itemId === "vampire-teeth"));
    assert.deepEqual(hybridFromBasic.materials.map((m) => m.itemId).sort(), ["bloody-pincers", "piece-of-dead-brain"]);
});

test("token/hybrid options are absent for imbuements without gold-token support", () => {
    const options = getAcquisitionOptions("swiftness", "powerful", { [GOLD_TOKEN_ITEM_ID]: 5000 });
    assert.equal(options.length, 1);
    assert.equal(options[0].method, "market");
});

test("selectCheapestOption returns null when every option is incomplete", () => {
    assert.equal(selectCheapestOption(getAcquisitionOptions("swiftness", "basic", {})), null);
});

// ---------------------------------------------------------------- calculateImbuement / cost per hour

test("calculateImbuement returns all three tiers with no uncertainty flagged on any (Strike's is resolved)", () => {
    const all = calculateImbuement("strike", { "protective-charm": 10, "sabretooth": 10, "vexclaw-talon": 10 });
    assert.deepEqual(Object.keys(all), TIER_ORDER);
    assert.equal(all.basic.uncertain, null);
    assert.equal(all.intricate.uncertain, null);
    assert.equal(all.powerful.uncertain, null);
});

test("costPerActiveHour divides by the active duration and passes through a null total", () => {
    assert.equal(costPerActiveHour(20000), 1000);
    assert.equal(costPerActiveHour(20000, 10), 2000);
    assert.equal(costPerActiveHour(null), null);
    assert.throws(() => costPerActiveHour(1000, 0), /positive number/);
    assert.throws(() => costPerActiveHour(1000, -5), /positive number/);
});

// ---------------------------------------------------------------- custom recipe helper

test("priceCustomRecipe prices arbitrary materials with the same missing/negative-price rules", () => {
    const priced = priceCustomRecipe({ materials: [{ name: "Test Reagent", quantity: 3 }], fee: 1000, prices: { "Test Reagent": 50 } });
    assert.equal(priced.total, 3 * 50 + 1000);
    assert.equal(priceCustomRecipe({ materials: [{ name: "Unpriced", quantity: 1 }], prices: {} }).total, null);
    assert.throws(() => priceCustomRecipe({ materials: [] }), /at least one material/);
    assert.throws(() => priceCustomRecipe({ materials: [{ name: "X", quantity: 0 }] }), /whole number greater than zero/);
    assert.throws(() => priceCustomRecipe({ materials: [{ name: "X", quantity: 1.5 }] }), /whole number greater than zero/);
    assert.throws(() => priceCustomRecipe({ materials: [{ quantity: 1 }] }), /needs a name/);
    assert.throws(() => priceCustomRecipe({ materials: [{ name: "X", quantity: 1 }], fee: -1 }), /nonnegative number/);
});

// ---------------------------------------------------------------- break-even (optional, never guaranteed)

test("evaluateBreakEven without a benefit reports only cost/hour", () => {
    const result = evaluateBreakEven({ totalCost: 20000 });
    assert.equal(result.costPerHour, 1000);
    assert.equal(result.benefitPerHour, null);
    assert.equal(result.netPerHour, null);
    assert.equal(result.breakEvenHours, null);
    assert.equal(result.guaranteed, false);
});

test("evaluateBreakEven with a manual benefit computes net and break-even hours, and stays unguaranteed", () => {
    const profitable = evaluateBreakEven({ totalCost: 20000, observedBenefitPerHour: 2000 });
    assert.equal(profitable.netPerHour, 1000);
    assert.equal(profitable.breakEvenHours, 10);
    assert.equal(profitable.guaranteed, false);

    const unprofitable = evaluateBreakEven({ totalCost: 20000, observedBenefitPerHour: 500 });
    assert.equal(unprofitable.netPerHour, -500);
    assert.equal(unprofitable.breakEvenHours, 40); // exceeds the 20h active duration: never pays for itself in one cycle

    const zeroBenefit = evaluateBreakEven({ totalCost: 20000, observedBenefitPerHour: 0 });
    assert.equal(zeroBenefit.netPerHour, -1000);
    assert.equal(zeroBenefit.breakEvenHours, null);
});

test("evaluateBreakEven rejects invalid cost or benefit input", () => {
    assert.throws(() => evaluateBreakEven({ totalCost: -1 }), /nonnegative number/);
    assert.throws(() => evaluateBreakEven({ totalCost: 100, observedBenefitPerHour: NaN }), /finite number/);
});
