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
-- LABFLOW / ANAND DIAGNOSTIC CENTER: SEED DATA 003
-- Initial Lab Settings, Default Referrers, and 38 Clinical Test Panels
-- ====================================================================

-- 1. Initial Lab Settings
INSERT INTO public.lab_settings (
    id,
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
    '00000000-0000-0000-0000-000000000001',
    'Anand Diagnostic Center',
    'Precision Diagnostics · Clinical Excellence',
    'Silk Filature Quarters Road, Ward No. 14, Sidlaghatta – 562105, Chikkaballapur (Dist.)',
    '6361303305',
    'hello@opti-x.in',
    'KA-BLR-LAB-2026-089',
    'Dr. Ramesh Kumar',
    'MD (Pathology), DCP',
    'S. Nagaraj',
    'B.Sc MLT (Senior Technologist)',
    'classic',
    'Results relate only to the specimen tested. Please correlate clinically with symptoms and history.',
    'Mon – Sat: 7:00 AM – 9:00 PM | Sun: 8:00 AM – 2:00 PM'
)
ON CONFLICT (id) DO UPDATE SET
    lab_name = EXCLUDED.lab_name,
    tagline = EXCLUDED.tagline,
    address = EXCLUDED.address,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    working_hours = EXCLUDED.working_hours;

-- 2. Referring Doctors (Empty by default - registered by laboratory staff)
-- 3. Referral Labs & Hospitals (Empty by default - registered by laboratory staff)

-- 4. 38 Test Panels & Parameters
DO $$
DECLARE
    v_test_id UUID;
BEGIN
    -- 1. CBC
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('CBC', 'Complete Blood Count (CBC)', 'Hematology', 'EDTA Whole Blood', 300.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'hb', 'Hemoglobin', 'g/dL', '12.0 – 17.5', '13.5 – 17.5', '12.0 – 15.5', 12, 17.5, 7, 21, 1),
        (v_test_id, 'wbc', 'Total Leukocyte Count (TLC)', 'cells/µL', '4,000 – 11,000', NULL, NULL, 4000, 11000, 2000, 40000, 2),
        (v_test_id, 'neutrophils', 'Neutrophils', '%', '40 – 70', NULL, NULL, 40, 70, NULL, NULL, 3),
        (v_test_id, 'lymphocytes', 'Lymphocytes', '%', '20 – 40', NULL, NULL, 20, 40, NULL, NULL, 4),
        (v_test_id, 'eosinophils', 'Eosinophils', '%', '1 – 6', NULL, NULL, 1, 6, NULL, NULL, 5),
        (v_test_id, 'monocytes', 'Monocytes', '%', '2 – 8', NULL, NULL, 2, 8, NULL, NULL, 6),
        (v_test_id, 'basophils', 'Basophils', '%', '0 – 1', NULL, NULL, 0, 1, NULL, NULL, 7),
        (v_test_id, 'platelets', 'Platelet Count', 'lakh/µL', '1.5 – 4.5', NULL, NULL, 1.5, 4.5, 0.2, 10, 8),
        (v_test_id, 'rbc', 'Total RBC Count', 'million/µL', '4.0 – 5.9', '4.5 – 5.9', '4.0 – 5.2', 4, 5.9, NULL, NULL, 9),
        (v_test_id, 'hct', 'Hematocrit (PCV)', '%', '36 – 53', '41 – 53', '36 – 46', 36, 53, 20, 60, 10),
        (v_test_id, 'mcv', 'Mean Corpuscular Volume (MCV)', 'fL', '80 – 100', NULL, NULL, 80, 100, NULL, NULL, 11),
        (v_test_id, 'mch', 'Mean Corpuscular Hemoglobin (MCH)', 'pg', '27 – 33', NULL, NULL, 27, 33, NULL, NULL, 12),
        (v_test_id, 'mchc', 'MCHC', 'g/dL', '31.5 – 35.5', NULL, NULL, 31.5, 35.5, NULL, NULL, 13),
        (v_test_id, 'rdw_cv', 'RDW-CV', '%', '11.5 – 14.5', NULL, NULL, 11.5, 14.5, NULL, NULL, 14),
        (v_test_id, 'rdw_sd', 'RDW-SD', 'fL', '39 – 46', NULL, NULL, 39, 46, NULL, NULL, 15);

    -- 2. BLOOD_GROUP
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('BLOOD_GROUP', 'Blood Grouping & Rh Type', 'Hematology', 'EDTA Whole Blood', 70.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'abo_group', 'ABO Blood Group', '', 'A / B / AB / O', NULL, NULL, 0, 1, NULL, NULL, 1),
        (v_test_id, 'rh_factor', 'Rh(D) Factor', '', 'Positive / Negative', NULL, NULL, 0, 1, NULL, NULL, 2);

    -- 3. WIDAL
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('WIDAL', 'Widal Test (Agglutination)', 'Serology', 'Serum', 200.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'widal_to', 'S. Typhi "O" Titer', 'Titer', '< 1:80 Non-Reactive', NULL, NULL, 0, 80, NULL, NULL, 1),
        (v_test_id, 'widal_th', 'S. Typhi "H" Titer', 'Titer', '< 1:80 Non-Reactive', NULL, NULL, 0, 80, NULL, NULL, 2),
        (v_test_id, 'widal_ah', 'S. Paratyphi "AH"', 'Titer', '< 1:80 Non-Reactive', NULL, NULL, 0, 80, NULL, NULL, 3),
        (v_test_id, 'widal_bh', 'S. Paratyphi "BH"', 'Titer', '< 1:80 Non-Reactive', NULL, NULL, 0, 80, NULL, NULL, 4),
        (v_test_id, 'widal_result', 'Widal Impression', '', 'Non-Reactive', NULL, NULL, 0, 1, NULL, NULL, 5);

    -- 4. CRP
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('CRP', 'CRP (C-Reactive Protein)', 'Biochemistry', 'Serum', 300.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'crp', 'C-Reactive Protein (Quantitative)', 'mg/L', '< 6.0', NULL, NULL, 0, 6, NULL, 100, 1);

    -- 5. PLATELET
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('PLATELET', 'Platelet Count (Plates Count)', 'Hematology', 'EDTA Whole Blood', 150.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'platelets', 'Platelet Count', 'lakh/µL', '1.5 – 4.5', NULL, NULL, 1.5, 4.5, 0.2, 10, 1);

    -- 6. AEC
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('AEC', 'AEC Count (Absolute Eosinophil)', 'Hematology', 'EDTA Whole Blood', 300.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'aec_count', 'Absolute Eosinophil Count', 'cells/µL', '40 – 440', NULL, NULL, 40, 440, NULL, NULL, 1);

    -- 7. ESR
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('ESR', 'ESR (Erythrocyte Sedimentation Rate)', 'Hematology', 'Sodium Citrate / EDTA Blood', 100.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'esr', 'ESR (Westergren 1 hr)', 'mm/hr', '0 – 20', '0 – 15', '0 – 20', 0, 20, NULL, NULL, 1);

    -- 8. MALARIA
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('MALARIA', 'Malaria Parasite (Smear & Card)', 'Parasitology', 'EDTA Whole Blood', 250.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'mp_smear', 'Smear for Malarial Parasite', '', 'Not Detected (Negative)', NULL, NULL, 0, 1, NULL, NULL, 1),
        (v_test_id, 'mp_pf', 'P. Falciparum Antigen', '', 'Negative', NULL, NULL, 0, 1, NULL, NULL, 2),
        (v_test_id, 'mp_pv', 'P. Vivax Antigen', '', 'Negative', NULL, NULL, 0, 1, NULL, NULL, 3);

    -- 9. MANTOUX
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('MANTOUX', 'Mantoux or PPD Test', 'Clinical Pathology', 'Intradermal Injection', 400.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'mantoux_induration', 'Induration Diameter', 'mm', '< 5 mm Negative, >= 10 mm Positive', NULL, NULL, 0, 9, NULL, NULL, 1),
        (v_test_id, 'mantoux_reading', 'Mantoux Interpretation', '', 'Negative after 48-72 hrs', NULL, NULL, 0, 1, NULL, NULL, 2);

    -- 10. CHIKUNGUNYA
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('CHIKUNGUNYA', 'Chikungunya Test (IgM & IgG)', 'Serology', 'Serum', 800.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'chik_igm', 'Chikungunya IgM Antibodies', '', 'Negative', NULL, NULL, 0, 1, NULL, NULL, 1),
        (v_test_id, 'chik_igg', 'Chikungunya IgG Antibodies', '', 'Negative', NULL, NULL, 0, 1, NULL, NULL, 2);

    -- 11. HIV
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('HIV', 'HIV 1 & 2 Antibody Screen', 'Serology', 'Serum', 450.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'hiv_screen', 'HIV 1 & 2 Antibody Screen', '', 'Non-Reactive', NULL, NULL, 0, 1, NULL, NULL, 1);

    -- 12. HBSAG
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('HBSAG', 'HBsAg (Hepatitis B Surface Antigen)', 'Serology', 'Serum', 300.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'hbsag_screen', 'HBsAg (Hepatitis B Surface Ag)', '', 'Non-Reactive', NULL, NULL, 0, 1, NULL, NULL, 1);

    -- 13. VDRL
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('VDRL', 'VDRL / RPR Syphilis Test', 'Serology', 'Serum', 200.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'vdrl_screen', 'VDRL / RPR Syphilis Test', '', 'Non-Reactive', NULL, NULL, 0, 1, NULL, NULL, 1);

    -- 14. HSV
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('HSV', 'HSV (Herpes Simplex 1 & 2 IgM)', 'Serology', 'Serum', 400.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'hsv1_igm', 'Herpes Simplex Virus 1 (HSV-1 IgM)', 'Index', '< 0.9 Negative', NULL, NULL, 0, 0.9, NULL, NULL, 1),
        (v_test_id, 'hsv2_igm', 'Herpes Simplex Virus 2 (HSV-2 IgM)', 'Index', '< 0.9 Negative', NULL, NULL, 0, 0.9, NULL, NULL, 2);

    -- 15. URINE_ROUTINE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('URINE_ROUTINE', 'Urine Routine & Microscopic', 'Clinical Pathology', 'Spot Urine', 100.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'urine_color', 'Color', '', 'Pale Yellow', NULL, NULL, 0, 1, NULL, NULL, 1),
        (v_test_id, 'urine_appearance', 'Appearance', '', 'Clear', NULL, NULL, 0, 1, NULL, NULL, 2),
        (v_test_id, 'urine_sp_gr', 'Specific Gravity', '', '1.005 – 1.030', NULL, NULL, 1.005, 1.03, NULL, NULL, 3),
        (v_test_id, 'urine_ph', 'pH', '', '5.0 – 7.5', NULL, NULL, 5, 7.5, NULL, NULL, 4),
        (v_test_id, 'urine_protein', 'Protein / Albumin', '', 'Nil', NULL, NULL, 0, 1, NULL, NULL, 5),
        (v_test_id, 'urine_sugar', 'Sugar / Glucose', '', 'Nil', NULL, NULL, 0, 1, NULL, NULL, 6),
        (v_test_id, 'urine_ketones', 'Ketone Bodies', '', 'Nil', NULL, NULL, 0, 1, NULL, NULL, 7),
        (v_test_id, 'urine_pus_cells', 'Pus Cells', '/hpf', '1 – 4', NULL, NULL, 0, 5, NULL, NULL, 8),
        (v_test_id, 'urine_rbc', 'Red Blood Cells', '/hpf', 'Nil', NULL, NULL, 0, 2, NULL, NULL, 9),
        (v_test_id, 'urine_epithelial', 'Epithelial Cells', '/hpf', '1 – 3', NULL, NULL, 0, 5, NULL, NULL, 10);

    -- 16. PREGNANCY
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('PREGNANCY', 'Pregnancy Test (Urine hCG Card)', 'Clinical Pathology', 'Early Morning Urine', 100.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'pregnancy_hcg', 'Urine hCG Pregnancy Test', '', 'Negative', NULL, NULL, 0, 1, NULL, NULL, 1);

    -- 17. FBS
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('FBS', 'Fasting Blood Sugar (FBS)', 'Biochemistry', 'Fluoride Plasma', 50.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'glucose_fasting', 'Fasting Blood Sugar (FBS)', 'mg/dL', '70 – 99 mg/dL (Normal: 70–99, Impaired: 100–125, Diabetic: ≥126)', NULL, NULL, 70, 99, 40, 500, 1);

    -- 18. PPBS
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('PPBS', 'Post Blood Sugar (PPBS)', 'Biochemistry', 'Fluoride Plasma', 50.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'glucose_postprandial', 'Post Prandial Blood Sugar (PPBS)', 'mg/dL', '< 140 mg/dL (Normal: <140, Impaired: 140–199, Diabetic: ≥200)', NULL, NULL, 70, 139, 40, 500, 1);

    -- 19. RA_FACTOR
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('RA_FACTOR', 'RA Factor (Rheumatoid Factor)', 'Serology', 'Serum', 150.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'ra_factor', 'Rheumatoid Factor (RA / RF)', 'IU/mL', '< 20.0 IU/mL (Negative)', NULL, NULL, 0, 20, NULL, NULL, 1);

    -- 20. ASLO
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('ASLO', 'ASLO / ASO Titer', 'Serology', 'Serum', 350.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'aslo_titer', 'ASLO / ASO Titer', 'IU/mL', '< 200 IU/mL (Negative)', NULL, NULL, 0, 200, NULL, NULL, 1);

    -- 21. HBA1C
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('HBA1C', 'HbA1c (Glycated Hemoglobin)', 'Biochemistry', 'EDTA Whole Blood', 500.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'hba1c', 'Glycated Hemoglobin (HbA1c)', '%', '< 5.7% (Normal: <5.7%, Prediabetes: 5.7–6.4%, Diabetes: ≥6.5%)', NULL, NULL, 4, 5.6, NULL, NULL, 1),
        (v_test_id, 'eag', 'Estimated Average Glucose (eAG)', 'mg/dL', '70 – 120 mg/dL', NULL, NULL, 70, 120, NULL, NULL, 2);

    -- 22. LFT
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('LFT', 'Liver Function Test (LFT)', 'Biochemistry', 'Serum', 450.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'bilirubin_total', 'Bilirubin, Total', 'mg/dL', '0.2 – 1.2 mg/dL', NULL, NULL, 0.2, 1.2, NULL, 15, 1),
        (v_test_id, 'bilirubin_direct', 'Bilirubin, Direct', 'mg/dL', '0.0 – 0.3 mg/dL', NULL, NULL, 0, 0.3, NULL, NULL, 2),
        (v_test_id, 'bilirubin_indirect', 'Bilirubin, Indirect', 'mg/dL', '0.1 – 0.8 mg/dL', NULL, NULL, 0.1, 0.8, NULL, NULL, 3),
        (v_test_id, 'alt', 'SGPT / ALT', 'U/L', '7 – 56 U/L', NULL, NULL, 7, 56, NULL, 1000, 4),
        (v_test_id, 'ast', 'SGOT / AST', 'U/L', '10 – 40 U/L', NULL, NULL, 10, 40, NULL, 1000, 5),
        (v_test_id, 'alp', 'Alkaline Phosphatase (ALP)', 'U/L', '44 – 147 U/L', NULL, NULL, 44, 147, NULL, NULL, 6),
        (v_test_id, 'total_protein', 'Total Protein', 'g/dL', '6.0 – 8.3 g/dL', NULL, NULL, 6, 8.3, NULL, NULL, 7),
        (v_test_id, 'albumin', 'Albumin', 'g/dL', '3.5 – 5.0 g/dL', NULL, NULL, 3.5, 5, 1.5, NULL, 8),
        (v_test_id, 'globulin', 'Globulin', 'g/dL', '2.0 – 3.5 g/dL', NULL, NULL, 2, 3.5, NULL, NULL, 9),
        (v_test_id, 'ag_ratio', 'A:G Ratio', '', '1.2 – 2.2', NULL, NULL, 1.2, 2.2, NULL, NULL, 10);

    -- 23. URIC_ACID
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('URIC_ACID', 'Uric Acid', 'Biochemistry', 'Serum', 250.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'uric_acid', 'Uric Acid', 'mg/dL', '2.5 – 7.2 mg/dL', '3.5 – 7.2 mg/dL', '2.6 – 6.0 mg/dL', 2.5, 7.2, NULL, NULL, 1);

    -- 24. THYROID_PROFILE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('THYROID_PROFILE', 'Thyroid Profile (T3, T4, TSH)', 'Endocrinology', 'Serum', 450.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 't3_total', 'Triiodothyronine (Total T3)', 'ng/dL', '80 – 200 ng/dL', NULL, NULL, 80, 200, NULL, NULL, 1),
        (v_test_id, 't4_total', 'Thyroxine (Total T4)', 'µg/dL', '5.1 – 14.1 µg/dL', NULL, NULL, 5.1, 14.1, NULL, NULL, 2),
        (v_test_id, 'tsh', 'Thyroid Stimulating Hormone (TSH)', 'µIU/mL', '0.40 – 4.50 µIU/mL', NULL, NULL, 0.4, 4.5, 0.01, 100, 3);

    -- 25. LIPID_PROFILE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('LIPID_PROFILE', 'Lipid Profile', 'Biochemistry', 'Fasting Serum', 500.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'cholesterol_total', 'Total Cholesterol', 'mg/dL', '< 200 mg/dL (Desirable: <200, Borderline: 200–239, High: ≥240)', NULL, NULL, 0, 200, NULL, NULL, 1),
        (v_test_id, 'triglycerides', 'Triglycerides', 'mg/dL', '< 150 mg/dL (Normal: <150, Borderline: 150–199, High: 200–499)', NULL, NULL, 0, 150, NULL, NULL, 2),
        (v_test_id, 'hdl', 'HDL Cholesterol', 'mg/dL', '> 40 (M), > 50 (F) mg/dL', '> 40 mg/dL', '> 50 mg/dL', 40, 100, NULL, NULL, 3),
        (v_test_id, 'ldl', 'LDL Cholesterol', 'mg/dL', '< 100 mg/dL (Optimal: <100, Borderline: 130–159, High: ≥160)', NULL, NULL, 0, 100, NULL, NULL, 4),
        (v_test_id, 'vldl', 'VLDL Cholesterol', 'mg/dL', '5 – 40 mg/dL', NULL, NULL, 5, 40, NULL, NULL, 5),
        (v_test_id, 'chol_hdl_ratio', 'Total Chol / HDL Ratio', '', '3.3 – 4.4', NULL, NULL, 3.3, 4.4, NULL, NULL, 6);

    -- 26. UREA
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('UREA', 'Blood Urea', 'Biochemistry', 'Serum', 140.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'urea', 'Blood Urea', 'mg/dL', '15 – 40 mg/dL', NULL, NULL, 15, 40, NULL, 200, 1);

    -- 27. ELECTROLYTES
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('ELECTROLYTES', 'Serum Electrolytes (Na, K, Cl)', 'Biochemistry', 'Serum', 500.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'sodium', 'Sodium (Na+)', 'mmol/L', '136 – 145 mmol/L', NULL, NULL, 136, 145, 120, 160, 1),
        (v_test_id, 'potassium', 'Potassium (K+)', 'mmol/L', '3.5 – 5.1 mmol/L', NULL, NULL, 3.5, 5.1, 2.5, 6.5, 2),
        (v_test_id, 'chloride', 'Chloride (Cl-)', 'mmol/L', '98 – 107 mmol/L', NULL, NULL, 98, 107, 80, 120, 3);

    -- 28. CREATININE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('CREATININE', 'Creatinine', 'Biochemistry', 'Serum', 150.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'creatinine', 'Serum Creatinine', 'mg/dL', '0.6 – 1.3 mg/dL', '0.7 – 1.3 mg/dL', '0.6 – 1.1 mg/dL', 0.6, 1.3, NULL, 10, 1);

    -- 29. FSH
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('FSH', 'FSH (Follicle Stimulating Hormone)', 'Endocrinology', 'Serum', 350.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'fsh', 'Follicle Stimulating Hormone (FSH)', 'mIU/mL', '1.5 – 12.4 (M), 3.5 – 12.5 (F)', NULL, NULL, 1.5, 12.4, NULL, NULL, 1);

    -- 30. LH
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('LH', 'LH (Luteinizing Hormone)', 'Endocrinology', 'Serum', 350.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'lh', 'Luteinizing Hormone (LH)', 'mIU/mL', '1.7 – 8.6 (M), 2.4 – 12.6 (F)', NULL, NULL, 1.7, 8.6, NULL, NULL, 1);

    -- 31. PROLACTIN
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('PROLACTIN', 'Prolactin', 'Endocrinology', 'Fasting Morning Serum', 600.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'prolactin', 'Serum Prolactin', 'ng/mL', '4.0 – 15.2 (M), 4.8 – 23.3 (F)', NULL, NULL, 4, 20, NULL, NULL, 1);

    -- 32. TESTOSTERONE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('TESTOSTERONE', 'Testosterone (Total)', 'Endocrinology', 'Morning Serum', 600.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'testosterone', 'Total Testosterone', 'ng/dL', '240 – 870 (M), 8.4 – 48.1 (F)', NULL, NULL, 240, 870, NULL, NULL, 1);

    -- 33. IRON_PROFILE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('IRON_PROFILE', 'Iron Profile', 'Biochemistry', 'Fasting Serum', 1500.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'serum_iron', 'Serum Iron', 'µg/dL', '50 – 170', NULL, NULL, 50, 170, NULL, NULL, 1),
        (v_test_id, 'tibc', 'Total Iron Binding Capacity (TIBC)', 'µg/dL', '250 – 450', NULL, NULL, 250, 450, NULL, NULL, 2),
        (v_test_id, 'transferrin_sat', 'Transferrin Saturation', '%', '20 – 50', NULL, NULL, 20, 50, NULL, NULL, 3);

    -- 34. ANA_PROFILE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('ANA_PROFILE', 'ANA Profile', 'Immunology', 'Serum', 3500.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'ana_screen', 'ANA Primary Screen (IFA / EIA)', '', 'Negative (< 1:100)', NULL, NULL, 0, 1, NULL, NULL, 1),
        (v_test_id, 'anti_dsdna', 'Anti-dsDNA Antibodies', 'IU/mL', '< 10 Negative', NULL, NULL, 0, 10, NULL, NULL, 2),
        (v_test_id, 'ana_pattern', 'ANA Nuclear Pattern', '', 'Homogeneous / Speckled / Negative', NULL, NULL, 0, 1, NULL, NULL, 3);

    -- 35. DENGUE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('DENGUE', 'Dengue Test (NS1 Ag + IgM/IgG)', 'Serology', 'Serum', 600.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'dengue_ns1', 'Dengue NS1 Antigen', '', 'Negative', NULL, NULL, 0, 1, NULL, NULL, 1),
        (v_test_id, 'dengue_igm', 'Dengue IgM Antibodies', '', 'Negative', NULL, NULL, 0, 1, NULL, NULL, 2),
        (v_test_id, 'dengue_igg', 'Dengue IgG Antibodies', '', 'Negative', NULL, NULL, 0, 1, NULL, NULL, 3);

    -- 36. AMYLASE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('AMYLASE', 'Serum Amylase', 'Biochemistry', 'Serum', 500.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'amylase', 'Serum Amylase', 'U/L', '28 – 100', NULL, NULL, 28, 100, NULL, NULL, 1);

    -- 37. LIPASE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('LIPASE', 'Serum Lipase', 'Biochemistry', 'Serum', 400.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'lipase', 'Serum Lipase', 'U/L', '13 – 60', NULL, NULL, 13, 60, NULL, NULL, 1);

    -- 38. CALCIUM
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('CALCIUM', 'Serum Calcium', 'Biochemistry', 'Serum', 450.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'calcium_total', 'Serum Calcium (Total)', 'mg/dL', '8.5 – 10.5', NULL, NULL, 8.5, 10.5, 6, 13, 1);

