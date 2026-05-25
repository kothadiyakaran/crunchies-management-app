# Backfill — archived (not used)

Original intent (Sprint 9, ADR-44): import mom's paper-notebook history — past customers and orders predating the app — into Supabase so the first-launch experience would include existing customer directory + historical order patterns feeding the production algorithm.

**Decision 2026-05-25 (Karan):** drop backfill entirely. Mom starts from a clean slate; she enters customers + orders as activity happens. The §11 algorithm correctly handles this — for the first 4 weeks per product it uses her seed estimates, then auto-switches to the rolling 4-week average. Reports tabs show their documented empty states until enough data accumulates.

These files are preserved here as a reference, in case a future small-business deployment wants to import notebook history. They are NOT actively loaded by any build, test, or smoke. The `tsconfig.scripts.json` that originally type-checked `scripts/**/*.ts` was removed when these files moved out (no other TS scripts exist).

## What's in this folder

- `backfill-notebook.ts` — idempotent CSV → Supabase importer. Required `SUPABASE_SERVICE_KEY`. Dry-run by default; `--apply` to write.
- `backfill-notebook.test.ts` — 23 Vitest tests against a fake Supabase client. No longer runs (out of `vitest --include` glob scope).
- `backfill-notebook.README.md` — usage docs, CSV format, idempotency primitives, defaulted fields.
- `backfill-notebook.sample.csv` — 4-row fixture.

## If you ever want to revive this

1. `git mv docs/archive/build-artifacts/backfill/*.ts scripts/`
2. Restore `tsconfig.scripts.json` (see git history at commit `e196e79`) and re-add it to `tsconfig.json` references.
3. Verify `tsx` is in devDependencies (it was added at commit `e196e79`).
4. Run the test suite to confirm: `npx vitest run docs/archive/build-artifacts/backfill/backfill-notebook.test.ts` — or move tests back into the active tree.
