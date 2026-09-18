/**
 * Pure Bestie Imbuements engine: recipe materials, guaranteed-success fees, gold-token
 * substitution and 20-hour active-duration cost projections for the bundled imbuement
 * catalog. No DOM, storage or network access; every dependency is either the bundled
 * dataset or caller-supplied plain data (manual unit prices, optional custom materials).
 *
 * Facts (item lists, quantities, tier bonuses, fees, token counts, the 20-hour active
 * duration) live in src/data/imbuements.json with their own reference-by-reference
 * provenance. No third-party source code is reused; see docs/imbuements-sources.md for
 * the full contract, including the remaining source uncertainties this module deliberately
 * does not resolve by guessing (SOURCE.uncertainties) and the ones later primary-source
 * verification has since resolved (SOURCE.resolvedUncertainties).
 */

import catalog from "../../data/imbuements.json" with { type: "json" };

export const TIER_ORDER = ["basic", "intricate", "powerful"];
export const GOLD_TOKEN_ITEM_ID = "gold-token";
export const ACTIVE_DURATION_HOURS = catalog.activeDurationHours;
export const TIER_FEES = catalog.tierFees;
export const TIER_TOKEN_COST = catalog.tierTokenCost;
export const IMBUEMENTS = catalog.imbuements;
export const SOURCE = catalog.source;

function requireTier(tierId) {
    if (!TIER_ORDER.includes(tierId)) throw new Error(`Tier must be one of ${TIER_ORDER.join(", ")}.`);
    return tierId;
}

export function listImbuements() {
    return IMBUEMENTS;
}

export function getImbuement(imbuementId) {
    const found = IMBUEMENTS.find((entry) => entry.id === imbuementId);
    if (!found) throw new Error(`Unknown imbuement "${imbuementId}".`);
    return found;
}

/** Entries carrying an explicit source-disagreement flag on any tier; see SOURCE.uncertainties. */
export function listFlaggedImbuements() {
    return IMBUEMENTS.filter((entry) => TIER_ORDER.some((tierId) => entry.tiers[tierId].uncertain));
}

function mergeMaterials(materials) {
    const merged = [];
    for (const material of materials) {
        const existing = merged.find((entry) => entry.itemId === material.itemId);
        if (existing) existing.quantity += material.quantity;
        else merged.push({ ...material });
    }
    return merged;
}

/** Materials this tier alone adds beyond the previous tier (what the NPC actually sells for this upgrade). */
export function getIncrementalMaterials(imbuementId, tierId) {
    const imbuement = getImbuement(imbuementId);
    requireTier(tierId);
    return imbuement.tiers[tierId].addedMaterials;
}

/** Full material list required from scratch to reach this tier (every lower tier's materials included). */
export function getCumulativeMaterials(imbuementId, tierId) {
    const imbuement = getImbuement(imbuementId);
    requireTier(tierId);
    const uptoIndex = TIER_ORDER.indexOf(tierId);
    const materials = TIER_ORDER.slice(0, uptoIndex + 1).flatMap((t) => imbuement.tiers[t].addedMaterials);
    return mergeMaterials(materials);
}

/**
 * A price is valid as any finite, nonnegative number — explicit zero is a legitimately known
 * price (e.g. a material the player already owns or farms for free), not an unknown one. Only
 * a missing key, null or undefined resolve to "unknown". Negative or non-finite input is a
 * caller error, not an unknown price.
 */
function resolvePrice(prices, itemId) {
    const entry = prices ? prices[itemId] : undefined;
    if (entry === undefined || entry === null) return null;
    if (typeof entry !== "number" || !Number.isFinite(entry)) throw new Error(`Price for "${itemId}" must be a finite number.`);
    if (entry < 0) throw new Error(`Price for "${itemId}" cannot be negative.`);
    return entry;
}

function priceMaterials(materials, prices) {
    const missingItems = [];
    const lines = materials.map((material) => {
        const unitPrice = resolvePrice(prices, material.itemId);
        if (unitPrice === null) missingItems.push(material.name);
        return { itemId: material.itemId, name: material.name, quantity: material.quantity, unitPrice,
            subtotal: unitPrice === null ? null : unitPrice * material.quantity };
    });
    const total = missingItems.length ? null : lines.reduce((sum, line) => sum + line.subtotal, 0);
    if (total !== null && !Number.isFinite(total)) throw new Error("Material cost exceeds the supported numeric range.");
    return { lines, total, missingItems };
}

function finalizeTotal(materialsTotal, fee) {
    if (materialsTotal === null) return null;
    const total = materialsTotal + fee;
    if (!Number.isFinite(total)) throw new Error("Recipe cost exceeds the supported numeric range.");
    return total;
}

export function costPerActiveHour(total, activeHours = ACTIVE_DURATION_HOURS) {
    if (!Number.isFinite(activeHours) || activeHours <= 0) throw new Error("Active hours must be a positive number.");
    return total === null ? null : total / activeHours;
}

/**
 * Every valid acquisition option for one imbuement tier: market-only, a fully-token option (if
 * the imbuement supports gold-token exchange) and every non-double-counting hybrid — a lower
 * tier bought via tokens plus only the market materials the remaining tiers add.
 */
