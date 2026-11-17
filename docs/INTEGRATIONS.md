# Analyzer import and report-delivery boundaries

This module provides a validated **CSV draft-import boundary** and an **unsent delivery-intent builder**. It does not connect to analyzers, listen on serial/TCP ports, implement ASTM/HL7, send email, call WhatsApp, or prove that any analyzer model is supported. A laboratory processing 100 patients per day can use the same validation boundary, but no hardware throughput, clinical validation, or universal compatibility claim is established by these functions.

## CSV contract

`parseAnalyzerCSV(text)` returns an array of records containing these seven fields plus a 1-based `lineNumber` for the beginning of each record:

```csv
order_id,test_code,parameter_code,value,unit,instrument_id,run_id
LF-123,CBC,HGB,14.2,g/dL,HEMA-01,RUN-20261114-001
LF-123,CBC,WBC,7200,cells/µL,HEMA-01,RUN-20261114-001
```

Headers may be reordered; surrounding whitespace and letter case in headers are normalized. All seven columns are required exactly once. Extra columns fail validation rather than being ignored. Blank physical lines are skipped. The parser supports a leading UTF-8 BOM, LF/CRLF/CR record endings, quoted commas, doubled quote escaping, and quoted multiline fields. Malformed quoting, wrong column counts, null bytes, files above 5 MiB, fields above 65,536 characters, and more than 20,000 measurement rows fail. A header-only file fails. Identifiers and measurements receive stricter validation after parsing; for example, a multiline run identifier is not valid even though the CSV parser can represent it.

An import is one instrument and one run. `order_id` must be the exact registered order/sample identifier. The module never matches on a patient name, age, collection time, or approximate identifier. It does not resolve individual specimen containers inside an order. A device adapter must validate its actual tube/barcode identity against the correct order and collection before producing this CSV, particularly for multiple separately timed specimens such as fasting and postprandial glucose.

## Server-owned mappings

The server must load instrument configuration from an administrator-controlled store. Do not accept an `instrument`, `catalog`, `parameters`, `orders`, or `seenImports` object supplied by an importing browser or analyzer payload.

Example mapping against the application's catalog:

```js
const instrument = {
  id: 'HEMA-01',
  enabled: true,
  mappings: {
    CBC: {
      testCode: 'CBC',
      parameters: {
        HGB: { parameterCode: 'hb', unit: 'g/dL' },
        WBC: { parameterCode: 'wbc', unit: 'cells/µL' }
      }
    }
  }
};
```

Each external test and parameter requires an explicit mapping. The canonical analyte must belong to the mapped panel, and the order must contain that panel. The mapping's `unit` must exactly equal the canonical catalog unit. Incoming values use strict finite decimal/scientific numeric syntax within −1e9 through 1e9. Hexadecimal, formulas, `NaN`, infinity, and empty values are rejected. Values outside a clinical reference interval remain valid numeric measurements for later review; the boundary does not diagnose a patient or automatically reject an abnormal result.

Units are compared exactly after trimming surrounding CSV whitespace. Case differences and the distinct Unicode micro characters `µ` and `μ` are not silently normalized. No conversion exists by default. A separately validated conversion can be configured per instrument/analyte:

```js
WBC: {
  parameterCode: 'wbc',
  unit: 'cells/µL',
  conversion: {
    fromUnit: '10^3/µL',
    toUnit: 'cells/µL',
    factor: 1000,
    offset: 0
  }
}
```

The formula is `canonicalValue = importedValue * factor + offset`. The factor must be a finite positive number. The target unit must equal the canonical unit. Only this single explicitly configured source unit is accepted in addition to the canonical unit. An alias can use factor 1/offset 0 only after the laboratory verifies that it represents the same measurement. No rounding is applied by this boundary; method-specific precision and significant-figure rules still need validation.

## Validate, review, commit

```js
import { validateAnalyzerImport, IntegrationError }
  from '../lib/integrations.mjs';

const proposal = validateAnalyzerImport({
  csv,
  instrument,           // loaded on the server
  orders: currentRows, // array, Map keyed by id, or object keyed by id
  catalog: TESTS,
  parameters: PARAMETERS,
  seenImports          // persistent keys/checksums loaded on the server
});
```

A successful result contains:

```js
{
  idempotencyKey,
  checksum,             // SHA-256 of the exact UTF-8 CSV text
  instrumentId,
  runId,
  duplicate: false,
  changes: [{
    orderId,
    expectedVersion,
    status: 'Processing',
    requiresReview: true,
    results,            // full existing draft results plus validated measurements
    provenance: {
      source: 'analyzer_csv', instrumentId, runId, checksum,
      measurements: [{
        lineNumber, sourceTestCode, sourceParameterCode,
        testCode, parameterCode, rawValue, rawUnit,
        value, unit, conversion
      }]
    }
  }],
  errors: []
}
```

The function is pure with respect to supplied orders, mappings, and history. It never approves a report, advances an order beyond Processing, changes a patient record, writes a database, or makes an external call. A human must review imported measurements using the laboratory's result-validation and release procedures. Receiving results does not establish that instrument QC, calibration, specimen integrity, critical-value handling, or patient identification has passed.

The whole batch is rejected if any row is invalid. A thrown `IntegrationError` has `code`, `message`, and an `errors` array with row-level `lineNumber`, `code`, `message`, and `orderId` when available. No partial proposal is returned. Unknown orders, orders outside Processing, missing versions, unconfigured tests/analytes, unordered panels, unit mismatches, invalid numbers, and conflicting values all fail. Identical repeated measurements collapse into the same target value while retaining both provenance entries. Conflicting duplicates—even from two external codes mapping to one canonical analyte—fail. An imported value cannot replace a different existing draft value; resolve that difference through the application's audited manual correction process.

After validation, an authorized server route must perform **one database transaction**:

1. Re-read and verify every target order's version and Processing status.
2. Recheck that the instrument/run key has not already been committed.
3. Write all proposed draft results and their provenance/audit events.
4. Persist the import key and checksum, with a unique constraint on the key.
5. Commit all changes together, or roll back the complete batch on any failure.

This module cannot make a multi-order database operation atomic by returning JavaScript objects; atomicity belongs in that server transaction. Keep the CSV request-size limit consistent with the HTTP body's encoding and authenticate/authorize the import endpoint. Do not expose a raw import write endpoint publicly.

### Idempotency

The key hashes the configured instrument ID and run ID. `seenImports` may be a `Map`, object keyed by `idempotencyKey`, or array of `{idempotencyKey, checksum}` records. A value may be `{checksum}` or a checksum string. Persist history in the database; an in-memory set is insufficient after a restart.

The same committed instrument/run and exact payload return `duplicate:true, changes:[]`, even if the order has since been approved. The same key with a different checksum throws `IMPORT_REPLAY_CONFLICT`. Even a different newline encoding changes the exact payload checksum. A corrected or regenerated export needs an explicit reviewed reconciliation process/new run identifier; it must not silently overwrite a previous import.

## Per-device rollout

For each analyzer model, firmware version, interface mode, and laboratory method:

- Obtain the manufacturer's interface/export specification and agree which system owns order/sample identifiers.
- Build and validate a model-specific adapter for its CSV export or protocol. This module does not supply that adapter.
- Verify all external assay codes, specimen types, measurement units, conversions, precision, analyzer flags, and repeat/correction behavior against the laboratory's validated catalog.
- Validate barcode and specimen routing, run/QC acceptance, interrupted exports, duplicates, out-of-order messages, critical values, and rejected specimens using known specimens/test data.
- Record mapping approvals and maintain them as controlled configuration. Test a firmware, catalog, unit, method, or mapping change before enabling it.

No device is declared integrated simply because its data can be put in a CSV file. ASTM/HL7 middleware, LIS bidirectional ordering, analyzer TCP/serial connections, QC interfaces, and instrument-specific flag interpretation remain separate implementation and acceptance work.

## Report delivery intent

`createDeliveryIntent(order, channel, destination, consent)` produces an unsent proposal only. Supported channel identifiers are `whatsapp` and `email`. The order must be Approved and have a recorded approval timestamp. A plain email address is required for email; display names, multiple recipients, and injected headers are rejected. WhatsApp requires E.164 format such as `+919876543210`; a local 10-digit number is not silently assigned a country code.

Consent is a server-owned, auditable record tied to the patient, channel, purpose, and exact normalized destination:

```js
const consent = {
  granted: true,
  scope: 'report_delivery',
  channel: 'whatsapp',
  destination: '+919876543210',
  patientId: order.patientId,
  recordedAt: '2026-11-14T08:00:00.000Z',
  recordedBy: 'staff-identifier'
};
const intent = createDeliveryIntent(order, 'whatsapp', consent.destination, consent);
```