END $$;


-- ====================================================================
-- LABFLOW / ANAND DIAGNOSTIC CENTER: CLINICAL TEST CATALOGUE V2 (004)
-- Revision 2: Diagnostic reference intervals, numeric rules, critical
-- limits, sources, and clinical calculation/interpretation procedures.
-- ====================================================================

-- Anand Diagnostic Center | LabFlow clinical test catalogue, revision 2
-- PostgreSQL 14+  |  UTF-8  |  22 November 2026
--
-- Run the complete file in a PostgreSQL SQL editor, or use:
--   psql -X -v ON_ERROR_STOP=1 -d your_database -f Anand_Lab_Catalog_v2.sql
-- This transaction creates a separate catalogue. No public table or patient record is changed.
-- Published adult examples require local verification against the actual assay and population.
-- The source seed supplied prices, but supplied no local method list, approved intervals or
-- signed critical-result policy. See the accompanying review for the before/after comparison.
--
-- Start with: SELECT * FROM labflow_catalog_v2.catalogue ORDER BY panel_order, sort_order;
-- Numeric bands: SELECT * FROM labflow_catalog_v2.numeric_rules ORDER BY test_code, parameter_code, rule_no;
-- The last section contains the optional LabFlow import and an existing-database comparison.

BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
SELECT pg_advisory_xact_lock(1279345222, 2);
CREATE SCHEMA IF NOT EXISTS labflow_catalog_v2;

CREATE TABLE IF NOT EXISTS labflow_catalog_v2.sources (
    code text PRIMARY KEY,
    publisher text NOT NULL,
    title text NOT NULL,
    url text NOT NULL
);

CREATE TABLE IF NOT EXISTS labflow_catalog_v2.tests (
    code text PRIMARY KEY,
    name text NOT NULL,
    department text NOT NULL,
    sample_type text NOT NULL,
    price_inr numeric(12,2) NOT NULL CHECK (price_inr >= 0),
    panel_order smallint NOT NULL UNIQUE CHECK (panel_order > 0),
    catalog_status text NOT NULL CHECK (catalog_status IN ('review', 'archive')),
    reporting_note text NOT NULL
);

CREATE TABLE IF NOT EXISTS labflow_catalog_v2.parameters (
    test_code text NOT NULL REFERENCES labflow_catalog_v2.tests(code),
    code text NOT NULL,
    name text NOT NULL,
    sort_order smallint NOT NULL CHECK (sort_order > 0),
    result_kind text NOT NULL CHECK (result_kind IN
        ('number','calculated','method_numeric','count_per_field','category','description','ordinal','titre','narrative')),
    unit text CHECK (unit IS NULL OR btrim(unit) <> ''),
    expected_result text,          -- display information only; never a patient result default
    allowed_results text[],        -- NULL for free text or a site/kit-defined graded list
    inclusion text NOT NULL CHECK (inclusion IN ('routine','conditional','optional','archived')),
    report_when text,
    calculation text,
    reporting_note text NOT NULL,
    origin text NOT NULL CHECK (origin IN ('supplied','added')),
    PRIMARY KEY (test_code, code),
    UNIQUE (test_code, sort_order),
    UNIQUE (test_code, code, result_kind),
    CHECK (result_kind IN ('number','calculated','method_numeric','count_per_field') OR unit IS NULL),
    CHECK ((result_kind = 'calculated') = (calculation IS NOT NULL)),
    CHECK ((inclusion IN ('conditional','optional')) = (report_when IS NOT NULL)),
    CHECK (allowed_results IS NULL OR
        (result_kind = 'category' AND cardinality(allowed_results) > 0
         AND array_position(allowed_results, NULL::text) IS NULL)),
    CHECK (expected_result IS NULL OR allowed_results IS NULL OR expected_result = ANY(allowed_results))
);

CREATE TABLE IF NOT EXISTS labflow_catalog_v2.parameter_sources (
    test_code text NOT NULL,
    parameter_code text NOT NULL,
    source_code text NOT NULL REFERENCES labflow_catalog_v2.sources(code),
    PRIMARY KEY (test_code, parameter_code, source_code),
    FOREIGN KEY (test_code, parameter_code) REFERENCES labflow_catalog_v2.parameters(test_code, code)
);

-- Ages are completed years: [18,20) covers ages 18 and 19.
-- numrange preserves < versus ≤, and > versus ≥, without inventing a maximum or a minimum.
-- To adopt a band, insert a NEW 'local_verified' row under its real local_method,
-- with the local limits, verifier, date and evidence. Published examples stay separate.
CREATE TABLE IF NOT EXISTS labflow_catalog_v2.numeric_rules (
    test_code text NOT NULL,
    parameter_code text NOT NULL,
    result_kind text NOT NULL CHECK (result_kind IN ('number','calculated','method_numeric','count_per_field')),
    rule_set text NOT NULL CHECK (rule_set IN ('published_example','local_verified')),
    local_method text NOT NULL,
    rule_no smallint NOT NULL CHECK (rule_no > 0),
    rule_kind text NOT NULL CHECK (rule_kind IN ('reference','decision')),
    age_years int4range NOT NULL,
    sex_group text NOT NULL CHECK (sex_group IN ('any','male','female')),
    reproductive_group text NOT NULL CHECK (reproductive_group IN
        ('any','follicular','midcycle','luteal','postmenopausal','nonlactating')),
    context_key text NOT NULL CHECK (context_key IN ('routine','fasting_8h','fasting_lipids','diagnostic_hba1c')),
    value_band numrange NOT NULL,
    unit_at_definition text,
    band_label text NOT NULL,
    source_code text NOT NULL REFERENCES labflow_catalog_v2.sources(code),
    verified_by text,
    verified_on date,
    verification_record text,
    PRIMARY KEY (test_code, parameter_code, rule_set, local_method, rule_no),
    FOREIGN KEY (test_code, parameter_code, result_kind)
        REFERENCES labflow_catalog_v2.parameters(test_code, code, result_kind),
    CHECK (NOT isempty(value_band) AND NOT (lower_inf(value_band) AND upper_inf(value_band))),
    CHECK (NOT isempty(age_years) AND NOT lower_inf(age_years) AND lower(age_years) >= 18),
    CHECK (reproductive_group = 'any' OR sex_group = 'female'),
    CHECK ((rule_set = 'published_example' AND local_method = '' AND verified_by IS NULL
            AND verified_on IS NULL AND verification_record IS NULL)
       OR (rule_set = 'local_verified' AND btrim(local_method) <> ''
            AND NULLIF(btrim(verified_by), '') IS NOT NULL AND verified_on IS NOT NULL
            AND NULLIF(btrim(verification_record), '') IS NOT NULL))
);

