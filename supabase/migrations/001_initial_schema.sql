-- ====================================================================
-- LABFLOW DIAGNOSTIC LABORATORY: SCHEMA MIGRATION 001
-- Idempotent initial schema with Row Level Security (RLS), Sequences,
-- Numeric(12,2) monetary fields, and Atomic Billing RPC.
-- ====================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Sequences for Human-Friendly Identifiers
CREATE SEQUENCE IF NOT EXISTS patient_no_seq START WITH 10001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS bill_no_seq START WITH 10001 INCREMENT BY 1;

-- 3. Core Tables

-- 3.1 Lab Settings (Single configuration row)
CREATE TABLE IF NOT EXISTS public.lab_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_name TEXT NOT NULL DEFAULT 'Anand Diagnostic Laboratory',
    tagline TEXT DEFAULT 'Quality Diagnostics & Patient Care',
    address TEXT DEFAULT 'Bangalore, Karnataka',
    phone TEXT DEFAULT '+91 98765 43210',
    email TEXT DEFAULT 'contact@anandlab.in',
    registration_no TEXT DEFAULT 'KA-BLR-2026-089',
    pathologist_name TEXT DEFAULT 'Dr. Ramesh Kumar',
    pathologist_qualification TEXT DEFAULT 'MD (Pathology), DCP',
    lab_incharge TEXT DEFAULT 'Checked by Technologist',
    lab_incharge_qualification TEXT DEFAULT 'B.Sc MLT',
    letterhead_template TEXT NOT NULL DEFAULT 'classic' CHECK (letterhead_template IN ('classic', 'sahara', 'minimal')),
    report_footer TEXT DEFAULT 'Results relate only to the specimen tested. Please correlate clinically with symptoms and history.',
    working_hours TEXT DEFAULT 'Mon – Sat: 7:00 AM – 8:30 PM | Sun: 7:00 AM – 1:00 PM',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.2 Doctors (Referred By)
CREATE TABLE IF NOT EXISTS public.doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    qualification TEXT,
    phone TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.3 Referral Labs
CREATE TABLE IF NOT EXISTS public.referral_labs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.4 Referral Hospitals
CREATE TABLE IF NOT EXISTS public.referral_hospitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.5 Test Catalog
CREATE TABLE IF NOT EXISTS public.tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    sample_type TEXT NOT NULL,
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.6 Test Parameters (Clinical reference intervals and flagging bounds)
CREATE TABLE IF NOT EXISTS public.test_parameters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    unit TEXT,
    reference_range TEXT,
    reference_range_m TEXT,
    reference_range_f TEXT,
    min_val NUMERIC(12,2),
    max_val NUMERIC(12,2),
    critical_min NUMERIC(12,2),
    critical_max NUMERIC(12,2),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_test_parameter UNIQUE (test_id, code)
);

-- 3.7 Patients
CREATE TABLE IF NOT EXISTS public.patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_no TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL CHECK (title IN ('Mr', 'Mrs', 'Ms', 'Master', 'Miss', 'Baby', 'B/O', 'Dr', 'Prof')),
    full_name TEXT NOT NULL,
    sex TEXT NOT NULL CHECK (sex IN ('Male', 'Female', 'Other')),
    age_value INTEGER NOT NULL CHECK (age_value >= 0),
    age_unit TEXT NOT NULL CHECK (age_unit IN ('Y', 'M', 'D')),
    mobile TEXT,
    alt_mobile TEXT,
    email TEXT,
    height NUMERIC(5,2),
    weight NUMERIC(5,2),
    area TEXT,
    city TEXT DEFAULT 'Bangalore',
    pincode TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- 3.8 Bills
CREATE TABLE IF NOT EXISTS public.bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_no TEXT UNIQUE NOT NULL,
    patient_id UUID NOT NULL REFERENCES public.patients(id),
    doctor_id UUID REFERENCES public.doctors(id),
    referral_lab_id UUID REFERENCES public.referral_labs(id),
    referral_hospital_id UUID REFERENCES public.referral_hospitals(id),
    subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
    discount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
    total NUMERIC(12,2) NOT NULL CHECK (total >= 0),
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    balance NUMERIC(12,2) NOT NULL CHECK (balance >= 0),
    payment_status TEXT NOT NULL CHECK (payment_status IN ('Unpaid', 'Partial', 'Paid')),
    cancelled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- 3.9 Bill Items (Snapshot of test data at time of billing)
CREATE TABLE IF NOT EXISTS public.bill_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    test_id UUID REFERENCES public.tests(id),
    test_code TEXT NOT NULL,
    test_name TEXT NOT NULL,
    test_department TEXT NOT NULL,
    test_sample_type TEXT NOT NULL,
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.10 Payments Ledger
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    mode TEXT NOT NULL CHECK (mode IN ('Cash', 'UPI', 'Card', 'Net Banking', 'Other')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- 3.11 Reports
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id),
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed')),
    clinical_notes TEXT,
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.12 Report Results (Parameters and entered patient values)
CREATE TABLE IF NOT EXISTS public.report_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
    test_code TEXT NOT NULL,
    parameter_code TEXT NOT NULL,
    parameter_name TEXT NOT NULL,
    unit TEXT,
    reference_range TEXT,
    min_val NUMERIC(12,2),
    max_val NUMERIC(12,2),
    critical_min NUMERIC(12,2),
    critical_max NUMERIC(12,2),
    value TEXT,
    flag TEXT DEFAULT '' CHECK (flag IN ('L', 'H', 'C', '')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Indexes for Rapid Queries
CREATE INDEX IF NOT EXISTS idx_patients_patient_no ON public.patients(patient_no);
CREATE INDEX IF NOT EXISTS idx_patients_mobile ON public.patients(mobile);
CREATE INDEX IF NOT EXISTS idx_patients_name ON public.patients(full_name);
CREATE INDEX IF NOT EXISTS idx_bills_bill_no ON public.bills(bill_no);
CREATE INDEX IF NOT EXISTS idx_bills_patient_id ON public.bills(patient_id);
CREATE INDEX IF NOT EXISTS idx_bills_created_at ON public.bills(created_at);
CREATE INDEX IF NOT EXISTS idx_bills_payment_status ON public.bills(payment_status);
CREATE INDEX IF NOT EXISTS idx_reports_bill_id ON public.reports(bill_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_report_results_report_id ON public.report_results(report_id);

-- 5. Row Level Security (Strict authenticated access only, NO anonymous access)
ALTER TABLE public.lab_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_labs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_results ENABLE ROW LEVEL SECURITY;

-- Create ALL policies for authenticated users
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "auth_full_access" ON public.%I', tbl);
        EXECUTE format('CREATE POLICY "auth_full_access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl);
    END LOOP;
END $$;

-- Explicitly revoke public/anon access
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Grant access to authenticated and service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
