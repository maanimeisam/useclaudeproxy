<!--
SYNC IMPACT REPORT
==================
Version change: 1.1.0 → 1.2.0 (MINOR: new principle group VIII–XIII added
from the repository-conformance principle list; workflow and governance
expanded; one reconciliation flagged)
Modified principles:
  - V (CLI-First Observability): unchanged, but now reinforced by new
    Principle XII (conformance to established error handling/validation/
    logging patterns)
Added sections:
  - Principle VIII: Behavior & Compatibility Preservation
  - Principle IX: Minimal, Focused Change Discipline
  - Principle X: Type Safety & Code Quality
  - Principle XI: Reuse Before Creation
  - Principle XII: Error Handling & Observability Conformance
  - Principle XIII: Spec Traceability & Completion Verification
  - Workflow gate 8: spec/constitution conformance check before completion
Removed sections: none
Reconciliation (flagged, not silent):
  - Requested item "Follow the existing testing strategy and add appropriate
    tests for new or changed behavior" CONFLICTS with ratified Principle VII
    (Test-Free Development, NON-NEGOTIABLE) because the repository has no
    test runner, no test infrastructure, and excludes "test"-named files by
    constitution. Per the instruction to prioritize codebase evidence over
    the generic list, this item is encoded as "follow the established
    testing strategy" — which in this repository means: no tests are
    created, updated, run, or verified; syntax is verified only via
    `tsc --noEmit` (Principle VII). Adding a test runner remains a
    constitution amendment (MAJOR for Principle VII redefinition), not a
    per-feature decision.
History:
  - 1.0.0 — initial ratification (principles I–V, constraints, workflow,
    governance)
  - 1.1.0 — added principles VI (codebase-memory as source of truth) and VII
    (test-free development); indexing and debug-logging gates added to
    workflow
  - 1.2.0 — added principles VIII–XIII (repository-conformance set:
    behavior/compat preservation, minimal focused changes, type safety,
    reuse-first, error-handling conformance, spec traceability); testing
    item reconciled into Principle VII; workflow gate 8 added
-->

# useclaudeproxy Constitution

## Core Principles

### I. Provider Plugin Architecture
Every upstream backend (OAuth device-flow provider, static-token provider, or
OpenAI-compatible API) MUST live in exactly one self-contained file,
`src/providers/<name>.ts`, extending `BaseProvider` and exporting a singleton.
New providers are integrated ONLY by registering in the
`src/providers/index.ts` registry Map; no other shared file (app, args,
config-yaml, http-client) MUST change to support a single provider. Provider
selection is driven at runtime by `--provider <name>` via `args.activeProvider`.

### II. BaseProvider Contract Fidelity (NON-NEGOTIABLE)
`src/providers/base-provider.ts` is the architectural source of truth. Every
provider MUST implement the three abstract members (`name`, `baseUrl`,
`tokenPath`) and the three abstract methods (`initConfig`, `getValidToken`,
`startTokenWatcher`) without widening or weakening base signatures — in
particular `getValidToken()` MUST keep its base return type `unknown`, with the
concrete token type defined and narrowed inside the provider file. The
`setApiKey` index-`[0]` assumption is a known contract constraint:
`initConfig` MUST always place the active provider at
`config["openai-compatibility"][0]`; multi-provider coexistence MUST NOT be
silently worked around — it requires a deliberate, flagged change to the base.

### III. Minimalism & YAGNI
The laziest solution that actually works MUST be preferred. Provider-specific
types, constants, headers, OAuth clients, and error classes are declared
locally in the provider file and MUST NOT be pushed into shared modules unless
genuinely shared by two or more providers — such generalization is a
deliberate, flagged change. No test runner or test infrastructure is added
unless explicitly requested. Existing providers (hermes, opencode, cline,
custom) MUST NOT be refactored as a side effect of adding a new one. Reuse
existing infrastructure (`createOAuthHttpClient()`, `readConfig`/`writeConfig`,
`sleep(ms, signal)`) over building new equivalents.

