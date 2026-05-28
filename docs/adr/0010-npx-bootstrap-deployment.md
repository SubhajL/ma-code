# ADR-0010: Pi-harness deploys via a published `bin` shim (npx-callable), not as an npm runtime dependency

- **Status:** Accepted
- **Date:** 2026-05-28
- **Supersedes:** none
- **Superseded-By:** none

## Context

The Pi-harness ships substantial repo-local infrastructure: `AGENTS.md`
and `SYSTEM.md` at the repo root, ADRs under `docs/adr/`, harness
extensions and prompts under `.pi/agent/`, validator scripts under
`scripts/`. Operators have historically installed it by cloning this
repo and running `npm run harness:install -- --dest <path>`. That
works, but requires:

1. The operator already knows about the harness repo URL.
2. The operator clones it locally before any consuming repo can use it.
3. Every harness update requires re-cloning or pulling.

For a team that wants to adopt the harness across many repos, that
friction adds up. The natural-looking alternative is "publish the
harness to npm and `npm install` it." But the harness's design is
repo-local: AGENTS.md at root, ADRs at root, validators that read
repo-relative paths. Living inside `node_modules/` would either break
those path assumptions or force a layer of indirection that hides the
governance files agents must discover.

There's a third option that nobody had picked yet: ship a small
**bootstrap CLI as a `bin` entry** so the package can be invoked via
`npx` to copy the harness assets into a destination repo. The package
itself doesn't get `npm install`-ed into the consuming repo; only the
bootstrap CLI runs (one-shot) and then exits. The harness ends up
deployed at the consuming repo's root, as before.

The 2026-05-28 "use this for every repo from now on" decision made
this the right time to add the npx path.

## Decision

The Pi-harness package exposes a single `bin` entry,
`pi-harness-install`, that bootstraps the harness into any target repo.

```bash
# From any empty or existing repo, with no prior setup:
npx github:SubhajL/ma-code#main pi-harness-install --dest .

# Or with an explicit destination:
npx github:SubhajL/ma-code#main pi-harness-install --dest /path/to/target

# Explicit source-root (overrides the bin's auto-detected package root,
# useful for testing or staging from a local checkout):
node scripts/bin/pi-harness-install.mjs --source-root /path/to/harness --dest /path/to/target
```

The bin lives at `scripts/bin/pi-harness-install.mjs` and is registered
in `package.json` as:

```json
"bin": {
  "pi-harness-install": "scripts/bin/pi-harness-install.mjs"
}
```

The shim is intentionally tiny (~60 lines of pure-Node ESM). It only:

1. Locates its own install directory via `import.meta.url` so it can
   set `--source-root` to the package's root (not the user's cwd).
2. Defaults `--dest` to `process.cwd()` when not provided.
3. Resolves the package-local `tsx` bin
   (`<package-root>/node_modules/.bin/tsx`) and spawns
   `tsx scripts/harness-package.ts install ...`. Using the
   package-local tsx bin avoids `node --import tsx` failing to resolve
   tsx against the user's cwd (the bug the integration test caught
   while this ADR was being drafted).
4. Forwards every other CLI argument unchanged so all existing
   `harness-package.ts install` options (`--skip-install`,
   `--skip-validators`, `--json`, etc.) work via the bin.

### What this decision explicitly does NOT cover

- **Publishing to the public npm registry.** The bin works today via
  `npx github:<user>/<repo>#<ref>`. Public-registry publication is a
  separate decision that would need a name reservation, a version
  policy, a release CI workflow, and probably a maintainership story.
  When the team has run a few `npx github:...` installs and decided
  the model is durable, that's the right time to publish.
- **`npm install` of the harness as a runtime dependency.** The
  harness's repo-local design (governance files at repo root, ADRs at
  repo root, validators reading repo-relative paths) is incompatible
  with living inside `node_modules/`. Future contributors should not
  add the harness's `lib/` exports to a consuming repo's
  `dependencies` map. If a consuming repo wants to import shared TS
  types from the harness, they should be copied via the bootstrap
  (and re-bootstrapped on harness updates), not imported transitively.
