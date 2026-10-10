# Survivor PWA

Requires Node 20.19+ (or Node 22.12+) and pnpm.

```sh
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm preview
```

On this Mac, `./dev.sh` also starts the app using the bundled Node runtime when Node is absent from PATH. Dependencies have already been installed.

Dev and preview use port 5173. Hash routing supports static hosts and offline reloads without server rewrites. Set `VITE_BASE_PATH=/civicmesh-sos/` when building for GitHub Pages.

Includes locally bundled Inter, Tailwind, Lucide, dark/light themes, guarded JSON storage with memory fallback, route focus handling, skip link, status announcements, and a native modal sheet with focus return. Tests cover unavailable/corrupt storage and navigation/theme/sheet interaction.

The production service worker uses automatic updates and precaches fonts, app assets, future model files, and future local ORT files, with a 40 MB per-file ceiling. “App shell cached” does not claim model readiness. Service workers require HTTPS or localhost. Development mode does not register one.

Mock analysis, GPS, identity, editable review, packing, relay handoff, and history are implemented. T1 model loading/inference are deferred; the default experimental replacement is available below. `public/model/` remains owned by T1. Shared triage colors are pending coordination with T3.

Manual acceptance: run production preview, visit once and wait for “Ready offline ✓ · Experimental model”; switch DevTools offline, reload both routes; verify both themes at 320 px; use Tab/Shift+Tab and Escape in the information sheet; verify browser Back/Forward. Real iPhone/Android offline validation remains outstanding.

## Protocol API

`src/protocol/` implements MASTER_PROMPT.md §§2–3. `pack(fields)` returns uppercase relay hex. `packFrame(fields)` accepts the flat `FrameFields` interface; `unpackFrame(bytes)` returns decoded fields and the complete `flags` mask. `toHex`/`fromHex` enforce an 18-byte version-1 frame and accept lowercase input. `gpsBucket` maps meter accuracy to the wire enum. Headcounts clamp to 0–15; malformed numeric fields are rejected rather than silently wrapped. Sequence advancement remains the sending layer's responsibility.

Coordinates use the Track 4 JavaScript `Math.round` formula with double precision. Exact half-step parity with Python's ties-to-even rounding still needs T1 confirmation. The included specification vectors pass; additional T1 golden fixtures are pending. `medicalFlags` retains the complete mask on decode, as the Python schema does; use `medicalFlags & 0xff` to display only medical needs. No text is encoded, and no additional checksum is introduced.

## Deterministic resolvers

`src/resolvers/index.ts` exports `resolveHeadcount(text)` → `{ adults, children }`, `resolveMedical(text)` → medical mask bits 0–7, `resolveLocation(text)` → `{ type, text, flags }`, and `resolveReport(text)` → combined results plus `suggestedThirdParty`. These implement §5.4 without model-based priority/hazard/status prediction. The suggested third-party value must never override a user's answer. Matched location text stays local and is not part of the frame.

Until T1 provides the Python reference, multiple count mentions use the maximum rather than summing possible repeated references. Generic totals subtract children before clamping. Medical matches are keyword backstops, with no negation inference. Addresses accept up to six street-name words. These unspecified details must be aligned with T1 instead of changing JS alone. The K5 test automatically reads `../tests/fixtures/parity_sentences.jsonl` when present; it is explicitly skipped when absent. No benchmark messages were read or used to author resolver rules/tests.

Run `pnpm test:parity` to require T1’s 50-sentence fixture and check each sentence separately. This command fails if the fixture is missing; normal `pnpm test` explicitly skips parity until it arrives.

Temporary `src/resolvers/fixtures/mock_sentences.json` contains 50 hand-authored examples with manually specified expectations. Normal tests run them under “NOT Python parity.” They use no endpoints/network and do not replace or populate T1-owned fixtures. Once the real K5 JSONL is delivered, the same checks also run against Python reference rows. `pnpm test:parity` still fails when the real fixture is missing.

## Classifier seam (no ONNX/Transformers.js yet)