export function getAcquisitionOptions(imbuementId, tierId, prices = {}) {
    const imbuement = getImbuement(imbuementId);
    requireTier(tierId);
    const fee = TIER_FEES[tierId];
    const targetIndex = TIER_ORDER.indexOf(tierId);
    const options = [];

    const marketPriced = priceMaterials(getCumulativeMaterials(imbuementId, tierId), prices);
    options.push({
        method: "market", tierId, hybridFromTier: null, tokenQuantity: 0, tokenUnitPrice: null,
        materials: marketPriced.lines, fee, missingItems: marketPriced.missingItems,
        total: finalizeTotal(marketPriced.total, fee),
    });

    if (imbuement.supportsGoldTokenExchange) {
        for (let coveredIndex = targetIndex; coveredIndex >= 0; coveredIndex--) {
            const coveredTierId = TIER_ORDER[coveredIndex];
            const tokenUnitPrice = resolvePrice(prices, GOLD_TOKEN_ITEM_ID);
            const tokenQuantity = TIER_TOKEN_COST[coveredTierId];
            const remainingMaterials = mergeMaterials(
                TIER_ORDER.slice(coveredIndex + 1, targetIndex + 1).flatMap((t) => imbuement.tiers[t].addedMaterials));
            const remainingPriced = priceMaterials(remainingMaterials, prices);
            const missingItems = [...(tokenUnitPrice === null ? ["Gold Token"] : []), ...remainingPriced.missingItems];
            const materialsTotal = tokenUnitPrice === null || remainingPriced.total === null
                ? null : tokenUnitPrice * tokenQuantity + remainingPriced.total;
            options.push({
                method: coveredIndex === targetIndex ? "tokens" : "hybrid",
                tierId, hybridFromTier: coveredIndex === targetIndex ? null : coveredTierId,
                tokenQuantity, tokenUnitPrice, materials: remainingPriced.lines, fee, missingItems,
                total: finalizeTotal(materialsTotal, fee),
            });
        }
    }
    return options;
}

export function selectCheapestOption(options) {
    const complete = options.filter((option) => option.total !== null);
    if (!complete.length) return null;
    return complete.reduce((best, option) => (option.total < best.total ? option : best));
}

/** Full breakdown for one tier: every acquisition option, the cheapest complete one, and which prices are missing. */
export function calculateTier(imbuementId, tierId, prices = {}, activeHours = ACTIVE_DURATION_HOURS) {
    const options = getAcquisitionOptions(imbuementId, tierId, prices).map((option) => ({
        ...option, costPerHour: costPerActiveHour(option.total, activeHours),
    }));
    const cheapest = selectCheapestOption(options);
    const missingPrices = [...new Set(options.flatMap((option) => option.missingItems))];
    return {
        imbuementId, tierId, incrementalMaterials: getIncrementalMaterials(imbuementId, tierId),
        cumulativeMaterials: getCumulativeMaterials(imbuementId, tierId), options, cheapest,
        canCalculate: cheapest !== null, missingPrices, activeHours,
        uncertain: getImbuement(imbuementId).tiers[tierId].uncertain ?? null,
    };
}

export function calculateImbuement(imbuementId, prices = {}, activeHours = ACTIVE_DURATION_HOURS) {
    return Object.fromEntries(TIER_ORDER.map((tierId) => [tierId, calculateTier(imbuementId, tierId, prices, activeHours)]));
}

function safePositiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a whole number greater than zero.`);
    return value;
}

/**
 * Prices an arbitrary material list against the same manual-price convention as the bundled
 * recipes, for materials or full custom recipes the dataset does not cover (for example a
 * community-reported cost for an imbuement type this catalog flags as unconfirmed).
 */
export function priceCustomRecipe({ materials, fee = 0, prices = {} }) {
    if (!Array.isArray(materials) || !materials.length) throw new Error("A custom recipe needs at least one material.");
    if (!Number.isFinite(fee) || fee < 0) throw new Error("Installation fee must be a nonnegative number.");
    const normalized = materials.map((material, index) => {
        if (!material || typeof material.name !== "string" || !material.name.trim()) throw new Error(`Material ${index + 1} needs a name.`);
        safePositiveInteger(material.quantity, `Material ${index + 1} quantity`);
        return { itemId: material.itemId ?? material.name, name: material.name, quantity: material.quantity };
    });
    const priced = priceMaterials(normalized, prices);
    return { materials: priced.lines, fee, missingItems: priced.missingItems, total: finalizeTotal(priced.total, fee) };
}

/**
 * Optional break-even projection against a manually estimated hourly benefit (extra loot, XP,
 * survivability, etc.). The benefit is always the caller's own estimate, never a value this
 * module asserts or verifies — `guaranteed` is always false when a benefit is supplied.
 */
export function evaluateBreakEven({ totalCost, activeHours = ACTIVE_DURATION_HOURS, observedBenefitPerHour = null }) {
    if (!Number.isFinite(totalCost) || totalCost < 0) throw new Error("Total cost must be a nonnegative number.");
    const costPerHour = costPerActiveHour(totalCost, activeHours);
    if (observedBenefitPerHour === null || observedBenefitPerHour === undefined) {
        return { costPerHour, benefitPerHour: null, netPerHour: null, breakEvenHours: null, guaranteed: false };
    }
    if (!Number.isFinite(observedBenefitPerHour)) throw new Error("Observed benefit per hour must be a finite number.");
    const netPerHour = observedBenefitPerHour - costPerHour;
    return {
        costPerHour, benefitPerHour: observedBenefitPerHour, netPerHour,
        breakEvenHours: observedBenefitPerHour > 0 ? totalCost / observedBenefitPerHour : null,
        guaranteed: false,
    };
}
