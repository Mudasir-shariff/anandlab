# Labflow deployment, backup and recovery

These tools add verifiable operational controls to the self-hosted application. They do not certify clinical validity, legal compliance, accreditation, security or parity with a commercial LIS. The hosted Sites preview is still a separate demonstration unless its backend is explicitly migrated. Run the shared server on one managed Linux host, private cloud VM or container with a persistent local disk; every workstation and phone uses the same HTTPS origin.

The isolated100-patient/eight-client workflow is measured in [BENCHMARK.md](BENCHMARK.md). This is not a production capacity guarantee. The intended starting workload is a laboratory handling approximately 100 patients per day. Capacity at that workload still requires a representative load test, real report/PDF validation and monitoring on the chosen hardware. SQLite uses WAL and supports concurrent clients through one server process. Do not put the database on a network filesystem, run multiple writable replicas, or treat the container image as durable storage.

## Deployment

Node.js 24 or newer is required. Runtime npm packages are not needed. The included Dockerfile and Compose configuration use a non-root service account, read-only application filesystem, restricted capabilities, bounded logs and separate persistent data/backup volumes. The Docker image was built and an isolated local container smoke test verified UID1000, read-only application files, protected clinical APIs, named sessions, registration, mode0600 database files and persistent data across restart. Host-specific TLS, storage, monitoring and clinical acceptance remain operator tasks.

Set `LAB_PUBLIC_ORIGIN` to the exact externally reachable HTTPS origin, without a trailing slash. Bootstrap the first named administrator with `LAB_USER` and a unique `LAB_PASSWORD` of at least 16 characters through the deployment secret manager. Never put actual secrets in Git, this document, shell command arguments or the downloaded source archive. After named staff are initialized, bootstrap credentials need not remain in the running process environment.

```sh
docker compose build
docker compose up -d
docker compose ps
```

The Compose service binds port 3000 only to the host's loopback interface. Place a managed TLS reverse proxy in front of it. For a Caddy installation on that host, adapt this configuration using your real DNS name and certificate provisioning:

```caddyfile
lab.your-domain.in {
  reverse_proxy 127.0.0.1:3000
}
```

Check that external HTTP redirects to HTTPS, the certificate validates, unauthenticated clinical APIs return 401, and authenticated write requests use the configured same origin. The process health check establishes only that the application answers a liveness request; it does not establish database recoverability, clinical readiness or functioning analyzers.

Create distinct reception, technician, pathologist, billing and administrator identities as appropriate. Leave independent review enabled and legacy Basic-auth compatibility disabled. Never operate a shared installation with `LAB_DEMO=1`. Use encrypted host storage, restricted OS service permissions, a host firewall, monitored disk space and your institution's retention policy. The application does not encrypt the live SQLite database itself.

## Consistent encrypted backups

`node scripts/backup.mjs` uses SQLite's native online backup API to capture the entire database consistently while WAL writes may be occurring. It preserves durable staff accounts, report/catalog snapshots and audit tables as well as orders and settings. The snapshot is encrypted with AES-256-GCM and a scrypt-derived key; random salts and IVs are generated for every backup. No plaintext SQLite snapshot is published as a backup artifact. Private temporary snapshots are removed after completion or failure. Output is written atomically to a new mode-0600 `.lfbackup` file.

Configure:

| Environment setting | Purpose |
| --- | --- |
| `LAB_DATA_DIR` | Existing data directory containing `labflow.sqlite` |
| `LAB_BACKUP_DIR` | Private directory receiving encrypted backups |
| `LAB_BACKUP_PASSPHRASE` | Unique passphrase of 20–1024 characters, loaded from a secret manager |

The encrypted backup can only be recovered with its passphrase. Keep the recovery secret in a separate protected store and test that your designated recovery operator can retrieve it. Losing the passphrase loses access to these backups. Do not reuse a staff login password as the backup key.

```sh
node scripts/backup.mjs
```

For Compose, export the secret in the administrative shell through the secret manager, then pass the environment variable by name:

```sh
docker compose exec -T -e LAB_BACKUP_PASSPHRASE labflow node scripts/backup.mjs
```

The command prints a backup filename, ciphertext SHA-256, creation time and size. It does not print credentials or patient rows. A local encrypted backup on the same physical disk is not disaster recovery. Copy completed backups to a separate encrypted and access-controlled offsite location, monitor job failures and define retention/deletion with the lab. These scripts never silently delete older backups. Schedule the job using the host's service manager; no schedule is installed automatically by this package.

## Verify every recovery path

Run an isolated recovery check after a backup and periodically from the offsite copy. The check authenticates and decrypts the backup into a private temporary directory, runs full SQLite integrity checks, validates required tables and each order's stored identity/version, records table counts, then removes the temporary database.

