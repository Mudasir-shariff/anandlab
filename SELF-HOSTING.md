# Labflow shared deployment and API

The published Sites version is a device-local fictional demonstration. Deploy `server.mjs` on one managed host/private cloud VM with a persistent local disk for shared laboratory records. All phones and desktops connect to the same HTTPS origin. SQLite WAL supports concurrent requests through this one server process; do not place the database on a network filesystem or horizontally scale writable replicas.

## First setup

Requires Node.js24+. Create a service-account-owned environment file outside the source checkout, mode0600:

```dotenv
NODE_ENV=production
LAB_USER=your-administrator-username
LAB_PASSWORD=replace-with-a-unique-password-at-least-16-characters
LAB_HOST=127.0.0.1
PORT=3000
LAB_DATA_DIR=/var/lib/labflow
LAB_BACKUP_DIR=/var/backups/labflow
LAB_PUBLIC_ORIGIN=https://lab.your-domain.in
LAB_REQUIRE_INDEPENDENT_REVIEW=1
LAB_CLINICAL_VALIDATION_FILE=/secure/labflow/clinical.json
LAB_ALLOW_BASIC=0
```

Replace placeholders locally; do not commit secrets. Create data/backup directories owned by the unprivileged service user, mode0700. Start:

```sh
node --env-file=/secure/path/labflow.env server.mjs
```

The first administrator is bootstrapped only when the staff table is empty. Startup does not reset existing accounts. Staff access uses individual sessions, not a shared Basic login. `LAB_ALLOW_BASIC=1` exists for explicit legacy tests and is rejected by production readiness checks. Public static assets render the login page; clinical APIs require authentication. Configure TLS using a managed reverse proxy and the exact `LAB_PUBLIC_ORIGIN`.

`LAB_DEMO=1 node server.mjs` is an unauthenticated loopback-only evaluation server. It starts empty and never imports browser demonstration records. Do not use it for shared production.

## Staff and release authority

| Role | Permitted operations |
|---|---|
| Admin | Staff/configuration, operational controls and lab workflows; independent review still applies |
| Reception | Register/edit patients, collect specimens |
| Technician | Process specimens, enter/review draft results, record QC evidence |
| Pathologist | Review/correct results and authorize release; record critical notifications |
| Billing | View orders and record payments |
| Auditor | Read orders and audit history |

Passwords are scrypt-hashed with independent salts. Only token hashes are retained for sessions; cookies are HttpOnly, SameSiteStrict and Secure for an HTTPS configured origin. Disable, password reset or role changes revoke active sessions. The last active administrator cannot be disabled or demoted. Staff CLI: `node scripts/manage-users.mjs` prints usage; passwords go through stdin, never command arguments.

Results record the named entrant. With the default independent-review rule, that same user cannot release their own results. A reviewer changing results becomes the latest entrant and requires another reviewer. Configured QC holds, rejected/unreceived specimens and unacknowledged critical findings block release. Absence of configured QC/critical policy is a visible warning, not a successful QC result. Lab acceptance must establish those policies before use.

## API

JSON write requests require matching `Origin` and `Content-Type: application/json`. Every mutation is authorized server-side. Stale expected versions return409; invalid input422; unauthenticated401; unauthorized403. Request bodies are bounded to1MiB.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Public process liveness; not go-live readiness |
| POST | `/api/login` | Named credentials, session cookie |
| GET / POST | `/api/session`, `/api/logout` | Current staff permissions / revoke session |
| GET / POST | `/api/users` | Admin lists/creates staff |
| PATCH | `/api/users/:id` | Admin disables, changes role or resets password |
| GET | `/api/state` | Latest250 orders, workspace totals and recent activity |
| GET | `/api/orders?q=...` | Full-database search, up to100 matches; refine if truncated |
| POST | `/api/orders` | Register a patient/order |
| PUT | `/api/orders/:id` | Whole-order update with `expectedVersion` |
| GET | `/api/orders/:id/release-check` | Specimen, QC, critical and reviewer release conditions |
| POST | `/api/orders/:id/specimen` | collect/receive/reject/recollect with specimen ID, expectedVersion and reason where required |
| POST | `/api/orders/:id/critical-acknowledgments` | Document completed notification/read-back for current result fingerprint |
| GET / PUT | `/api/quality-controls`, `/api/quality-controls/:code` | Read/record versioned control-run evidence |
| PUT | `/api/settings` | Admin updates whitelisted laboratory-profile fields |
| GET | `/api/audit` | Authorized clinical and staff activity history |
| GET / POST | `/api/instruments` | Admin lists/records explicit analyzer mappings |
| PATCH | `/api/instruments/:id` | Versioned enable/disable |
| POST | `/api/analyzer-imports` | Atomic mapped CSV draft import, no automatic approval |
| POST | `/api/orders/:id/delivery-intents` | Approved report + recipient consent; explicitly blocked without provider |
| GET | `/api/deliveries` | Admin views queue state |
| GET | `/api/readiness` | Admin-only cached local engineering checks |
| GET | `/api/backup` | Clinical JSON export; does not replace complete encrypted backups |

The initial worklist is bounded; search reaches older orders. Dashboard headline counts query the whole database. Worklist charts and invoice summaries explicitly reflect loaded records. The application polls the shared state every15 seconds while idle and protects conflicting edits with versions.

## Data and reports

Orders advance Registered→Collected→Processing→Review→Approved. Review may return to Processing for correction before release. Sample replacement creates a new specimen barcode; rejected identifiers are retained in provenance. Collection/receipt times are explicitly recorded, not fabricated from print time. Critical acknowledgments bind to result revision and specimen identity; changing either invalidates the prior acknowledgment.

Approved clinical content is locked. `reportSnapshot` freezes the lab profile and `catalogSnapshot` freezes ordered definitions, analyte names/units/limits/reference text and explanatory notes. Billing retains those snapshots and original totals. Historical records without snapshots are labeled as such; the application does not invent prior metadata. Report amendments/reissues need a dedicated future versioning workflow and are not implemented here.

A typed staff name is not a verified digital signature. No fake QR or handwriting is generated. Code39 label generation must be accepted on the lab's actual printer/stock/scanner at100% scale.

## Recovery and operational acceptance

Use the encrypted whole-database backup/restore tools in [OPERATIONS.md](docs/OPERATIONS.md). They retain staff, quality controls, analyzer mappings, import identities, report requests, clinical snapshots and audit data; recovery revokes old sessions. The older JSON export/restore is for clinical portability and omits account/configuration tables. Do not copy only the main SQLite file while WAL writes are active.

Use full-disk/storage encryption, secure off-site backup, institutional retention/deletion rules, monitoring and access controls. Read [the research comparison](docs/COMPETITOR-COMPARISON.md) and [benchmark evidence](docs/BENCHMARK.md). The package has not established clinical validity, legal compliance, accreditation, physical A4/scanner compatibility, universal analyzer compatibility or live WhatsApp/email delivery.
