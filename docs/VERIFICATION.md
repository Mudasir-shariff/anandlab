# Engineering verification — 15 November 2026

The source passed `npm run check` and all44 automated tests in `npm test`, with no failed, skipped or cancelled tests. The suite includes real HTTP/session/role tests, clinical approval and specimen/QC rules, atomic mapped imports, blocked delivery requests, encrypted backup recovery, historical data compatibility, actual CSS scope checks,45 panel/layout DOM combinations, named staff login and negative save/conflict regressions.

The100-patient workload completed500 clinical writes at8 concurrent requests, producing100 independently approved reports with0 unexpected request failures and an `ok` SQLite integrity check. [BENCHMARK.md](BENCHMARK.md) records exact local measurements and scope.

The Docker image was built and an isolated smoke test verified non-root UID1000, read-only application code, protected clinical APIs, named sessions, registration, mode0600 SQLite files and persistence across a container restart. No existing lab data was used; test containers and volumes were disposable.

Source archives are checked for ZIP integrity and contain a SHA256 manifest of their source files. Credentials, databases, backups, local validation records, tool state, Git authentication and installed modules are excluded. Development dependencies can be reproduced with `npm ci`; runtime needs Node.js24+ and its built-in modules.

Unverified external behavior remains explicit: real browser visual output, physical A4 print margins, label stock/scanners, live TLS on the selected host, instrument protocols/models, WhatsApp/email transport and receipts, and clinical/legal acceptance. Production report release is blocked without a lab validation record matching the deployed catalog. Technical tests and an operator attestation are not certifications or a replacement for a shadow pilot.