- **Auto-updating an existing installation.** The bin overwrites
  reusable assets on every run and is idempotent for them, but it
  doesn't merge changes into per-repo files (`AGENTS.md`, ADRs the
  consuming repo has edited). Updating an installed harness requires
  the operator to review the bootstrap report and merge per-repo
  edits by hand — same as today.
- **A separate `@pi-harness/core` library package.** Splitting the
  harness into a "core library installed via npm" + "consuming repo
  governance copied via bootstrap" is plausible future work but would
  supersede this ADR's "everything ships via bootstrap" framing.
  Premature today.

## Consequences

Positive:

- A team adopting the harness on a new repo runs ONE command from any
  directory — no prior clone, no path-juggling. The friction drops
  from "find the repo, clone it, navigate, run install" to "run
  install."
- The bin works without any npm publish or external registry. Teams
  can use a private fork (`npx github:<their-fork>#<ref>`) without
  changing the workflow.
- The bootstrap path is unchanged: the bin delegates to the existing
  `harness-package.ts install`, which has its own test surface
  (`tests/integration/harness-package.test.ts`,
  `scripts/validate-harness-package.sh`). The bin's own tests cover
  only the shim's argument-mapping and the package-root resolution.
- Future evolution to a public-registry publish is additive — the bin
  exists, has a tested shape, and just needs a published `name` +
  version + release workflow.

Negative:

- `npx github:<user>/<repo>#<ref>` runs `npm install` of the harness
  package's full dependency tree (tsx, typescript, sqlite, etc.) just
  to invoke the bin. That's ~100 MB and ~30 seconds of network +
  unpack cost on each first run. Subsequent runs in the same shell
  session are cached. Documented as a known cost; not a dealbreaker
  for one-time per-repo installs.
- The "use a local checkout's harness assets" path
  (`--source-root /path/to/harness`) is the only way to develop /
  test bin changes; the bin's package-root auto-detection points at
  its own installed location, which for a `npx github:` invocation
  means the npm cache rather than the developer's working tree.
  Documented in the operator install guide.
- Two install paths now coexist: the in-repo
  `npm run harness:install -- --dest <path>` (for developers who
  already have the harness checked out) and the npx
  `npx github:... pi-harness-install --dest <path>` (for external
  adopters). They share the same underlying engine, but operators
  have to know both exist.

## Notes

- Bin shim: [`scripts/bin/pi-harness-install.mjs`](../../scripts/bin/pi-harness-install.mjs).
- `bin` registration: [`package.json`](../../package.json) at the
  `bin.pi-harness-install` field.
- Underlying installer: [`scripts/harness-package.ts`](../../scripts/harness-package.ts)
  (the `install` subcommand).
- Tests: `tests/integration/pi-harness-install-bin.test.ts` (3 tests
  covering --dest-override, cwd-default, and missing-harness-package
  guard). End-to-end coverage for `harness-package.ts install` itself
  lives in `tests/integration/harness-package.test.ts`.
- Operator-facing docs:
  [`.pi/agent/docs/operator_install_guide.md`](../../.pi/agent/docs/operator_install_guide.md)
  documents the three install paths (Option A: in-repo `harness:install`;
  Option B: `npx github:` bootstrap; Option C: operate this repo
  directly). [`.pi/agent/docs/harness_runbook.md`](../../.pi/agent/docs/harness_runbook.md)
  cross-references the install paths in its "deployment" section.
- Related: [ADR-0002](./0002-bounded-autonomy.md) (the bin is a
  bounded operator action, not a daemon),
  [ADR-0004](./0004-apps-web-and-services-api-are-harness-fixtures.md)
  (the harness ships with `apps/web` + `services/api` as fixture
  directories — those are NOT installed into the consuming repo).
