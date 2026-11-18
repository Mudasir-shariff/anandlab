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
    lab_name TEXT NOT NULL DEFAULT 'Opti-X Labs',
    tagline TEXT DEFAULT 'Precision Diagnostics & Clinical Excellence',
    address TEXT DEFAULT 'Bangalore, Karnataka',
    phone TEXT DEFAULT '+91 98765 43210',
    email TEXT DEFAULT 'contact@optixlabs.in',
    registration_no TEXT DEFAULT 'KA-BLR-LAB-2026-089',
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
-- ====================================================================
-- LABFLOW DIAGNOSTIC LABORATORY: RPC & STORED FUNCTIONS 002
-- Atomic transactions for Billing, Payment Collection, and Reports.
-- ====================================================================

-- 1. Helper function for sequential formatted ID generation
CREATE OR REPLACE FUNCTION public.format_patient_no()
RETURNS TEXT AS $$
BEGIN
    RETURN 'PT-' || LPAD(nextval('patient_no_seq')::text, 5, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.format_bill_no()
RETURNS TEXT AS $$
BEGIN
    RETURN 'BL-' || LPAD(nextval('bill_no_seq')::text, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- 2. Master Atomic Transaction: Create Bill, Bill Items, Payment, and Report
CREATE OR REPLACE FUNCTION public.create_bill_transaction(
    p_patient_id UUID,
    p_patient_data JSONB,
    p_doctor_id UUID,
    p_referral_lab_id UUID,
    p_referral_hospital_id UUID,
    p_test_ids UUID[],
    p_discount NUMERIC(12,2) DEFAULT 0.00,
    p_paid_amount NUMERIC(12,2) DEFAULT 0.00,
    p_payment_mode TEXT DEFAULT 'Cash',
    p_payment_notes TEXT DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_patient_id UUID := p_patient_id;
    v_patient_no TEXT;
    v_bill_id UUID;
    v_bill_no TEXT;
    v_report_id UUID;
    v_subtotal NUMERIC(12,2) := 0.00;
    v_discount NUMERIC(12,2) := COALESCE(p_discount, 0.00);
    v_total NUMERIC(12,2) := 0.00;
    v_paid NUMERIC(12,2) := COALESCE(p_paid_amount, 0.00);
    v_balance NUMERIC(12,2) := 0.00;
    v_status TEXT;
    v_test RECORD;
    v_param RECORD;
    v_sex TEXT;
BEGIN
    -- Validate tests provided
    IF p_test_ids IS NULL OR array_length(p_test_ids, 1) = 0 THEN
        RAISE EXCEPTION 'At least one test must be selected for billing.';
    END IF;

    -- 1. Resolve or Create Patient
    IF v_patient_id IS NOT NULL THEN
        SELECT patient_no, sex INTO v_patient_no, v_sex FROM public.patients WHERE id = v_patient_id;
        IF v_patient_no IS NULL THEN
            RAISE EXCEPTION 'Specified patient record not found.';
        END IF;
    ELSE
        -- Insert new patient
        v_patient_no := format_patient_no();
        v_sex := p_patient_data->>'sex';
        INSERT INTO public.patients (
            patient_no,
            title,
            full_name,
            sex,
            age_value,
            age_unit,
            mobile,
            alt_mobile,
            email,
            height,
            weight,
            area,
            city,
            pincode,
            created_by
        ) VALUES (
            v_patient_no,
            p_patient_data->>'title',
            p_patient_data->>'full_name',
            v_sex,
            (p_patient_data->>'age_value')::INTEGER,
            COALESCE(p_patient_data->>'age_unit', 'Y'),
            p_patient_data->>'mobile',
            p_patient_data->>'alt_mobile',
            p_patient_data->>'email',
            NULLIF(p_patient_data->>'height', '')::NUMERIC(5,2),
            NULLIF(p_patient_data->>'weight', '')::NUMERIC(5,2),
            p_patient_data->>'area',
            COALESCE(p_patient_data->>'city', 'Bangalore'),
            p_patient_data->>'pincode',
            v_user_id
        ) RETURNING id INTO v_patient_id;
    END IF;

    -- 2. Calculate Subtotal from current active prices in test catalog
    SELECT COALESCE(SUM(price), 0.00) INTO v_subtotal
    FROM public.tests
    WHERE id = ANY(p_test_ids);

    IF v_subtotal <= 0 THEN
        RAISE EXCEPTION 'Invalid test selection or zero test value.';
    END IF;

    -- Calculate Total and Balance
    v_total := GREATEST(0.00, v_subtotal - v_discount);
    IF v_paid > v_total THEN
        RAISE EXCEPTION 'Paid amount cannot exceed total bill amount.';
    END IF;
    v_balance := v_total - v_paid;

    IF v_balance = 0.00 THEN
        v_status := 'Paid';
    ELSIF v_paid > 0.00 THEN
        v_status := 'Partial';
    ELSE
        v_status := 'Unpaid';
    END IF;

    -- 3. Create Bill
    v_bill_no := format_bill_no();
    INSERT INTO public.bills (
        bill_no,
        patient_id,
        doctor_id,
        referral_lab_id,
        referral_hospital_id,
        subtotal,
        discount,
        total,
        paid_amount,
        balance,
        payment_status,
        created_by
    ) VALUES (
        v_bill_no,
        v_patient_id,
        p_doctor_id,
        p_referral_lab_id,
        p_referral_hospital_id,
        v_subtotal,
        v_discount,
        v_total,
        v_paid,
        v_balance,
        v_status,
        v_user_id
    ) RETURNING id INTO v_bill_id;

    -- 4. Insert Bill Items (Snapshot test data)
    FOR v_test IN
        SELECT id, code, name, department, sample_type, price
        FROM public.tests
        WHERE id = ANY(p_test_ids)
    LOOP
        INSERT INTO public.bill_items (
            bill_id,
            test_id,
            test_code,
            test_name,
            test_department,
            test_sample_type,
            price
        ) VALUES (
            v_bill_id,
            v_test.id,
            v_test.code,
            v_test.name,
            v_test.department,
            v_test.sample_type,
            v_test.price
        );
    END LOOP;

    -- 5. Record Initial Payment if paid > 0
    IF v_paid > 0.00 THEN
        INSERT INTO public.payments (
            bill_id,
            amount,
            mode,
            notes,
            created_by
        ) VALUES (
            v_bill_id,
            v_paid,
            COALESCE(p_payment_mode, 'Cash'),
            p_payment_notes,
            v_user_id
        );
    END IF;

    -- 6. Initialize Clinical Report (Pending status)
    INSERT INTO public.reports (
        bill_id,
        patient_id,
        status,
        created_at
    ) VALUES (
        v_bill_id,
        v_patient_id,
        'Pending',
        now()
    ) RETURNING id INTO v_report_id;

    -- 7. Populate Report Parameters from catalog
    FOR v_param IN
        SELECT
            t.code AS test_code,
            tp.code AS parameter_code,
            tp.name AS parameter_name,
            tp.unit,
            CASE
                WHEN v_sex = 'Male' AND tp.reference_range_m IS NOT NULL THEN tp.reference_range_m
                WHEN v_sex = 'Female' AND tp.reference_range_f IS NOT NULL THEN tp.reference_range_f
                ELSE tp.reference_range
            END AS resolved_range,
            tp.min_val,
            tp.max_val,
            tp.critical_min,
            tp.critical_max,
            tp.sort_order
        FROM public.tests t
        JOIN public.test_parameters tp ON tp.test_id = t.id
        WHERE t.id = ANY(p_test_ids)
        ORDER BY t.code, tp.sort_order
    LOOP
        INSERT INTO public.report_results (
            report_id,
            test_code,
            parameter_code,
            parameter_name,
            unit,
            reference_range,
            min_val,
            max_val,
            critical_min,
            critical_max,
            sort_order
        ) VALUES (
            v_report_id,
            v_param.test_code,
            v_param.parameter_code,
            v_param.parameter_name,
            v_param.unit,
            v_param.resolved_range,
            v_param.min_val,
            v_param.max_val,
            v_param.critical_min,
            v_param.critical_max,
            v_param.sort_order
        );
    END LOOP;

    -- 8. Return generated transaction summary
    RETURN jsonb_build_object(
        'bill_id', v_bill_id,
        'bill_no', v_bill_no,
        'patient_id', v_patient_id,
        'patient_no', v_patient_no,
        'report_id', v_report_id,
        'subtotal', v_subtotal,
        'discount', v_discount,
        'total', v_total,
        'paid_amount', v_paid,
        'balance', v_balance,
        'payment_status', v_status
    );
END;
$$;

-- 3. Payment Collection Function
CREATE OR REPLACE FUNCTION public.collect_bill_payment(
    p_bill_id UUID,
    p_amount NUMERIC(12,2),
    p_mode TEXT DEFAULT 'Cash',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_bill RECORD;
    v_new_paid NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_new_status TEXT;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero.';
    END IF;

    SELECT * INTO v_bill FROM public.bills WHERE id = p_bill_id FOR UPDATE;
    IF v_bill.id IS NULL THEN
        RAISE EXCEPTION 'Bill not found.';
    END IF;
    IF v_bill.cancelled THEN
        RAISE EXCEPTION 'Cannot accept payment on a cancelled bill.';
    END IF;
    IF p_amount > v_bill.balance THEN
        RAISE EXCEPTION 'Payment amount exceeds current balance of %', v_bill.balance;
    END IF;

    v_new_paid := v_bill.paid_amount + p_amount;
    v_new_balance := v_bill.total - v_new_paid;

    IF v_new_balance = 0.00 THEN
        v_new_status := 'Paid';
    ELSE
        v_new_status := 'Partial';
    END IF;

    -- Record Payment
    INSERT INTO public.payments (
        bill_id,
        amount,
        mode,
        notes,
        created_by
    ) VALUES (
        p_bill_id,
        p_amount,
        COALESCE(p_mode, 'Cash'),
        p_notes,
        v_user_id
    );

    -- Update Bill
    UPDATE public.bills
    SET paid_amount = v_new_paid,
        balance = v_new_balance,
        payment_status = v_new_status
    WHERE id = p_bill_id;

    RETURN jsonb_build_object(
        'bill_id', p_bill_id,
        'bill_no', v_bill.bill_no,
        'paid_amount', v_new_paid,
        'balance', v_new_balance,
        'payment_status', v_new_status
    );
END;
$$;
-- ====================================================================
-- LABFLOW DIAGNOSTIC LABORATORY: SEED DATA 003
-- Initial Lab Settings, Default Referrers, and 15 Clinical Test Panels
-- ====================================================================

-- 1. Initial Lab Settings
INSERT INTO public.lab_settings (
    lab_name,
    tagline,
    address,
    phone,
    email,
    registration_no,
    pathologist_name,
    pathologist_qualification,
    lab_incharge,
    lab_incharge_qualification,
    letterhead_template,
    report_footer,
    working_hours
) VALUES (
    'Opti-X Labs',
    'Precision Diagnostics · Clinical Excellence',
    '#42, 10th Main, Vijayanagar, Bangalore - 560040',
    '+91 98450 12345',
    'contact@optixlabs.in',
    'KA-BLR-LAB-2026-089',
    'Dr. Ramesh Kumar',
    'MD (Pathology), DCP',
    'S. Nagaraj',
    'B.Sc MLT (Senior Technologist)',
    'classic',
    'Results relate only to the specimen tested. Please correlate clinically with symptoms and history.',
    'Mon – Sat: 7:00 AM – 8:30 PM | Sun: 7:00 AM – 1:00 PM'
)
ON CONFLICT DO NOTHING;

-- 2. Default Doctors
INSERT INTO public.doctors (name, qualification, phone, active) VALUES
    ('Self / Walk-in', '', '', true),
    ('Dr. Meera Iyer', 'MD (Gen Med)', '+91 98451 22334', true),
    ('Dr. Arjun Rao', 'MBBS, DNB', '+91 98452 33445', true)
ON CONFLICT DO NOTHING;

-- 3. Default Referral Labs & Hospitals
INSERT INTO public.referral_labs (name, active) VALUES
    ('Direct Walk-in', true),
    ('Apex Reference Lab', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.referral_hospitals (name, active) VALUES
    ('None / Independent', true),
    ('City Care Hospital', true)
ON CONFLICT DO NOTHING;

-- 4. 15 Test Panels & Parameters
DO $$
DECLARE
    v_test_id UUID;
BEGIN
    -- 1. CBC
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('CBC', 'Complete Blood Count', 'Hematology', 'EDTA whole blood', 450.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'hb', 'Hemoglobin', 'g/dL', '12.0 – 17.5', '13.5 – 17.5', '12.0 – 15.5', 12.0, 17.5, 7.0, 21.0, 1),
        (v_test_id, 'wbc', 'Total leukocyte count', 'cells/µL', '4,000 – 11,000', NULL, NULL, 4000, 11000, 2000, 40000, 2),
        (v_test_id, 'neutrophils', 'Neutrophils', '%', '40 – 70', NULL, NULL, 40, 70, NULL, NULL, 3),
        (v_test_id, 'lymphocytes', 'Lymphocytes', '%', '20 – 40', NULL, NULL, 20, 40, NULL, NULL, 4),
        (v_test_id, 'eosinophils', 'Eosinophils', '%', '1 – 6', NULL, NULL, 1, 6, NULL, NULL, 5),
        (v_test_id, 'monocytes', 'Monocytes', '%', '2 – 8', NULL, NULL, 2, 8, NULL, NULL, 6),
        (v_test_id, 'basophils', 'Basophils', '%', '0 – 1', NULL, NULL, 0, 1, NULL, NULL, 7),
        (v_test_id, 'platelets', 'Platelet count', 'lakh/µL', '1.5 – 4.5', NULL, NULL, 1.5, 4.5, 0.2, 10.0, 8),
        (v_test_id, 'rbc', 'Total RBC count', 'million/µL', '4.0 – 5.9', '4.5 – 5.9', '4.0 – 5.2', 4.0, 5.9, NULL, NULL, 9),
        (v_test_id, 'hct', 'Hematocrit (HCT)', '%', '36 – 53', '41 – 53', '36 – 46', 36, 53, 20, 60, 10),
        (v_test_id, 'mcv', 'Mean corpuscular volume (MCV)', 'fL', '80 – 100', NULL, NULL, 80, 100, NULL, NULL, 11),
        (v_test_id, 'mch', 'Mean corpuscular hemoglobin (MCH)', 'pg', '27 – 33', NULL, NULL, 27, 33, NULL, NULL, 12),
        (v_test_id, 'mchc', 'Mean corpuscular Hb concentration (MCHC)', 'g/dL', '31.5 – 35.5', NULL, NULL, 31.5, 35.5, NULL, NULL, 13),
        (v_test_id, 'rdw_cv', 'Red cell distribution width (RDW-CV)', '%', '11.5 – 14.5', NULL, NULL, 11.5, 14.5, NULL, NULL, 14),
        (v_test_id, 'rdw_sd', 'Red cell distribution width (RDW-SD)', 'fL', '39 – 46', NULL, NULL, 39, 46, NULL, NULL, 15);

    -- 2. LFT
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('LFT', 'Liver Function Test', 'Biochemistry', 'Serum', 700.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'bilirubin_total', 'Bilirubin, total', 'mg/dL', '0.2 – 1.2', 0.2, 1.2, NULL, 15.0, 1),
        (v_test_id, 'bilirubin_direct', 'Bilirubin, direct', 'mg/dL', '0.0 – 0.3', 0.0, 0.3, NULL, NULL, 2),
        (v_test_id, 'alt', 'Alanine aminotransferase (ALT)', 'U/L', '7 – 56', 7, 56, NULL, 1000, 3),
        (v_test_id, 'ast', 'Aspartate aminotransferase (AST)', 'U/L', '10 – 40', 10, 40, NULL, 1000, 4),
        (v_test_id, 'alp', 'Alkaline phosphatase (ALP)', 'U/L', '44 – 147', 44, 147, NULL, NULL, 5),
        (v_test_id, 'total_protein', 'Total protein', 'g/dL', '6.0 – 8.3', 6.0, 8.3, NULL, NULL, 6),
        (v_test_id, 'albumin', 'Albumin', 'g/dL', '3.5 – 5.0', 3.5, 5.0, 1.5, NULL, 7);

    -- 3. KFT
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('KFT', 'Kidney Function Test', 'Biochemistry', 'Serum', 650.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'urea', 'Blood urea', 'mg/dL', '15 – 45', 15, 45, NULL, 200, 1),
        (v_test_id, 'creatinine', 'Creatinine', 'mg/dL', '0.6 – 1.3', 0.6, 1.3, NULL, 10.0, 2),
        (v_test_id, 'uric_acid', 'Uric acid', 'mg/dL', '2.5 – 7.0', 2.5, 7.0, NULL, NULL, 3),
        (v_test_id, 'sodium', 'Sodium', 'mmol/L', '135 – 145', 135, 145, 120, 160, 4),
        (v_test_id, 'potassium', 'Potassium', 'mmol/L', '3.5 – 5.1', 3.5, 5.1, 2.5, 6.5, 5);

    -- 4. HBA1C
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('HBA1C', 'Glycated Hemoglobin', 'Biochemistry', 'EDTA whole blood', 550.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, min_val, max_val, sort_order) VALUES
        (v_test_id, 'hba1c', 'Glycated hemoglobin (HbA1c)', '%', '4.0 – 5.6', 4.0, 5.6, 1);

    -- 5. TSH
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('TSH', 'Thyroid Stimulating Hormone', 'Immunology', 'Serum', 400.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'tsh', 'Thyroid stimulating hormone (TSH)', 'µIU/mL', '0.4 – 4.0', 0.4, 4.0, 0.01, 100, 1);

    -- 6. LIPID
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('LIPID', 'Lipid Profile', 'Biochemistry', 'Serum', 750.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, min_val, max_val, sort_order) VALUES
        (v_test_id, 'cholesterol_total', 'Total cholesterol', 'mg/dL', 'Desirable: < 200', 0, 200, 1),
        (v_test_id, 'triglycerides', 'Triglycerides', 'mg/dL', 'Desirable: < 150', 0, 150, 2),
        (v_test_id, 'hdl', 'HDL cholesterol', 'mg/dL', '40 – 100', 40, 100, 3),
        (v_test_id, 'ldl', 'LDL cholesterol', 'mg/dL', 'Optimal: < 100', 0, 100, 4),
        (v_test_id, 'vldl', 'VLDL cholesterol', 'mg/dL', '5 – 40', 5, 40, 5);

    -- 7. GLUCOSE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('GLUCOSE', 'Blood Glucose (Fasting & Postprandial)', 'Biochemistry', 'Fluoride plasma', 200.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'glucose_fasting', 'Blood glucose, fasting', 'mg/dL', '70 – 99', 70, 99, 40, 500, 1),
        (v_test_id, 'glucose_postprandial', 'Blood glucose, 2-hour postprandial', 'mg/dL', '70 – 139', 70, 139, 40, 500, 2);

    -- 8. THYROID
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('THYROID', 'Thyroid Profile (T3, T4 & TSH)', 'Immunology', 'Serum', 750.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 't3_total', 'Triiodothyronine, total (T3)', 'ng/dL', '80 – 200', 80, 200, NULL, NULL, 1),
        (v_test_id, 't4_total', 'Thyroxine, total (T4)', 'µg/dL', '5.1 – 14.1', 5.1, 14.1, NULL, NULL, 2),
        (v_test_id, 'tsh', 'Thyroid stimulating hormone (TSH)', 'µIU/mL', '0.4 – 4.0', 0.4, 4.0, 0.01, 100, 3);

    -- 9. ESR
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('ESR', 'Erythrocyte Sedimentation Rate', 'Hematology', 'Anticoagulated whole blood', 150.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, sort_order) VALUES
        (v_test_id, 'esr', 'Erythrocyte sedimentation rate (ESR)', 'mm/hr', '0 – 20', '0 – 15', '0 – 20', 0, 20, 1);

    -- 10. CRP
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('CRP', 'C-Reactive Protein (Quantitative)', 'Immunology', 'Serum', 450.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, min_val, max_val, critical_max, sort_order) VALUES
        (v_test_id, 'crp', 'C-reactive protein, quantitative', 'mg/L', '0 – 5', 0, 5, 200, 1);

    -- 11. URIC_ACID
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('URIC_ACID', 'Uric Acid', 'Biochemistry', 'Serum', 250.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, min_val, max_val, sort_order) VALUES
        (v_test_id, 'uric_acid', 'Uric acid', 'mg/dL', '2.5 – 7.0', 2.5, 7.0, 1);

    -- 12. CALCIUM
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('CALCIUM', 'Calcium (Total)', 'Biochemistry', 'Serum', 250.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'calcium_total', 'Calcium, total', 'mg/dL', '8.6 – 10.2', 8.6, 10.2, 6.0, 13.0, 1);

    -- 13. ELECTROLYTES
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('ELECTROLYTES', 'Serum Electrolytes', 'Biochemistry', 'Serum', 500.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'sodium', 'Sodium', 'mmol/L', '135 – 145', 135, 145, 120, 160, 1),
        (v_test_id, 'potassium', 'Potassium', 'mmol/L', '3.5 – 5.1', 3.5, 5.1, 2.5, 6.5, 2),
        (v_test_id, 'chloride', 'Chloride', 'mmol/L', '98 – 107', 98, 107, 80, 120, 3);

    -- 14. IRON
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('IRON', 'Iron Profile', 'Biochemistry', 'Serum', 650.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, min_val, max_val, sort_order) VALUES
        (v_test_id, 'serum_iron', 'Iron, serum', 'µg/dL', '60 – 170', 60, 170, 1),
        (v_test_id, 'tibc', 'Total iron binding capacity (TIBC)', 'µg/dL', '250 – 450', 250, 450, 2),
        (v_test_id, 'transferrin_saturation', 'Transferrin saturation', '%', '20 – 50', 20, 50, 3);

    -- 15. VITD
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('VITD', 'Vitamin D (25-Hydroxy)', 'Immunology', 'Serum', 1200.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, min_val, max_val, sort_order) VALUES
        (v_test_id, 'vitamin_d_25oh', 'Vitamin D, 25-hydroxy', 'ng/mL', '30 – 100', 30, 100, 1);

END $$;
