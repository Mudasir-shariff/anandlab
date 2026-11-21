# Labflow Diagnostics - Hardening & Bug Tracking Log

This document tracks all bugs, security vulnerabilities, edge-case failures, and production readiness issues identified during the comprehensive 10-phase QA audit.

---

## Bug Summary Matrix

| ID | Title | Severity | Phase Found | Status |
|---|---|---|---|---|
| BUG-001 | Production Supabase Service Role Key & Credentials in `.env` | Critical | Phase 0/5 | Open |
| BUG-002 | Default Patient City Hardcoded to 'Bangalore' instead of Lab Locality | Low | Phase 0/2 | Open |
| BUG-003 | Floating Point Precision in Money & Balance Calculations | Medium | Phase 2 | Open |
| BUG-004 | Missing Validation on Patient Age Bounds & Input Types | High | Phase 2/4 | Open |
| BUG-005 | Missing Phone Number Format Validation (Non-digits / Invalid Length) | Medium | Phase 2/4 | Open |
| BUG-006 | Client-side Session Expiry During Active Result Entry | High | Phase 2/8 | Open |
| BUG-007 | XSS Attack Vector in Report Notes / Test Descriptions | High | Phase 2/5 | Open |
| BUG-008 | Unhandled Negative/Excessive Discount In Billing | High | Phase 2/4 | Open |
| BUG-009 | Report Parameter Result Entry Type Coercion & NaN Flagging | Medium | Phase 2/4 | Open |
| BUG-010 | Missing Production Deployment Guide and Health Check | Medium | Phase 9 | Open |

---

## Detailed Bug Reports

### [BUG-001] Production Supabase Service Role Key & Credentials in `.env`
- **Severity**: Critical
- **Found in**: Phase 0 (Reconnaissance) / Phase 5 (Security)
- **Description**: The `.env` file containing `SUPABASE_SECRET_KEY` (service role master key) and credentials was tracked in git history. If exposed, this bypasses all Supabase Row Level Security and grants complete database access.
- **Reproduction**: Check `.env` and `git log -p .env`.
- **Fix**: Remove secret key from frontend distribution, ensure `.env` is ignored, provide `.env.example`, and sanitize config loading in dev scripts.
- **Verification**: Pending fix.
- **Status**: Open

### [BUG-002] Default Patient City Hardcoded to 'Bangalore' instead of Lab Locality
- **Severity**: Low
- **Found in**: Phase 0 (Reconnaissance) / Phase 2 (Static Code Audit)
- **Description**: Default patient city in `app.js` is set to `'Bangalore'`, whereas Anand Laboratory operates in Sidlaghatta (Chikkaballapur). New registrations without explicit city default to Bangalore.
- **Reproduction**: Open new registration form; city field defaults to 'Bangalore'.
- **Fix**: Default city to 'Sidlaghatta' and fallback gracefully to configured lab city from `lab_settings`.
- **Verification**: Pending fix.
- **Status**: Open

### [BUG-003] Floating Point Precision in Money & Balance Calculations
- **Severity**: Medium
- **Found in**: Phase 2 (Static Code Audit)
- **Description**: Money arithmetic uses native JavaScript floating point without explicit decimal rounding (e.g. `Math.round((val + Number.EPSILON) * 100) / 100`), which can cause minor cent/paisa discrepancies in totals and balance dues.
- **Reproduction**: Calculate discount or balance with multiple items having fractional amounts.
- **Fix**: Add a safe currency arithmetic utility function `roundCurrency()` and apply it to subtotal, discount, total, paid, and balance calculations across billing and payment collection.
- **Verification**: Pending fix.
- **Status**: Open

### [BUG-004] Missing Validation on Patient Age Bounds & Input Types
- **Severity**: High
- **Found in**: Phase 2 / Phase 4 (Adversarial Testing)
- **Description**: Patient age input allows negative numbers, zero, or unrealistically large numbers (e.g. 9999) which can break report formatting and database validation.
- **Reproduction**: Enter `-5` or `500` in patient age and submit bill.
- **Fix**: Enforce strict age bounds (1–125 for Years, 1–12 for Months, 1–31 for Days) with clear client-side validation errors before submission.
- **Verification**: Pending fix.
- **Status**: Open

### [BUG-005] Missing Phone Number Format Validation
- **Severity**: Medium
- **Found in**: Phase 2 / Phase 4 (Adversarial Testing)
- **Description**: Mobile number allows arbitrary strings, special characters, or invalid lengths instead of validating standard 10-digit Indian phone numbers.
- **Reproduction**: Enter text or `123` in Mobile field and submit.
- **Fix**: Enforce 10-digit numeric validation (`/^[6-9]\d{9}$/` for standard Indian mobile numbers or 10 digits clean) with visual feedback.
- **Verification**: Pending fix.
- **Status**: Open

### [BUG-006] Client-side Session Expiry During Active Result Entry
- **Severity**: High
- **Found in**: Phase 2 / Phase 8 (Error Handling)
- **Description**: If a technician leaves the result entry screen open while performing bench tests and the JWT expires, clicking "Save Progress" or "Mark as Completed" can fail abruptly without saving inputs.
- **Reproduction**: Expire the session token and attempt to save report results.
- **Fix**: Implement automatic proactive session refresh before save/complete operations and save a local draft to `sessionStorage` in case network drops.
- **Verification**: Pending fix.
- **Status**: Open

### [BUG-007] XSS Attack Vector in Report Notes / Test Descriptions
- **Severity**: High
- **Found in**: Phase 2 / Phase 5 (Security)
- **Description**: User input in clinical notes or doctor names could potentially inject malicious HTML tags if not consistently escaped when rendered in receipt or report templates.
- **Reproduction**: Inject `<script>` or `<img src=x onerror=alert(1)>` in clinical notes.
- **Fix**: Ensure all interpolations in `report.js` and `app.js` pass through robust HTML entity escaping.
- **Verification**: Pending fix.
- **Status**: Open

### [BUG-008] Unhandled Negative or Excessive Discount in Billing
- **Severity**: High
- **Found in**: Phase 2 / Phase 4 (Adversarial Testing)
- **Description**: Entering a negative discount increases the total bill, or entering a discount higher than subtotal can produce negative totals if not clamped.
- **Reproduction**: Enter `-500` in discount input.
- **Fix**: Clamp discount between 0 and subtotal; reject negative discounts.
- **Verification**: Pending fix.
- **Status**: Open

### [BUG-009] Report Parameter Result Entry Type Coercion & NaN Flagging
- **Severity**: Medium
- **Found in**: Phase 2 / Phase 4 (Adversarial Testing)
- **Description**: When entering non-numeric characters for numeric parameters (e.g. typing "12.5 mg" into a numeric result field), range comparison fails silently or evaluates to NaN.
- **Reproduction**: Type alphanumeric text into a numeric parameter input.
- **Fix**: Sanitize numeric inputs, parse floats cleanly for range evaluation, and handle non-numeric qualitative results gracefully.
- **Verification**: Pending fix.
- **Status**: Open

### [BUG-010] Missing Production Deployment Guide and Health Check
- **Severity**: Medium
- **Found in**: Phase 9 (Production Readiness)
- **Description**: Missing automated health check and clear step-by-step production setup / backup / restore instructions in `README.md`.
- **Reproduction**: Read `README.md`; missing operations and disaster recovery procedures.
- **Fix**: Document full setup, deployment, backup/restore scripts, and smoke testing procedures.
- **Verification**: Pending fix.
- **Status**: Open