`recordedAt`, `approvedAt`, and optional `expiresAt` use valid UTC ISO timestamps ending in `Z`. Future consent timestamps beyond a five-minute clock allowance, revoked consent, expired consent, another patient/channel/purpose, and a different recipient are rejected. The caller must verify that the staff member may record that consent and that the record reflects the patient's or authorized representative's actual instruction. A browser boolean is not sufficient.

The returned object includes a deterministic `id`/`idempotencyKey`, `orderId`, `patientId`, `channel`, normalized `destination`, `status:'queued'`, `attempts:0`, `providerMessageId:null`, a checksum of the released clinical report, approval time, creation time, and normalized consent metadata. The deterministic key excludes billing updates but changes when the clinical report or recipient changes. The return value is not a persisted queue record until the server stores it. It does not mean a message was sent, accepted, or delivered.

A production delivery worker still needs official WhatsApp Business/email-provider configuration, runtime secrets, approved message/template use where required, recipient/consent rechecks at dispatch, access-controlled report documents or expiring report links, idempotent provider submission/retry policy, authenticated callbacks, and accurate queued/sent/failed/delivered transitions based on provider evidence. Do not turn `queued` into `delivered` without that evidence. Never include report contents in routine delivery logs, publish patient reports to obtain a share link, or put credentials in application source. This module performs none of those external actions.

## Verification

Run `node --test test/integrations.test.mjs`. Coverage includes parsing edge cases, exact mappings and units, configured conversions, whole-batch rejection, conflicting duplicates, existing-result protection, run replay conflicts, a 100-order draft run, approval/recipient/consent gates, and stable unsent intent identity across billing changes. These are software boundary tests, not manufacturer, clinical, regulatory, or live-provider acceptance tests.

## Specimen barcodes

`dist/barcode.js` exports `renderBarcode(value, label = value)`. It renders a vector **standard Code39** symbol using the ISO/IEC 16388 character patterns, with the correct start/stop asterisks, nine alternating bar/space elements per symbol, a 3:1 wide/narrow ratio, one narrow inter-character gap, and white quiet zones of 10 narrow modules on each side. The input value is encoded exactly; it is not shortened, case-folded, or replaced by decorative bars. Human-readable label text is escaped separately and cannot alter the encoded identifier.

Supported inputs contain 1–40 characters from the 43-character standard Code39 alphabet: uppercase A–Z, digits, hyphen, period, space, dollar sign, slash, plus, and percent. An asterisk is reserved for start/stop and is rejected in the input. Lowercase, underscores, unsupported scripts, empty or overlong values throw `RangeError`. Do not hide that failure behind a made-up barcode; display the identifier and resolve the unsupported format. The specimen IDs generated by the application use the supported uppercase/digit/hyphen format, for example `LF-A1B2C3D4-S01-R01`.

No optional Mod43 check character is appended. A scanner configured to require that check character must be reconfigured or a separately validated check-digit implementation must be added. Code39 is not QR, and this function does not create a report-download URL or disclose patient information through a public endpoint.

The SVG's declared and inline physical dimensions use a 0.254 mm narrow module. Bar height is at least 12.7 mm or 15% of the symbol's encoded width, whichever is larger. Inline dimensions and `stroke:none` protect the bars from the workspace's generic icon-sizing/stroke rules. A 19-character specimen identifier occupies about 90 mm including the quiet zones; select label stock and margins that accommodate that physical width. Do not shrink the barcode with CSS `max-width:100%`, browser Fit to page, image resampling, or a printer driver's scaling option to force it onto smaller stock. Longer supported identifiers need wider labels.

Before using labels with patient specimens, perform physical acceptance tests with the intended printer, label stock, ribbon/ink, print density, scanner models/settings, and analyzer workflow. Verify the exact returned specimen ID, quiet zones, handling of Code39 start/stop and optional checksums, label durability, repeated scans, recollection/reprint IDs, and nearby human-readable patient identifiers. Compare scan results against the registered specimen record. Software pattern tests do not establish print quality, scanner compatibility, specimen identification safety, or a universal analyzer interface.

Run `node --test test/barcode.test.mjs` for known standard patterns, the full alphabet, quiet zones/gaps, physical dimensions, escaping, and unsupported-input failures. No scanner or printer was exercised by those tests.
