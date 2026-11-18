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
    'Anand Diagnostic Laboratory',
    'Accurate Diagnostics · Compassionate Care',
    '#42, 10th Main, Vijayanagar, Bangalore - 560040',
    '+91 98450 12345',
    'contact@anandlab.in',
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
