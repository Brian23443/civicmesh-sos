# Track 3 Chatbot Importer — Implementation Review

**Repository:** `TejasSureson/civicmesh-sos`  
**Track:** Track 3 — Operator Dashboard & Training Data  
**Scope:** Hour 0–1 chatbot JSONL importer and test suite  
**Pull request:** [#1 — Add chatbot training-data importer](https://github.com/TejasSureson/civicmesh-sos/pull/1)  
**Merged commit:** `2398db1cb4a4cd2b29fccaa82e57ba9dc241f10a`  
**Completed:** 2026-10-10

## Outcome

The Track 3 chatbot importer is implemented and merged into the fork's `main`
branch. It validates chatbot-generated JSONL, normalizes accepted records, skips
duplicates, appends imported rows to `data/synthetic/raw.jsonl`, and provides a
read-only `--check` report for dataset balance, message length, duplicate
detection, and Appendix A contamination.

The requested test command ran successfully in GitHub Actions on CPython 3.13.16:

```text
python -m pytest tests/test_importer.py
collected 20 items
tests/test_importer.py .................... [100%]
20 passed in 0.08s
```

Workflow run: [Track 3 importer tests](https://github.com/TejasSureson/civicmesh-sos/actions/runs/38071710426)

## Files added

### `training/import_chatbot.py`

Implements the command-line importer:

```bash
python3 -m training.import_chatbot data/chatA.txt data/chatB.txt data/chatC.txt \
  --writer chatbot --label-version 2
```

Read-only pre-import check:

```bash
python3 -m training.import_chatbot data/chatA.txt data/chatB.txt data/chatC.txt \
  --writer chatbot --label-version 2 --check
```

Default output path:

```text
data/synthetic/raw.jsonl
```

Default benchmark path:

```text
data/benchmark_dataset.jsonl
```

### `tests/test_importer.py`

Adds focused pytest coverage for parsing, validation, transformation,
deduplication, check mode, similarity thresholds, and contamination detection.
The parameterized validation test expands the file to 20 collected test cases.

### `.github/workflows/importer-tests.yml`

Adds a narrowly scoped GitHub Actions workflow that:

1. Checks out the repository.
2. Installs CPython 3.13.
3. Installs pytest.
4. Runs `python -m pytest tests/test_importer.py`.

The workflow is path-filtered to the importer, shared training utilities,
importer tests, and the workflow itself.

## Contract K6 dependency handling

`training/common.py` did not exist in the fork when this work was performed.
The importer therefore contains the exact §2 fallback vocabularies and a clear
`TODO(K6)` marking the future migration to `training.common`.

When `training.common` becomes available, the importer automatically consumes:

- `LABEL_VERSION`
- `COUNT_RULE`
- `THIRD_PARTY_RULE`
- `PRIORITY_LABELS`
- `STATUS_LABELS`
- `MEDICAL_NAMES`
- `LANGUAGES`
- `HAZRAM_NAMES`, or `HAZARD_DESCRIPTIONS` when that is the exported name
- `read_jsonl`, when provided
- `append_jsonl`, when provided

Shared vocabularies may be sequences or mappings. Mapping vocabularies are
normalized to their keys.

### Fallback vocabularies

Priority labels:

- `Minor`
- `Delayed`
- `Immediate`
- `Deceased`

Hazard labels:

- `NONE`
- `FLOOD`
- `FIRE_SMOKE`
- `STRUCTURAL_COLLAPSE`
- `HAZMAT_GAS`
- `ELECTRICAL_POWER`
- `EXTREME_WEATHER`
- `MEDICAL_CRISIS`
- `ACTIVE_VIOLENCE`
- `TSUNAMI_SURGE`
- `LANDSLIDE`
- `HYPOTHERMIA_FREEZE`
- `HEAT_STROKE`
- `SINKHOLE_SUBSIDENCE`
- `CONTAMINATED_WATER`
- `OTHER`

Rescue status labels:

- `Sheltered`
- `Exposed`
- `Trapped`
- `Unknown`

Medical flags:

- `INSULIN`
- `OXYGEN`
- `BLEEDING`
- `HYPOTHERMIA`
- `MOBILITY_IMPAIRED`
- `CARDIAC`
- `PREGNANCY_INFANT`
- `BURNS`

Languages:

- `English`
- `Spanish`
- `mixed English and Spanish`

## Parsing behavior

The importer processes physical input files line by line.

- Leading whitespace is tolerated.
- Only lines whose first non-whitespace character is `{` are parsed.
- Markdown fence markers and prose are ignored.
- JSON objects inside Markdown fences are still parsed because their lines begin
  with `{`.
- UTF-8 and UTF-8-with-BOM files are supported.
- Blank lines count as physical input lines but are not parsed as candidates.
- Missing files and malformed candidate JSON are reported without aborting the
  remaining batch.
- Errors include both the source file and one-based line number.

Example error format:

```text
data/chatA.txt:42: adult_count must be an integer between 0 and 15
```

## Validation behavior

Every candidate must be a JSON object and include:

- `id`
- `text`
- `triage_priority`
- `hazard_class`
- `rescue_status`
- `adult_count`
- `pediatric_count`
- `medical_flags`
- `is_third_party`
- `language`

Additional validation:

- `id` and `text` must be non-empty strings.
- Priority, hazard, status, and language must exactly match their vocabularies.
- Adult and pediatric counts must be integers from 0 through 15.
- Booleans are explicitly rejected as counts even though Python's `bool` is a
  subclass of `int`.
- `medical_flags` must be a list.
- Every medical flag must be one of the eight allowed values.
- `is_third_party` must be an actual Boolean; values such as `0`, `1`, and
  strings are rejected.
- All validation errors found for a candidate are printed; processing continues
  with the next line.
- The invalid-line count increases once per invalid candidate line, even when
  that line contains several field errors.

## Transformations and duplicate handling

For every valid accepted record:

- The identifier becomes `chat_<writer>_<original id>`.
- `medical_flags` is deduplicated and sorted.
- `writer` is overwritten with the CLI writer value.
- `label_version` is overwritten with the CLI label version.

Duplicate suppression applies after prefixing:

- Duplicate identifiers within the current batch are skipped.
- Identifiers already present in the output JSONL are skipped.
- Duplicate rows are not treated as validation errors.
- Existing output is opened in append mode and is never replaced.

Example:

```text
chatA_001 + --writer chatbot -> chat_chatbot_chatA_001
```

## `--check` report

Check mode performs all parsing, validation, transformation, and duplicate
suppression, but never appends to `raw.jsonl`.

The report contains:

1. Valid unique rows versus total physical input lines.
2. Counts and percentages for every priority.
3. Counts and percentages for all 16 hazards.
4. Counts and percentages for every rescue status.
5. Counts and percentages for every language.
6. Word-count minimum, median, and maximum.
7. Word-count histogram buckets: `0-4`, `5-15`, `16-40`, `41-80`,
   and `81+`.
8. Every intra-batch pair with a `difflib.SequenceMatcher` ratio strictly
   greater than 0.70.
9. Every candidate/Appendix A pair with a similarity ratio strictly greater
   than 0.55.

Similarity matching is case-insensitive. The implementation compares every
candidate text with every benchmark test message; it does not stop after the
first match.

## Functions added

### `_names(value)`

Normalizes a shared vocabulary to a tuple. When the shared value is a mapping,
its keys are used as the label names.

### `read_jsonl(path)`

Yields JSON objects from a JSONL file. It uses `training.common.read_jsonl`
when available and otherwise uses the local UTF-8 implementation. Blank lines
are ignored, and non-object JSON values raise a line-specific `ValueError`.

### `append_jsonl(path, rows)`

Appends normalized JSON objects to a JSONL file. It delegates to
`training.common.append_jsonl` when present. The fallback creates parent
directories, writes UTF-8, preserves non-ASCII text, sorts keys for stable
output, and writes one object per line.

### `validate_record(record)`

Returns a list of all schema and vocabulary errors for one decoded candidate.
It performs no mutation.

### `transform_record(record, writer, label_version)`

Copies a valid record, prefixes its ID, sorts/deduplicates medical flags, and
sets writer/version metadata.

### `parse_files(files, ...)`

Reads all source files and returns:

```python
(valid_unique_rows, physical_input_lines, invalid_line_count)
```

It reports malformed or invalid candidates to the supplied error stream and
continues processing.

### `similarity_ratio(left, right)`

Returns a case-insensitive `difflib.SequenceMatcher` ratio.

### `find_near_duplicates(rows, threshold=0.70)`

Performs pairwise comparison within the accepted batch and returns every match
strictly above the threshold as:

```python
(left_id, right_id, ratio)
```

### `benchmark_texts(path)`

Loads benchmark IDs and text. If rows contain a `split` field, non-test rows
are excluded; Appendix A rows without a split field are included.

### `find_benchmark_contamination(rows, benchmark_path, threshold=0.55)`

Compares every candidate against every benchmark message and returns all pairs
strictly above the threshold.

### `_word_bucket(count)`

Assigns a word count to the report's histogram bucket.

### `build_check_report(rows, input_lines, benchmark_path)`

Builds the complete human-readable pre-import report without writing files.

### `import_files(files, ...)`

Coordinates existing-ID loading, parsing, validation, check-mode reporting, and
normal append behavior. It returns the accepted rows and invalid-line count.

### `build_parser()`

Defines the positional input files and the `--writer`, `--label-version`, and
`--check` options.

### `main(argv=None)`

Validates the writer argument, invokes the import, and returns:

- `0` when no invalid input lines were encountered.
- `1` when malformed/invalid lines or output-reading failures occurred.
- `2` when `--writer` is empty or argparse rejects the command.

## Test coverage

The suite verifies:

- Prose and Markdown fences are skipped without crashing.
- JSON inside a Markdown code block is still imported.
- Malformed JSON reports the correct file and line.
- Invalid priority labels are rejected.
- Invalid hazard labels are rejected.
- Invalid rescue status labels are rejected.
- Invalid language labels are rejected.
- Negative counts are rejected.
- Counts above 15 are rejected.
- Boolean counts are rejected.
- Non-Boolean third-party values are rejected.
- Unknown medical flags are rejected.
- Non-list medical flags are rejected.
- IDs are prefixed with the selected writer.
- Writer and label version metadata are set.
- Duplicate IDs within a batch are skipped.
- IDs already in the output JSONL are skipped without changing the file.
- Medical flags are sorted and deduplicated.
- Check mode produces its report without creating the output file.
- Similarity above 0.55 is detected against Appendix A.
- Every benchmark row is considered.
- A similarity equal to 0.55 is not flagged.
- Intra-batch similarity above 0.70 is detected.

Some checks are parameterized, resulting in 20 collected pytest cases.

## Development history

Work was performed on `track/t3-dashboard-data` and merged through PR #1.

Notable commits before the squash merge:

- `ce2316c43bf19e07b3dd9e0de2189558f1b463c0` — importer implementation
- `de302139568785d23e7f6a0f1743e46ed2374a42` — importer tests
- `bb97c0ac57a2b4e7601a44596042bf6b074a15e2` — shared-vocabulary compatibility fix
- `781cca7a0b7c00719bd82b466ac86555d22dfea9` — importer CI workflow

The PR was squash-merged as
`2398db1cb4a4cd2b29fccaa82e57ba9dc241f10a`.

## Errors and blockers encountered

### Original repository was not available to the connector

The requested source repository, `Brian23443/civicmesh-sos`, returned GitHub
API 404 responses. The connected GitHub App installation belonged to
`TejasSureson` and only covered repositories owned by that account, even
though its setting said "All repositories."

Resolution: the user forked the repository to
`TejasSureson/civicmesh-sos`, after which the GitHub connector had full
read/write access.

### Local checkout could not execute processes or accept patches

The desktop execution environment failed before command creation with:

```text
Failed to create unified exec process:
helper_unknown_error: setup refresh had errors
```

The same setup error affected PowerShell, cmd.exe, Python, Node, browser
automation, and the local patch service. No local checkout files were modified.

Resolution: repository changes were made through the GitHub API on the fork.

### Remote Vercel sandbox fallback was unavailable

An attempted remote Python sandbox run returned a 403 because the connected
Vercel identity was not authorized for the selected project scope.

Resolution: a repository-local GitHub Actions workflow was added and used for
the authoritative Python 3.13 pytest run.

### Test-file upload initially hit a JavaScript quoting error

The test source contains Markdown triple-backtick markers. During API payload
construction, those backticks prematurely terminated an internal JavaScript
template string.

Resolution: the test fixture expresses the backtick character as `\x60`;
Python evaluates it to the intended Markdown fence at test runtime. This does
not alter importer behavior.

### Shared hazard fallback had an eager-default edge case

The first implementation used a nested attribute expression as the default
argument to `getattr`. Python evaluates default arguments eagerly, which
could raise `AttributeError` if a future `training.common` exported only
`HAZRAM_NAMES`.

Resolution: the importer now fetches `HAZRAM_NAMES` first and reads
`HAZARD_DESCRIPTIONS` only when necessary. This was fixed before pytest and
before the PR was merged.

## Remaining follow-up

The importer is complete under the current Track 3 contract. One planned
integration cleanup remains:

- When Track 1 adds `training/common.py`, confirm the exact JSONL helper
  signatures and remove the marked local fallback vocabulary block if the team
  wants Contract K6 to become a hard dependency.

Before importing the real 310-row chatbot batch, run `--check`, review every
Appendix A match and near-duplicate, and rewrite or drop flagged rows. The
benchmark dataset must never be imported into training data.
