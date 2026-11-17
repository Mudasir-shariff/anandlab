# Labflow: research, competitive comparison and go-live scope

Reviewed14–15 November2026 for a laboratory in India targeting approximately100 patients/day. Public vendor pages and operational documentation were reviewed; no commercial product was installed or benchmarked. Advertised features are not independently established reliability, clinical validity, contractual availability or certification. “Not established” means the cited pages did not demonstrate a detail.

## Primary sources

1. [CrelioHealth laboratory testing](https://creliohealth.com/lims/laboratory-testing/laboratory-testing-software): specimen custody, instruments, report validation, critical findings and delivery.
2. [CrelioHealth QC help](https://help.creliohealth.com/support/solutions/articles/82000921172-qc-result-wise-validation-help-guide): reviewer decisions on incoming control results; configuration is required.
3. [MocDoc LIMS](https://mocdoc.com/lab-management-software): barcode lifecycle, machine transfer, delta checks, approval, dispatch and multiple sites.
4. [Labsmart reporting](https://www.labsmartlis.com/features/lab_reporting) and [employee accountability](https://www.labsmartlis.com/employee-accountability): configurable reports/reference data, staff permissions, activity history and sharing.
5. [SENAITE features](https://www.senaite.com/features/): state-aware roles, independent verification, quality controls, instrument state and PDF publication. It is a broader laboratory LIMS; clinical patient-workflow equivalence is not assumed.
6. [MeitY DPDP rules and enforcement documents](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025) and [NABL medical laboratories](https://nabl-india.org/medical-testing-laboratories-iso-15189/): official Indian references for the lab’s legal/quality review. DPDP commencement is staged. The lab needs advice for its actual obligations and dates; software features do not create NABL accreditation.

## Compared capabilities

| Capability | Established products describe | Labflow1.3 implementation | Still required / not claimed |
|---|---|---|---|
| Report generation | Labsmart: configurable forms, intervals and sharing; others: validation/publishing |15 starter panels,3 styles, snapshots of released values/definitions/profile, readable draft labels, structured review |Lab-approved age/sex/method intervals, real A4/PDF acceptance, narrative/microbiology panels, corrected report versions |
| Staff authority | Crelio/MocDoc: roles and audit; SENAITE: independent verification |Named scrypt-backed accounts, six roles, revocable protected sessions; independent entry/release identities by default |Institutional onboarding, MFA/SSO, formal staff qualification review, external security assessment |
| Specimen traceability | Crelio/MocDoc: barcode lifecycle; SENAITE: sample identifiers/workflow |Separate specimen IDs, fasting/postprandial split, Code39 labels, collect/receive/reject/recollect and replacement IDs |Actual scanner/stock/printer validation, custody across couriers/branches, aliquot/archival lifecycle |
| QC and critical results | Crelio help: reviewed controls; SENAITE: controls/instrument-state gates |Recorded QC evidence with expiry/hold; only configured critical rules; real notification/read-back tied to result revision |Lab-specific critical thresholds, quality policies, QC charting/calibration, instrument acceptance |
| Analyzer ingestion |Crelio/MocDoc: instrument interfaces |Atomic mapped CSV drafts, exact units or explicit conversion, provenance, replay protection, no automatic release |Each actual model/protocol, serial/TCP/ASTM/HL7 middleware, real acceptance files. Universal compatibility is not established |
| Report delivery |Crelio/MocDoc/Labsmart: channel delivery and tracking |Recipient consent plus durable idempotent delivery requests; explicitly blocked when no provider |Actual WhatsApp/email accounts, approved templates, secure patient links, transport retries and authenticated receipts |
| Recovery |Commercial pages advertise hosting/recovery; operational detail varies |Consistent full SQLite backup encrypted AES-256-GCM; actual restore/integrity tests and revoked restored sessions |Off-site storage, recovery-key custody, scheduled monitored jobs, documented operator restore drill and RPO/RTO |
| Scale and multiple sites |MocDoc/Crelio describe branch operations |One server with persistent local SQLite, bounded initial worklists, full-database search, tested100-order concurrent workflow |Long-term retention/representative peak pilot, multi-branch tenancy/transfers and horizontal scaling |

The useful competitive position is a focused, transparent reporting workflow with testable controls and a small self-hosted footprint. The evidence does not establish that Labflow surpasses established systems, has full feature parity, or is ready to process clinical data without local acceptance.

## Engineering work delivered

The earlier shared administrator/browser-demo model has been separated from the real server deployment. Staff roles, review separation, specimen records, quality gates, instrument import validation, blocked delivery intents, full-database backup/restore, deployment checks and regression coverage are implemented in the source package. The live private Sites publication is a demonstration; publishing static files does not deploy the Node/SQLite service or make its browser-local records shared.

The isolated workload completed100 fictional patients,500 clinical writes and8 concurrent requests with zero unexpected failures and100 independently approved reports. See [BENCHMARK.md](BENCHMARK.md) for exact measurements and limits. These are test results, not a production SLA.

## Acceptance and rollout

1. **Deploy a staging server:** select the managed host, persistent encrypted disk, HTTPS origin, staff accounts, backup secret and off-site backup destination. Confirm unauthenticated/unauthorized denials, expiry/revocation, version conflicts and restore recovery.
2. **Validate laboratory behavior:** the qualified lab reviews catalog/methods/intervals, specimen identity, rejection/recollection, critical callbacks, control evidence, reviewer authority, printouts and scanner labels. Record exactly which software/catalog revision was tested. Check privacy notices, consent, access, retention/deletion and incident response for the actual Indian operating context.
3. **Validate each connection:** enumerate actual instrument models and protocols; retain accepted sample output/mapping tests. Configure delivery providers and validate failure, retry and receipt behavior. A queue entry is not a sent report.
4. **Shadow pilot before clinical release:** run representative orders alongside the established process, compare every result/unit/report and resolve discrepancies. Establish operational ownership, monitoring, retention, RPO/RTO and a fallback workflow. Clear readiness checks only against actual evidence.

Remaining inputs are the hosting/HTTPS choice, named lab staff and qualified reviewer, actual analyzer list/output samples, provider credentials entered through a protected secret mechanism, and lab acceptance records. No passwords or patient records should be pasted into chat or the source repository.
