# Tracker Data Entry UX

> Superseded on 2026-08-11 by the [source-screen pass re-audit](audits/tracker-entry-rethink-2026-08-11/README.md),
> which is extended by the [per-tracker journey maps, derivation ledger and concrete
> flows](audits/tracker-entry-flows-2026-08-11/README.md).

The previous proposal treated a row or field as the unit of work. That still required the player to process the app's catalog instead of transcribing a bounded surface from Tibia, and it incorrectly bundled Bestiary kills, Echo Warden, and Animus Mastery into one review task.

The current UX decision is:

- synchronize one source-aligned group at a time;
- keep untouched values unknown while a pass is incomplete;
- let the player enter only non-zero or Yes exceptions;
- review the pass, then explicitly commit untouched applicable items as zero or No;
- keep full baseline checks, small ongoing updates, and session/import evidence as three distinct journeys;
- never apply session or import evidence to canonical progress without a scoped before/after review and Undo.

No interface work should proceed until the replacement journey and acceptance criteria in the re-audit are accepted.
