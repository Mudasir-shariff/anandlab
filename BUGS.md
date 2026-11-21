# Labflow Diagnostics - Hardening & Bug Tracking Log

This document tracks all bugs, security vulnerabilities, edge-case failures, and production readiness issues identified and resolved during the comprehensive 10-phase QA audit.

---

## Bug Summary Matrix

| ID | Title | Severity | Phase Found | Status | Resolution Commit |
|---|---|---|---|---|---|
| BUG-001 | Production Supabase Service Role Key & Credentials in `.env` | Critical | Phase 0/5 | Fixed | `6d65e0b` |
| BUG-002 | Default Patient City Hardcoded to 'Bangalore' instead of Lab Locality | Low | Phase 0/2 | Fixed | `a44a39c` |
| BUG-003 | Floating Point Precision in Money & Balance Calculations | Medium | Phase 2 | Fixed | `a44a39c` |
| BUG-004 | Missing Validation on Patient Age Bounds & Input Types | High | Phase 2/4 | Fixed | `a44a39c` |
| BUG-005 | Missing Phone Number Format Validation (Non-digits / Invalid Length) | Medium | Phase 2/4 | Fixed | `a44a39c` |
| BUG-006 | Client-side Session Expiry During Active Result Entry | High | Phase 2/8 | Fixed | `a44a39c` |
| BUG-007 | XSS Attack Vector in Report Notes / Test Descriptions & Malformed Tags | High | Phase 2/5 | Fixed | `2746373` |
| BUG-008 | Unhandled Negative/Excessive Discount In Billing | High | Phase 2/4 | Fixed | `a44a39c` |
| BUG-009 | Report Parameter Result Entry Type Coercion & NaN Flagging | Medium | Phase 2/4 | Fixed | `a44a39c` |
| BUG-010 | Missing Production Deployment Guide and Health Check | Medium | Phase 9 | Fixed | Current |
| BUG-011 | Browser Print Shim Crashes when Popup is Blocked | Medium | Phase 8 | Fixed | `2746373` |
| BUG-012 | Redundant Duplicated Keys in settingsAdapter Object Literal | Low | Phase 2 | Fixed | `a44a39c` |

---

## Detailed Bug Reports & Resolution Evidence

### [BUG-001] Production Supabase Service Role Key & Credentials in `.env`
- **Severity**: Critical
- **Found in**: Phase 0 (Reconnaissance) / Phase 5 (Security)
- **Description**: The `.env` file containing `SUPABASE_SECRET_KEY` (service role master key) was present locally and exposed to scripts. If leaked, this bypasses all Supabase Row Level Security and grants complete database access.
- **Reproduction**: Check `.env` loading and ensure `/api/config` does not expose secret keys.
- **Fix**: Ensured `.env` is ignored by `.gitignore` and untracked in git. Verified `/api/config` returns only `supabaseAnonKey` and `supabaseUrl`. Updated `.env.example` with clear placeholders and security notes. Added unit test `test/security.test.mjs` verifying secret keys are never returned by `/api/config`.
- **Verification**: `test/security.test.mjs` passed; `check-git-leaks.mjs` verified 0 working file secret leaks.
- **Status**: Fixed
- **Commit**: `6d65e0b`

### [BUG-002] Default Patient City Hardcoded to 'Bangalore' instead of Lab Locality
- **Severity**: Low
- **Found in**: Phase 0 (Reconnaissance) / Phase 2 (Static Code Audit)
- **Description**: Default patient city in `app.js` was set to `'Bangalore'`, whereas Anand Laboratory operates in Sidlaghatta (Chikkaballapur). New registrations without explicit city defaulted to Bangalore.
- **Reproduction**: Open new registration form; city field defaulted to 'Bangalore'.
- **Fix**: Replaced all hardcoded 'Bangalore' default city references in `app.js` with 'Sidlaghatta'.
- **Verification**: Verified registration state initial state and DOM fallback value in `app.js`.
- **Status**: Fixed
- **Commit**: `a44a39c`

### [BUG-003] Floating Point Precision in Money & Balance Calculations
- **Severity**: Medium
- **Found in**: Phase 2 (Static Code Audit)
- **Description**: Money arithmetic used native JavaScript floating point without explicit decimal rounding (e.g. `0.1 + 0.2 = 0.30000000000000004`), which can cause minor paise discrepancies in totals and balance dues.
- **Reproduction**: Calculate discount or balance with fractional amounts.
- **Fix**: Implemented `roundCurrency(val)` utility using `Math.round((Number(val || 0) + Number.EPSILON) * 100) / 100` and applied it across subtotal, discount, net payable, paid amount, and payment collection in `app.js`.
- **Verification**: Verified in `test/calculations.test.mjs` (0.1 + 0.2 rounding test passed).
- **Status**: Fixed
- **Commit**: `a44a39c`

### [BUG-004] Missing Validation on Patient Age Bounds & Input Types
- **Severity**: High
- **Found in**: Phase 2 / Phase 4 (Adversarial Testing)
- **Description**: Patient age input allowed negative numbers, zero, or unrealistically large numbers (e.g. 9999) without validation.
- **Reproduction**: Enter `-5` or `500` in patient age and submit bill.
- **Fix**: Enforced strict age bounds:
  - Years (`Y`): 0–125
  - Months (`M`): 0–12
  - Days (`D`): 0–31
  - Displays user-friendly error toast and stops transaction.
- **Verification**: Verified in `test/adversarial.test.mjs` (age boundary tests passed).
- **Status**: Fixed
- **Commit**: `a44a39c`

