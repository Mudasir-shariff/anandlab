# Labflow Diagnostics

Modern, secure, and resilient clinical diagnostic laboratory workspace and reporting platform for **Anand Laboratory** (Sidlaghatta, Chikkaballapur, Karnataka).

Powered by **Electron** desktop application, modern responsive web workspace, and **Supabase PostgreSQL** cloud backend with atomic transactions and Row Level Security (RLS).

---

## System Architecture & Features

- **Test Catalog**: 38 standardized diagnostic panels (Hematology, Biochemistry, Serology, Endocrinology, Clinical Pathology, Lipid Profiles, Liver Function, Renal Function, Electrolytes, etc.) matching Anand Laboratory pricing.
- **Atomic Billing & Registration**: Atomic PostgreSQL stored procedure (`create_bill_transaction`) creating patient, bill, bill items, initial payment, report header, and test parameters in a single transaction.
- **Diagnostic Result Entry**: Rapid keyboard-driven result entry (Enter/Arrow navigation), live abnormality detection (`L` = Low, `H` = High, `C` = Critical), and automatic draft caching to prevent data loss.
- **Reporting & Letterheads**: Three clinical report styles (*Classic Blue*, *Modern Orange*, *Minimal Teal*) with Dr. Anand Hospital letterhead, two-tone typography, Code39 barcode, and technician authorization signatures.
- **Billing & Thermal Printing**: 80mm thermal receipt roll format and full-page A4 clinical invoices with Number-to-Words Indian currency conversion.
- **Security & Data Isolation**: Row Level Security (RLS) policies on all tables, secure session persistence via Electron `safeStorage`, strict Content-Security-Policy (CSP), zero secret key leakage, and HTML entity escaping.

---

## Quick Start & Running Locally

### Prerequisites
- **Node.js**: v20 or v24+ (Node.js 24 recommended)
- **npm**: v10+

### 1. Installation
Clone the repository and install dependencies:
```sh
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env` and configure your credentials:
```sh
cp .env.example .env
```

Ensure your `.env` contains:
```ini
SUPABASE_URL=https://zynqvlhxregoxskzhnmu.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
SUPABASE_SECRET_KEY=sb_secret_your_key_here
LAB_USERNAME=anandlab
LAB_PASSWORD=your_password_here
LAB_EMAIL_DOMAIN=labflow.local
```
> **Security Note**: Never commit `.env` to version control. The repository `.gitignore` automatically excludes all `.env*` files except `.env.example`.

### 3. Run Web Preview Server
To run the local web workspace server:
```sh
npm run serve
```
Open **`http://127.0.0.1:3000`** in Google Chrome or any modern browser.

### 4. Run Electron Desktop App
To launch the desktop application:
```sh
npm start
```

### 5. Build Desktop Installer (Windows NSIS)
To compile and package the standalone Windows installer:
```sh
npm run dist
```
The installer executable will be generated in `build-out/`.

---

## Testing & Quality Assurance

Labflow includes an extensive automated test suite covering catalog integrity, report formatting, calculations, adversarial inputs, XSS resistance, and security policies.

### Run All Tests
```sh
npm test
```
Executes all unit, integration, layout, and adversarial test suites:
- `test/catalog.test.mjs` - Catalog panel definitions and pricing integrity
- `test/calculations.test.mjs` - Currency precision and Indian numbering conversions
- `test/adversarial.test.mjs` - Edge-case inputs, negative numbers, age bounds, mobile validation
- `test/security.test.mjs` - Secret leakage prevention and Content-Security-Policy validation
- `test/report.test.mjs` - Clinical report pagination, layout, and letterhead styles
- `test/styles.test.mjs` - CSS scoping and print media rules
- `test/ui.test.mjs` - Full JSDOM user flow simulations (Login -> Billing -> Result Entry -> Printing)

### Post-Deploy Smoke Test
Run against a running server to verify live endpoint readiness, static delivery, and authenticated Supabase connectivity:
```sh
npm run smoke-test
```

### Secret and Leak Scanner
Scan the entire codebase and git history for accidentally committed credentials or keys:
```sh
node scripts/check-git-leaks.mjs
```

---

## Database Management & Disaster Recovery

### Automated Database Backup
To take a full JSON snapshot of all Supabase tables (`patients`, `bills`, `reports`, `report_results`, `payments`, `doctors`, `tests`, `settings`):
```sh
node scripts/backup-db.mjs
```
Backups are timestamped and stored locally in `backups/backup-<timestamp>/`. This directory is strictly excluded from version control.

### Verifying Database Tables
To verify table connectivity and active panel counts:
```sh
node scripts/verify-db.js
```

---

## Operational Credentials & Roles

| Role | Default Username | Scope |
|---|---|---|
| Laboratory Operator | `anandlab` | Patient registration, billing, result entry, report authorization, receipt & report printing |

---

## License & Support

Confidential clinical laboratory software developed for Anand Laboratory, Sidlaghatta.
Support Contact: hello@opti-x.in | +91 8123649448
