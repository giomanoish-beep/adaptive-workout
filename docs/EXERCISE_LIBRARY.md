# Exercise Library

The exercise catalog import contract is the reviewed source format for shared exercise taxonomy. It maps to `muscles`, `equipment`, `exercise_families`, `exercises`, `exercise_muscles`, `exercise_equipment`, and `exercise_substitutions`. Import validation is deterministic and framework-independent.

## Schema mapping

- `name` is the canonical display name; `slug` is the stable canonical key.
- `aliases` are import-review metadata used to detect duplicates and naming collisions. The current database has no alias table, so importers must not persist aliases into an incompatible field.
- `exerciseFamilySlug` maps each exercise to one `exercise_families` row. The family is the current movement-pattern classification.
- `muscles` maps to `exercise_muscles` using the controlled roles `primary`, `secondary`, and `stabilizer`; contribution is greater than `0` and at most `1`.
- `equipment` maps to `exercise_equipment` using only `required` and `optional`.
- `substitutions` are directed edges with a reason code and compatibility greater than `0` and at most `1`.
- The catalog is wrapped in the shared versioned-contract type. Database entity IDs reuse shared `DomainId` aliases; import references use stable slugs so new rows do not require preallocated UUIDs.

The current schema does not define unilateral/bilateral, compound/isolation, difficulty, setup context, rep-range guidance, progression suitability, or separate movement-pattern fields. Do not encode these concepts in descriptions, aliases, family names, or invented import fields. Add them only through a reviewed architecture and migration task when a concrete product requirement exists.

## Editorial rules

1. Create a canonical exercise only for a meaningfully distinct movement or equipment variant.
2. Treat spelling, abbreviations, and common alternate names as aliases, not separate exercises.
3. Split grip, stance, angle, machine, cable, dumbbell, barbell, Smith, or unilateral variants only when the distinction materially changes programming, equipment availability, progression, or substitution.
4. Keep exercise families broader than individual variants and stable enough for movement-pattern diversity rules.
5. Assign at least one primary muscle and use bounded contributions; use secondary or stabilizer roles only when editorially justified.
6. Add directed substitutions only when the replacement preserves relevant training intent, and document the compatibility reason.

## Review standard

Every catalog change must pass deterministic contract validation and human editorial review. Reviewers must check naming, taxonomy references, muscle roles, equipment requirements, and substitution direction. Bulk LLM-generated exercise catalogs must never be accepted without deterministic validation and review. Do not import copyrighted descriptions or media.

## Import process

`prepareExerciseCatalogImport` validates the canonical source and produces a deterministic plan for the seven catalog tables. It sorts reference rows and relational edges by stable slugs, resolves relationships by slug rather than preallocated UUID, and deliberately excludes aliases because the current database has no alias table.

`importExerciseCatalog` invokes an injected `ExerciseCatalogImportTarget` only after validation succeeds. A database target must apply the complete plan in one transaction, resolve slug references to database IDs, and roll back every write if any row fails. Infrastructure failures propagate to the caller; validation failures return the shared typed domain result and never call the target. Catalog population remains a separate reviewed task.

## Production catalog

`packages/domain/src/exercise-catalog-data.ts` is the single maintainable source for the initial reviewed catalog. `npm run catalog:generate` validates and compiles that source into the versioned Supabase seed migration. `npm run catalog:check` fails when the committed migration differs from deterministic importer output. Never edit the generated migration manually.

## Search and filters

Authenticated clients use `search_exercise_catalog` for active catalog discovery. It supports full-text canonical name/slug search, family filters, primary/secondary muscle filters, available-equipment filtering, deterministic ordering, total counts, and bounded pagination. Available equipment uses all-required semantics: an exercise is eligible only when every required equipment row is present.

`get_exercise_catalog_filter_options` returns active family, muscle, and equipment facets with exercise counts. Both functions are read-only, RLS-aware, and unavailable to anonymous clients. Aliases remain canonical-source review metadata because the current relational schema has no alias table.
