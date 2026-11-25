# Test suite review — 25 November 2026

Reviewed against `7d6c74d` (including the practice demo), before the next release.
No production code or release requirements changed.

## Measurements and decisions

The full local Python suite passed **1,280 tests in 8.53 seconds**. No exact
Python test-body duplicates were found. Storage, migrations, transactions,
permissions, calculations, backups and notification transitions remain intact.
Deleting these fast tests would save little and could lose important failure
coverage. Architecture source contracts and browser behavior checks protect
different layers; a shared feature name alone does not make them duplicates.
Some older source-string UI checks are candidates for replacement when those
components change, rather than adding more implementation-specific assertions.

The previous full browser run on the same application HEAD passed 1,812
executions in **7.0 minutes** with two local workers. The revised matrix passed
1,319 executions in **2.8 minutes** with four workers on the same Mac. That is
27.2% fewer executions and about 60% less elapsed time, from both narrower tablet
coverage and more parallelism. This is a local observation, not a CI benchmark
or an isolated measurement of either optimization.

| Browser profile | Before | After |
| --- | ---: | ---: |
| Chromium desktop | 564 | 567 |
| WebKit iPhone | 434 | 436 |
| WebKit iPad portrait | 407 | 158 |
| WebKit iPad landscape | 407 | 158 |
| Total executions | 1,812 | 1,319 |
| Unique scenarios, including parameter combinations | 576 | 576 |

No test callbacks or assertions were removed or weakened. All previous Chromium
and iPhone cases remain. Two previously phone-only download cases now also run
in Chromium, and Behavior/Temperature save flows gained iPhone coverage.

## Tablet selection

Reviewed all 246 originally tablet-tagged declarations. Removed tablet tags
from browser-independent API routing, permissions/privacy, persistence, stale
response handling and exhaustive owner/category combinations that already run
on the relevant desktop/phone engines. These still run outside the tablets.

Retained actual geometry, responsive overflow, scrolling, focus, keyboard and
viewport assertions on both tablet orientations. Also retained representative
dialog, editor, navigation and composed-card flows. Parameterized recurring-care
surfaces retain all puppy variants and all owner scopes in the Reminders surface;
shared follow-up and feeding forms retain representative puppy tablet cases.
Every owner combination remains on its existing Chromium/iPhone profiles.

Tag decisions stay beside each test; there is no hidden file exclusion list.
See [test ownership](../tests/README.md#test-ownership) before adding new tags.

## Scheduling and diagnostics

The last completed CI available during review had browser steps of 268, 355,
564 and 457 seconds ([reference run](https://github.com/aranaformae/HA_PuppyTracker/actions/runs/42628871147)).
That older commit is evidence of imbalance, not a runtime baseline for the new
application HEAD. Four file-level/global shards could concentrate large files
or slower WebKit work in one job.

Each CI job now runs one quarter of every configured browser profile, with
independent tests distributed within files. Each project has its own report and
output directory; failures do not prevent the other profiles from being checked.
The generated shard lists contain 331, 331, 329 and 328 executions; their union
contains every execution exactly once. A complete local run of the first shard
passed all 331 checks through the new runner. Counts are balanced; individual
test durations can still differ. Four CI jobs and one worker per job remain. No release gate or backend version
has been dropped. New unit checks protect shard arguments, future profiles,
failure propagation and diagnostic isolation.

Local parallelism is half the available CPU count, capped at four workers.
Tests use independent contexts and mocked backends; the review found no
file-level before/after hooks, serial groups or mutable cross-test state.
Use a lower explicit `--workers` limit on constrained machines. CI timing and
flakiness under repeated runs still need observation after pushing; automated
WebKit does not replace actual iPhone/iPad/Companion App verification.

## Verification of this change

- Full revised browser matrix: 1,319 passed in 2.8 minutes.
- Backend recheck after workflow edits: 1,280 passed in 9.94 seconds.
- Release-gate and shard-runner Node tests: 30 passed.
- All 397 declared browser callbacks match HEAD byte for byte; parameter loops
  still expand to the same 576 unique scenarios.
- Markdown links/anchors, JSON/YAML examples and workflow YAML parse successfully.
