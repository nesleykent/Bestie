# Charmwise

Open Tools → Charmwise. The comparison reads the active character's Charms and Bestiary records. Major upgrades spend charm points; Minor upgrades spend echoes. Major stages generate 50, 100 and 200 echoes cumulatively, with a separate optional 100-echo promotion grant. Each next-stage cost comes from the same catalog as the tracker.

Unknown stages are never treated as confirmed locked charms. A manually entered available balance confirms that currency only, not the charm stage. Recorded balances are marked incomplete until the relevant progress has been recorded. Negative recorded balances expose overspending. Manual zero is supported.

Choose a Bestiary creature to compare its recorded elemental damage-received percentages. The ordering combines the selected priority, affordability, affinity and next-stage cost; it is not a DPS calculation or proof that a charm is optimal. Critical, resource-dependent, on-kill and defensive effects explain the missing context. Assignment requires a completed Bestiary entry. No points are spent and no tracker records change.

Inputs are local to each character, survive reload, and travel in full backups. Tests cover actual stage costs, currencies, unknown and reviewed-zero states, promotion, affinity/immunity, input rejection and nonmutation. Isolated Chrome checks cover desktop/mobile, rendering, draft persistence and malformed balances.