`src/inference/classifier.ts` exports `createClassifier`, `MockClassifier`, `Stage1Classifier`, `decodeStage1`, and shared types. All classifiers expose async `classify(text)` with exactly the K4 result shape. `createClassifier()` selects the development mock (300 ms default delay; set `delayMs: 0` for immediate tests). Mock scores are synthetic heuristic outputs, not confidence probabilities or real inference measurements. The mock is always identified by `kind: 'mock'`.

Stage 1 requires an injected `EmbeddingProvider` and T1-compatible `PrototypeData`; it validates normalized 384-dimensional vectors, computes dot products in enum order, and applies `unknownMargin` (default 0.02). Missing OTHER/UNKNOWN prototypes have null scores. It does not fetch files, tokenize text, load models, or import a model runtime. Provider errors propagate so the UI can offer manual mode. Medical/headcount/location resolvers remain separate; Stage 1 medical and third-party probabilities are null. The app defaults to the experimental Stage 1 provider; the mock remains injectable for tests. Stage 2 and T1 runtime integration remain deferred; the experimental provider below implements local Stage 1 execution.

```ts
const classifier = createClassifier({ kind: 'mock', delayMs: 300 });
const result = await classifier.classify(message);
```

The stable consumer contract is `Classifier { classify(text: string): Promise<TriageResult> }` from `src/inference/types.ts` (also re-exported by `classifier.ts`). `TriageResult` retains the K4 result fields. `ClassificationResult` remains a compatibility alias. Implementation `kind` metadata is not required by this interface.

## Report → Analyze → Review → Send → My reports

The app uses the local Stage 1 classifier and deterministic resolvers through the stable `Classifier` interface. Analysis is visibly labeled experimental. Manual entry remains available without text or after classification failure. Review includes editable priority, hazard, situation, counts, medical needs, reporter presence, and location type, with accessible sheets. GPS is requested only by the user's “Get location” / “Refresh GPS” action, with high accuracy and a 10-second timeout; no fix encodes coordinates as zero and does not prevent sending.

Continue freezes the exact 18-byte frame fields shown on Send. Send commits a single storage snapshot containing device identity, incremented/wrapped sequence, and history before top-level relay navigation. Only hex and handoff metadata are stored in history; original message/location text stay in the in-memory draft. Storage failures preserve session state and still allow handoff. “Handed to relay” is not delivery confirmation. The relay page and return link remain T2's responsibility. Refreshing Review/Send without an in-memory draft redirects safely home.

Triage colors in this UI are provisional T4 values awaiting T3 agreement; shared tokens remain TBD. The experimental model phase below adds Transformers.js and matching local WASM assets. Real-phone offline and hardware delivery tests are still pending.

Analyze now has a dedicated processing route with an announced loading state, cancellation/back navigation, and manual fallback. Review displays separate adults/children controls, rescue status, location confidence, and third-party status alongside the “Are you at the emergency?” toggle. User corrections persist through Send and back to Review; packing reads the corrected draft, not the original classifier result.

## Phase D — offline production cache

Run `pnpm build` and `pnpm check:offline`, then `./dev.sh preview --port 5175` on this Mac. Open the preview while connected and wait for **Ready offline ✓ · Experimental model** before enabling Airplane Mode. The Vite development server does not provide offline installation. Use HTTPS for a deployed installation; localhost works for desktop preview.

Inter, icons, JavaScript, and CSS are local. There are no runtime CDN dependencies. Workbox precaches the app shell and all files supplied under `public/model/` and `public/ort/`, with `maximumFileSizeToCacheInBytes = 41,943,040` (40 MiB). A build inventory lets the app verify cached assets again after reload. `pnpm check:offline` checks actual production files against the generated precache manifest. Tests verify that a 40 MiB model is included and larger files are rejected.

T1 inference is still deferred. T1 has not supplied `model.json`, `tokenizer.json`, the compressed model, or prototypes; matching local ORT WASM files are now supplied by the experimental replacement. `pnpm check:inference-assets` deliberately fails until these files exist. Same-origin asset helpers reject remote URLs. Asset presence and caching do not prove inference correctness; each runtime/provider integration must use local paths and undergo its own offline inference test.