-- Only locally specified and authorized alert rules belong here. The seed provides none.
-- This register is separate from reference intervals, diagnostic bands and instrument limits.
-- The approved local SOP governs calls, timing, documentation and qualitative critical events.
CREATE TABLE IF NOT EXISTS labflow_catalog_v2.critical_limits (
    test_code text NOT NULL,
    parameter_code text NOT NULL,
    result_kind text NOT NULL CHECK (result_kind IN ('number','calculated','method_numeric','count_per_field')),
    local_method text NOT NULL CHECK (btrim(local_method) <> ''),
    policy_rule text NOT NULL CHECK (btrim(policy_rule) <> ''),
    population text NOT NULL CHECK (btrim(population) <> ''),
    unit_at_approval text,
    alert_band numrange NOT NULL CHECK (NOT isempty(alert_band) AND NOT (lower_inf(alert_band) AND upper_inf(alert_band))),
    notification_policy text NOT NULL CHECK (btrim(notification_policy) <> ''),
    approved_by text NOT NULL CHECK (btrim(approved_by) <> ''),
    approved_on date NOT NULL,
    PRIMARY KEY (test_code, parameter_code, local_method, policy_rule),
    FOREIGN KEY (test_code, parameter_code, result_kind)
        REFERENCES labflow_catalog_v2.parameters(test_code, code, result_kind)
);

-- Re-running the seed fills missing catalogue keys. Local edits and verification records survive.

INSERT INTO labflow_catalog_v2.sources
    (code, publisher, title, url)
