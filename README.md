# Labflow 1.3

A responsive laboratory workspace for desktop, tablet and mobile. It connects patient registration, individually identified specimens, result entry, independent review, reports, invoices and operational controls.

**Deployment status:** the private Sites publication remains a browser-local fictional demonstration. The included Node.js/SQLite server is the shared deployment application. The package is an engineering release candidate; it is not a clinically validated LIS, a certified product, or a live connection to every analyzer.

## What works

- Fifteen starter panels; three A4 report layouts; units, intervals and H/L flags
- Approved reports freeze patient results, laboratory profile, panel definitions, units and intervals
- Named staff accounts with server-enforced admin, reception, technician, pathologist, billing and auditor permissions
- Scrypt password hashes, revocable HttpOnly/SameSite sessions and independent reviewer enforcement
- Individual specimen IDs, separate fasting/postprandial specimens, Code39 labels, rejection and recollection with replacement IDs
- Lab-configured QC evidence/release holds and critical-result notifications with read-back and result fingerprints
- Atomic, mapped analyzer CSV imports with unit checks, provenance and durable run replay protection; imports remain drafts
- Consent-backed delivery requests explicitly blocked while provider connections are absent
- Partial payments, version conflict protection, audit history, full-database search and bounded initial worklists
- Consistent AES-256-GCM encrypted SQLite backups, isolated restore verification and a fail-closed readiness command
- Non-root Docker/Compose scaffolding with persistent volumes

## Run locally

Requires **Node.js 24 or newer**. Runtime uses Node's built-in modules; no runtime npm dependencies are needed.

For an unauthenticated, empty, loopback-only evaluation:

```sh
LAB_DEMO=1 npm start
```

Open `http://127.0.0.1:3000`. Evaluation mode is not suitable for real patient data or network deployment.

For a shared installation, create a protected environment file outside the source tree with `LAB_USER`, a unique `LAB_PASSWORD` of 16–256 characters, `LAB_DATA_DIR`, and the exact HTTPS `LAB_PUBLIC_ORIGIN`. Then run:

```sh
node --env-file=/secure/path/labflow.env server.mjs
```

The first startup creates one administrator; subsequent startups do not reset staff passwords. Sign in, add separate staff accounts, and leave independent review enabled. Use an HTTPS reverse proxy. See [SELF-HOSTING.md](SELF-HOSTING.md) and [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Verify

```sh
npm ci
npm run check
npm test
npm run benchmark
npm run readiness
```

`npm ci` installs development-only jsdom for interaction regressions. Tests use temporary databases and fictional records. The benchmark uses 100 fictional patients, eight concurrent clients and separate result-entry/reviewer accounts. Read [docs/BENCHMARK.md](docs/BENCHMARK.md) for measured results and limits.

## Documentation

- [Research and comparison](docs/COMPETITOR-COMPARISON.md)
- [Deployment, encrypted backups and recovery](docs/OPERATIONS.md)
- [Analyzer mapping, unsent delivery intents and labels](docs/INTEGRATIONS.md)
- [Self-hosting and API reference](SELF-HOSTING.md)
- [Workload verification](docs/BENCHMARK.md)
- [Engineering verification and limits](docs/VERIFICATION.md)

## Required before clinical go-live

A qualified Indian laboratory must validate its catalog, age/sex-specific intervals, methods, critical thresholds, specimen procedures, control policy, report printouts and authorization rules. Configure and independently test the actual server, encrypted storage, backups, retention, monitoring and staff access. Run a shadow pilot against the existing process and document acceptance.

CSV mapping is not a universal ASTM/HL7/serial/TCP interface. Actual instrument models, middleware and acceptance files remain required. WhatsApp/email provider transport, secure patient download links and provider callbacks are not implemented; queued requests are not sent. Multi-branch tenancy, longitudinal patient/visit management, report amendments/reissues, automatic clinical delta rules, full QC charting/calibration, MFA/enterprise SSO and external tamper-resistant audit storage remain product gaps.

The readiness command reports technical checks and operator attestations. It does not establish legal compliance, NABL accreditation, clinical validity, physical printer/scanner compatibility, or competitor parity. Do not enter real patient information into the hosted demo.
