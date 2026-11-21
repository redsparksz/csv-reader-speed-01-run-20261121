# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/redsparksz/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/redsparksz/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: reads broken CSV files with exactly csv-reader's answers (`{columns, rows, errors}`), about 5x faster on the practice set. Most records are taken whole-line at once (slice + `split(',')`); records holding a quote or a stray CR take an `indexOf`-based field parser that mirrors csv-reader's broken-row policy character for character — BOM, CRLF/LF, stray CRs, doubled quotes, embedded line breaks in quotes, quote junk, unterminated quotes, short/long rows. Dependency-free ES module, no WASM, no native code.

## Run it

```sh
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=output node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=dz7nf39t&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