VALUES
    ('EP28', 'CLSI', 'EP28 • Verification of laboratory reference intervals', 'https://clsi.org/shop/standards/ep28/'),
    ('GP47', 'CLSI', 'GP47 • Critical and significant-risk results', 'https://clsi.org/shop/standards/gp47/'),
    ('ICMR', 'Indian Council of Medical Research', 'Good Clinical Laboratory Practices, 2021', 'https://www.icmr.gov.in/icmrobject/custom_data/pdf/resource-guidelines/GCLP_Guidelines_2020_Final.pdf'),
    ('CBC', 'Rush Medical Laboratories', 'Adult complete blood count and automated differential', 'https://www.rush.edu/rush-medical-laboratories-testing-services/normal-ranges-common-laboratory-tests'),
    ('PLT', 'National Heart, Lung, and Blood Institute', 'Adult platelet counts and units', 'https://www.nhlbi.nih.gov/health/thrombocytopenia'),
    ('RDW', 'Sysmex', 'XN-series analyzer reference intervals', 'https://www.sysmex.de/fileadmin/media/f101/Brochures_Flyer/XN-Series_Reference_Ranges.pdf'),
    ('ESR', 'University Hospitals Dorset NHS', 'ESR by Starrsed EDTA and manual methods', 'https://www.uhd.nhs.uk/services/pathology/haematology/test-repertoire-and-reference-ranges'),
    ('ABO', 'Government of India', 'National Standards for Blood Centres and Blood Transfusion Services', 'https://clinicalestablishments.mohfw.gov.in/sites/default/files/2022-07/1491_1.pdf'),
    ('WID', 'CDC', 'Clinical guidance for typhoid and paratyphoid fever', 'https://www.cdc.gov/typhoid-fever/hcp/clinical-guidance/index.html'),
    ('CRP', 'Mayo Clinic Laboratories', 'CRP, conventional quantitative serum assay', 'https://mml.testcatalog.org/show/CRP'),
    ('MAL', 'CDC', 'Malaria diagnostic tests and microscopy', 'https://www.cdc.gov/malaria/hcp/diagnosis-testing/malaria-diagnostic-tests.html'),
    ('PAN', 'World Health Organization', 'Generic malaria Pf/Pan rapid test result guide', 'https://cdn.who.int/media/docs/default-source/malaria/diagnosis/genericpfpanguide-final.pdf'),
    ('TBI', 'Central TB Division, India', 'Programmatic management of TB preventive treatment', 'https://nti.gov.in/wp-content/uploads/2024/06/Guidelines-for-Programmatic-Management-of-Tuberculosis-Preventive-Treatment-in-India.pdf'),
    ('TST', 'National Tuberculosis Institute, India', 'NTEP training modules for programme managers and medical officers', 'https://nti.gov.in/?p=11850'),
    ('CHIK', 'CDC', 'Clinical testing for chikungunya virus disease', 'https://www.cdc.gov/chikungunya/hcp/diagnosis-testing/index.html'),
    ('HIV', 'National AIDS Control Organisation, India', 'National HIV Counselling and Testing Guidelines, 2024', 'https://naco.mohfw.gov.in/wp-content/uploads/2026/11/NACO_HCTS-Guideline-2024_02.11.2026.pdf'),
    ('HBV', 'CDC', 'Viral hepatitis surveillance, appendix D on HBsAg testing', 'https://www.cdc.gov/hepatitis/php/surveillance-guidance/appendices.html'),
    ('SYPH', 'CDC', 'Laboratory recommendations for syphilis testing, 2024', 'https://www.cdc.gov/mmwr/volumes/73/rr/rr7301a1.htm'),
    ('HSV', 'CDC', 'Genital herpes, STI treatment guidelines', 'https://www.cdc.gov/STD/treatment-guidelines/herpes.htm'),
    ('UA', 'University of Iowa Health Care', 'Urinalysis chemistry and strip components', 'https://www.healthcare.uiowa.edu/path_handbook/handbook/test2590.html'),
    ('UAM', 'University of Iowa Health Care', 'Urine microscopy by flow-through microscopy', 'https://www.healthcare.uiowa.edu/path_handbook/handbook/test3139.html'),
    ('SG', 'MedlinePlus', 'Urine specific gravity', 'https://medlineplus.gov/ency/article/003587.htm'),
    ('PH', 'MedlinePlus', 'Urine pH', 'https://www.medlineplus.gov/ency/article/003583.htm'),
    ('COLOR', 'Cleveland Clinic', 'Urinalysis and specimen appearance', 'https://my.clevelandclinic.org/health/diagnostics/17893-urinalysis'),
    ('HCG', 'U.S. Food and Drug Administration', 'Qualitative urine pregnancy tests', 'https://www.fda.gov/medical-devices/home-use-tests/pregnancy'),
    ('ADA', 'American Diabetes Association', 'Diagnosis and Classification of Diabetes, Standards of Care 2026', 'https://doi.org/10.2337/dc26-s002'),
    ('FPG', 'MedlinePlus', 'Fasting blood glucose', 'https://medlineplus.gov/ency/article/003482.htm'),
    ('GLU', 'AACC and American Diabetes Association', 'Laboratory analysis in diabetes, specimen handling', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12376302/'),
    ('PP', 'A.J. Hospital & Research Centre, Mangaluru', 'Sample Collection Manual, postprandial blood glucose', 'https://ajhospital.in/storage/files/Lab-DOS/SAMPLE%20COLLECTION%20MANUAL_FINAL.pdf'),
    ('RF', 'Mayo Clinic Laboratories', 'Rheumatoid factor, quantitative serum assay', 'https://mml.testcatalog.org/show/RHUT'),
    ('ASO', 'Mayo Clinic Laboratories', 'Antistreptolysin O, quantitative age-specific interpretation', 'https://mml.testcatalog.org/show/ASO'),
    ('EAG', 'NGSP', 'Estimated average glucose from HbA1c', 'https://ngsp.org/A1ceAG.asp'),
    ('LFT', 'Mayo Clinic Laboratories', 'Liver profile, serum', 'https://www.mayocliniclabs.com/test-catalog/overview/113633'),
    ('LFTC', 'UT Southwestern Medical Center', 'Hepatic function panel components', 'https://utsouthwestern.testcatalog.org/show/5300782'),
    ('CMP', 'Mayo Clinic Laboratories', 'Comprehensive metabolic panel, serum', 'https://www.testcatalog.org/show/CMAMA'),
    ('URIC', 'Mayo Clinic Laboratories', 'Uric acid, serum', 'https://mml.testcatalog.org/show/URIC'),
    ('T3', 'Mayo Clinic Laboratories', 'Total triiodothyronine, serum', 'https://mml.testcatalog.org/show/T3'),
    ('T4', 'Mayo Clinic Laboratories', 'Total thyroxine, serum', 'https://mml.testcatalog.org/show/T4'),
    ('TSH', 'Mayo Clinic Laboratories', 'Sensitive TSH, serum', 'https://mml.testcatalog.org/show/STSH'),
    ('LIPID', 'MedlinePlus', 'Cholesterol levels and general risk categories', 'https://medlineplus.gov/cholesterollevelswhatyouneedtoknow.html'),
    ('CSI', 'Cardiological Society of India', 'Dyslipidemia guidelines, executive summary', 'https://pubmed.ncbi.nlm.nih.gov/38052658/'),
    ('ACC', 'ACC and AHA', '2026 guideline on dyslipidemia and lipid reporting', 'https://doi.org/10.1016/j.jacc.2025.11.016'),
    ('UREA', 'DiaSys Diagnostic Systems', 'Urea and urea nitrogen reference intervals', 'https://www.diasys-diagnostics.com/en/service-area/support/reference-ranges/analyte/urea/analyte.show'),
    ('FSH', 'Mayo Clinic Laboratories', 'Follicle-stimulating hormone, serum', 'https://endocrinology.testcatalog.org/show/FSH'),
    ('LH', 'Mayo Clinic Laboratories', 'Luteinizing hormone, serum', 'https://endocrinology.testcatalog.org/show/LH'),
    ('PRL', 'Mayo Clinic Laboratories', 'Prolactin, serum', 'https://mml.testcatalog.org/show/PRL'),
    ('TESTO', 'Mayo Clinic Laboratories', 'Total testosterone by mass spectrometry', 'https://mml.testcatalog.org/show/TTST'),
    ('IRON', 'Mayo Clinic Laboratories', 'Iron, total iron-binding capacity and saturation', 'https://www.mayocliniclabs.com/test-catalog/overview/621385'),
    ('ANA', 'ARUP Consult', 'ANA with HEp-2 substrate by immunofluorescence', 'https://arupconsult.com/ati/antinuclear-antibody-ana-hep-2-substrate'),
    ('DNA', 'ARUP Laboratories', 'Anti-dsDNA IgG by ELISA with reflex IFA, assay example', 'https://www.aruplab.com/Testing-Information/resources/HotLines/Sample_Reports/May2021/0050215_Double-Stranded%20DNA%20%28dsDNA%29%20Antibody%2C%20IgG%20by%20ELISA%20with%20Reflex%20to%20dsDNA%20Antibody%2C%20IgG%20by%20IFA_DNA.pdf'),
    ('DENV', 'CDC', 'Serologic testing for dengue', 'https://www.cdc.gov/dengue/hcp/diagnosis-testing/serologic-tests-for-dengue-virus.html'),
    ('DUO', 'Abbott India', 'Bioline Dengue Duo, qualitative NS1 and IgM/IgG format', 'https://www.globalpointofcare.abbott/in/en/product-details/bioline-dengue-duo-ns1-ag-ab-combo.html'),
    ('AMY', 'Mayo Clinic Laboratories', 'Total amylase, serum', 'https://mml.testcatalog.org/show/AMS'),
    ('LPS', 'Mayo Clinic Laboratories', 'Lipase, serum', 'https://mml.testcatalog.org/show/LPS')
ON CONFLICT DO NOTHING;

INSERT INTO labflow_catalog_v2.tests
    (code, name, department, sample_type, price_inr, panel_order, catalog_status, reporting_note)
VALUES
    ('CBC', 'Complete blood count with five-part differential', 'Hematology', 'EDTA whole blood', 250.0, 1, 'review', 'Use the analyzer’s verified blood-count and differential intervals. A three-part instrument cannot supply a five-part differential. Confirm whether RDW-SD is reported.'),
    ('BLOOD_GROUP', 'ABO group and RhD type', 'Hematology', 'EDTA whole blood', 70.0, 2, 'review', 'Report blood-group classifications. Resolve discrepancies and weak or indeterminate D by the transfusion service protocol.'),
    ('WIDAL', 'Widal agglutination (legacy)', 'Serology', 'Serum', 200.0, 3, 'archive', 'Archive for historical lookup. A single antibody titre has poor diagnostic specificity. Blood culture is preferred in suspected enteric fever.'),
    ('CRP', 'C-reactive protein, quantitative', 'Biochemistry', 'Serum', 300.0, 4, 'review', 'This order is for conventional quantitative CRP. A high-sensitivity assay or a qualitative latex test needs its own method definition.'),
    ('PLATELET', 'Platelet count', 'Hematology', 'EDTA whole blood', 150.0, 5, 'review', 'Standalone order and CBC use the same count, unit and reference proposal. One lakh equals 100,000.'),
    ('AEC', 'Absolute eosinophil count', 'Hematology', 'EDTA whole blood', 300.0, 6, 'review', 'The reference uses an automated absolute count in cells/µL. Confirm whether the local count is automated or manual.'),
    ('ESR', 'Erythrocyte sedimentation rate (ESR)', 'Hematology', 'Whole blood in the tube specified by the ESR method', 100.0, 7, 'review', 'Record the method and anticoagulant. The example intervals are for the Starrsed EDTA method. A manual citrate Westergren procedure needs its own verification.'),
    ('MALARIA', 'Malaria microscopy and rapid antigen test', 'Parasitology', 'EDTA whole blood', 250.0, 8, 'review', 'Record which examinations were performed. Complete species and parasite density when microscopy detects parasites. Select antigen fields that match the actual kit.'),
    ('MANTOUX', 'Mantoux tuberculin skin test (PPD)', 'Clinical Pathology', 'In vivo skin test (no specimen)', 400.0, 9, 'review', 'Record placement time, reading time and transverse palpable induration in mm at 48–72 hours. Use the NTEP PPD protocol and patient risk group for interpretation. Cy-Tb is a different test.'),
    ('CHIKUNGUNYA', 'Chikungunya IgM and IgG, qualitative', 'Serology', 'Serum', 800.0, 10, 'review', 'Use this listing only for a kit reporting both antibodies qualitatively. Record illness timing and follow the local confirmatory pathway for a reactive IgM.'),
    ('HIV', 'HIV-1/2 antibody screen', 'Serology', 'Serum', 450.0, 11, 'review', 'This order is antibody-only. Report the screening result. Refer reactive screens for confirmation under the NACO testing pathway. Use a distinct order for a combined antigen/antibody assay.'),
    ('HBSAG', 'Hepatitis B surface antigen (HBsAg) screen', 'Serology', 'Serum', 300.0, 12, 'review', 'Use the screening assay’s interpretation and its repeat or confirmation algorithm for initially reactive results.'),
    ('VDRL', 'Syphilis nontreponemal screen (record VDRL or RPR)', 'Serology', 'Serum', 200.0, 13, 'review', 'Record the method actually used. Report an endpoint titre for reactive serum and follow the treponemal confirmation pathway. Use the same nontreponemal method for serial titres.'),
    ('HSV', 'HSV-1/2 IgM (legacy)', 'Serology', 'Serum', 400.0, 14, 'archive', 'Retain the original codes for history. HSV IgM does not reliably identify the HSV type and is unsuitable for routine diagnosis.'),
    ('URINE_ROUTINE', 'Urinalysis with microscopy (listed components)', 'Clinical Pathology', 'Fresh, clean-catch midstream urine', 100.0, 15, 'review', 'This catalog contains the ten supplied components. Confirm the actual strip and microscopy menu. Blood, nitrite, leukocyte esterase, bilirubin, urobilinogen, casts, crystals and bacteria are examples of additional reportables only if performed.'),
    ('PREGNANCY', 'Urine hCG, qualitative', 'Clinical Pathology', 'Urine (first morning preferred for early testing)', 100.0, 16, 'review', 'The detection threshold belongs to the kit. A negative result can occur early or with dilute urine. Release only a valid test.'),
    ('FBS', 'Fasting plasma glucose (FBS)', 'Biochemistry', 'Venous plasma', 50.0, 17, 'review', 'Document at least 8 hours without caloric intake. Use a validated glycolysis-inhibition or prompt separation procedure. Sodium fluoride alone does not promptly stop early glycolysis.'),
    ('PPBS', 'Two-hour postprandial plasma glucose (PPBS)', 'Biochemistry', 'Venous plasma', 50.0, 18, 'review', 'Record the start of the usual meal and the collection time. The standardized 75 g OGTT has a different order and diagnostic criteria.'),
    ('RA_FACTOR', 'Rheumatoid factor (RF), quantitative', 'Serology', 'Serum', 150.0, 19, 'review', 'The result is an RF concentration. A qualitative slide latex result requires a different result type and units.'),
    ('ASLO', 'Antistreptolysin O (ASO), quantitative', 'Serology', 'Serum', 350.0, 20, 'review', 'An IU/mL result is a concentration. Use the local assay and age-specific upper limit. A dilution titre uses a different representation.'),
    ('HBA1C', 'HbA1c with estimated average glucose', 'Biochemistry', 'EDTA whole blood', 500.0, 21, 'review', 'Use an NGSP-certified, DCCT-standardized method for diagnostic interpretation. Review haemoglobin variants, altered red cell survival and recent transfusion when relevant.'),
    ('LFT', 'Liver function panel', 'Biochemistry', 'Serum', 450.0, 22, 'review', 'Use method-specific enzyme and protein intervals. Calculate derived results only from valid components from the same collection. Neonatal bilirubin needs age-in-hours interpretation.'),
    ('URIC_ACID', 'Uric acid, serum', 'Biochemistry', 'Serum', 250.0, 23, 'review', 'Use the sex-specific adult interval verified for the assay. Gout treatment targets are separate clinical decisions.'),
    ('THYROID_PROFILE', 'Thyroid profile (total T3, total T4 and TSH)', 'Endocrinology', 'Serum', 450.0, 24, 'review', 'Retain total T3 and total T4 and their original unit systems. Pregnancy requires appropriate method- and gestation-specific interpretation.'),
    ('LIPID_PROFILE', 'Lipid profile', 'Biochemistry', 'Serum (record fasting status)', 500.0, 25, 'review', 'Record fasting status and the method used for LDL-C and VLDL-C. Apply risk-specific clinical lipid goals. Non-HDL-C can be calculated from total cholesterol and HDL-C.'),
    ('UREA', 'Urea, serum', 'Biochemistry', 'Serum', 140.0, 26, 'review', 'Measure the mass concentration of urea. Blood urea nitrogen (BUN) has a different numeric scale in mg/dL.'),
    ('ELECTROLYTES', 'Electrolytes (sodium, potassium and chloride)', 'Biochemistry', 'Serum', 500.0, 27, 'review', 'Specimen and method matter, especially for potassium. Haemolysis and critical values require the laboratory’s review and notification procedures.'),
    ('CREATININE', 'Creatinine, serum', 'Biochemistry', 'Serum', 150.0, 28, 'review', 'Use an assay-traceable, sex-specific interval. eGFR is a separately derived estimate and requires the appropriate equation and patient context.'),
    ('FSH', 'Follicle-stimulating hormone (FSH)', 'Endocrinology', 'Serum', 350.0, 29, 'review', 'Use the appropriate sex and menstrual phase or menopausal group. A missing phase cannot select a female interval.'),
    ('LH', 'Luteinizing hormone (LH)', 'Endocrinology', 'Serum', 350.0, 30, 'review', 'Use the appropriate sex and menstrual phase or menopausal group. A missing phase cannot select a female interval.'),
    ('PROLACTIN', 'Prolactin', 'Endocrinology', 'Serum', 600.0, 31, 'review', 'Follow the performing method’s timing and preparation instructions. Pregnancy and lactation change interpretation. Fasting is a preparation detail, not a specimen type.'),
    ('TESTOSTERONE', 'Total testosterone', 'Endocrinology', 'Serum (morning collection preferred)', 600.0, 32, 'review', 'Document collection time and method. The published example is for LC-MS/MS. Check method performance at low concentrations.'),
    ('IRON_PROFILE', 'Iron, total iron-binding capacity and transferrin saturation', 'Biochemistry', 'Serum', 1500.0, 33, 'review', 'Record collection time and recent iron intake per local protocol. Morning collection and an 8-hour fast are preferred in the cited method. Ferritin is a separate test.'),
    ('ANA_PROFILE', 'ANA by HEp-2 IFA with anti-dsDNA IgG', 'Immunology', 'Serum', 3500.0, 34, 'review', 'The supplied components support this limited panel. Confirm that HEp-2 IFA and quantitative anti-dsDNA IgG are both performed. An EIA-only screen cannot produce an IFA pattern or titre.'),
    ('DENGUE', 'Dengue NS1 antigen and IgM/IgG, qualitative', 'Serology', 'Serum', 600.0, 35, 'review', 'Record the platform and day of illness. Each marker has a separate qualitative result. Isolated IgG on one sample cannot establish acute infection.'),
    ('AMYLASE', 'Amylase, total', 'Biochemistry', 'Serum', 500.0, 36, 'review', 'Use the assay’s serum enzyme interval.'),
    ('LIPASE', 'Lipase', 'Biochemistry', 'Serum', 400.0, 37, 'review', 'Use the assay’s serum enzyme interval.'),
    ('CALCIUM', 'Calcium, total', 'Biochemistry', 'Serum', 450.0, 38, 'review', 'Use age-specific intervals. This is total calcium. Ionized calcium has different collection requirements, units and intervals.')
ON CONFLICT DO NOTHING;

-- CBC
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('CBC', 'hb', 'Hemoglobin', 1, 'number', 'g/dL', NULL, NULL, 'routine', NULL, NULL, 'Replaced the pooled flagging interval with separate adult male and female examples.', 'supplied'),
    ('CBC', 'wbc', 'Total leukocyte count', 2, 'number', 'cells/µL', NULL, NULL, 'routine', NULL, NULL, 'Published adult CBC example in the stated unit.', 'supplied'),
    ('CBC', 'neutrophils', 'Neutrophils', 3, 'number', '%', NULL, NULL, 'routine', NULL, NULL, 'Adult automated differential example.', 'supplied'),
    ('CBC', 'lymphocytes', 'Lymphocytes', 4, 'number', '%', NULL, NULL, 'routine', NULL, NULL, 'Adult automated differential example.', 'supplied'),
    ('CBC', 'eosinophils', 'Eosinophils', 5, 'number', '%', NULL, NULL, 'routine', NULL, NULL, 'Adult automated differential example.', 'supplied'),
    ('CBC', 'monocytes', 'Monocytes', 6, 'number', '%', NULL, NULL, 'routine', NULL, NULL, 'Adult automated differential example.', 'supplied'),
    ('CBC', 'basophils', 'Basophils', 7, 'number', '%', NULL, NULL, 'routine', NULL, NULL, 'Adult automated differential example.', 'supplied'),
    ('CBC', 'platelets', 'Platelet count', 8, 'number', 'lakh/µL', NULL, NULL, 'routine', NULL, NULL, '1.5–4.5 lakh/µL equals 150,000–450,000/µL. Preserve the unit on instrument import.', 'supplied'),
    ('CBC', 'rbc', 'Red blood cell count', 9, 'number', 'million/µL', NULL, NULL, 'routine', NULL, NULL, 'Replaced the pooled flagging interval with separate adult male and female examples.', 'supplied'),
    ('CBC', 'hct', 'Hematocrit (PCV)', 10, 'number', '%', NULL, NULL, 'routine', NULL, NULL, 'Replaced the pooled flagging interval with separate adult male and female examples.', 'supplied'),
    ('CBC', 'mcv', 'Mean corpuscular volume (MCV)', 11, 'number', 'fL', NULL, NULL, 'routine', NULL, NULL, 'Published adult CBC example in the stated unit.', 'supplied'),
    ('CBC', 'mch', 'Mean corpuscular hemoglobin (MCH)', 12, 'number', 'pg', NULL, NULL, 'routine', NULL, NULL, 'Published adult CBC example in the stated unit.', 'supplied'),
    ('CBC', 'mchc', 'Mean corpuscular hemoglobin concentration (MCHC)', 13, 'number', 'g/dL', NULL, NULL, 'routine', NULL, NULL, 'Published adult CBC example in the stated unit.', 'supplied'),
    ('CBC', 'rdw_cv', 'Red cell distribution width (RDW-CV)', 14, 'number', '%', NULL, NULL, 'routine', NULL, NULL, 'Published adult CBC example in the stated unit.', 'supplied'),
    ('CBC', 'rdw_sd', 'Red cell distribution width (RDW-SD)', 15, 'number', 'fL', NULL, NULL, 'optional', 'Analyzer reports RDW-SD.', NULL, 'Confirm the analyzer supplies RDW-SD and verify its fL interval. RDW-CV is a separate measurement.', 'supplied')
ON CONFLICT DO NOTHING;

-- BLOOD_GROUP
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('BLOOD_GROUP', 'abo_group', 'ABO group', 1, 'category', NULL, NULL, ARRAY['A', 'B', 'AB', 'O']::text[], 'routine', NULL, NULL, 'All four groups are valid classifications. Unresolved grouping follows the discrepancy pathway.', 'supplied'),
    ('BLOOD_GROUP', 'rh_factor', 'RhD type', 2, 'category', NULL, NULL, ARRAY['Positive', 'Negative']::text[], 'routine', NULL, NULL, 'Report the resolved D type. A discrepant or weak reaction requires the local workup.', 'supplied')
ON CONFLICT DO NOTHING;

-- WIDAL
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('WIDAL', 'widal_to', 'S. Typhi O agglutinin titre', 1, 'titre', NULL, NULL, NULL, 'archived', NULL, NULL, 'Archive the dilution notation (e.g. 1:80). Removed the universal 1:80 threshold.', 'supplied'),
    ('WIDAL', 'widal_th', 'S. Typhi H agglutinin titre', 2, 'titre', NULL, NULL, NULL, 'archived', NULL, NULL, 'Archive the dilution notation (e.g. 1:80). Removed the universal 1:80 threshold.', 'supplied'),
    ('WIDAL', 'widal_ah', 'S. Paratyphi A H agglutinin titre', 3, 'titre', NULL, NULL, NULL, 'archived', NULL, NULL, 'Archive the dilution notation (e.g. 1:80). Removed the universal 1:80 threshold.', 'supplied'),
    ('WIDAL', 'widal_bh', 'S. Paratyphi B H agglutinin titre', 4, 'titre', NULL, NULL, NULL, 'archived', NULL, NULL, 'Archive the dilution notation (e.g. 1:80). Removed the universal 1:80 threshold.', 'supplied'),
    ('WIDAL', 'widal_result', 'Widal interpretive comment', 5, 'narrative', NULL, NULL, NULL, 'archived', NULL, NULL, 'Historical comment only. No default negative result or automated diagnosis.', 'supplied')
ON CONFLICT DO NOTHING;

-- CRP
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('CRP', 'crp', 'C-reactive protein, quantitative', 1, 'number', 'mg/L', NULL, NULL, 'routine', NULL, NULL, 'The comparator is strict. <5 is a published assay example. The supplied <6 needs its own kit evidence.', 'supplied')
ON CONFLICT DO NOTHING;

-- PLATELET
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('PLATELET', 'platelets', 'Platelet count', 1, 'number', 'lakh/µL', NULL, NULL, 'routine', NULL, NULL, '1.5–4.5 lakh/µL equals 150,000–450,000/µL. Preserve the unit on instrument import.', 'supplied')
ON CONFLICT DO NOTHING;

-- AEC
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('AEC', 'aec_count', 'Absolute eosinophil count', 1, 'number', 'cells/µL', NULL, NULL, 'routine', NULL, NULL, 'Source uses 0–0.600 thousand/µL for the adult automated absolute count.', 'supplied')
ON CONFLICT DO NOTHING;

-- ESR
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('ESR', 'esr', 'Erythrocyte sedimentation rate', 1, 'number', 'mm/h', NULL, NULL, 'routine', NULL, NULL, 'Age and sex bands shown only as examples for Starrsed EDTA. Verify the local method and tube.', 'supplied')
ON CONFLICT DO NOTHING;

-- MALARIA
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('MALARIA', 'mp_smear', 'Malaria microscopy', 1, 'category', NULL, 'No parasites seen', ARRAY['No parasites seen', 'Parasites seen']::text[], 'routine', NULL, NULL, 'Record microscopy independently of the rapid test.', 'supplied'),
    ('MALARIA', 'mp_pf', 'P. falciparum antigen', 2, 'category', NULL, 'Negative', ARRAY['Negative', 'Positive']::text[], 'conditional', 'Kit includes a P. falciparum line.', NULL, 'A pan line alone cannot identify P. vivax. Select the actual kit target.', 'supplied'),
    ('MALARIA', 'mp_pv', 'P. vivax antigen', 3, 'category', NULL, 'Negative', ARRAY['Negative', 'Positive']::text[], 'conditional', 'Kit includes a P. vivax-specific line.', NULL, 'A pan line alone cannot identify P. vivax. Select the actual kit target.', 'supplied'),
    ('MALARIA', 'mp_pan', 'Pan-Plasmodium antigen', 4, 'category', NULL, 'Negative', ARRAY['Negative', 'Positive']::text[], 'conditional', 'Kit includes a pan-Plasmodium line.', NULL, 'A pan line alone cannot identify P. vivax. Select the actual kit target.', 'added'),
    ('MALARIA', 'mp_species', 'Plasmodium species by microscopy', 5, 'narrative', NULL, NULL, NULL, 'conditional', 'Microscopy shows parasites.', NULL, 'Allow species, mixed infection, or species undetermined.', 'added'),
    ('MALARIA', 'mp_parasitemia', 'Parasitaemia by thin film', 6, 'number', '%', NULL, NULL, 'conditional', 'Positive thin-film microscopy and density is quantifiable as a percentage.', NULL, 'Report the measured percentage of infected erythrocytes when quantifiable. Record a method-specific density separately if expressed per µL.', 'added')
ON CONFLICT DO NOTHING;

-- MANTOUX
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('MANTOUX', 'mantoux_induration', 'Transverse induration at reading', 1, 'number', 'mm', NULL, NULL, 'routine', NULL, NULL, 'Record palpable induration, including measured 0 mm. Record timing and risk group. No universal numeric normal band.', 'supplied'),
    ('MANTOUX', 'mantoux_reading', 'Mantoux clinical interpretation', 2, 'category', NULL, NULL, ARRAY['Negative', 'Positive']::text[], 'conditional', 'Valid timed reading and applicable risk information.', NULL, 'NTEP gives ≥10 mm in its usual PPD context and a 5 mm cutoff for HIV coinfection. Apply the relevant protocol. A missed read has its own status.', 'supplied')
ON CONFLICT DO NOTHING;

-- CHIKUNGUNYA
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('CHIKUNGUNYA', 'chik_igm', 'Chikungunya IgM antibody', 1, 'category', NULL, 'Negative', ARRAY['Negative', 'Positive']::text[], 'routine', NULL, NULL, 'Qualitative antibody result. Interpret alongside illness timing and the kit instructions.', 'supplied'),
    ('CHIKUNGUNYA', 'chik_igg', 'Chikungunya IgG antibody', 2, 'category', NULL, 'Negative', ARRAY['Negative', 'Positive']::text[], 'routine', NULL, NULL, 'Qualitative antibody result. Interpret alongside illness timing and the kit instructions.', 'supplied')
ON CONFLICT DO NOTHING;

-- HIV
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('HIV', 'hiv_screen', 'HIV-1/2 antibody screen', 1, 'category', NULL, 'Non-reactive', ARRAY['Non-reactive', 'Reactive']::text[], 'routine', NULL, NULL, 'Report the initial screening result. Reactive screens follow the NACO confirmation pathway.', 'supplied')
ON CONFLICT DO NOTHING;

-- HBSAG
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('HBSAG', 'hbsag_screen', 'Hepatitis B surface antigen screen', 1, 'category', NULL, 'Non-reactive', ARRAY['Non-reactive', 'Reactive']::text[], 'routine', NULL, NULL, 'Apply the assay’s repeat and confirmation algorithm where indicated.', 'supplied')
ON CONFLICT DO NOTHING;

-- VDRL
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('VDRL', 'vdrl_screen', 'Nontreponemal screen', 1, 'category', NULL, 'Non-reactive', ARRAY['Non-reactive', 'Reactive']::text[], 'routine', NULL, NULL, 'Identify VDRL or RPR on the report. A reactive screening result requires follow-up.', 'supplied'),
    ('VDRL', 'vdrl_method', 'Nontreponemal method performed', 2, 'category', NULL, NULL, ARRAY['VDRL', 'RPR']::text[], 'routine', NULL, NULL, 'Per-order method metadata. Retain with the titre for comparison over time.', 'added'),
    ('VDRL', 'vdrl_titre', 'Nontreponemal endpoint titre', 3, 'titre', NULL, NULL, NULL, 'conditional', 'Reactive nontreponemal serum result.', NULL, 'Record the observed endpoint dilution, e.g. 1:8. Never enter its denominator as a concentration.', 'added')
ON CONFLICT DO NOTHING;

-- HSV
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('HSV', 'hsv1_igm', 'HSV-1 IgM (legacy label)', 1, 'number', 'index', NULL, NULL, 'archived', NULL, NULL, 'Keep historical identity only. Remove the generic index cutoff and independent type-specific interpretation.', 'supplied'),
    ('HSV', 'hsv2_igm', 'HSV-2 IgM (legacy label)', 2, 'number', 'index', NULL, NULL, 'archived', NULL, NULL, 'Keep historical identity only. Remove the generic index cutoff and independent type-specific interpretation.', 'supplied')
ON CONFLICT DO NOTHING;

-- URINE_ROUTINE
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('URINE_ROUTINE', 'urine_color', 'Urine colour', 1, 'description', NULL, 'Shades of yellow', NULL, 'routine', NULL, NULL, 'Record observed colour, including colours outside the usual yellow spectrum.', 'supplied'),
    ('URINE_ROUTINE', 'urine_appearance', 'Urine clarity', 2, 'description', NULL, 'Clear', NULL, 'routine', NULL, NULL, 'Record the observed appearance.', 'supplied'),
    ('URINE_ROUTINE', 'urine_sp_gr', 'Specific gravity', 3, 'number', NULL, NULL, NULL, 'routine', NULL, NULL, 'Dimensionless. Preserve three decimal places in display.', 'supplied'),
    ('URINE_ROUTINE', 'urine_ph', 'Urine pH', 4, 'number', NULL, NULL, NULL, 'routine', NULL, NULL, 'Dimensionless. Confirm the reportable increments of the actual pH method.', 'supplied'),
    ('URINE_ROUTINE', 'urine_protein', 'Protein by dipstick', 5, 'ordinal', NULL, 'Negative', NULL, 'routine', NULL, NULL, 'Use the strip’s negative/trace/graded scale. Dipstick protein is distinct from a quantitative urine albumin assay.', 'supplied'),
    ('URINE_ROUTINE', 'urine_sugar', 'Glucose by dipstick', 6, 'ordinal', NULL, 'Negative', NULL, 'routine', NULL, NULL, 'Use the manufacturer’s negative/trace/graded reporting scale.', 'supplied'),
    ('URINE_ROUTINE', 'urine_ketones', 'Ketones by dipstick', 7, 'ordinal', NULL, 'Negative', NULL, 'routine', NULL, NULL, 'Use the manufacturer’s negative/trace/graded reporting scale.', 'supplied'),
    ('URINE_ROUTINE', 'urine_pus_cells', 'White blood cells (pus cells)', 8, 'count_per_field', 'cells/HPF', NULL, NULL, 'routine', NULL, NULL, 'Aligned printed and numeric intervals. Example uses flow-through microscopy. Keep manual spans such as 2–4/HPF intact for review.', 'supplied'),
    ('URINE_ROUTINE', 'urine_rbc', 'Red blood cells', 9, 'count_per_field', 'cells/HPF', NULL, NULL, 'routine', NULL, NULL, 'Aligned printed and numeric intervals. Example uses flow-through microscopy. Keep manual spans such as 2–4/HPF intact for review.', 'supplied'),
    ('URINE_ROUTINE', 'urine_epithelial', 'Epithelial cells', 10, 'count_per_field', 'cells/HPF', NULL, NULL, 'routine', NULL, NULL, 'Aligned printed and numeric intervals. Example uses flow-through microscopy. Keep manual spans such as 2–4/HPF intact for review.', 'supplied')
ON CONFLICT DO NOTHING;

-- PREGNANCY
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('PREGNANCY', 'pregnancy_hcg', 'Urine hCG, qualitative', 1, 'category', NULL, 'Negative', ARRAY['Negative', 'Positive']::text[], 'routine', NULL, NULL, 'Expected result describes absence of detectable hCG. Record the observed result. A kit sensitivity in mIU/mL is separate from the result.', 'supplied')
ON CONFLICT DO NOTHING;

-- FBS
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('FBS', 'glucose_fasting', 'Fasting plasma glucose', 1, 'number', 'mg/dL', NULL, NULL, 'routine', NULL, NULL, 'Venous plasma after ≥8 hours without calories. Diagnostic-range values require appropriate clinical confirmation unless hyperglycaemia is unequivocal.', 'supplied')
ON CONFLICT DO NOTHING;

-- PPBS
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('PPBS', 'glucose_postprandial', 'Plasma glucose, 2 h after usual meal', 1, 'number', 'mg/dL', NULL, NULL, 'routine', NULL, NULL, 'Use meal and specimen timestamps. No universal diagnostic cutoff for an ordinary post-meal sample is seeded.', 'supplied')
ON CONFLICT DO NOTHING;

-- RA_FACTOR
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('RA_FACTOR', 'ra_factor', 'Rheumatoid factor, quantitative', 1, 'number', 'IU/mL', NULL, NULL, 'routine', NULL, NULL, 'Example for the cited quantitative method. Verify the local assay before adopting a cutoff.', 'supplied')
ON CONFLICT DO NOTHING;

-- ASLO
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('ASLO', 'aslo_titer', 'Antistreptolysin O concentration', 1, 'number', 'IU/mL', NULL, NULL, 'routine', NULL, NULL, 'The uploaded <200 and Mayo’s adult ≤530 illustrate substantial assay/population variation. Supply the local limit before flagging.', 'supplied')
ON CONFLICT DO NOTHING;

-- HBA1C
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('HBA1C', 'hba1c', 'HbA1c (NGSP/DCCT)', 1, 'number', '%', NULL, NULL, 'routine', NULL, NULL, 'Classify only when the assay and patient context are suitable. Diagnostic criteria and treatment goals serve different purposes.', 'supplied'),
    ('HBA1C', 'eag', 'Estimated average glucose (eAG)', 2, 'calculated', 'mg/dL', NULL, NULL, 'routine', NULL, '28.7 × HbA1c (%) − 46.7', 'Derive only from a valid and interpretable HbA1c within the laboratory’s approved calculation range. No independent normal interval.', 'supplied')
ON CONFLICT DO NOTHING;

-- LFT
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('LFT', 'bilirubin_total', 'Total bilirubin', 1, 'number', 'mg/dL', NULL, NULL, 'routine', NULL, NULL, 'Adult example starts at 19 completed years. Use a dedicated neonatal pathway for newborns.', 'supplied'),
    ('LFT', 'bilirubin_direct', 'Direct bilirubin', 2, 'number', 'mg/dL', NULL, NULL, 'routine', NULL, NULL, 'Published serum example.', 'supplied'),
    ('LFT', 'bilirubin_indirect', 'Indirect bilirubin', 3, 'calculated', 'mg/dL', NULL, NULL, 'routine', NULL, 'Total bilirubin − direct bilirubin', 'Flag inconsistent components for technical review if direct exceeds total. Establish a local calculated interval if reported.', 'supplied'),
    ('LFT', 'alt', 'Alanine aminotransferase (ALT/SGPT)', 4, 'number', 'U/L', NULL, NULL, 'routine', NULL, NULL, 'Use sex-specific examples for the cited method.', 'supplied'),
    ('LFT', 'ast', 'Aspartate aminotransferase (AST/SGOT)', 5, 'number', 'U/L', NULL, NULL, 'routine', NULL, NULL, 'Use sex-specific examples for the cited method.', 'supplied'),
    ('LFT', 'alp', 'Alkaline phosphatase (ALP)', 6, 'number', 'U/L', NULL, NULL, 'routine', NULL, NULL, 'Age- and sex-specific serum enzyme intervals. Pregnancy requires separate interpretation.', 'supplied'),
    ('LFT', 'total_protein', 'Total protein', 7, 'number', 'g/dL', NULL, NULL, 'routine', NULL, NULL, 'Published adult serum example.', 'supplied'),
    ('LFT', 'albumin', 'Albumin', 8, 'number', 'g/dL', NULL, NULL, 'routine', NULL, NULL, 'Published adult serum example.', 'supplied'),
    ('LFT', 'globulin', 'Globulin, calculated', 9, 'calculated', 'g/dL', NULL, NULL, 'routine', NULL, 'Total protein − albumin', 'Use paired results from the same specimen. Review inconsistent components and verify any local calculated interval.', 'supplied'),
    ('LFT', 'ag_ratio', 'Albumin/globulin ratio', 10, 'calculated', NULL, NULL, NULL, 'routine', NULL, 'Albumin / globulin', 'Dimensionless. Suppress if globulin is zero or negative, or inputs are missing. Verify any local interval.', 'supplied')
ON CONFLICT DO NOTHING;

-- URIC_ACID
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('URIC_ACID', 'uric_acid', 'Uric acid', 1, 'number', 'mg/dL', NULL, NULL, 'routine', NULL, NULL, 'The original displayed male/female values disagreed with its generic numeric bounds.', 'supplied')
ON CONFLICT DO NOTHING;

-- THYROID_PROFILE
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('THYROID_PROFILE', 't3_total', 'Total triiodothyronine (T3)', 1, 'number', 'ng/dL', NULL, NULL, 'routine', NULL, NULL, 'Use the age and assay-specific example. Pregnancy requires separate intervals.', 'supplied'),
    ('THYROID_PROFILE', 't4_total', 'Total thyroxine (T4)', 2, 'number', 'µg/dL', NULL, NULL, 'routine', NULL, NULL, 'Use the age and assay-specific example. Pregnancy requires separate intervals.', 'supplied'),
    ('THYROID_PROFILE', 'tsh', 'Thyroid-stimulating hormone (TSH)', 3, 'number', 'µIU/mL', NULL, NULL, 'routine', NULL, NULL, 'Use the age and assay-specific example. Pregnancy requires separate intervals. Numerically, 1 µIU/mL equals 1 mIU/L.', 'supplied')
ON CONFLICT DO NOTHING;

-- LIPID_PROFILE
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('LIPID_PROFILE', 'cholesterol_total', 'Total cholesterol', 1, 'number', 'mg/dL', NULL, NULL, 'routine', NULL, NULL, 'Desirable category for general adult reporting. Treatment targets depend on individual risk.', 'supplied'),
    ('LIPID_PROFILE', 'triglycerides', 'Triglycerides', 2, 'number', 'mg/dL', NULL, NULL, 'routine', NULL, NULL, 'Decision point applies to fasting specimens. Exactly 150 is outside the desirable category.', 'supplied'),
    ('LIPID_PROFILE', 'hdl', 'HDL cholesterol', 3, 'number', 'mg/dL', NULL, NULL, 'routine', NULL, NULL, 'Sex-specific low-HDL categories. Removed the unsupported upper flag at 100 mg/dL.', 'supplied'),
    ('LIPID_PROFILE', 'ldl', 'LDL cholesterol (specify method)', 4, 'method_numeric', 'mg/dL', NULL, NULL, 'routine', NULL, NULL, 'Record direct assay or validated calculation and its limits. <100 is a general descriptive category. Individual treatment goals may be lower.', 'supplied'),
    ('LIPID_PROFILE', 'vldl', 'VLDL cholesterol (specify method)', 5, 'method_numeric', 'mg/dL', NULL, NULL, 'optional', 'Validated VLDL method is available.', NULL, 'Retain only if the laboratory measures or validates an estimation method. TG/5 has limits, especially with hypertriglyceridaemia.', 'supplied'),
    ('LIPID_PROFILE', 'chol_hdl_ratio', 'Total cholesterol/HDL ratio', 6, 'calculated', NULL, NULL, NULL, 'routine', NULL, 'Total cholesterol / HDL cholesterol', 'No universal lower bound. Suppress if HDL is zero or inputs are unavailable.', 'supplied'),
    ('LIPID_PROFILE', 'non_hdl', 'Non-HDL cholesterol', 7, 'calculated', 'mg/dL', NULL, NULL, 'routine', NULL, 'Total cholesterol − HDL cholesterol', 'A calculated component of a standard lipid panel. Risk-specific targets can differ. Review if HDL exceeds total cholesterol.', 'added')
ON CONFLICT DO NOTHING;

-- UREA
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('UREA', 'urea', 'Urea', 1, 'number', 'mg/dL', NULL, NULL, 'routine', NULL, NULL, 'The manufacturer’s general adult example is for whole urea. A BUN value in mg/dL is numerically different.', 'supplied')
ON CONFLICT DO NOTHING;

-- ELECTROLYTES
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('ELECTROLYTES', 'sodium', 'Sodium', 1, 'number', 'mmol/L', NULL, NULL, 'routine', NULL, NULL, 'Adult serum example. Retain the laboratory’s separately approved critical notification policy.', 'supplied'),
    ('ELECTROLYTES', 'potassium', 'Potassium', 2, 'number', 'mmol/L', NULL, NULL, 'routine', NULL, NULL, 'Adult serum example. Retain the laboratory’s separately approved critical notification policy.', 'supplied'),
    ('ELECTROLYTES', 'chloride', 'Chloride', 3, 'number', 'mmol/L', NULL, NULL, 'routine', NULL, NULL, 'Adult serum example. Retain the laboratory’s separately approved critical notification policy.', 'supplied')
ON CONFLICT DO NOTHING;

-- CREATININE
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('CREATININE', 'creatinine', 'Creatinine', 1, 'number', 'mg/dL', NULL, NULL, 'routine', NULL, NULL, 'Replaced the pooled numeric limits with sex-specific adult examples.', 'supplied')
ON CONFLICT DO NOTHING;

-- FSH
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('FSH', 'fsh', 'Follicle-stimulating hormone', 1, 'number', 'mIU/mL', NULL, NULL, 'routine', NULL, NULL, 'Adult assay examples start at 19 completed years in this template. 1 mIU/mL equals 1 IU/L. Select the physiological phase on the order.', 'supplied')
ON CONFLICT DO NOTHING;

-- LH
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('LH', 'lh', 'Luteinizing hormone', 1, 'number', 'mIU/mL', NULL, NULL, 'routine', NULL, NULL, 'Adult assay examples start at 19 completed years in this template. 1 mIU/mL equals 1 IU/L. Select the physiological phase on the order.', 'supplied')
ON CONFLICT DO NOTHING;

-- PROLACTIN
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('PROLACTIN', 'prolactin', 'Prolactin', 1, 'number', 'ng/mL', NULL, NULL, 'routine', NULL, NULL, 'Separate adult male and nonpregnant, nonlactating female reference intervals. The previous pooled 4–20 could misflag either sex.', 'supplied')
ON CONFLICT DO NOTHING;

-- TESTOSTERONE
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('TESTOSTERONE', 'testosterone', 'Total testosterone', 1, 'number', 'ng/dL', NULL, NULL, 'routine', NULL, NULL, 'LC-MS/MS example. The source file applied male numeric limits to women.', 'supplied')
ON CONFLICT DO NOTHING;

-- IRON_PROFILE
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('IRON_PROFILE', 'serum_iron', 'Serum iron', 1, 'number', 'µg/dL', NULL, NULL, 'routine', NULL, NULL, 'Verify collection conditions and sex-specific intervals.', 'supplied'),
    ('IRON_PROFILE', 'tibc', 'Total iron-binding capacity (TIBC)', 2, 'method_numeric', 'µg/dL', NULL, NULL, 'routine', NULL, NULL, 'Record the assay’s measured or derived TIBC method.', 'supplied'),
    ('IRON_PROFILE', 'transferrin_sat', 'Transferrin saturation', 3, 'calculated', '%', NULL, NULL, 'routine', NULL, '100 × serum iron / TIBC', 'Use consistent concentration units and a positive TIBC from the same specimen.', 'supplied')
ON CONFLICT DO NOTHING;

-- ANA_PROFILE
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('ANA_PROFILE', 'ana_screen', 'ANA screen by HEp-2 IFA', 1, 'category', NULL, 'Negative', ARRAY['Negative', 'Positive']::text[], 'routine', NULL, NULL, 'Use the local IFA screening dilution. EIA does not supply a fluorescence pattern.', 'supplied'),
    ('ANA_PROFILE', 'anti_dsdna', 'Anti-dsDNA IgG, quantitative', 2, 'number', 'IU/mL', NULL, NULL, 'routine', NULL, NULL, 'Use the manufacturer’s method, unit and negative/equivocal/positive bands. Different dsDNA methods can have materially different cutoffs.', 'supplied'),
    ('ANA_PROFILE', 'ana_pattern', 'HEp-2 IFA staining pattern(s)', 3, 'description', NULL, NULL, NULL, 'conditional', 'Reportable HEp-2 IFA fluorescence per local policy.', NULL, 'Report the observed pattern(s) including mixed, cytoplasmic or mitotic patterns if supported. A list of example patterns is not a reference interval.', 'supplied'),
    ('ANA_PROFILE', 'ana_titre', 'ANA endpoint titre by HEp-2 IFA', 4, 'titre', NULL, NULL, NULL, 'conditional', 'Positive HEp-2 IFA screen and endpoint titration performed.', NULL, 'Report actual dilution; attach separate titres to multiple patterns if the local method reports them.', 'added')
ON CONFLICT DO NOTHING;

-- DENGUE
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('DENGUE', 'dengue_ns1', 'Dengue NS1 antigen', 1, 'category', NULL, 'Negative', ARRAY['Negative', 'Positive']::text[], 'routine', NULL, NULL, 'Qualitative kit format. Use no unit or numeric flag. Interpret with day of illness and the other markers.', 'supplied'),
    ('DENGUE', 'dengue_igm', 'Dengue IgM antibody', 2, 'category', NULL, 'Negative', ARRAY['Negative', 'Positive']::text[], 'routine', NULL, NULL, 'Qualitative kit format. Use no unit or numeric flag. Interpret with day of illness and the other markers.', 'supplied'),
    ('DENGUE', 'dengue_igg', 'Dengue IgG antibody', 3, 'category', NULL, 'Negative', ARRAY['Negative', 'Positive']::text[], 'routine', NULL, NULL, 'Qualitative kit format. Use no unit or numeric flag. Isolated IgG does not establish acute dengue.', 'supplied')
ON CONFLICT DO NOTHING;

-- AMYLASE
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('AMYLASE', 'amylase', 'Total amylase', 1, 'number', 'U/L', NULL, NULL, 'routine', NULL, NULL, 'Supplied adult interval agrees with the cited assay example. Confirm local transferability.', 'supplied')
ON CONFLICT DO NOTHING;

-- LIPASE
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('LIPASE', 'lipase', 'Lipase', 1, 'number', 'U/L', NULL, NULL, 'routine', NULL, NULL, 'Supplied adult interval agrees with the cited assay example. Confirm local transferability.', 'supplied')
ON CONFLICT DO NOTHING;

-- CALCIUM
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('CALCIUM', 'calcium_total', 'Total calcium', 1, 'number', 'mg/dL', NULL, NULL, 'routine', NULL, NULL, 'Age partitions apply to total calcium. Do not apply these values to ionized calcium.', 'supplied')
ON CONFLICT DO NOTHING;

INSERT INTO labflow_catalog_v2.parameter_sources
    (test_code, parameter_code, source_code)
VALUES
    ('CBC', 'hb', 'CBC'),
    ('CBC', 'wbc', 'CBC'),
    ('CBC', 'neutrophils', 'CBC'),
    ('CBC', 'lymphocytes', 'CBC'),
    ('CBC', 'eosinophils', 'CBC'),
    ('CBC', 'monocytes', 'CBC'),
    ('CBC', 'basophils', 'CBC'),
    ('CBC', 'platelets', 'PLT'),
    ('CBC', 'rbc', 'CBC'),
    ('CBC', 'hct', 'CBC'),
    ('CBC', 'mcv', 'CBC'),
    ('CBC', 'mch', 'CBC'),
    ('CBC', 'mchc', 'CBC'),
    ('CBC', 'rdw_cv', 'CBC'),
    ('CBC', 'rdw_sd', 'RDW'),
    ('BLOOD_GROUP', 'abo_group', 'ABO'),
    ('BLOOD_GROUP', 'rh_factor', 'ABO'),
    ('WIDAL', 'widal_to', 'WID'),
    ('WIDAL', 'widal_th', 'WID'),
    ('WIDAL', 'widal_ah', 'WID'),
    ('WIDAL', 'widal_bh', 'WID'),
    ('WIDAL', 'widal_result', 'WID'),
    ('CRP', 'crp', 'CRP'),
    ('PLATELET', 'platelets', 'PLT'),
    ('AEC', 'aec_count', 'CBC'),
    ('ESR', 'esr', 'ESR'),
    ('MALARIA', 'mp_smear', 'MAL'),
    ('MALARIA', 'mp_pf', 'PAN'),
    ('MALARIA', 'mp_pf', 'MAL'),
    ('MALARIA', 'mp_pv', 'PAN'),
    ('MALARIA', 'mp_pv', 'MAL'),
    ('MALARIA', 'mp_pan', 'PAN'),
    ('MALARIA', 'mp_pan', 'MAL'),
    ('MALARIA', 'mp_species', 'MAL'),
    ('MALARIA', 'mp_parasitemia', 'MAL'),
    ('MANTOUX', 'mantoux_induration', 'TST'),
    ('MANTOUX', 'mantoux_induration', 'TBI'),
    ('MANTOUX', 'mantoux_reading', 'TST'),
    ('MANTOUX', 'mantoux_reading', 'TBI'),
    ('CHIKUNGUNYA', 'chik_igm', 'CHIK'),
    ('CHIKUNGUNYA', 'chik_igg', 'CHIK'),
    ('HIV', 'hiv_screen', 'HIV'),
    ('HBSAG', 'hbsag_screen', 'HBV'),
    ('VDRL', 'vdrl_screen', 'SYPH'),
    ('VDRL', 'vdrl_method', 'SYPH'),
    ('VDRL', 'vdrl_titre', 'SYPH'),
    ('HSV', 'hsv1_igm', 'HSV'),
    ('HSV', 'hsv2_igm', 'HSV'),
    ('URINE_ROUTINE', 'urine_color', 'COLOR'),
    ('URINE_ROUTINE', 'urine_appearance', 'COLOR'),
    ('URINE_ROUTINE', 'urine_sp_gr', 'SG'),
    ('URINE_ROUTINE', 'urine_ph', 'PH'),
    ('URINE_ROUTINE', 'urine_protein', 'UA'),
    ('URINE_ROUTINE', 'urine_sugar', 'UA'),
    ('URINE_ROUTINE', 'urine_ketones', 'UA'),
    ('URINE_ROUTINE', 'urine_pus_cells', 'UAM'),
    ('URINE_ROUTINE', 'urine_rbc', 'UAM'),
    ('URINE_ROUTINE', 'urine_epithelial', 'UAM'),
    ('PREGNANCY', 'pregnancy_hcg', 'HCG'),
    ('FBS', 'glucose_fasting', 'FPG'),
    ('FBS', 'glucose_fasting', 'ADA'),
    ('FBS', 'glucose_fasting', 'GLU'),
    ('PPBS', 'glucose_postprandial', 'PP'),
    ('PPBS', 'glucose_postprandial', 'ADA'),
    ('PPBS', 'glucose_postprandial', 'GLU'),
    ('RA_FACTOR', 'ra_factor', 'RF'),
    ('ASLO', 'aslo_titer', 'ASO'),
    ('HBA1C', 'hba1c', 'ADA'),
    ('HBA1C', 'eag', 'EAG'),
    ('LFT', 'bilirubin_total', 'LFT'),
    ('LFT', 'bilirubin_direct', 'LFT'),
    ('LFT', 'bilirubin_indirect', 'LFTC'),
    ('LFT', 'bilirubin_indirect', 'LFT'),
    ('LFT', 'alt', 'LFT'),
    ('LFT', 'ast', 'LFT'),
    ('LFT', 'alp', 'LFT'),
    ('LFT', 'total_protein', 'LFT'),
    ('LFT', 'albumin', 'LFT'),
    ('LFT', 'globulin', 'LFTC'),
    ('LFT', 'ag_ratio', 'LFTC'),
    ('URIC_ACID', 'uric_acid', 'URIC'),
    ('THYROID_PROFILE', 't3_total', 'T3'),
    ('THYROID_PROFILE', 't4_total', 'T4'),
    ('THYROID_PROFILE', 'tsh', 'TSH'),
    ('LIPID_PROFILE', 'cholesterol_total', 'LIPID'),
    ('LIPID_PROFILE', 'cholesterol_total', 'CSI'),
    ('LIPID_PROFILE', 'triglycerides', 'LIPID'),
    ('LIPID_PROFILE', 'triglycerides', 'ACC'),
    ('LIPID_PROFILE', 'hdl', 'LIPID'),
    ('LIPID_PROFILE', 'hdl', 'CSI'),
    ('LIPID_PROFILE', 'ldl', 'LIPID'),
    ('LIPID_PROFILE', 'ldl', 'CSI'),
    ('LIPID_PROFILE', 'ldl', 'ACC'),
    ('LIPID_PROFILE', 'vldl', 'ACC'),
    ('LIPID_PROFILE', 'chol_hdl_ratio', 'LIPID'),
    ('LIPID_PROFILE', 'chol_hdl_ratio', 'CSI'),
    ('LIPID_PROFILE', 'non_hdl', 'ACC'),
    ('LIPID_PROFILE', 'non_hdl', 'LIPID'),
    ('LIPID_PROFILE', 'non_hdl', 'CSI'),
    ('UREA', 'urea', 'UREA'),
    ('ELECTROLYTES', 'sodium', 'CMP'),
    ('ELECTROLYTES', 'potassium', 'CMP'),
    ('ELECTROLYTES', 'chloride', 'CMP'),
    ('CREATININE', 'creatinine', 'CMP'),
    ('FSH', 'fsh', 'FSH'),
    ('LH', 'lh', 'LH'),
    ('PROLACTIN', 'prolactin', 'PRL'),
    ('TESTOSTERONE', 'testosterone', 'TESTO'),
    ('IRON_PROFILE', 'serum_iron', 'IRON'),
    ('IRON_PROFILE', 'tibc', 'IRON'),
    ('IRON_PROFILE', 'transferrin_sat', 'IRON'),
    ('ANA_PROFILE', 'ana_screen', 'ANA'),
    ('ANA_PROFILE', 'anti_dsdna', 'DNA'),
    ('ANA_PROFILE', 'ana_pattern', 'ANA'),
    ('ANA_PROFILE', 'ana_titre', 'ANA'),
    ('DENGUE', 'dengue_ns1', 'DUO'),
    ('DENGUE', 'dengue_ns1', 'DENV'),
    ('DENGUE', 'dengue_igm', 'DUO'),
    ('DENGUE', 'dengue_igm', 'DENV'),
    ('DENGUE', 'dengue_igg', 'DUO'),
    ('DENGUE', 'dengue_igg', 'DENV'),
    ('AMYLASE', 'amylase', 'AMY'),
    ('LIPASE', 'lipase', 'LPS'),
    ('CALCIUM', 'calcium_total', 'CMP')
ON CONFLICT DO NOTHING;

INSERT INTO labflow_catalog_v2.numeric_rules
    (test_code, parameter_code, result_kind, rule_set, local_method, rule_no, rule_kind, age_years, sex_group, reproductive_group, context_key, value_band, unit_at_definition, band_label, source_code)
VALUES
    ('CBC', 'hb', 'number', 'published_example', '', 1, 'reference', '[18,)', 'male', 'any', 'routine', '[13.5,17.5]', 'g/dL', 'Reference interval', 'CBC'),
    ('CBC', 'hb', 'number', 'published_example', '', 2, 'reference', '[18,)', 'female', 'any', 'routine', '[12,16]', 'g/dL', 'Reference interval', 'CBC'),
    ('CBC', 'rbc', 'number', 'published_example', '', 1, 'reference', '[18,)', 'male', 'any', 'routine', '[4.5,5.9]', 'million/µL', 'Reference interval', 'CBC'),
    ('CBC', 'rbc', 'number', 'published_example', '', 2, 'reference', '[18,)', 'female', 'any', 'routine', '[4,5.2]', 'million/µL', 'Reference interval', 'CBC'),
    ('CBC', 'hct', 'number', 'published_example', '', 1, 'reference', '[18,)', 'male', 'any', 'routine', '[42,54]', '%', 'Reference interval', 'CBC'),
    ('CBC', 'hct', 'number', 'published_example', '', 2, 'reference', '[18,)', 'female', 'any', 'routine', '[37,47]', '%', 'Reference interval', 'CBC'),
    ('CBC', 'wbc', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[4000,10000]', 'cells/µL', 'Reference interval', 'CBC'),
    ('CBC', 'neutrophils', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[46,78]', '%', 'Reference interval', 'CBC'),
    ('CBC', 'lymphocytes', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[18,52]', '%', 'Reference interval', 'CBC'),
    ('CBC', 'eosinophils', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[0,6]', '%', 'Reference interval', 'CBC'),
    ('CBC', 'monocytes', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[3,10]', '%', 'Reference interval', 'CBC'),
    ('CBC', 'basophils', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[0,3]', '%', 'Reference interval', 'CBC'),
    ('CBC', 'mcv', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[82,103]', 'fL', 'Reference interval', 'CBC'),
    ('CBC', 'mch', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[26,34]', 'pg', 'Reference interval', 'CBC'),
    ('CBC', 'mchc', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[30,37]', 'g/dL', 'Reference interval', 'CBC'),
    ('CBC', 'rdw_cv', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[11.5,14.5]', '%', 'Reference interval', 'CBC'),
    ('CBC', 'platelets', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[1.5,4.5]', 'lakh/µL', 'Reference interval', 'PLT'),
    ('PLATELET', 'platelets', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[1.5,4.5]', 'lakh/µL', 'Reference interval', 'PLT'),
    ('CRP', 'crp', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '(,5)', 'mg/L', 'Reference interval', 'CRP'),
    ('AEC', 'aec_count', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[0,600]', 'cells/µL', 'Reference interval', 'CBC'),
    ('ESR', 'esr', 'number', 'published_example', '', 1, 'reference', '[18,51)', 'male', 'any', 'routine', '[1,10]', 'mm/h', 'Reference interval', 'ESR'),
    ('ESR', 'esr', 'number', 'published_example', '', 2, 'reference', '[18,51)', 'female', 'any', 'routine', '[1,12]', 'mm/h', 'Reference interval', 'ESR'),
    ('ESR', 'esr', 'number', 'published_example', '', 3, 'reference', '[51,61)', 'male', 'any', 'routine', '[1,12]', 'mm/h', 'Reference interval', 'ESR'),
    ('ESR', 'esr', 'number', 'published_example', '', 4, 'reference', '[51,61)', 'female', 'any', 'routine', '[1,19]', 'mm/h', 'Reference interval', 'ESR'),
    ('ESR', 'esr', 'number', 'published_example', '', 5, 'reference', '[61,71)', 'male', 'any', 'routine', '[1,14]', 'mm/h', 'Reference interval', 'ESR'),
    ('ESR', 'esr', 'number', 'published_example', '', 6, 'reference', '[61,71)', 'female', 'any', 'routine', '[1,20]', 'mm/h', 'Reference interval', 'ESR'),
    ('ESR', 'esr', 'number', 'published_example', '', 7, 'reference', '[71,)', 'male', 'any', 'routine', '[1,30]', 'mm/h', 'Reference interval', 'ESR'),
    ('ESR', 'esr', 'number', 'published_example', '', 8, 'reference', '[71,)', 'female', 'any', 'routine', '[1,35]', 'mm/h', 'Reference interval', 'ESR'),
    ('URINE_ROUTINE', 'urine_sp_gr', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[1.005,1.03]', NULL, 'Reference interval', 'SG'),
    ('URINE_ROUTINE', 'urine_ph', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[4.6,8]', NULL, 'Reference interval', 'PH'),
    ('URINE_ROUTINE', 'urine_pus_cells', 'count_per_field', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[0,5]', 'cells/HPF', 'Reference interval', 'UAM'),
    ('URINE_ROUTINE', 'urine_rbc', 'count_per_field', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[0,2]', 'cells/HPF', 'Reference interval', 'UAM'),
    ('URINE_ROUTINE', 'urine_epithelial', 'count_per_field', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[0,2]', 'cells/HPF', 'Reference interval', 'UAM'),
    ('FBS', 'glucose_fasting', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'fasting_8h', '[70,100)', 'mg/dL', 'Reference interval', 'FPG'),
    ('FBS', 'glucose_fasting', 'number', 'published_example', '', 2, 'decision', '[18,)', 'any', 'any', 'fasting_8h', '[100,126)', 'mg/dL', 'Impaired fasting glucose range', 'ADA'),
    ('FBS', 'glucose_fasting', 'number', 'published_example', '', 3, 'decision', '[18,)', 'any', 'any', 'fasting_8h', '[126,)', 'mg/dL', 'Diabetes diagnostic range; confirm as indicated', 'ADA'),
    ('RA_FACTOR', 'ra_factor', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '(,15)', 'IU/mL', 'Reference interval', 'RF'),
    ('HBA1C', 'hba1c', 'number', 'published_example', '', 1, 'decision', '[18,)', 'any', 'any', 'diagnostic_hba1c', '(,5.7)', '%', 'Below the prediabetes HbA1c threshold', 'ADA'),
    ('HBA1C', 'hba1c', 'number', 'published_example', '', 2, 'decision', '[18,)', 'any', 'any', 'diagnostic_hba1c', '[5.7,6.5)', '%', 'Prediabetes range', 'ADA'),
    ('HBA1C', 'hba1c', 'number', 'published_example', '', 3, 'decision', '[18,)', 'any', 'any', 'diagnostic_hba1c', '[6.5,)', '%', 'Diabetes diagnostic range; confirm as indicated', 'ADA'),
    ('LFT', 'bilirubin_total', 'number', 'published_example', '', 1, 'reference', '[19,)', 'any', 'any', 'routine', '[0,1.2]', 'mg/dL', 'Reference interval', 'LFT'),
    ('LFT', 'bilirubin_direct', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[0,0.3]', 'mg/dL', 'Reference interval', 'LFT'),
    ('LFT', 'alt', 'number', 'published_example', '', 1, 'reference', '[18,)', 'male', 'any', 'routine', '[7,55]', 'U/L', 'Reference interval', 'LFT'),
    ('LFT', 'alt', 'number', 'published_example', '', 2, 'reference', '[18,)', 'female', 'any', 'routine', '[7,45]', 'U/L', 'Reference interval', 'LFT'),
    ('LFT', 'ast', 'number', 'published_example', '', 1, 'reference', '[18,)', 'male', 'any', 'routine', '[8,48]', 'U/L', 'Reference interval', 'LFT'),
    ('LFT', 'ast', 'number', 'published_example', '', 2, 'reference', '[18,)', 'female', 'any', 'routine', '[8,43]', 'U/L', 'Reference interval', 'LFT'),
    ('LFT', 'alp', 'number', 'published_example', '', 1, 'reference', '[18,19)', 'male', 'any', 'routine', '[52,222]', 'U/L', 'Reference interval', 'LFT'),
    ('LFT', 'alp', 'number', 'published_example', '', 2, 'reference', '[19,)', 'male', 'any', 'routine', '[45,115]', 'U/L', 'Reference interval', 'LFT'),
    ('LFT', 'alp', 'number', 'published_example', '', 3, 'reference', '[18,24)', 'female', 'any', 'routine', '[52,144]', 'U/L', 'Reference interval', 'LFT'),
    ('LFT', 'alp', 'number', 'published_example', '', 4, 'reference', '[24,46)', 'female', 'any', 'routine', '[37,98]', 'U/L', 'Reference interval', 'LFT'),
    ('LFT', 'alp', 'number', 'published_example', '', 5, 'reference', '[46,51)', 'female', 'any', 'routine', '[39,100]', 'U/L', 'Reference interval', 'LFT'),
    ('LFT', 'alp', 'number', 'published_example', '', 6, 'reference', '[51,56)', 'female', 'any', 'routine', '[41,108]', 'U/L', 'Reference interval', 'LFT'),
    ('LFT', 'alp', 'number', 'published_example', '', 7, 'reference', '[56,61)', 'female', 'any', 'routine', '[46,118]', 'U/L', 'Reference interval', 'LFT'),
    ('LFT', 'alp', 'number', 'published_example', '', 8, 'reference', '[61,66)', 'female', 'any', 'routine', '[50,130]', 'U/L', 'Reference interval', 'LFT'),
    ('LFT', 'alp', 'number', 'published_example', '', 9, 'reference', '[66,)', 'female', 'any', 'routine', '[55,142]', 'U/L', 'Reference interval', 'LFT'),
    ('LFT', 'total_protein', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[6.3,7.9]', 'g/dL', 'Reference interval', 'LFT'),
    ('LFT', 'albumin', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[3.5,5]', 'g/dL', 'Reference interval', 'LFT'),
    ('URIC_ACID', 'uric_acid', 'number', 'published_example', '', 1, 'reference', '[18,)', 'male', 'any', 'routine', '[3.7,8]', 'mg/dL', 'Reference interval', 'URIC'),
    ('URIC_ACID', 'uric_acid', 'number', 'published_example', '', 2, 'reference', '[18,)', 'female', 'any', 'routine', '[2.7,6.1]', 'mg/dL', 'Reference interval', 'URIC'),
    ('THYROID_PROFILE', 't3_total', 'number', 'published_example', '', 1, 'reference', '[18,20)', 'any', 'any', 'routine', '[91,218]', 'ng/dL', 'Reference interval', 'T3'),
    ('THYROID_PROFILE', 't3_total', 'number', 'published_example', '', 2, 'reference', '[20,)', 'any', 'any', 'routine', '[80,200]', 'ng/dL', 'Reference interval', 'T3'),
    ('THYROID_PROFILE', 't4_total', 'number', 'published_example', '', 1, 'reference', '[18,20)', 'any', 'any', 'routine', '[5.9,13.2]', 'µg/dL', 'Reference interval', 'T4'),
    ('THYROID_PROFILE', 't4_total', 'number', 'published_example', '', 2, 'reference', '[20,)', 'any', 'any', 'routine', '[4.5,11.7]', 'µg/dL', 'Reference interval', 'T4'),
    ('THYROID_PROFILE', 'tsh', 'number', 'published_example', '', 1, 'reference', '[18,20)', 'any', 'any', 'routine', '[0.5,4.3]', 'µIU/mL', 'Reference interval', 'TSH'),
    ('THYROID_PROFILE', 'tsh', 'number', 'published_example', '', 2, 'reference', '[20,)', 'any', 'any', 'routine', '[0.3,4.2]', 'µIU/mL', 'Reference interval', 'TSH'),
    ('LIPID_PROFILE', 'cholesterol_total', 'number', 'published_example', '', 1, 'decision', '[20,)', 'any', 'any', 'routine', '(,200)', 'mg/dL', 'Desirable total cholesterol', 'LIPID'),
    ('LIPID_PROFILE', 'triglycerides', 'number', 'published_example', '', 1, 'decision', '[20,)', 'any', 'any', 'fasting_lipids', '(,150)', 'mg/dL', 'Desirable fasting triglycerides', 'LIPID'),
    ('LIPID_PROFILE', 'hdl', 'number', 'published_example', '', 1, 'decision', '[20,)', 'male', 'any', 'routine', '(,40)', 'mg/dL', 'Low HDL cholesterol', 'LIPID'),
    ('LIPID_PROFILE', 'hdl', 'number', 'published_example', '', 2, 'decision', '[20,)', 'female', 'any', 'routine', '(,50)', 'mg/dL', 'Low HDL cholesterol', 'LIPID'),
    ('LIPID_PROFILE', 'ldl', 'method_numeric', 'published_example', '', 1, 'decision', '[20,)', 'any', 'any', 'routine', '(,100)', 'mg/dL', 'General desirable LDL category', 'LIPID'),
    ('LIPID_PROFILE', 'non_hdl', 'calculated', 'published_example', '', 1, 'decision', '[20,)', 'any', 'any', 'routine', '(,130)', 'mg/dL', 'General desirable non-HDL category', 'LIPID'),
    ('UREA', 'urea', 'number', 'published_example', '', 1, 'reference', '[20,)', 'any', 'any', 'routine', '[17,43]', 'mg/dL', 'Reference interval', 'UREA'),
    ('ELECTROLYTES', 'sodium', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[135,145]', 'mmol/L', 'Reference interval', 'CMP'),
    ('ELECTROLYTES', 'potassium', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[3.6,5.2]', 'mmol/L', 'Reference interval', 'CMP'),
    ('ELECTROLYTES', 'chloride', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[98,107]', 'mmol/L', 'Reference interval', 'CMP'),
    ('CREATININE', 'creatinine', 'number', 'published_example', '', 1, 'reference', '[18,)', 'male', 'any', 'routine', '[0.74,1.35]', 'mg/dL', 'Reference interval', 'CMP'),
    ('CREATININE', 'creatinine', 'number', 'published_example', '', 2, 'reference', '[18,)', 'female', 'any', 'routine', '[0.59,1.04]', 'mg/dL', 'Reference interval', 'CMP'),
    ('FSH', 'fsh', 'number', 'published_example', '', 1, 'reference', '[19,)', 'male', 'any', 'routine', '[1.2,15.8]', 'mIU/mL', 'Reference interval', 'FSH'),
    ('FSH', 'fsh', 'number', 'published_example', '', 2, 'reference', '[19,)', 'female', 'follicular', 'routine', '[2.9,14.6]', 'mIU/mL', 'Reference interval', 'FSH'),
    ('FSH', 'fsh', 'number', 'published_example', '', 3, 'reference', '[19,)', 'female', 'midcycle', 'routine', '[4.7,23.2]', 'mIU/mL', 'Reference interval', 'FSH'),
    ('FSH', 'fsh', 'number', 'published_example', '', 4, 'reference', '[19,)', 'female', 'luteal', 'routine', '[1.4,8.9]', 'mIU/mL', 'Reference interval', 'FSH'),
    ('FSH', 'fsh', 'number', 'published_example', '', 5, 'reference', '[19,)', 'female', 'postmenopausal', 'routine', '[16,157]', 'mIU/mL', 'Reference interval', 'FSH'),
    ('LH', 'lh', 'number', 'published_example', '', 1, 'reference', '[19,)', 'male', 'any', 'routine', '[1.3,9.6]', 'mIU/mL', 'Reference interval', 'LH'),
    ('LH', 'lh', 'number', 'published_example', '', 2, 'reference', '[19,)', 'female', 'follicular', 'routine', '[1.9,14.6]', 'mIU/mL', 'Reference interval', 'LH'),
    ('LH', 'lh', 'number', 'published_example', '', 3, 'reference', '[19,)', 'female', 'midcycle', 'routine', '[12.2,118]', 'mIU/mL', 'Reference interval', 'LH'),
    ('LH', 'lh', 'number', 'published_example', '', 4, 'reference', '[19,)', 'female', 'luteal', 'routine', '[0.7,12.9]', 'mIU/mL', 'Reference interval', 'LH'),
    ('LH', 'lh', 'number', 'published_example', '', 5, 'reference', '[19,)', 'female', 'postmenopausal', 'routine', '[5.3,65.4]', 'mIU/mL', 'Reference interval', 'LH'),
    ('PROLACTIN', 'prolactin', 'number', 'published_example', '', 1, 'reference', '[18,)', 'male', 'any', 'routine', '[4,15.2]', 'ng/mL', 'Reference interval', 'PRL'),
    ('PROLACTIN', 'prolactin', 'number', 'published_example', '', 2, 'reference', '[18,)', 'female', 'nonlactating', 'routine', '[4.8,23.3]', 'ng/mL', 'Reference interval', 'PRL'),
    ('TESTOSTERONE', 'testosterone', 'number', 'published_example', '', 1, 'reference', '[18,19)', 'male', 'any', 'routine', '[300,1200]', 'ng/dL', 'Reference interval', 'TESTO'),
    ('TESTOSTERONE', 'testosterone', 'number', 'published_example', '', 2, 'reference', '[18,19)', 'female', 'any', 'routine', '[20,75]', 'ng/dL', 'Reference interval', 'TESTO'),
    ('TESTOSTERONE', 'testosterone', 'number', 'published_example', '', 3, 'reference', '[19,)', 'male', 'any', 'routine', '[240,950]', 'ng/dL', 'Reference interval', 'TESTO'),
    ('TESTOSTERONE', 'testosterone', 'number', 'published_example', '', 4, 'reference', '[19,)', 'female', 'any', 'routine', '[8,60]', 'ng/dL', 'Reference interval', 'TESTO'),
    ('IRON_PROFILE', 'serum_iron', 'number', 'published_example', '', 1, 'reference', '[18,)', 'male', 'any', 'routine', '[50,150]', 'µg/dL', 'Reference interval', 'IRON'),
    ('IRON_PROFILE', 'serum_iron', 'number', 'published_example', '', 2, 'reference', '[18,)', 'female', 'any', 'routine', '[35,145]', 'µg/dL', 'Reference interval', 'IRON'),
    ('IRON_PROFILE', 'tibc', 'method_numeric', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[250,400]', 'µg/dL', 'Reference interval', 'IRON'),
    ('IRON_PROFILE', 'transferrin_sat', 'calculated', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[14,50]', '%', 'Reference interval', 'IRON'),
    ('AMYLASE', 'amylase', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[28,100]', 'U/L', 'Reference interval', 'AMY'),
    ('LIPASE', 'lipase', 'number', 'published_example', '', 1, 'reference', '[18,)', 'any', 'any', 'routine', '[13,60]', 'U/L', 'Reference interval', 'LPS'),
    ('CALCIUM', 'calcium_total', 'number', 'published_example', '', 1, 'reference', '[18,60)', 'any', 'any', 'routine', '[8.6,10]', 'mg/dL', 'Reference interval', 'CMP'),
    ('CALCIUM', 'calcium_total', 'number', 'published_example', '', 2, 'reference', '[60,91)', 'any', 'any', 'routine', '[8.8,10.2]', 'mg/dL', 'Reference interval', 'CMP'),
    ('CALCIUM', 'calcium_total', 'number', 'published_example', '', 3, 'reference', '[91,)', 'any', 'any', 'routine', '[8.2,9.6]', 'mg/dL', 'Reference interval', 'CMP')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE VIEW labflow_catalog_v2.catalogue AS
SELECT t.panel_order, t.code AS test_code, t.name AS test_name, t.department, t.sample_type,
       t.price_inr, t.catalog_status, p.sort_order, p.code AS parameter_code,
       p.name AS parameter_name, p.result_kind, p.unit, p.expected_result, p.allowed_results,
       p.inclusion, p.report_when, p.calculation, p.origin, p.reporting_note, t.reporting_note AS panel_note
FROM labflow_catalog_v2.tests AS t
JOIN labflow_catalog_v2.parameters AS p ON p.test_code = t.code;

-- Only local verified rules are eligible. An empty result means no applicable interpretation.
-- Pass the actual method, unit and patient/collection context. Never substitute a default sex, phase,
-- age, fasting status, or population. All seeded examples concern nonpregnant adults only.
-- The reference flag and any decision category are returned separately. Conflicting applicable
-- bands of the same kind are withheld. This function does not issue critical notifications.
CREATE OR REPLACE FUNCTION labflow_catalog_v2.interpret_number(
    p_test text, p_parameter text, p_value numeric, p_age_years integer, p_sex text,
    p_population text, p_reproductive_group text, p_context text, p_local_method text, p_reported_unit text
) RETURNS TABLE (rule_kind text, interpretation text, band_label text, value_band numrange)
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $interpret$
    WITH eligible AS (
        SELECT r.*, count(*) OVER (PARTITION BY r.rule_kind) AS applicable_count
        FROM labflow_catalog_v2.numeric_rules AS r
        JOIN labflow_catalog_v2.tests AS t ON t.code = r.test_code
        JOIN labflow_catalog_v2.parameters AS p ON p.test_code = r.test_code AND p.code = r.parameter_code
        WHERE r.test_code = p_test AND r.parameter_code = p_parameter
          AND r.rule_set = 'local_verified' AND r.local_method = p_local_method
          AND r.unit_at_definition IS NOT DISTINCT FROM p.unit
          AND p_reported_unit IS NOT DISTINCT FROM r.unit_at_definition
          AND t.catalog_status <> 'archive' AND p.inclusion <> 'archived'
          AND p_population = 'adult_nonpregnant' AND r.age_years @> p_age_years
          AND (r.sex_group = 'any' OR r.sex_group = p_sex)
          AND (r.reproductive_group = 'any' OR r.reproductive_group = p_reproductive_group)
          AND (r.context_key = 'routine' OR r.context_key = p_context)
          AND p_value >= 0 AND p_value < 'Infinity'::numeric
          AND (r.rule_kind = 'reference' OR r.value_band @> p_value)
    )
    SELECT e.rule_kind,
           CASE WHEN e.rule_kind = 'decision' THEN 'decision'
                WHEN e.value_band @> p_value THEN 'within'
                WHEN p_value < lower(e.value_band)
                  OR (p_value = lower(e.value_band) AND NOT lower_inc(e.value_band)) THEN 'below'
                ELSE 'above' END,
           e.band_label, e.value_band
    FROM eligible AS e WHERE e.applicable_count = 1
    ORDER BY e.rule_kind;
$interpret$;

-- Pure calculations. Supply valid, numeric JSON values in the listed reporting units from
-- one specimen. p_inputs_verified includes method limits, timing and clinical eligibility.
-- Missing/qualified measurements, zero denominators and inconsistent differences return NULL.
-- The caller decides local display precision and must preserve original measurements.
CREATE OR REPLACE FUNCTION labflow_catalog_v2.component_number(inputs jsonb, component text)
RETURNS numeric LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, pg_temp AS $component$
    SELECT CASE WHEN jsonb_typeof(inputs -> component) = 'number' THEN
                    CASE WHEN (inputs ->> component)::numeric >= 0 THEN (inputs ->> component)::numeric END
                END;
$component$;

CREATE OR REPLACE FUNCTION labflow_catalog_v2.calculate_component(
    p_test text, p_parameter text, inputs jsonb, p_inputs_verified boolean
) RETURNS numeric LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog, pg_temp AS $calculate$
DECLARE
    component_a numeric;
    component_b numeric;
    derived_value numeric;
BEGIN
    IF NOT p_inputs_verified OR jsonb_typeof(inputs) <> 'object' THEN RETURN NULL; END IF;
    CASE ARRAY[p_test, p_parameter]
        WHEN ARRAY['HBA1C','eag'] THEN
            component_a := labflow_catalog_v2.component_number(inputs, 'hba1c');
            IF component_a <= 0 OR component_a > 100 THEN RETURN NULL; END IF;
            derived_value := 28.7 * component_a - 46.7;
        WHEN ARRAY['LFT','bilirubin_indirect'] THEN
            derived_value := labflow_catalog_v2.component_number(inputs, 'bilirubin_total')
                           - labflow_catalog_v2.component_number(inputs, 'bilirubin_direct');
        WHEN ARRAY['LFT','globulin'] THEN
            derived_value := labflow_catalog_v2.component_number(inputs, 'total_protein')
                           - labflow_catalog_v2.component_number(inputs, 'albumin');
        WHEN ARRAY['LFT','ag_ratio'] THEN
            component_a := labflow_catalog_v2.component_number(inputs, 'albumin');
            component_b := labflow_catalog_v2.component_number(inputs, 'total_protein') - component_a;
            IF component_b <= 0 THEN RETURN NULL; END IF;
            derived_value := component_a / component_b;
        WHEN ARRAY['LIPID_PROFILE','chol_hdl_ratio'] THEN
            component_a := labflow_catalog_v2.component_number(inputs, 'cholesterol_total');
            component_b := labflow_catalog_v2.component_number(inputs, 'hdl');
            IF component_b <= 0 OR component_b > component_a THEN RETURN NULL; END IF;
            derived_value := component_a / component_b;
        WHEN ARRAY['LIPID_PROFILE','non_hdl'] THEN
            derived_value := labflow_catalog_v2.component_number(inputs, 'cholesterol_total')
                           - labflow_catalog_v2.component_number(inputs, 'hdl');
        WHEN ARRAY['IRON_PROFILE','transferrin_sat'] THEN
            component_a := labflow_catalog_v2.component_number(inputs, 'serum_iron');
            component_b := labflow_catalog_v2.component_number(inputs, 'tibc');
            IF component_b <= 0 THEN RETURN NULL; END IF;
            derived_value := 100 * component_a / component_b;
        ELSE RETURN NULL;
    END CASE;
    IF derived_value < 0 THEN RETURN NULL; END IF;
    RETURN derived_value;
END;
$calculate$;

-- Optional adapter for the two public LabFlow tables used by seed 003.
-- Call explicitly only if those tables exist and the application supports inactive tests and
-- nullable numeric limits. It adds missing order codes as INACTIVE with their original
-- tariffs and original parameter codes; it skips every existing order and all of its children.
-- Conditional additions, calculations and local context-aware rules belong in the v2-aware
-- result-entry workflow. Never automatically populate an observed patient result from expected_result.
-- The catalogue is available even when the public base tables do not exist.
CREATE OR REPLACE PROCEDURE labflow_catalog_v2.import_missing_inactive_orders()
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $import$
BEGIN
    IF to_regclass('public.tests') IS NULL OR to_regclass('public.test_parameters') IS NULL THEN
        RAISE EXCEPTION 'The optional import requires the original public.tests and public.test_parameters tables.';
    END IF;
    WITH added_tests AS (
        INSERT INTO public.tests (code, name, department, sample_type, price, active)
        SELECT t.code, t.name, t.department, t.sample_type, t.price_inr, false
        FROM labflow_catalog_v2.tests AS t
        ORDER BY t.panel_order
        ON CONFLICT (code) DO NOTHING
        RETURNING id, code
    )
    INSERT INTO public.test_parameters
        (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f,
         min_val, max_val, critical_min, critical_max, sort_order)
    SELECT a.id, p.code, p.name, coalesce(p.unit, ''), coalesce(p.expected_result, ''),
           NULL, NULL, NULL, NULL, NULL, NULL, p.sort_order
    FROM added_tests AS a
    JOIN labflow_catalog_v2.parameters AS p ON p.test_code = a.code AND p.origin = 'supplied'
    ORDER BY a.code, p.sort_order;
END;
$import$;


-- Grants for Supabase roles to access labflow_catalog_v2
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT USAGE ON SCHEMA labflow_catalog_v2 TO anon, authenticated, service_role;
        GRANT SELECT ON ALL TABLES IN SCHEMA labflow_catalog_v2 TO anon, authenticated, service_role;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA labflow_catalog_v2 TO anon, authenticated, service_role;
        GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA labflow_catalog_v2 TO anon, authenticated, service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA labflow_catalog_v2 GRANT SELECT ON TABLES TO anon, authenticated, service_role;
    END IF;
END $$;

COMMIT;

-- Optional: create only absent, inactive order templates in an existing LabFlow installation.
-- CALL labflow_catalog_v2.import_missing_inactive_orders();
--
-- Read-only comparison when the original public tables exist. Join by both codes.
-- SELECT v.test_code, v.parameter_code, p.name AS old_name, v.parameter_name AS proposed_name,
--        p.unit AS old_unit, v.unit AS proposed_unit, p.reference_range AS old_display,
--        p.min_val, p.max_val, p.critical_min, p.critical_max, v.inclusion, v.reporting_note
-- FROM labflow_catalog_v2.catalogue AS v
-- LEFT JOIN public.tests AS t ON t.code = v.test_code
-- LEFT JOIN public.test_parameters AS p ON p.test_id = t.id AND p.code = v.parameter_code
-- ORDER BY v.panel_order, v.sort_order;
--
-- A v2-aware result form reads catalogue.result_kind, inclusion, report_when and allowed_results.
-- For count_per_field allow an exact count or the observed interval. A span such as 2–4/HPF stays
-- a span for review. Do not coerce censored, graded, ranged or titre results to a midpoint.
-- Keep QC/run state (invalid, inconclusive, unread, not performed) separate from observations;
-- never default an unperformed result to negative. For a kit with an equivocal result category,
-- register that manufacturer-defined category and its repeat algorithm before use.
-- On report authorization snapshot the applied unit, method, rule version/interval and interpretation
-- with the report. Obtain local approval for critical calls and verify end-to-end flags before release.
