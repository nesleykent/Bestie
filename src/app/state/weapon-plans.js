export function createWeaponPlan(id = "weapon-1") {
    return { id, name: "", currentXP: "0", targetXP: "" };
}

export function restoreWeaponPlans(plans) {
    if (!Array.isArray(plans) || !plans.length) return [createWeaponPlan()];
    const ids = new Set();
    const restored = plans.filter((plan) => plan && typeof plan === "object").map((plan, index) => {
        let id = typeof plan.id === "string" ? plan.id : `weapon-${index + 1}`;
        while (ids.has(id)) id += "-copy";
        ids.add(id);
        return {
            id, name: typeof plan.name === "string" ? plan.name : "",
            currentXP: typeof plan.currentXP === "string" ? plan.currentXP : "0",
            targetXP: typeof plan.targetXP === "string" ? plan.targetXP : ""
        };
    });
    return restored.length ? restored : [createWeaponPlan()];
}