### IV. Credential & Token Security
Tokens are secrets. Token files MUST be persisted per-provider (the token path
is provider-owned, not a shared global) with mode `0o600`. On every token
refresh, the provider MUST re-inject the credential into `tools/config.yaml` so
the proxy keeps working without manual re-entry. Credentials MUST NOT be logged
via debug namespaces, embedded in error messages, or committed to the
repository.

### V. CLI-First Observability
Functionality is exposed through the CLI (commander) with a single-command
experience: authenticate → configure `tools/config.yaml` → launch
CLIProxyAPI. Diagnostics MUST go through namespaced `debug` loggers following
the `useclaudeproxy:<name>` / `useclaudeproxy:<name>:error` convention, not
ad-hoc console output in library code — the `debug` package MUST be used to
log results at each step of any multi-step operation. Abortable long-running
loops (watchers) MUST honor an `AbortSignal` via `sleep(ms, signal)` with a
clean guard against busy spinning.

### VI. Codebase-Memory as Source of Truth (NON-NEGOTIABLE)
Project understanding MUST come from the codebase-memory MCP (graph/index)
as the primary source of truth. The project MUST be indexed and the index
kept fresh: refresh the index at each work step and before starting any new
feature. Conventions, contracts, and structure are derived from indexed
source — not from assumption or memory of prior sessions.

### VII. Test-Free Development (NON-NEGOTIABLE)
Tests MUST NOT be created, updated, run, or verified, and any file whose
name contains "test" (e.g. `index_test.ts`) MUST be skipped and excluded
from all work. Web drivers (e.g. Puppeteer) and sandboxes MUST NOT be used.
Syntax verification is performed ONLY with `tsc --noEmit` — no other
verification runners are introduced. This principle IS the project's
established testing strategy; new or changed behavior is validated against
it, not against a test suite.

### VIII. Behavior & Compatibility Preservation
Existing behavior, architecture, and public contracts MUST be preserved
unless a specification explicitly requires a change. Public APIs, interfaces,
configuration formats (`tools/config.yaml` shape, CLI flags), persisted data
contracts (token file formats), and CLIProxyAPI integration behavior MUST
remain stable and backward compatible unless a breaking change is explicitly
required by the approved specification. New behavior MUST be consistent with
existing behavior unless the specification explicitly defines the change.

### IX. Minimal, Focused Change Discipline
Changes MUST be minimal, focused, and scoped to the requested feature.
Unrelated code MUST NOT be refactored while implementing a feature.
Speculative abstractions, premature optimizations, and unnecessary
architectural changes MUST NOT be introduced. New dependencies MUST NOT be
added unless they provide clear value and are consistent with the project's
existing technology choices (commander, got, debug, yaml, zod, express,
biome, TypeScript).

### X. Type Safety & Code Quality
Strict typing MUST be used; unnecessary `any`, type assertions, and unsafe
patterns MUST be avoided. Simple, readable, maintainable TypeScript is
preferred over abstraction or complexity. Established project conventions
(`.ts` import extensions, `Debug` namespaces, module-level `const` styling,
singleton exports) MUST be followed before introducing new patterns or
technologies; any new pattern requires an explicit, flagged justification.

### XI. Reuse Before Creation
Existing utilities, services, abstractions, and infrastructure MUST be reused
before creating new ones — in particular `createOAuthHttpClient()`,
`readConfig()`/`writeConfig()`, `sleep(ms, signal)`, `readStoredToken()`/
`saveTokens()`, the `BaseProvider` hooks, and the provider registry. A new
abstraction is justified only when no existing one fits AND its need is not
speculative (see Principle III).

### XII. Error Handling & Observability Conformance
Error handling, validation, logging, and observability MUST follow the
project's established patterns: errors via namespaced `useclaudeproxy:<name>:error`
debug loggers and thrown typed errors per provider; validation via `zod` and
the existing args/config parsing; logging via the `debug` package only.
Security, correctness, and data integrity (Principle IV) MUST NOT be weakened
for implementation convenience.

