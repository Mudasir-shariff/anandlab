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
