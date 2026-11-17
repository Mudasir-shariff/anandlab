# Local laboratory validation record

Do not mark a catalog validated merely to remove a release block. A qualified laboratory must perform and document acceptance against its own methods, units, applicable intervals, specimen procedures and report formats.

After actual acceptance, create `clinical.json` locally in this directory (or set `LAB_CLINICAL_VALIDATION_FILE` to a protected file elsewhere). It is deliberately not included in the downloadable package or Git. The JSON requires:

- `format`: `labflow-clinical-validation-v1`
- `approvedBy`: the actual responsible reviewer's name
- `approvedAt`: the actual approval time as an ISO8601 timestamp
- `catalogSha256`: SHA-256 of the exact deployed `dist/catalog.js`

You can obtain the catalog fingerprint with `sha256sum dist/catalog.js`. Record the fingerprint in the lab's acceptance evidence. The application matches the record to the deployed file; it does not verify medical qualifications, a cryptographic signature, accreditation or the underlying clinical work.

Compose mounts this directory read-only at `/app/validation`. Its production server does not release reports while the record is missing, invalid or out of date. Do not include passwords, patient data or private acceptance attachments in the source archive.
