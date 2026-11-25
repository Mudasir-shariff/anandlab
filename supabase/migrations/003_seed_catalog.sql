-- ====================================================================
-- LABFLOW / ANAND DIAGNOSTIC CENTER: SEED DATA 003
-- Initial Lab Settings, Default Referrers, and 39 Clinical Test Panels
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

-- 4. 39 Test Panels & Parameters
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

    -- 2. HB
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('HB', 'Hemoglobin (Hb)', 'Hematology', 'EDTA Whole Blood', 150.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'hb', 'Hemoglobin', 'g/dL', '12.0 – 17.5', '13.5 – 17.5', '12.0 – 15.5', 12, 17.5, 7, 21, 1);

    -- 3. BLOOD_GROUP
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('BLOOD_GROUP', 'Blood Grouping & Rh Type', 'Hematology', 'EDTA Whole Blood', 70.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'abo_group', 'ABO Blood Group', '', 'A / B / AB / O', NULL, NULL, 0, 1, NULL, NULL, 1),
        (v_test_id, 'rh_factor', 'Rh(D) Factor', '', 'Positive / Negative', NULL, NULL, 0, 1, NULL, NULL, 2);

    -- 4. WIDAL
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

    -- 5. CRP
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('CRP', 'CRP (C-Reactive Protein)', 'Biochemistry', 'Serum', 300.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'crp', 'C-Reactive Protein (Quantitative)', 'mg/L', '< 6.0', NULL, NULL, 0, 6, NULL, 100, 1);

    -- 6. PLATELET
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('PLATELET', 'Platelet Count (Plates Count)', 'Hematology', 'EDTA Whole Blood', 150.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'platelets', 'Platelet Count', 'lakh/µL', '1.5 – 4.5', NULL, NULL, 1.5, 4.5, 0.2, 10, 1);

    -- 7. AEC
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('AEC', 'AEC Count (Absolute Eosinophil)', 'Hematology', 'EDTA Whole Blood', 300.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'aec_count', 'Absolute Eosinophil Count', 'cells/µL', '40 – 440', NULL, NULL, 40, 440, NULL, NULL, 1);

    -- 8. ESR
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('ESR', 'ESR (Erythrocyte Sedimentation Rate)', 'Hematology', 'Sodium Citrate / EDTA Blood', 100.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'esr', 'ESR (Westergren 1 hr)', 'mm/hr', '0 – 20', '0 – 15', '0 – 20', 0, 20, NULL, NULL, 1);

    -- 9. MALARIA
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('MALARIA', 'Malaria Parasite (Smear & Card)', 'Parasitology', 'EDTA Whole Blood', 250.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'mp_smear', 'Smear for Malarial Parasite', '', 'Not Detected (Negative)', NULL, NULL, 0, 1, NULL, NULL, 1),
        (v_test_id, 'mp_pf', 'P. Falciparum Antigen', '', 'Negative', NULL, NULL, 0, 1, NULL, NULL, 2),
        (v_test_id, 'mp_pv', 'P. Vivax Antigen', '', 'Negative', NULL, NULL, 0, 1, NULL, NULL, 3);

    -- 10. MANTOUX
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('MANTOUX', 'Mantoux or PPD Test', 'Clinical Pathology', 'Intradermal Injection', 400.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'mantoux_induration', 'Induration Diameter', 'mm', '< 5 mm Negative, >= 10 mm Positive', NULL, NULL, 0, 9, NULL, NULL, 1),
        (v_test_id, 'mantoux_reading', 'Mantoux Interpretation', '', 'Negative after 48-72 hrs', NULL, NULL, 0, 1, NULL, NULL, 2);

    -- 11. CHIKUNGUNYA
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('CHIKUNGUNYA', 'Chikungunya Test (IgM & IgG)', 'Serology', 'Serum', 800.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'chik_igm', 'Chikungunya IgM Antibodies', '', 'Negative', NULL, NULL, 0, 1, NULL, NULL, 1),
        (v_test_id, 'chik_igg', 'Chikungunya IgG Antibodies', '', 'Negative', NULL, NULL, 0, 1, NULL, NULL, 2);

    -- 12. HIV
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('HIV', 'HIV 1 & 2 Antibody Screen', 'Serology', 'Serum', 450.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'hiv_screen', 'HIV 1 & 2 Antibody Screen', '', 'Non-Reactive', NULL, NULL, 0, 1, NULL, NULL, 1);

    -- 13. HBSAG
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('HBSAG', 'HBsAg (Hepatitis B Surface Antigen)', 'Serology', 'Serum', 300.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'hbsag_screen', 'HBsAg (Hepatitis B Surface Ag)', '', 'Non-Reactive', NULL, NULL, 0, 1, NULL, NULL, 1);

    -- 14. VDRL
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('VDRL', 'VDRL / RPR Syphilis Test', 'Serology', 'Serum', 200.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'vdrl_screen', 'VDRL / RPR Syphilis Test', '', 'Non-Reactive', NULL, NULL, 0, 1, NULL, NULL, 1);

    -- 15. HSV
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('HSV', 'HSV (Herpes Simplex 1 & 2 IgM)', 'Serology', 'Serum', 400.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'hsv1_igm', 'Herpes Simplex Virus 1 (HSV-1 IgM)', 'Index', '< 0.9 Negative', NULL, NULL, 0, 0.9, NULL, NULL, 1),
        (v_test_id, 'hsv2_igm', 'Herpes Simplex Virus 2 (HSV-2 IgM)', 'Index', '< 0.9 Negative', NULL, NULL, 0, 0.9, NULL, NULL, 2);

    -- 16. URINE_ROUTINE
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

    -- 17. PREGNANCY
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('PREGNANCY', 'Pregnancy Test (Urine hCG Card)', 'Clinical Pathology', 'Early Morning Urine', 100.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'pregnancy_hcg', 'Urine hCG Pregnancy Test', '', 'Negative', NULL, NULL, 0, 1, NULL, NULL, 1);

    -- 18. FBS
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('FBS', 'Fasting Blood Sugar (FBS)', 'Biochemistry', 'Fluoride Plasma', 50.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'glucose_fasting', 'Fasting Blood Sugar (FBS)', 'mg/dL', '70 – 99 mg/dL (Normal: 70–99, Impaired: 100–125, Diabetic: ≥126)', NULL, NULL, 70, 99, 40, 500, 1);

    -- 19. PPBS
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('PPBS', 'Post Blood Sugar (PPBS)', 'Biochemistry', 'Fluoride Plasma', 50.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'glucose_postprandial', 'Post Prandial Blood Sugar (PPBS)', 'mg/dL', '< 140 mg/dL (Normal: <140, Impaired: 140–199, Diabetic: ≥200)', NULL, NULL, 70, 139, 40, 500, 1);

    -- 20. RA_FACTOR
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('RA_FACTOR', 'RA Factor (Rheumatoid Factor)', 'Serology', 'Serum', 150.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'ra_factor', 'Rheumatoid Factor (RA / RF)', 'IU/mL', '< 20.0 IU/mL (Negative)', NULL, NULL, 0, 20, NULL, NULL, 1);

    -- 21. ASLO
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('ASLO', 'ASLO / ASO Titer', 'Serology', 'Serum', 350.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'aslo_titer', 'ASLO / ASO Titer', 'IU/mL', '< 200 IU/mL (Negative)', NULL, NULL, 0, 200, NULL, NULL, 1);

    -- 22. HBA1C
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('HBA1C', 'HbA1c (Glycated Hemoglobin)', 'Biochemistry', 'EDTA Whole Blood', 500.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'hba1c', 'Glycated Hemoglobin (HbA1c)', '%', '< 5.7% (Normal: <5.7%, Prediabetes: 5.7–6.4%, Diabetes: ≥6.5%)', NULL, NULL, 4, 5.6, NULL, NULL, 1),
        (v_test_id, 'eag', 'Estimated Average Glucose (eAG)', 'mg/dL', '70 – 120 mg/dL', NULL, NULL, 70, 120, NULL, NULL, 2);

    -- 23. LFT
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

    -- 24. URIC_ACID
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('URIC_ACID', 'Uric Acid', 'Biochemistry', 'Serum', 250.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'uric_acid', 'Uric Acid', 'mg/dL', '2.5 – 7.2 mg/dL', '3.5 – 7.2 mg/dL', '2.6 – 6.0 mg/dL', 2.5, 7.2, NULL, NULL, 1);

    -- 25. THYROID_PROFILE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('THYROID_PROFILE', 'Thyroid Profile (T3, T4, TSH)', 'Endocrinology', 'Serum', 450.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 't3_total', 'Triiodothyronine (Total T3)', 'ng/dL', '80 – 200 ng/dL', NULL, NULL, 80, 200, NULL, NULL, 1),
        (v_test_id, 't4_total', 'Thyroxine (Total T4)', 'µg/dL', '5.1 – 14.1 µg/dL', NULL, NULL, 5.1, 14.1, NULL, NULL, 2),
        (v_test_id, 'tsh', 'Thyroid Stimulating Hormone (TSH)', 'µIU/mL', '0.40 – 4.50 µIU/mL', NULL, NULL, 0.4, 4.5, 0.01, 100, 3);

    -- 26. LIPID_PROFILE
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

    -- 27. UREA
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('UREA', 'Blood Urea', 'Biochemistry', 'Serum', 140.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'urea', 'Blood Urea', 'mg/dL', '15 – 40 mg/dL', NULL, NULL, 15, 40, NULL, 200, 1);

    -- 28. ELECTROLYTES
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('ELECTROLYTES', 'Serum Electrolytes (Na, K, Cl)', 'Biochemistry', 'Serum', 500.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'sodium', 'Sodium (Na+)', 'mmol/L', '136 – 145 mmol/L', NULL, NULL, 136, 145, 120, 160, 1),
        (v_test_id, 'potassium', 'Potassium (K+)', 'mmol/L', '3.5 – 5.1 mmol/L', NULL, NULL, 3.5, 5.1, 2.5, 6.5, 2),
        (v_test_id, 'chloride', 'Chloride (Cl-)', 'mmol/L', '98 – 107 mmol/L', NULL, NULL, 98, 107, 80, 120, 3);

    -- 29. CREATININE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('CREATININE', 'Creatinine', 'Biochemistry', 'Serum', 150.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'creatinine', 'Serum Creatinine', 'mg/dL', '0.6 – 1.3 mg/dL', '0.7 – 1.3 mg/dL', '0.6 – 1.1 mg/dL', 0.6, 1.3, NULL, 10, 1);

    -- 30. FSH
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('FSH', 'FSH (Follicle Stimulating Hormone)', 'Endocrinology', 'Serum', 350.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'fsh', 'Follicle Stimulating Hormone (FSH)', 'mIU/mL', '1.5 – 12.4 (M), 3.5 – 12.5 (F)', NULL, NULL, 1.5, 12.4, NULL, NULL, 1);

    -- 31. LH
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('LH', 'LH (Luteinizing Hormone)', 'Endocrinology', 'Serum', 350.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'lh', 'Luteinizing Hormone (LH)', 'mIU/mL', '1.7 – 8.6 (M), 2.4 – 12.6 (F)', NULL, NULL, 1.7, 8.6, NULL, NULL, 1);

    -- 32. PROLACTIN
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('PROLACTIN', 'Prolactin', 'Endocrinology', 'Fasting Morning Serum', 600.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'prolactin', 'Serum Prolactin', 'ng/mL', '4.0 – 15.2 (M), 4.8 – 23.3 (F)', NULL, NULL, 4, 20, NULL, NULL, 1);

    -- 33. TESTOSTERONE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('TESTOSTERONE', 'Testosterone (Total)', 'Endocrinology', 'Morning Serum', 600.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'testosterone', 'Total Testosterone', 'ng/dL', '240 – 870 (M), 8.4 – 48.1 (F)', NULL, NULL, 240, 870, NULL, NULL, 1);

    -- 34. IRON_PROFILE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('IRON_PROFILE', 'Iron Profile', 'Biochemistry', 'Fasting Serum', 1500.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'serum_iron', 'Serum Iron', 'µg/dL', '50 – 170', NULL, NULL, 50, 170, NULL, NULL, 1),
        (v_test_id, 'tibc', 'Total Iron Binding Capacity (TIBC)', 'µg/dL', '250 – 450', NULL, NULL, 250, 450, NULL, NULL, 2),
        (v_test_id, 'transferrin_sat', 'Transferrin Saturation', '%', '20 – 50', NULL, NULL, 20, 50, NULL, NULL, 3);

    -- 35. ANA_PROFILE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('ANA_PROFILE', 'ANA Profile', 'Immunology', 'Serum', 3500.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'ana_screen', 'ANA Primary Screen (IFA / EIA)', '', 'Negative (< 1:100)', NULL, NULL, 0, 1, NULL, NULL, 1),
        (v_test_id, 'anti_dsdna', 'Anti-dsDNA Antibodies', 'IU/mL', '< 10 Negative', NULL, NULL, 0, 10, NULL, NULL, 2),
        (v_test_id, 'ana_pattern', 'ANA Nuclear Pattern', '', 'Homogeneous / Speckled / Negative', NULL, NULL, 0, 1, NULL, NULL, 3);

    -- 36. DENGUE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('DENGUE', 'Dengue Test (NS1 Ag + IgM/IgG)', 'Serology', 'Serum', 600.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'dengue_ns1', 'Dengue NS1 Antigen', '', 'Negative', NULL, NULL, 0, 1, NULL, NULL, 1),
        (v_test_id, 'dengue_igm', 'Dengue IgM Antibodies', '', 'Negative', NULL, NULL, 0, 1, NULL, NULL, 2),
        (v_test_id, 'dengue_igg', 'Dengue IgG Antibodies', '', 'Negative', NULL, NULL, 0, 1, NULL, NULL, 3);

    -- 37. AMYLASE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('AMYLASE', 'Serum Amylase', 'Biochemistry', 'Serum', 500.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'amylase', 'Serum Amylase', 'U/L', '28 – 100', NULL, NULL, 28, 100, NULL, NULL, 1);

    -- 38. LIPASE
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('LIPASE', 'Serum Lipase', 'Biochemistry', 'Serum', 400.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'lipase', 'Serum Lipase', 'U/L', '13 – 60', NULL, NULL, 13, 60, NULL, NULL, 1);

    -- 39. CALCIUM
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('CALCIUM', 'Serum Calcium', 'Biochemistry', 'Serum', 450.00, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
        (v_test_id, 'calcium_total', 'Serum Calcium (Total)', 'mg/dL', '8.5 – 10.5', NULL, NULL, 8.5, 10.5, 6, 13, 1);

END $$;
