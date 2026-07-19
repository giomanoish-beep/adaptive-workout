# Implementation Plan

Statuses: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`. Update this file when a task finishes.

| Task ID                | Title                                                        | Status  | Dependencies                                                 |
| ---------------------- | ------------------------------------------------------------ | ------- | ------------------------------------------------------------ |
| FOUNDATION-001         | Initialize architecture, workspace, tooling, and smoke tests | DONE    | —                                                            |
| FOUNDATION-002         | Add CI checks for install, typecheck, lint, test, build      | DONE    | FOUNDATION-001                                               |
| FOUNDATION-003         | Define shared domain IDs, errors, and version contracts      | DONE    | FOUNDATION-001                                               |
| FOUNDATION-004         | Make workspace CI typechecking clean-clone safe              | DONE    | FOUNDATION-002                                               |
| DATABASE-001           | Create Supabase project config and migration baseline        | DONE    | FOUNDATION-001                                               |
| DATABASE-002           | Migrate profiles and shared exercise taxonomy                | DONE    | DATABASE-001, FOUNDATION-003                                 |
| DATABASE-003           | Migrate programs and workout templates                       | DONE    | DATABASE-002                                                 |
| DATABASE-004           | Migrate sessions, exercises, and set logs                    | DONE    | DATABASE-002                                                 |
| DATABASE-005           | Migrate performance and muscle state                         | DONE    | DATABASE-004                                                 |
| DATABASE-006           | Migrate pain, preferences, decisions, and AI audits          | DONE    | DATABASE-002, FOUNDATION-003                                 |
| DATABASE-007           | Add RLS policies and database policy tests                   | DONE    | DATABASE-003, DATABASE-004, DATABASE-005, DATABASE-006       |
| EXERCISE_LIBRARY-001   | Define exercise catalog import schema                        | DONE    | DATABASE-002                                                 |
| EXERCISE_LIBRARY-002   | Build validated catalog importer                             | DONE    | EXERCISE_LIBRARY-001                                         |
| EXERCISE_LIBRARY-003   | Seed initial reviewed exercise dataset                       | DONE    | EXERCISE_LIBRARY-002                                         |
| EXERCISE_LIBRARY-004   | Add catalog search and filter queries                        | DONE    | EXERCISE_LIBRARY-003                                         |
| WORKOUT_ENGINE-001     | Define workout engine input/output types                     | DONE    | FOUNDATION-003, EXERCISE_LIBRARY-001                         |
| WORKOUT_ENGINE-002     | Implement hard-constraint candidate filtering                | DONE    | WORKOUT_ENGINE-001                                           |
| WORKOUT_ENGINE-003     | Implement configurable candidate scoring                     | DONE    | WORKOUT_ENGINE-002                                           |
| WORKOUT_ENGINE-004     | Implement diversity and volume allocation                    | DONE    | WORKOUT_ENGINE-003                                           |
| WORKOUT_ENGINE-005     | Implement duration fitting and validation                    | DONE    | WORKOUT_ENGINE-004                                           |
| WORKOUT_ENGINE-006     | Implement deterministic substitutions                        | DONE    | WORKOUT_ENGINE-005                                           |
| WORKOUT_ENGINE-007     | Persist workout decision traces                              | DONE    | WORKOUT_ENGINE-006, DATABASE-006                             |
| PROGRESSION_ENGINE-001 | Define exposure and recommendation contracts                 | DONE    | FOUNDATION-003, DATABASE-005                                 |
| PROGRESSION_ENGINE-002 | Implement increase, maintain, and reduction rules            | DONE    | PROGRESSION_ENGINE-001                                       |
| PROGRESSION_ENGINE-003 | Implement plateau and substitution signals                   | DONE    | PROGRESSION_ENGINE-002                                       |
| PROGRESSION_ENGINE-004 | Implement configurable deload signals                        | DONE    | PROGRESSION_ENGINE-002                                       |
| PROGRESSION_ENGINE-005 | Persist progression decision traces                          | DONE    | PROGRESSION_ENGINE-003, PROGRESSION_ENGINE-004, DATABASE-006 |
| PAIN_SAFETY-001        | Define discomfort observation and constraint contracts       | DONE    | FOUNDATION-003, DATABASE-006                                 |
| PAIN_SAFETY-002        | Implement missing-information evaluation                     | DONE    | PAIN_SAFETY-001                                              |
| PAIN_SAFETY-003        | Implement GREEN, ADAPT, and STOP rules                       | DONE    | PAIN_SAFETY-002                                              |
| PAIN_SAFETY-004        | Implement ADAPT constraint generation                        | DONE    | PAIN_SAFETY-003                                              |
| PAIN_SAFETY-005        | Implement follow-up and recurrence rules                     | DONE    | PAIN_SAFETY-003                                              |
| PAIN_SAFETY-006        | Add non-diagnostic language fixtures                         | DONE    | PAIN_SAFETY-003                                              |
| AI-001                 | Define provider and structured task contracts                | DONE    | FOUNDATION-003                                               |
| AI-002                 | Implement server-side GLM provider                           | DONE    | AI-001                                                       |
| AI-003                 | Implement DeepSeek fallback and routing                      | DONE    | AI-002                                                       |
| AI-004                 | Implement workout-intent extraction                          | DONE    | AI-003, WORKOUT_ENGINE-001                                   |
| AI-005                 | Implement discomfort extraction                              | DONE    | AI-003, PAIN_SAFETY-001                                      |
| AI-006                 | Implement grounded decision explanations                     | DONE    | AI-003, DATABASE-006                                         |
| WEB_APP-001            | Add Supabase client and authentication shell                 | DONE    | DATABASE-001                                                 |
| WEB_APP-002            | Build mobile-first app navigation                            | DONE    | WEB_APP-001                                                  |
| WEB_APP-003            | Build workout request and review flow                        | DONE    | WEB_APP-002, WORKOUT_ENGINE-007                              |
| WEB_APP-004            | Build active workout and set logging                         | DONE    | WEB_APP-002, DATABASE-004                                    |
| ONBOARDING-001         | Add training profile onboarding                              | DONE    | WEB_APP-002                                                  |
| DEPLOY-001             | Finalize Edge Function bundling and deployment path          | DONE    | WORKOUT_ENGINE-007, WEB_APP-003                              |
| WEB_APP-005            | Build history and progression views                          | TODO    | WEB_APP-004, PROGRESSION_ENGINE-005                          |
| WEB_APP-006            | Build discomfort report and follow-up flow                   | TODO    | WEB_APP-002, PAIN_SAFETY-005                                 |
| HARDENING-001          | Add end-to-end critical-flow tests                           | TODO    | WEB_APP-003, WEB_APP-004, WEB_APP-006                        |
| HARDENING-002          | Add observability and secret-redaction controls              | TODO    | AI-006, WORKOUT_ENGINE-007                                   |
| HARDENING-003          | Run accessibility and mobile performance audits              | TODO    | HARDENING-001                                                |
| HARDENING-004          | Complete security and data-retention review                  | TODO    | DATABASE-007, HARDENING-002                                  |
| V1-005                 | Remediate executable V1 validation and production safeguards | DONE    | WEB_APP-003, WEB_APP-004, ONBOARDING-001                     |
| V1-006                 | Deploy V1 and verify iPhone PWA installation readiness       | BLOCKED | V1-005                                                       |
| V1-007                 | Fix production workout equipment-context mapping             | DONE    | V1-005, DEPLOY-001                                           |
| V1-008                 | Align production workout-session persistence contracts       | DONE    | V1-007, DATABASE-004                                         |
| V1.1                   | UX, workout-only replacement, and immediate defects          | DONE    | V1-008                                                       |