### XIII. Spec Traceability & Completion Verification
Every implementation MUST remain traceable to the approved specification and
plan. A feature is complete only when the implementation is verified to
(1) satisfy the specification, (2) follow this constitution, and (3) remain
consistent with the existing architecture and conventions — with conformance
checks performed per the Development Workflow (codebase-memory graph,
`tsc --noEmit`, biome) and the verification recorded in the change summary.

## Technical Constraints

- **Language**: TypeScript, strict mode; ESM (`"type": "module"`) with
  `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` — relative
  imports MUST use explicit `.ts` extensions.
- **Runtime**: Node.js ≥ 18.
- **Package manager**: pnpm for development workflow scripts
  (`pnpm type-check`, `pnpm check`); build output is `tsc` → `dist/`.
- **HTTP**: all outbound HTTP MUST reuse `createOAuthHttpClient()` from
  `src/http-client.ts` (retry/proxy/TLS policy in one place); new ad-hoc HTTP
  clients MUST NOT be introduced per provider.
- **Config**: `tools/config.yaml` is the single proxy configuration surface;
  mutate the object returned by `readConfig()` and call `writeConfig()` once.
- **Diagnostics**: the `debug` package is the sole logging mechanism
  (`useclaudeproxy:<name>` namespaces); `console.*` in library code is not
  permitted.
- **Verification**: syntax MUST be verified only via `tsc --noEmit`; no test
  runners, web drivers (e.g. Puppeteer), or sandboxes are permitted (see
  Principle VII).
- **Third-party additions** must justify themselves against Principles III
  and IX.

## Development Workflow & Quality Gates

0. **Index first**: index the project in codebase-memory and refresh the
   index at each step and before starting any new feature (Principle VI).
1. **Read before write**: new provider work starts from the existing reference
   archetypes (hermes for OAuth device flow, opencode/cline for static or
   alternate-flow tokens) — derive conventions from indexed source, not
   assumption (Principles VI and X).
2. **Type gate**: `pnpm type-check` (`tsc --noEmit`) MUST pass clean.
3. **Lint/format gate**: `pnpm check` (biome) MUST pass clean; enforced
   pre-commit via husky + lint-staged.
4. **Registry sanity**: `PROVIDER_NAMES` and the registry Map MUST include the
   new provider after registration.
5. **Step logging**: each step's results MUST be logged via the `debug`
   package with the appropriate namespace (Principle V).
6. **Test exclusion**: files with "test" in their names are skipped and
   excluded from every step; no tests are created, updated, run, or verified
   (Principle VII).
7. **Scope check**: the diff MUST contain only changes traceable to the
   approved specification — no unrelated refactoring, no speculative
   abstractions, no unrequested dependency additions (Principles IX and XIII).
8. **Completion conformance**: before declaring a feature done, verify the
   implementation satisfies the specification, this constitution, and the
   existing architecture/conventions, and state that verification in the
   change summary (Principle XIII).

## Governance

This constitution supersedes all other practices, conventions, and ad-hoc
agent instructions for this repository. Where a skill, prompt, or habit
conflicts with these principles, the constitution wins — except that an
approved specification MAY explicitly override a preserved behavior
(Principle VIII), and such overrides MUST be called out in the change
description.

- **Amendment procedure**: any change to principles or workflow gates requires
  an explicit edit to this file with a version bump (MAJOR for removals,
  incompatible redefinitions, or non-negotiable principle changes; MINOR for
  new principles or materially expanded guidance; PATCH for clarifications
  and wording), an updated Sync Impact Report, and a stated rationale.
- **Complexity justification**: any deviation from Minimalism & YAGNI
  (Principle III), the BaseProvider contract (Principle II), or the reuse and
  type-safety rules (Principles X–XI) MUST be flagged as a deliberate change
  in the change description, not done silently.
- **Compliance review**: every change MUST pass the quality gates in
  Development Workflow before merge; reviewers (human or agent) verify
  constitutional compliance as part of review.

**Version**: 1.2.0 | **Ratified**: 2026-09-14 | **Last Amended**: 2026-09-14