Verified in desktop Chrome: the production app reached cache readiness, reloaded with its preview server stopped, analyzed a mock report, and displayed its uppercase 18-byte packet. Real iPhone/Android Airplane Mode testing remains outstanding. Airplane Mode supports preparing and reviewing reports; relay handoff requires Wi-Fi to be re-enabled and connected to the field node. Browser storage eviction can require reconnecting to reinstall cached assets.

## Experimental replacement model

The default English MiniLM alternative is now bundled under `public/experimental/`, separate from T1-owned `public/model/`. The app automatically loads Stage1Classifier through the local Transformers.js/ONNX provider. The app loads the local tokenizer and quantized ONNX model, initializes local WASM, and checks a real embedding before showing **Experimental MiniLM ready**. Analyze then uses Stage1Classifier. Review labels these suggestions experimental and preserves all corrections. Manual entry remains available during loading and after loading/inference failures. Failed loading shows **Retry model loading**. Reload automatically initializes the cached model again. MockClassifier is retained for tests and explicit development injection only.

The model is Xenova/all-MiniLM-L6-v2, revision `751bff37182d3f1213fa05d7196b954e230abad9`, Apache-2.0. `model.json` records SHA-256 hashes. Prototypes are generated from the specification's Stage 1 class descriptions in `scripts/experimental-seeds.json`: normalized q8 mean-pooled embeddings, averaged per class and normalized again. No benchmark or T1 fixture was used. These prototypes are a demonstration and do not establish T1 parity, accuracy, or multilingual support. Tokenization and pooling must stay identical if replacing the model or regenerating prototypes.

`pnpm prepare:experimental` reproducibly downloads pinned model files when absent, copies matching ORT browser assets, and generates prototypes with local Node inference. Runtime remote model loading is disabled, WASM paths are same-origin, and the service worker precaches these assets. Each file is below the 40 MiB ceiling; total installation is larger than 40 MiB. Included real-model integration tests check checksums, deterministic embeddings/classification, and result shape; they are not accuracy tests. `pnpm check:experimental-assets` verifies the replacement precache. T1's `check:inference-assets` remains a separate failing gate until its standard artifacts arrive.

Verified in desktop Chrome: load model, stop preview server, reload shell, load model again from cache, analyze a fresh smoke report, correct rescue status, and generate uppercase hex. The model suggested Fire/smoke but incorrectly chose Sheltered for a report saying occupants could not leave; the survivor correction to Trapped worked. Real-device Airplane Mode and independent accuracy evaluation remain outstanding.

Adult fallback now starts at **0** when no adult count can be inferred, including empty manual reports and child-only messages. Explicit adult counts and supported self-reference phrases still supply their counts. This user-requested behavior differs from the master specification's default of 1; T1 parity expectations must account for that difference. Temporary mock fixtures were updated; T1-owned fixtures were not changed.

## Model-kind selection

`createModelClassifier(model, providers)` implements the requested conditional: `prototype` constructs `Stage1Classifier`; `classifier` constructs `FineTunedClassifier`. Both expose `classify(text): Promise<TriageResult>`. The experimental loader now reads and validates `experimental/model.json` (`kind: "prototype"`, `experimental: true`) and uses this selector. Unknown kinds and missing providers fail explicitly.

FineTunedClassifier takes an injected local `LogitProvider.predict(text)` returning priority[4], hazard[16], status[4], medical[8], and thirdParty[1] logits in protocol enum order. It validates dimensions/finite values, applies stable softmax and sigmoid, and implements the configured Red threshold. Medical and third-party probabilities are returned through K4; survivor confirmation and medical threshold/backstop integration remain outside the adapter. Fine-tuned ONNX weights/tokenizer/output mappings are not supplied, so Stage 2 runtime execution is not enabled by merely changing `kind`. A matching five-head ONNX provider must be supplied. Decoder/provider-contract tests are separate from real-weight parity tests.
