# Track 3 Operator Dashboard and CI/CD — Implementation Review

**Repository:** `TejasSureson/civicmesh-sos`  
**Track:** Track 3 — Operator Dashboard & Training Data  
**Scope:** Hours 2–4 dashboard scaffold, Contract K3 models, mock map UI, and repository CI/CD hardening  
**Completed:** 2026-10-10

## Outcome

The Track 3 operator dashboard scaffold is implemented, verified, and merged into
`main`. It provides a responsive dark command-center interface, exact Contract
K3 TypeScript models, ten realistic incidents, data-driven MapLibre markers, an
offline-safe grid fallback, an incident queue, system status indicators, and
bundled local fonts.

The repository's two GitHub Actions workflows were subsequently audited and
hardened. Both now preserve the pull-request workflow, verify relevant changes
again after they reach `main`, support manual runs, use read-only repository
permissions, do not retain Git credentials, and never commit, push, tag, release,
or deploy.

## Pull requests and merge commits

| Pull request | Purpose | Squash merge |
|---|---|---|
| [#2 — Scaffold operator dashboard](https://github.com/TejasSureson/civicmesh-sos/pull/2) | Dashboard, K3 types, mocks, design tokens, browser tests | `276d5731f5db969a52f63f176eb9ac26d53e9d46` |
| [#3 — Harden dashboard verification](https://github.com/TejasSureson/civicmesh-sos/pull/3) | Correct main trigger, secure checkout, current actions, build artifact | `bb3088d9937b7dba2a519978ef1b23a9b76994a3` |
| [#4 — Align importer checks with protected Git flow](https://github.com/TejasSureson/civicmesh-sos/pull/4) | Apply the same safe PR/main behavior to importer tests | `da3e4675b2b6bdaeac632a64ed02546f39c00232` |

## Authoritative verification results

### Dashboard pull-request verification

The dashboard feature branch passed two independent runs: one for the branch
push and one for the pull request. The browser smoke test opened the real React
application in Chromium and asserted:

- the dashboard title is visible;
- the incident queue is visible;
- nine active incident cards render;
- the **No location** section renders;
- the map reaches either `Offline canvas` or `Grid fallback`;
- a MapLibre canvas or fallback grid is visible;
- no browser `console.error` messages occur;
- no uncaught page errors occur.

### Dashboard post-merge verification

Run: [Track 3 dashboard #22](https://github.com/TejasSureson/civicmesh-sos/actions/runs/38074962228)

Commit: `bb3088d9937b7dba2a519978ef1b23a9b76994a3`

Every step completed successfully:

1. Check out repository
2. Set up Node.js 20
3. Install dependencies
4. Build dashboard
5. Install Chromium
6. Render dashboard and check browser console
7. Start dev server and verify port 5174
8. Upload production dashboard

The uploaded artifact was:

- Name: `dashboard-dist-bb3088d9937b7dba2a519978ef1b23a9b76994a3`
- Size: 1,384,432 bytes
- Digest: `sha256:3a5b01cdcabac06905987ac6f65a6ff0c9bf7ec81dcf9eaa6302fcfc5dd9934f`
- Retention: seven days

### Importer post-merge verification

Run: [Track 3 importer tests](https://github.com/TejasSureson/civicmesh-sos/actions/runs/38075203100)

Commit: `da3e4675b2b6bdaeac632a64ed02546f39c00232`

The focused Python 3.13 importer test job completed successfully on `main`.

## Files added

### `dashboard/package.json`

Defines the dashboard project and scripts:

- `npm run dev` — Vite development server
- `npm run build` — TypeScript project build followed by Vite production build
- `npm run preview` — Vite production preview
- `npm run test:smoke` — Playwright browser smoke suite

Runtime dependencies:

- React and React DOM
- MapLibre GL JS
- PMTiles
- Protomaps basemap helpers
- Lucide React
- Inter and JetBrains Mono through `@fontsource`

Development dependencies:

- TypeScript
- Vite and the React plugin
- Tailwind CSS v4 and its Vite integration
- GeoJSON types
- Playwright test runner
- React type definitions

### `dashboard/index.html`

Provides the Vite HTML entry point and dashboard root element.

### `dashboard/tsconfig.json`

Defines the TypeScript project references for the browser application and Vite
configuration.

### `dashboard/tsconfig.app.json`

Configures strict browser-side TypeScript compilation.

### `dashboard/tsconfig.node.json`

Configures TypeScript for the Vite build configuration.

### `dashboard/vite.config.ts`

Configures:

- React support;
- Tailwind's Vite plugin;
- development port `5174`;
- `strictPort: true`, preventing a silent fallback to another port;
- `/api` proxying to `http://localhost:8000`;
- `/ws` proxying to the same bridge with `ws: true`.

### `dashboard/src/main.tsx`

Loads bundled font files, MapLibre CSS, dashboard CSS, and the React root. The
application is rendered under `StrictMode`.

No CDN font, map, JavaScript, or stylesheet request is required.

### `dashboard/src/types/incident.ts`

Implements the exact Contract K3 client-side types:

- `PriorityColor`
- `TriagePriority`
- `HazardClass`
- `RescueStatus`
- `GpsAccuracy`
- `Incident`

The `Incident` interface includes every K3 field and preserves nullable radio,
GPS, and removal values.

### `dashboard/src/mocks/incidents.ts`

Provides ten realistic K3 incidents.

Coverage includes:

- every priority: Immediate, Delayed, Minor, and Deceased;
- a third-party active-violence report;
- two `NO_FIX` incidents;
- a removed incident;
- null RSSI/SNR for an injected-style frame;
- location discrepancies;
- varied rescue states and medical flags;
- realistic radio telemetry and timestamps;
- ten uppercase, valid 36-character frame strings.

Nine incidents are active. The removed incident is excluded from active counters
and map markers.

### `dashboard/src/components/TopBar.tsx`

Renders:

- CivicMesh-SOS Operator Dashboard title;
- WebSocket mock status;
- serial simulator status;
- last-frame age;
- active counts for all four priorities;
- accessible sound-toggle placeholder.

The component receives counts and sound state through typed props, keeping
display logic separate from application state.

### `dashboard/src/components/IncidentSidebar.tsx`

Renders the incident queue in priority order:

1. Red
2. Yellow
3. Green
4. Black

Within equal priorities, newer incidents appear first.

Important functions:

- `ageLabel(timestamp)` — formats a POSIX timestamp as seconds, minutes, or
  hours ago.
- `IncidentCard({ incident })` — renders hazard, priority, people count,
  rescue status, radio data, third-party state, discrepancy warnings, medical
  flags, and a shortened frame identifier.
- `IncidentSidebar({ incidents })` — partitions active records into
  **Located** and **No location**, and summarizes removed records.

`NO_FIX` incidents are never presented as located.

### `dashboard/src/components/OperationsMap.tsx`

Implements the MapLibre skeleton and CSS-grid fallback.

Important constants and functions:

- `CENTER` — Austin default center at `[-97.7431, 30.2672]`.
- `TRIAGE_COLORS` — the canonical shared T3/T4 marker colors.
- `mappable(incident)` — permits only active incidents with a GPS fix.
- `fallbackPosition(incident)` — converts coordinates to clamped relative
  positions around the default center.
- `FallbackGrid({ incidents })` — renders accessible DOM pins when MapLibre
  cannot initialize or reports a map error.
- `OperationsMap({ incidents })` — owns MapLibre setup, GeoJSON generation,
  layers, pointer behavior, popups, status state, and cleanup.

Map behavior:

- Starts with an empty local MapLibre style, so it makes no tile request.
- Places incident data in one GeoJSON source.
- Uses a data-driven circle layer for marker color and radius.
- Adds a larger translucent halo for Immediate incidents.
- Gives Deceased markers a slate outline so near-black remains visible.
- Uses safe `textContent` for popup labels.
- Removes listeners and the MapLibre instance during React effect cleanup.
- Switches to the grid fallback if construction or map loading fails.

The CSS grid is also visible behind the transparent MapLibre canvas, so the
Hours 2–4 view remains useful before the later PMTiles extraction is supplied.

### `dashboard/src/App.tsx`

Coordinates the shell:

- owns the sound-toggle state;
- derives active priority counters;
- renders the top bar, map, sidebar, and footer;
- supplies the shared mock incident array to map and queue components.

### `dashboard/src/styles.css`

Defines the complete dark command-center presentation:

- shared CSS color tokens;
- 70/30 desktop map/sidebar layout;
- responsive tablet and mobile layouts;
- layered dark grid;
- triage marker styling;
- Immediate soft pulse;
- cards, badges, telemetry, map controls, and popups;
- keyboard focus treatment;
- local UI and monospace font families;
- `prefers-reduced-motion` handling.

### `dashboard/playwright.config.ts`

Runs Chromium against the actual Vite development server at
`http://127.0.0.1:5174`. CI retries failed browser tests twice and retains a
trace only on failure.

### `dashboard/tests/dashboard.spec.ts`

Provides the browser-backed render and console-error smoke test described in
the verification section.

### `dashboard/README.md`

Documents setup, development, build, verification, proxy behavior, the current
grid-first map strategy, and the planned PMTiles phase.

## Files modified

### `design/REFERENCES.md`

Preserves the Track 4-owned Survivor PWA section and fills the Track 3 Operator
Dashboard section.

Four references were documented:

1. Truck Tracking Dashboard — Light & Dark Mode
2. Logistics & Freight SaaS — Fleet Tracking Dashboard
3. Cybersecurity Operations Command Center Dashboard
4. Enterprise Security Dashboard — Real-Time Analytics

Each entry records the source, the relevant visual idea, and the specific
hierarchy or interaction pattern borrowed.

Shared canonical triage colors:

| Priority | Dark theme | Light theme |
|---|---|---|
| Immediate | `#FF4D5E` | `#C81E3A` |
| Delayed | `#F6C344` | `#A16207` |
| Minor | `#35C978` | `#15803D` |
| Deceased | `#111827` plus `#94A3B8` outline | `#111827` |

Dashboard tokens also define canvas, surface, border, text, and system-accent
colors; Inter and JetBrains Mono usage; type scale; radii; spacing; elevation;
motion; and focus behavior.

### `.github/workflows/dashboard.yml`

The final dashboard CI/CD workflow:

- runs on relevant pull requests;
- runs on relevant pushes to `main`;
- supports `workflow_dispatch`;
- uses path filtering to avoid unrelated runs;
- cancels stale runs for the same workflow/ref;
- sets `contents: read`;
- uses `persist-credentials: false`;
- uses `actions/checkout@v7`;
- uses `actions/setup-node@v7` while installing Node.js 20 for the project;
- disables implicit package caching because no lockfile is committed yet;
- installs dependencies without audit/funding network work;
- builds the production dashboard;
- installs Chromium;
- runs the rendered-page/console smoke test;
- separately launches `npm run dev` and curls port 5174;
- uploads `dashboard/dist` through `actions/upload-artifact@v7`;
- fails if the production output is absent.

The workflow has no Git write token and no deployment side effects. The
artifact upload is delivery of a verified build, not a repository mutation.

### `.github/workflows/importer-tests.yml`

The importer workflow was audited after the dashboard workflow because it was
the only other file under `.github/workflows`.

It now:

- runs on relevant importer pull requests;
- runs on relevant importer pushes to `main`;
- supports manual execution;
- cancels stale same-ref runs;
- uses read-only permissions;
- disables persisted Git credentials;
- uses `actions/checkout@v7`;
- uses `actions/setup-python@v7`;
- continues to test under Python 3.13;
- continues to run only `tests/test_importer.py`.

This preserved the established focused test behavior while fixing the obsolete
feature-branch-only push trigger.

## CI/CD and Git-workflow safety

The repository now has exactly two workflows:

- `.github/workflows/dashboard.yml`
- `.github/workflows/importer-tests.yml`

Both use the same safe lifecycle:

```text
feature branch change
        ↓
pull request path filter
        ↓
read-only validation
        ↓
human/authorized merge
        ↓
main push path filter
        ↓
read-only post-merge validation
```

Safety properties:

- No force pushes.
- No automated merges.
- No direct commits from Actions.
- No tags or releases.
- No branch deletion.
- No persisted checkout token.
- No write permission in `GITHUB_TOKEN`.
- No secret-dependent code paths.
- No workflow uses `pull_request_target`.
- No untrusted PR code receives elevated credentials.
- Dashboard and importer paths remain isolated.
- Concurrency cancellation affects only stale runs for the same ref.

A dashboard-only change runs dashboard CI. An importer-only change runs importer
CI. Documentation outside the watched shared design file does not consume a
full application test run.

## Commands verified by CI

Dashboard:

```bash
cd dashboard
npm install --no-audit --no-fund
npm run build
npx playwright install --with-deps chromium
npm run test:smoke
npm run dev -- --host 127.0.0.1
```

The final command was verified at:

```text
http://127.0.0.1:5174/
```

Importer:

```bash
python -m pip install pytest
python -m pytest tests/test_importer.py
```

## Errors, warnings, and corrections

### Local workspace process startup failure

The desktop workspace could not launch PowerShell, Node, Python, patch, or
browser-automation processes. Each attempt failed before command execution with:

```text
helper_unknown_error: setup refresh had errors
```

Resolution: all source changes were committed through the connected GitHub API,
and GitHub-hosted runners provided the authoritative build and browser
environment.

### Local skill instruction files were unavailable

The same process-start failure prevented loading the local Sites/Product Design
and React best-practices skill files.

Resolution: the required design and React quality checks were applied manually,
then verified by strict TypeScript compilation and a real Chromium smoke test.

### Initial CSS selector mismatch

The first styling pass used several selector names that did not exactly match
the committed component class names.

Resolution: the component files were fetched back from the branch, every class
contract was compared, and explicit selectors were added before the first PR
was opened. Browser CI subsequently verified the rendered result.

### Missing package lockfile

The first workflow draft configured npm caching with a
`dashboard/package-lock.json` path, but the scaffold did not yet have a
committed lockfile.

Resolution: the brittle cache configuration was removed. The workflow
intentionally uses `npm install` rather than `npm ci` until a lockfile is
committed.

### Browser-level verification was initially absent

The initial workflow compiled the app and curled the development server, but
that could not prove React rendered without console errors.

Resolution: Playwright was added. The workflow now opens the page in Chromium,
checks key UI state, and fails on console or page errors.

### Obsolete dashboard push branch

The initial workflow watched pushes to
`track/t3-dashboard-skeleton`. After the feature was merged, this would not
verify later dashboard merges on `main`.

Resolution: PR #3 changed the push branch to `main`, retained pull-request
checks, and added manual dispatch. The resulting `main` run completed
successfully.

### Obsolete importer push branch

The repository-wide workflow audit found the same pattern in
`importer-tests.yml`, which watched the completed
`track/t3-dashboard-data` branch.

Resolution: PR #4 aligned the importer workflow with the safe PR-plus-main
lifecycle. Its PR run and its subsequent `main` run both passed.

### Deprecated Node 20 action-runtime warning

The first dashboard runs used `actions/checkout@v4` and
`actions/setup-node@v4`. GitHub warned that those actions' internal Node 20
runtime was deprecated.

Resolution: the workflows now use the current v7 action generations, whose
internal runtime is Node 24. The dashboard itself still runs under Node.js 20,
as required by the Track 3 specification.

### Remaining GitHub notice

GitHub currently emits one informational notice that the `ubuntu-latest`
label will migrate to Ubuntu 26 beginning October 19, 2026.

This is not a workflow error. Both workflows passed. If exact runner-image
reproducibility becomes important, pinning an explicit supported Ubuntu image
can be evaluated after the migration.

## Deliberate scope boundaries

This Hours 2–4 implementation does not yet include:

- a live WebSocket connection to the bridge;
- live `GET /api/incidents` hydration;
- remove/restore calls;
- incident detail drawer and byte-by-byte frame breakdown;
- toast notifications or WebAudio alerts;
- the extracted offline PMTiles archive, local sprites, or glyphs;
- selected-marker GPS-accuracy polygons;
- production hosting or automatic deployment.

Those items belong to later Track 3 milestones. The installed PMTiles and
Protomaps packages establish the dependency base without introducing a runtime
network dependency now.

## Recommended follow-up

1. Commit a generated `dashboard/package-lock.json`, then change CI from
   `npm install` to `npm ci` and enable lockfile-based caching.
2. Integrate the Track 2 bridge while retaining the current mocks as a
   deterministic development mode.
3. Add the bounded PMTiles extract and local glyph/sprite assets.
4. Preserve the grid fallback and browser smoke assertions while adding the
   real basemap.
5. Expand Playwright coverage when remove/restore, reconnection, keyboard
   shortcuts, and the detail drawer are implemented.
6. Consider pinning third-party actions to full commit SHAs if the team adopts
   a stricter supply-chain policy.