### [BUG-005] Missing Phone Number Format Validation
- **Severity**: Medium
- **Found in**: Phase 2 / Phase 4 (Adversarial Testing)
- **Description**: Mobile number allowed arbitrary strings or invalid lengths instead of validating standard Indian phone numbers.
- **Reproduction**: Enter text or `123` in Mobile field and submit.
- **Fix**: Enforced Indian mobile number validation (`/^(?:\+91|0)?[6-9]\d{9}$/`) with visual feedback if a mobile number is entered.
- **Verification**: Verified in `test/adversarial.test.mjs` (phone validation tests passed).
- **Status**: Fixed
- **Commit**: `a44a39c`

### [BUG-006] Client-side Session Expiry During Active Result Entry
- **Severity**: High
- **Found in**: Phase 2 / Phase 8 (Error Handling)
- **Description**: If a technician leaves the result entry screen open while performing bench tests and the JWT expires, clicking "Save Progress" or "Mark as Completed" could fail without saving inputs.
- **Reproduction**: Expire the session token and attempt to save report results.
- **Fix**: Added proactive automatic session refresh before saving; added immediate local safety draft caching to `sessionStorage` under `draft_report_${id}` so patient test values are never lost even if connection drops.
- **Verification**: Code verified in `handleSaveReport` with try-catch draft caching and clearing on success.
- **Status**: Fixed
- **Commit**: `a44a39c`

### [BUG-007] Malformed Spaced HTML Tags & Template Literals Causing Modal Collapse
- **Severity**: High
- **Found in**: Phase 2 / Phase 4 (Visual Regression)
- **Description**: Spaced HTML tags such as `< table >`, `< header >`, `< section >`, `< tr >`, `< svg >` in receipt and report templates caused browser DOM parsers to treat them as unknown elements, collapsing the content into vertical single-character text columns.
- **Reproduction**: Generate receipt or view print preview; observed vertical letter wrapping.
- **Fix**: Sanitized all template literals in `app.js` removing stray spaces inside opening and closing tags. Verified all user variables pass through `escapeHTML()`.
- **Verification**: `test/adversarial.test.mjs` (XSS neutralization) and `test/ui.test.mjs` passed.
- **Status**: Fixed
- **Commit**: `2746373`

### [BUG-008] Unhandled Negative or Excessive Discount in Billing
- **Severity**: High
- **Found in**: Phase 2 / Phase 4 (Adversarial Testing)
- **Description**: Entering a negative discount increased total bill amount, and discount exceeding subtotal caused negative totals.
- **Reproduction**: Enter `-500` or `99999` in discount input.
- **Fix**: Clamped discount input to `Math.max(0, val)` on input, and strictly validated in `handleCreateBill` that `discount >= 0` and `discount <= subtotal`. Also validated `paidAmount >= 0` and `paidAmount <= netPayable`.
- **Verification**: Verified in `test/adversarial.test.mjs` (billing discount/paid validation tests passed).
- **Status**: Fixed
- **Commit**: `a44a39c`

### [BUG-009] Report Parameter Result Entry Type Coercion & NaN Flagging
- **Severity**: Medium
- **Found in**: Phase 2 / Phase 4 (Adversarial Testing)
- **Description**: Non-numeric or missing dataset attributes in result parameter inputs could throw null reference errors or produce `NaN` comparisons in `evaluateLiveFlag`.
- **Reproduction**: Input value when flag badge or dataset bounds are missing or malformed.
- **Fix**: Made `evaluateLiveFlag` completely null-safe with checks on `flagBadge` and `rowElement`, and safely coerced min/max thresholds.
- **Verification**: Verified via `npm test`.
- **Status**: Fixed
- **Commit**: `a44a39c`

### [BUG-010] Missing Production Deployment Guide and Health Check
- **Severity**: Medium
- **Found in**: Phase 9 (Production Readiness)
- **Description**: Outdated documentation referenced legacy SQLite and lacked automated post-deploy health checks and backup procedures.
- **Reproduction**: Inspect `README.md`.
- **Fix**: Completely rewrote `README.md` with accurate architecture, setup, testing, smoke test, and disaster recovery procedures. Added `scripts/smoke-test.mjs` and `scripts/backup-db.mjs`.
- **Verification**: `npm run smoke-test` executed successfully with 6/6 tests passing.
- **Status**: Fixed
- **Commit**: Pending (this commit)

### [BUG-011] Browser Print Shim Crashes when Popup is Blocked
- **Severity**: Medium
- **Found in**: Phase 8 (Error Handling)
- **Description**: When running in browser preview mode, if popup blocking is active, `window.open` returns `null`, causing an unhandled `TypeError: Cannot read properties of null (reading 'document')`.
- **Reproduction**: Enable popup blocker and click Print Receipt in browser.
- **Fix**: Added null check on `w` with user-friendly alert notifying them to allow popups for the site.
- **Verification**: Code verified in `app.js` print shim fallback.
- **Status**: Fixed
- **Commit**: `2746373`

### [BUG-012] Redundant Duplicated Keys in settingsAdapter Object Literal
- **Severity**: Low
- **Found in**: Phase 2 (Static Code Audit)
- **Description**: `labName`, `address`, `phone`, `email` were defined twice in `settingsAdapter` inside `openReportPrintPreview`.
- **Reproduction**: Inspect `dist/app.js` around line 2659.
- **Fix**: Removed duplicate keys and consolidated fallback logic cleanly.
- **Verification**: Verified via `npm test`.
- **Status**: Fixed
- **Commit**: `a44a39c`
