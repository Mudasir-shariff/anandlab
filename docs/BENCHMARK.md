# Isolated workload verification

Checked 2026-11-15T10:11:37.374Z. This is measured engineering evidence from this workspace, not a production SLA or a clinical/device acceptance test.

| Measurement | Result |
|---|---:|
| Fictional patients | 100 |
| Concurrent requests | 8 |
| Clinical write operations | 500 |
| Unexpected failed requests | 0 |
| Independently approved reports | 100 |
| Total measured workflow | 1194.08 ms |
| Write latency p50 / p95 / p99 | 11.9 / 20.6 / 23.7 ms |
| SQLite integrity | ok |
| Stale write rejection | HTTP 409 |

The script starts an isolated Node.js24 server with a temporary SQLite database, creates separate administrator, technician and pathologist sessions, then registers100 TSH orders and advances each through collection, processing, review and independent approval. It checks exact stored counts, unique IDs, version5 for every release, results, specimen receipt, release snapshots and independent entrant/reviewer identity. A stale update must fail409. The database is integrity-checked and the temporary server/data are removed.

Run `npm run benchmark` to reproduce it. The machine-readable result goes to `work/benchmark-result.json` and is not clinical data. The test does not target your live database.

Environment: v24.22.1, 3 exposed logical CPUs, local HTTP/SQLite. Storage and scheduling are shared infrastructure. No analyzer, WhatsApp, email, browser, A4 printer, scanner, remote network or sustained retention workload was exercised. Report rendering/PDF generation is covered separately by semantic/DOM checks, not by this API timing measurement.

100 patients per day is the initial design target. Representative panels, report sizes, concurrent staff, network outages, backups and long-term retention still need a staging/shadow pilot on the selected hardware before an operating commitment. No guaranteed capacity, uptime, RPO or RTO is inferred from this result.
