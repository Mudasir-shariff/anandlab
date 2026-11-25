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
    ('CALCIUM', 'Calcium, total', 'Biochemistry', 'Serum', 450.0, 38, 'review', 'Use age-specific intervals. This is total calcium. Ionized calcium has different collection requirements, units and intervals.'),
    ('HB', 'Hemoglobin (Hb)', 'Hematology', 'EDTA Whole Blood', 150.0, 39, 'review', 'Standalone Hemoglobin order and CBC share the same Hb measurement, unit (g/dL), photometric method (SLS / Cyanmethemoglobin), and sex-specific adult reference intervals.')
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

-- HB
INSERT INTO labflow_catalog_v2.parameters
    (test_code, code, name, sort_order, result_kind, unit, expected_result, allowed_results, inclusion, report_when, calculation, reporting_note, origin)
VALUES
    ('HB', 'hb', 'Hemoglobin', 1, 'number', 'g/dL', NULL, NULL, 'routine', NULL, NULL, 'Standalone Hemoglobin order matching CBC Hb intervals (male 13.5–17.5 g/dL, female 12.0–15.5 g/dL).', 'supplied')
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
    ('CALCIUM', 'calcium_total', 'CMP'),
    ('HB', 'hb', 'CBC')
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
    ('CALCIUM', 'calcium_total', 'number', 'published_example', '', 3, 'reference', '[91,)', 'any', 'any', 'routine', '[8.2,9.6]', 'mg/dL', 'Reference interval', 'CMP'),
    ('HB', 'hb', 'number', 'published_example', '', 1, 'reference', '[18,)', 'male', 'any', 'routine', '[13.5,17.5]', 'g/dL', 'Reference interval', 'CBC'),
    ('HB', 'hb', 'number', 'published_example', '', 2, 'reference', '[18,)', 'female', 'any', 'routine', '[12,15.5]', 'g/dL', 'Reference interval', 'CBC')
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
