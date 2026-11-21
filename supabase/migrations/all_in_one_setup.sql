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
    'Anand Laboratory',
    'Precision Diagnostics · Clinical Excellence',
    'Silk Filature Quarters Road, Ward No. 14, Sidlaghatta – 562105, Chikkaballapur (Dist.)',
    '6361303305',
    'anandhealthcaresdl@gmail.com',
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
    VALUES ('CBC', 'Complete Blood Count (CBC)', 'Hematology', 'EDTA Whole Blood', 250.00, true)
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
    VALUES ('PLATELET', 'Platelet Count', 'Hematology', 'EDTA Whole Blood', 150.00, true)
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
        (v_test_id, 'glucose_fasting', 'Fasting Blood Sugar (FBS)', 'mg/dL', '70 – 99', NULL, NULL, 70, 99, 40, 500, 1);

    -- 18. PPBS
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('PPBS', 'Post Blood Sugar (PPBS)', 'Biochemistry', 'Fluoride Plasma', 50.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'glucose_postprandial', 'Post Prandial Blood Sugar (PPBS)', 'mg/dL', '< 140', NULL, NULL, 70, 139, 40, 500, 1);

    -- 19. RA_FACTOR
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('RA_FACTOR', 'RA Factor (Rheumatoid Factor)', 'Serology', 'Serum', 150.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'ra_factor', 'Rheumatoid Factor (RA / RF)', 'IU/mL', '< 20.0', NULL, NULL, 0, 20, NULL, NULL, 1);

    -- 20. ASLO
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('ASLO', 'ASLO / ASO Titer', 'Serology', 'Serum', 350.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'aslo_titer', 'ASLO / ASO Titer', 'IU/mL', '< 200', NULL, NULL, 0, 200, NULL, NULL, 1);

    -- 21. HBA1C
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('HBA1C', 'HbA1c (Glycated Hemoglobin)', 'Biochemistry', 'EDTA Whole Blood', 500.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'hba1c', 'Glycated Hemoglobin (HbA1c)', '%', '< 5.7 Normal, 5.7-6.4 Prediabetes', NULL, NULL, 4, 5.6, NULL, NULL, 1),
        (v_test_id, 'eag', 'Estimated Average Glucose (eAG)', 'mg/dL', '70 – 120', NULL, NULL, 70, 120, NULL, NULL, 2);

    -- 22. LFT
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('LFT', 'Liver Function Test (LFT)', 'Biochemistry', 'Serum', 450.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'bilirubin_total', 'Bilirubin, Total', 'mg/dL', '0.2 – 1.2', NULL, NULL, 0.2, 1.2, NULL, 15, 1),
        (v_test_id, 'bilirubin_direct', 'Bilirubin, Direct', 'mg/dL', '0.0 – 0.3', NULL, NULL, 0, 0.3, NULL, NULL, 2),
        (v_test_id, 'bilirubin_indirect', 'Bilirubin, Indirect', 'mg/dL', '0.1 – 0.8', NULL, NULL, 0.1, 0.8, NULL, NULL, 3),
        (v_test_id, 'alt', 'SGPT / ALT', 'U/L', '7 – 56', NULL, NULL, 7, 56, NULL, 1000, 4),
        (v_test_id, 'ast', 'SGOT / AST', 'U/L', '10 – 40', NULL, NULL, 10, 40, NULL, 1000, 5),
        (v_test_id, 'alp', 'Alkaline Phosphatase (ALP)', 'U/L', '44 – 147', NULL, NULL, 44, 147, NULL, NULL, 6),
        (v_test_id, 'total_protein', 'Total Protein', 'g/dL', '6.0 – 8.3', NULL, NULL, 6, 8.3, NULL, NULL, 7),
        (v_test_id, 'albumin', 'Albumin', 'g/dL', '3.5 – 5.0', NULL, NULL, 3.5, 5, 1.5, NULL, 8),
        (v_test_id, 'globulin', 'Globulin', 'g/dL', '2.0 – 3.5', NULL, NULL, 2, 3.5, NULL, NULL, 9),
        (v_test_id, 'ag_ratio', 'A:G Ratio', '', '1.2 – 2.2', NULL, NULL, 1.2, 2.2, NULL, NULL, 10);

    -- 23. URIC_ACID
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('URIC_ACID', 'Uric Acid', 'Biochemistry', 'Serum', 250.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'uric_acid', 'Uric Acid', 'mg/dL', '3.5 – 7.2 (M), 2.6 – 6.0 (F)', NULL, NULL, 2.5, 7, NULL, NULL, 1);

    -- 24. THYROID_PROFILE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('THYROID_PROFILE', 'Thyroid Profile (T3, T4, TSH)', 'Endocrinology', 'Serum', 450.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 't3_total', 'Triiodothyronine (Total T3)', 'ng/dL', '80 – 200', NULL, NULL, 80, 200, NULL, NULL, 1),
        (v_test_id, 't4_total', 'Thyroxine (Total T4)', 'µg/dL', '5.1 – 14.1', NULL, NULL, 5.1, 14.1, NULL, NULL, 2),
        (v_test_id, 'tsh', 'Thyroid Stimulating Hormone (TSH)', 'µIU/mL', '0.40 – 4.50', NULL, NULL, 0.4, 4.5, 0.01, 100, 3);

    -- 25. LIPID_PROFILE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('LIPID_PROFILE', 'Lipid Profile', 'Biochemistry', 'Fasting Serum', 500.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'cholesterol_total', 'Total Cholesterol', 'mg/dL', 'Desirable: < 200', NULL, NULL, 0, 200, NULL, NULL, 1),
        (v_test_id, 'triglycerides', 'Triglycerides', 'mg/dL', 'Normal: < 150', NULL, NULL, 0, 150, NULL, NULL, 2),
        (v_test_id, 'hdl', 'HDL Cholesterol', 'mg/dL', '> 40 (M), > 50 (F)', NULL, NULL, 40, 100, NULL, NULL, 3),
        (v_test_id, 'ldl', 'LDL Cholesterol', 'mg/dL', 'Optimal: < 100', NULL, NULL, 0, 100, NULL, NULL, 4),
        (v_test_id, 'vldl', 'VLDL Cholesterol', 'mg/dL', '5 – 40', NULL, NULL, 5, 40, NULL, NULL, 5),
        (v_test_id, 'chol_hdl_ratio', 'Total Chol / HDL Ratio', '', '3.3 – 4.4', NULL, NULL, 3.3, 4.4, NULL, NULL, 6);

    -- 26. UREA
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('UREA', 'Blood Urea', 'Biochemistry', 'Serum', 140.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'urea', 'Blood Urea', 'mg/dL', '15 – 40', NULL, NULL, 15, 40, NULL, 200, 1);

    -- 27. ELECTROLYTES
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('ELECTROLYTES', 'Serum Electrolytes (Na, K, Cl)', 'Biochemistry', 'Serum', 500.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'sodium', 'Sodium (Na+)', 'mmol/L', '136 – 145', NULL, NULL, 136, 145, 120, 160, 1),
        (v_test_id, 'potassium', 'Potassium (K+)', 'mmol/L', '3.5 – 5.1', NULL, NULL, 3.5, 5.1, 2.5, 6.5, 2),
        (v_test_id, 'chloride', 'Chloride (Cl-)', 'mmol/L', '98 – 107', NULL, NULL, 98, 107, 80, 120, 3);

    -- 28. CREATININE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('CREATININE', 'Creatinine', 'Biochemistry', 'Serum', 150.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'creatinine', 'Serum Creatinine', 'mg/dL', '0.7 – 1.3 (M), 0.6 – 1.1 (F)', NULL, NULL, 0.6, 1.3, NULL, 10, 1);

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