```sh
node scripts/restore-check.mjs /secure/backups/labflow-TIMESTAMP.lfbackup
```

The secret remains in `LAB_BACKUP_PASSPHRASE`, never a positional argument. The check writes a protected receipt to `LAB_BACKUP_DIR/restore-check.json`, or `LAB_RESTORE_RECEIPT` if configured. The receipt binds its success to the encrypted backup's exact SHA-256 and records a verification time. Changing the backup invalidates that receipt. A check that simply lists a backup file is insufficient.

To recover service data, stop the application and restore into a **new directory**:

```sh
node scripts/restore-check.mjs /secure/backups/labflow-TIMESTAMP.lfbackup --restore-to /var/lib/labflow-recovered
```

Existing directories and database files are never overwritten. Restoration preserves named staff and report history, adds a restore audit entry and revokes all captured sessions so users must sign in again. Reconfigure `LAB_DATA_DIR` to the recovered directory, review restored staff access, start the service and verify representative reports and record totals before reopening clinical work. Keep the original database untouched until the recovery is accepted. JSON exports from `/api/backup` remain available, but they are not a substitute for this complete encrypted database backup if that API omits staff or later database tables.

With `NODE_ENV=production`, the server also blocks report release until `LAB_CLINICAL_VALIDATION_FILE` names a valid operator record matching the exact catalog hash. This is a fail-closed configuration control, not an independent clinical assessment. Restart the service after approved catalog or validation-record changes.

## Local readiness gate

```sh
node scripts/check-readiness.mjs
```

This produces a JSON report and exits with status 1 when any required control is blocked. It checks the Node version, disables evaluation/legacy auth bypasses, requires an HTTPS-origin configuration and independent review, inspects private/writable data storage and minimum free space, runs database integrity/identity checks, requires named admin/technician/pathologist accounts, and binds a recent successful restore receipt to the protected encrypted backup file.

It also requires explicit local evidence for work automation cannot establish:

- `LAB_A4_PRINT_VALIDATED=1` may be set only after a lab operator checks actual PDF and A4 print layout on the deployed system.
- `LAB_CLINICAL_VALIDATION_FILE` must point to the lab's local validation record for the exact deployed catalog. Its JSON format is `labflow-clinical-validation-v1`, with `approvedBy`, ISO `approvedAt`, and the SHA-256 of `dist/catalog.js` as `catalogSha256`. Generate this record only after qualified staff validate the methods, units, applicable population intervals and report procedures. It is an operator attestation, not proof that a clinical validation was actually performed.
- If analyzer or delivery connections are mandatory, declare their identifiers in comma-separated `LAB_REQUIRED_INTEGRATIONS`. The current check keeps that gate blocked because this package cannot certify unimplemented or unvalidated external connections. Do not clear the declaration merely to make a report say ready.

Optional controls are `LAB_MIN_FREE_BYTES` (default 1 GiB), `LAB_MAX_RESTORE_AGE_HOURS` (default 168 hours), and `LAB_RESTORE_RECEIPT`. A seven-day restore receipt is an initial engineering default, not the institution's recovery policy. Choose recovery point/time objectives with the lab, keep at least daily offsite backups when appropriate and validate the chosen schedule operationally.

A passing result means the listed local technical checks and attestations passed at that time. It does not prove live TLS reachability, browser output, instrument interfaces, WhatsApp/email delivery, capacity, cybersecurity, regulatory compliance or clinical validity. Repeat the gate after deployment/configuration changes and monitor it; do not use a past successful check as a permanent approval.

## Analyzer and messaging limits

“All analyzers” is not one protocol. Every analyzer model, firmware, physical connection, message protocol, analyte mapping, units, flags, patient/sample ID matching and acknowledgement behavior needs a validated interface. A connector that merely accepts arbitrary JSON is not evidence of instrument interoperability. For delivery, approved provider accounts, patient consent, templates, authenticated callbacks, retries and delivery-state reconciliation are required. Provider credentials and real equipment must be configured and exercised before these can be cleared as go-live requirements.

## Verified scope

`node --test test/ops.test.mjs` tests a live-WAL backup, encrypted recovery with report metadata and named staff, session revocation on actual restore, wrong-key/tamper rejection, refusal to overwrite files/directories, preservation of the source database, and readiness gates. These checks use isolated temporary databases and do not modify lab records. The operations unit tests do not execute Docker or certify physical printers or remote providers. `scripts/container-smoke.mjs` separately checks the locally built `labflow-verification:1.3` image with isolated disposable volumes; set `LAB_DOCKER_HOST` only when an explicit Docker endpoint is needed.
