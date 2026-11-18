/**
 * Anand Diagnostic Center / Opti-X Labs Clinical Catalog.
 * Exact 38 tests and prices from laboratory pricing board.
 */
export const CATALOG_NOTICE = 'Clinical reference intervals for Anand Diagnostic Center. Laboratory validated.';

export const PARAMETERS = {
  // CBC
  hb: { name: 'Hemoglobin', unit: 'g/dL', min: 12.0, max: 17.5, reference: '12.0 – 17.5', referenceM: '13.5 – 17.5', referenceF: '12.0 – 15.5', criticalMin: 7.0, criticalMax: 21.0 },
  wbc: { name: 'Total Leukocyte Count (TLC)', unit: 'cells/µL', min: 4000, max: 11000, reference: '4,000 – 11,000', criticalMin: 2000, criticalMax: 40000 },
  neutrophils: { name: 'Neutrophils', unit: '%', min: 40, max: 70, reference: '40 – 70' },
  lymphocytes: { name: 'Lymphocytes', unit: '%', min: 20, max: 40, reference: '20 – 40' },
  eosinophils: { name: 'Eosinophils', unit: '%', min: 1, max: 6, reference: '1 – 6' },
  monocytes: { name: 'Monocytes', unit: '%', min: 2, max: 8, reference: '2 – 8' },
  basophils: { name: 'Basophils', unit: '%', min: 0, max: 1, reference: '0 – 1' },
  platelets: { name: 'Platelet Count', unit: 'lakh/µL', min: 1.5, max: 4.5, reference: '1.5 – 4.5', criticalMin: 0.2, criticalMax: 10.0 },
  rbc: { name: 'Total RBC Count', unit: 'million/µL', min: 4.0, max: 5.9, reference: '4.0 – 5.9', referenceM: '4.5 – 5.9', referenceF: '4.0 – 5.2' },
  hct: { name: 'Hematocrit (PCV)', unit: '%', min: 36, max: 53, reference: '36 – 53', referenceM: '41 – 53', referenceF: '36 – 46', criticalMin: 20, criticalMax: 60 },
  mcv: { name: 'Mean Corpuscular Volume (MCV)', unit: 'fL', min: 80, max: 100, reference: '80 – 100' },
  mch: { name: 'Mean Corpuscular Hemoglobin (MCH)', unit: 'pg', min: 27, max: 33, reference: '27 – 33' },
  mchc: { name: 'MCHC', unit: 'g/dL', min: 31.5, max: 35.5, reference: '31.5 – 35.5' },
  rdw_cv: { name: 'RDW-CV', unit: '%', min: 11.5, max: 14.5, reference: '11.5 – 14.5' },
  rdw_sd: { name: 'RDW-SD', unit: 'fL', min: 39, max: 46, reference: '39 – 46' },

  // Blood Grouping
  abo_group: { name: 'ABO Blood Group', unit: '', min: 0, max: 1, reference: 'A / B / AB / O' },
  rh_factor: { name: 'Rh(D) Factor', unit: '', min: 0, max: 1, reference: 'Positive / Negative' },

  // Widal
  widal_to: { name: 'S. Typhi "O" Titer', unit: 'Titer', min: 0, max: 80, reference: '< 1:80 Non-Reactive' },
  widal_th: { name: 'S. Typhi "H" Titer', unit: 'Titer', min: 0, max: 80, reference: '< 1:80 Non-Reactive' },
  widal_ah: { name: 'S. Paratyphi "AH"', unit: 'Titer', min: 0, max: 80, reference: '< 1:80 Non-Reactive' },
  widal_bh: { name: 'S. Paratyphi "BH"', unit: 'Titer', min: 0, max: 80, reference: '< 1:80 Non-Reactive' },
  widal_result: { name: 'Widal Impression', unit: '', min: 0, max: 1, reference: 'Non-Reactive' },

  // CRP
  crp: { name: 'C-Reactive Protein (Quantitative)', unit: 'mg/L', min: 0, max: 6, reference: '< 6.0', criticalMax: 100 },

  // AEC Count
  aec_count: { name: 'Absolute Eosinophil Count', unit: 'cells/µL', min: 40, max: 440, reference: '40 – 440' },

  // ESR
  esr: { name: 'ESR (Westergren 1 hr)', unit: 'mm/hr', min: 0, max: 20, reference: '0 – 20', referenceM: '0 – 15', referenceF: '0 – 20' },

  // Malaria Parasite
  mp_smear: { name: 'Smear for Malarial Parasite', unit: '', min: 0, max: 1, reference: 'Not Detected (Negative)' },
  mp_pf: { name: 'P. Falciparum Antigen', unit: '', min: 0, max: 1, reference: 'Negative' },
  mp_pv: { name: 'P. Vivax Antigen', unit: '', min: 0, max: 1, reference: 'Negative' },

  // Mantoux Test
  mantoux_induration: { name: 'Induration Diameter', unit: 'mm', min: 0, max: 9, reference: '< 5 mm Negative, >= 10 mm Positive' },
  mantoux_reading: { name: 'Mantoux Interpretation', unit: '', min: 0, max: 1, reference: 'Negative after 48-72 hrs' },

  // Chikungunya Test
  chik_igm: { name: 'Chikungunya IgM Antibodies', unit: '', min: 0, max: 1, reference: 'Negative' },
  chik_igg: { name: 'Chikungunya IgG Antibodies', unit: '', min: 0, max: 1, reference: 'Negative' },

  // Infectious Disease Screen
  hiv_screen: { name: 'HIV 1 & 2 Antibody Screen', unit: '', min: 0, max: 1, reference: 'Non-Reactive' },
  hbsag_screen: { name: 'HBsAg (Hepatitis B Surface Ag)', unit: '', min: 0, max: 1, reference: 'Non-Reactive' },
  vdrl_screen: { name: 'VDRL / RPR Syphilis Test', unit: '', min: 0, max: 1, reference: 'Non-Reactive' },
  hsv1_igm: { name: 'Herpes Simplex Virus 1 (HSV-1 IgM)', unit: 'Index', min: 0, max: 0.9, reference: '< 0.9 Negative' },
  hsv2_igm: { name: 'Herpes Simplex Virus 2 (HSV-2 IgM)', unit: 'Index', min: 0, max: 0.9, reference: '< 0.9 Negative' },

  // Urine Routine
  urine_color: { name: 'Color', unit: '', min: 0, max: 1, reference: 'Pale Yellow' },
  urine_appearance: { name: 'Appearance', unit: '', min: 0, max: 1, reference: 'Clear' },
  urine_sp_gr: { name: 'Specific Gravity', unit: '', min: 1.005, max: 1.030, reference: '1.005 – 1.030' },
  urine_ph: { name: 'pH', unit: '', min: 5.0, max: 7.5, reference: '5.0 – 7.5' },
  urine_protein: { name: 'Protein / Albumin', unit: '', min: 0, max: 1, reference: 'Nil' },
  urine_sugar: { name: 'Sugar / Glucose', unit: '', min: 0, max: 1, reference: 'Nil' },
  urine_ketones: { name: 'Ketone Bodies', unit: '', min: 0, max: 1, reference: 'Nil' },
  urine_pus_cells: { name: 'Pus Cells', unit: '/hpf', min: 0, max: 5, reference: '1 – 4' },
  urine_rbc: { name: 'Red Blood Cells', unit: '/hpf', min: 0, max: 2, reference: 'Nil' },
  urine_epithelial: { name: 'Epithelial Cells', unit: '/hpf', min: 0, max: 5, reference: '1 – 3' },

  // Pregnancy Test
  pregnancy_hcg: { name: 'Urine hCG Pregnancy Test', unit: '', min: 0, max: 1, reference: 'Negative' },

  // Glucose Tests
  glucose_fasting: { name: 'Fasting Blood Sugar (FBS)', unit: 'mg/dL', min: 70, max: 99, reference: '70 – 99', criticalMin: 40, criticalMax: 500 },
  glucose_postprandial: { name: 'Post Prandial Blood Sugar (PPBS)', unit: 'mg/dL', min: 70, max: 139, reference: '< 140', criticalMin: 40, criticalMax: 500 },

  // Rheumatoid & Autoimmune
  ra_factor: { name: 'Rheumatoid Factor (RA / RF)', unit: 'IU/mL', min: 0, max: 20, reference: '< 20.0' },
  aslo_titer: { name: 'ASLO / ASO Titer', unit: 'IU/mL', min: 0, max: 200, reference: '< 200' },

  // HbA1c
  hba1c: { name: 'Glycated Hemoglobin (HbA1c)', unit: '%', min: 4.0, max: 5.6, reference: '< 5.7 Normal, 5.7-6.4 Prediabetes' },
  eag: { name: 'Estimated Average Glucose (eAG)', unit: 'mg/dL', min: 70, max: 120, reference: '70 – 120' },

  // Liver Function Test
  bilirubin_total: { name: 'Bilirubin, Total', unit: 'mg/dL', min: 0.2, max: 1.2, reference: '0.2 – 1.2', criticalMax: 15.0 },
  bilirubin_direct: { name: 'Bilirubin, Direct', unit: 'mg/dL', min: 0, max: 0.3, reference: '0.0 – 0.3' },
  bilirubin_indirect: { name: 'Bilirubin, Indirect', unit: 'mg/dL', min: 0.1, max: 0.8, reference: '0.1 – 0.8' },
  alt: { name: 'SGPT / ALT', unit: 'U/L', min: 7, max: 56, reference: '7 – 56', criticalMax: 1000 },
  ast: { name: 'SGOT / AST', unit: 'U/L', min: 10, max: 40, reference: '10 – 40', criticalMax: 1000 },
  alp: { name: 'Alkaline Phosphatase (ALP)', unit: 'U/L', min: 44, max: 147, reference: '44 – 147' },
  total_protein: { name: 'Total Protein', unit: 'g/dL', min: 6.0, max: 8.3, reference: '6.0 – 8.3' },
  albumin: { name: 'Albumin', unit: 'g/dL', min: 3.5, max: 5.0, reference: '3.5 – 5.0', criticalMin: 1.5 },
  globulin: { name: 'Globulin', unit: 'g/dL', min: 2.0, max: 3.5, reference: '2.0 – 3.5' },
  ag_ratio: { name: 'A:G Ratio', unit: '', min: 1.2, max: 2.2, reference: '1.2 – 2.2' },

  // Uric Acid
  uric_acid: { name: 'Uric Acid', unit: 'mg/dL', min: 2.5, max: 7.0, reference: '3.5 – 7.2 (M), 2.6 – 6.0 (F)' },

  // Thyroid Profile
  t3_total: { name: 'Triiodothyronine (Total T3)', unit: 'ng/dL', min: 80, max: 200, reference: '80 – 200' },
  t4_total: { name: 'Thyroxine (Total T4)', unit: 'µg/dL', min: 5.1, max: 14.1, reference: '5.1 – 14.1' },
  tsh: { name: 'Thyroid Stimulating Hormone (TSH)', unit: 'µIU/mL', min: 0.4, max: 4.5, reference: '0.40 – 4.50', criticalMin: 0.01, criticalMax: 100 },

  // Lipid Profile
  cholesterol_total: { name: 'Total Cholesterol', unit: 'mg/dL', min: 0, max: 200, reference: 'Desirable: < 200' },
  triglycerides: { name: 'Triglycerides', unit: 'mg/dL', min: 0, max: 150, reference: 'Normal: < 150' },
  hdl: { name: 'HDL Cholesterol', unit: 'mg/dL', min: 40, max: 100, reference: '> 40 (M), > 50 (F)' },
  ldl: { name: 'LDL Cholesterol', unit: 'mg/dL', min: 0, max: 100, reference: 'Optimal: < 100' },
  vldl: { name: 'VLDL Cholesterol', unit: 'mg/dL', min: 5, max: 40, reference: '5 – 40' },
  chol_hdl_ratio: { name: 'Total Chol / HDL Ratio', unit: '', min: 3.3, max: 4.4, reference: '3.3 – 4.4' },

  // Renal & Electrolytes
  urea: { name: 'Blood Urea', unit: 'mg/dL', min: 15, max: 40, reference: '15 – 40', criticalMax: 200 },
  creatinine: { name: 'Serum Creatinine', unit: 'mg/dL', min: 0.6, max: 1.3, reference: '0.7 – 1.3 (M), 0.6 – 1.1 (F)', criticalMax: 10.0 },
  sodium: { name: 'Sodium (Na+)', unit: 'mmol/L', min: 136, max: 145, reference: '136 – 145', criticalMin: 120, criticalMax: 160 },
  potassium: { name: 'Potassium (K+)', unit: 'mmol/L', min: 3.5, max: 5.1, reference: '3.5 – 5.1', criticalMin: 2.5, criticalMax: 6.5 },
  chloride: { name: 'Chloride (Cl-)', unit: 'mmol/L', min: 98, max: 107, reference: '98 – 107', criticalMin: 80, criticalMax: 120 },

  // Endocrinology / Reproductive Hormones
  fsh: { name: 'Follicle Stimulating Hormone (FSH)', unit: 'mIU/mL', min: 1.5, max: 12.4, reference: '1.5 – 12.4 (M), 3.5 – 12.5 (F)' },
  lh: { name: 'Luteinizing Hormone (LH)', unit: 'mIU/mL', min: 1.7, max: 8.6, reference: '1.7 – 8.6 (M), 2.4 – 12.6 (F)' },
  prolactin: { name: 'Serum Prolactin', unit: 'ng/mL', min: 4.0, max: 20.0, reference: '4.0 – 15.2 (M), 4.8 – 23.3 (F)' },
  testosterone: { name: 'Total Testosterone', unit: 'ng/dL', min: 240, max: 870, reference: '240 – 870 (M), 8.4 – 48.1 (F)' },

  // Iron Profile
  serum_iron: { name: 'Serum Iron', unit: 'µg/dL', min: 50, max: 170, reference: '50 – 170' },
  tibc: { name: 'Total Iron Binding Capacity (TIBC)', unit: 'µg/dL', min: 250, max: 450, reference: '250 – 450' },
  transferrin_sat: { name: 'Transferrin Saturation', unit: '%', min: 20, max: 50, reference: '20 – 50' },

  // ANA Profile
  ana_screen: { name: 'ANA Primary Screen (IFA / EIA)', unit: '', min: 0, max: 1, reference: 'Negative (< 1:100)' },
  anti_dsdna: { name: 'Anti-dsDNA Antibodies', unit: 'IU/mL', min: 0, max: 10, reference: '< 10 Negative' },
  ana_pattern: { name: 'ANA Nuclear Pattern', unit: '', min: 0, max: 1, reference: 'Homogeneous / Speckled / Negative' },

  // Dengue Test
  dengue_ns1: { name: 'Dengue NS1 Antigen', unit: '', min: 0, max: 1, reference: 'Negative' },
  dengue_igm: { name: 'Dengue IgM Antibodies', unit: '', min: 0, max: 1, reference: 'Negative' },
  dengue_igg: { name: 'Dengue IgG Antibodies', unit: '', min: 0, max: 1, reference: 'Negative' },

  // Pancreatic Enzymes
  amylase: { name: 'Serum Amylase', unit: 'U/L', min: 28, max: 100, reference: '28 – 100' },
  lipase: { name: 'Serum Lipase', unit: 'U/L', min: 13, max: 60, reference: '13 – 60' },

  // Serum Calcium
  calcium_total: { name: 'Serum Calcium (Total)', unit: 'mg/dL', min: 8.5, max: 10.5, reference: '8.5 – 10.5', criticalMin: 6.0, criticalMax: 13.0 }
};

export const TESTS = {
  CBC: { name: 'Complete Blood Count (CBC)', price: 250, sample: 'EDTA Whole Blood', department: 'Hematology', parameters: ['hb', 'wbc', 'neutrophils', 'lymphocytes', 'eosinophils', 'monocytes', 'basophils', 'platelets', 'rbc', 'hct', 'mcv', 'mch', 'mchc', 'rdw_cv', 'rdw_sd'] },
  BLOOD_GROUP: { name: 'Blood Grouping & Rh Type', price: 70, sample: 'EDTA Whole Blood', department: 'Hematology', parameters: ['abo_group', 'rh_factor'] },
  WIDAL: { name: 'Widal Test (Agglutination)', price: 200, sample: 'Serum', department: 'Serology', parameters: ['widal_to', 'widal_th', 'widal_ah', 'widal_bh', 'widal_result'] },
  CRP: { name: 'CRP (C-Reactive Protein)', price: 300, sample: 'Serum', department: 'Biochemistry', parameters: ['crp'] },
  PLATELET: { name: 'Platelet Count', price: 150, sample: 'EDTA Whole Blood', department: 'Hematology', parameters: ['platelets'] },
  AEC: { name: 'AEC Count (Absolute Eosinophil)', price: 300, sample: 'EDTA Whole Blood', department: 'Hematology', parameters: ['aec_count'] },
  ESR: { name: 'ESR (Erythrocyte Sedimentation Rate)', price: 100, sample: 'Sodium Citrate / EDTA Blood', department: 'Hematology', parameters: ['esr'] },
  MALARIA: { name: 'Malaria Parasite (Smear & Card)', price: 250, sample: 'EDTA Whole Blood', department: 'Parasitology', parameters: ['mp_smear', 'mp_pf', 'mp_pv'] },
  MANTOUX: { name: 'Mantoux or PPD Test', price: 400, sample: 'Intradermal Injection', department: 'Clinical Pathology', parameters: ['mantoux_induration', 'mantoux_reading'] },
  CHIKUNGUNYA: { name: 'Chikungunya Test (IgM & IgG)', price: 800, sample: 'Serum', department: 'Serology', parameters: ['chik_igm', 'chik_igg'] },
  HIV: { name: 'HIV 1 & 2 Antibody Screen', price: 450, sample: 'Serum', department: 'Serology', parameters: ['hiv_screen'] },
  HBSAG: { name: 'HBsAg (Hepatitis B Surface Antigen)', price: 300, sample: 'Serum', department: 'Serology', parameters: ['hbsag_screen'] },
  VDRL: { name: 'VDRL / RPR Syphilis Test', price: 200, sample: 'Serum', department: 'Serology', parameters: ['vdrl_screen'] },
  HSV: { name: 'HSV (Herpes Simplex 1 & 2 IgM)', price: 400, sample: 'Serum', department: 'Serology', parameters: ['hsv1_igm', 'hsv2_igm'] },
  URINE_ROUTINE: { name: 'Urine Routine & Microscopic', price: 100, sample: 'Spot Urine', department: 'Clinical Pathology', parameters: ['urine_color', 'urine_appearance', 'urine_sp_gr', 'urine_ph', 'urine_protein', 'urine_sugar', 'urine_ketones', 'urine_pus_cells', 'urine_rbc', 'urine_epithelial'] },
  PREGNANCY: { name: 'Pregnancy Test (Urine hCG Card)', price: 100, sample: 'Early Morning Urine', department: 'Clinical Pathology', parameters: ['pregnancy_hcg'] },
  FBS: { name: 'Fasting Blood Sugar (FBS)', price: 50, sample: 'Fluoride Plasma', department: 'Biochemistry', parameters: ['glucose_fasting'] },
  PPBS: { name: 'Post Blood Sugar (PPBS)', price: 50, sample: 'Fluoride Plasma', department: 'Biochemistry', parameters: ['glucose_postprandial'] },
  RA_FACTOR: { name: 'RA Factor (Rheumatoid Factor)', price: 150, sample: 'Serum', department: 'Serology', parameters: ['ra_factor'] },
  ASLO: { name: 'ASLO / ASO Titer', price: 350, sample: 'Serum', department: 'Serology', parameters: ['aslo_titer'] },
  HBA1C: { name: 'HbA1c (Glycated Hemoglobin)', price: 500, sample: 'EDTA Whole Blood', department: 'Biochemistry', parameters: ['hba1c', 'eag'] },
  LFT: { name: 'Liver Function Test (LFT)', price: 450, sample: 'Serum', department: 'Biochemistry', parameters: ['bilirubin_total', 'bilirubin_direct', 'bilirubin_indirect', 'alt', 'ast', 'alp', 'total_protein', 'albumin', 'globulin', 'ag_ratio'] },
  URIC_ACID: { name: 'Uric Acid', price: 250, sample: 'Serum', department: 'Biochemistry', parameters: ['uric_acid'] },
  THYROID_PROFILE: { name: 'Thyroid Profile (T3, T4, TSH)', price: 450, sample: 'Serum', department: 'Endocrinology', parameters: ['t3_total', 't4_total', 'tsh'] },
  LIPID_PROFILE: { name: 'Lipid Profile', price: 500, sample: 'Fasting Serum', department: 'Biochemistry', parameters: ['cholesterol_total', 'triglycerides', 'hdl', 'ldl', 'vldl', 'chol_hdl_ratio'] },
  UREA: { name: 'Blood Urea', price: 140, sample: 'Serum', department: 'Biochemistry', parameters: ['urea'] },
  ELECTROLYTES: { name: 'Serum Electrolytes (Na, K, Cl)', price: 500, sample: 'Serum', department: 'Biochemistry', parameters: ['sodium', 'potassium', 'chloride'] },
  CREATININE: { name: 'Creatinine', price: 150, sample: 'Serum', department: 'Biochemistry', parameters: ['creatinine'] },
  FSH: { name: 'FSH (Follicle Stimulating Hormone)', price: 350, sample: 'Serum', department: 'Endocrinology', parameters: ['fsh'] },
  LH: { name: 'LH (Luteinizing Hormone)', price: 350, sample: 'Serum', department: 'Endocrinology', parameters: ['lh'] },
  PROLACTIN: { name: 'Prolactin', price: 600, sample: 'Fasting Morning Serum', department: 'Endocrinology', parameters: ['prolactin'] },
  TESTOSTERONE: { name: 'Testosterone (Total)', price: 600, sample: 'Morning Serum', department: 'Endocrinology', parameters: ['testosterone'] },
  IRON_PROFILE: { name: 'Iron Profile', price: 1500, sample: 'Fasting Serum', department: 'Biochemistry', parameters: ['serum_iron', 'tibc', 'transferrin_sat'] },
  ANA_PROFILE: { name: 'ANA Profile', price: 3500, sample: 'Serum', department: 'Immunology', parameters: ['ana_screen', 'anti_dsdna', 'ana_pattern'] },
  DENGUE: { name: 'Dengue Test (NS1 Ag + IgM/IgG)', price: 600, sample: 'Serum', department: 'Serology', parameters: ['dengue_ns1', 'dengue_igm', 'dengue_igg'] },
  AMYLASE: { name: 'Serum Amylase', price: 500, sample: 'Serum', department: 'Biochemistry', parameters: ['amylase'] },
  LIPASE: { name: 'Serum Lipase', price: 400, sample: 'Serum', department: 'Biochemistry', parameters: ['lipase'] },
  CALCIUM: { name: 'Serum Calcium', price: 450, sample: 'Serum', department: 'Biochemistry', parameters: ['calcium_total'] }
};

export const reportNotes = {
  CBC: 'Complete blood count parameters should be clinically correlated with patient symptoms and peripheral smear examination.',
  BLOOD_GROUP: 'Confirmed by forward cell grouping and reverse serum grouping procedures.',
  WIDAL: 'Single high titers indicate exposure; paired sera after 7-10 days demonstrating a fourfold rise provide diagnostic confirmation.',
  CRP: 'Quantitative CRP measurement. Serial determinations provide valuable guidance in monitoring inflammatory disease.',
  PLATELET: 'Platelet counts below 50,000/µL or sudden declines warrant clinical evaluation and peripheral smear verification.',
  AEC: 'Absolute eosinophil count elevated in allergic disorders, parasitic infestations, and drug reactions.',
  ESR: 'Nonspecific marker of acute and chronic inflammation, infection, or tissue necrosis.',
  MALARIA: 'A negative smear does not exclude malaria. Repeat testing during pyrexia is recommended if clinically suspected.',
  MANTOUX: 'Induration >= 10 mm is considered positive in immunocompetent individuals. Interpret with chest X-ray and history.',
  CHIKUNGUNYA: 'IgM antibodies appear within 3-5 days after symptom onset and persist for 2-3 months.',
  HIV: 'Screening test. Reactive results must be confirmed by Western Blot or supplementary testing according to NACO guidelines.',
  HBSAG: 'Initial screening test. Reactive samples should be confirmed by neutralization assay or quantitative HBV DNA PCR.',
  VDRL: 'Nonspecific screening test for syphilis. Reactive results require clinical correlation and TPHA / FTA-ABS confirmation.',
  HSV: 'IgM antibodies indicate recent exposure or primary infection; IgG demonstrates past exposure.',
  URINE_ROUTINE: 'Clean-catch midstream urine sample. Correlate with clinical findings and history of urinary symptoms.',
  PREGNANCY: 'Detects human chorionic gonadotropin (hCG) at sensitivity >= 25 mIU/mL. Confirm with serum beta-hCG if needed.',
  FBS: 'Fasting duration 8-12 hours prior to venipuncture. Repeat fasting or HbA1c testing recommended for confirmation.',
  PPBS: 'Sample taken exactly 2 hours after start of normal meal.',
  RA_FACTOR: 'Rheumatoid factor is positive in 70-80% of rheumatoid arthritis cases; also seen in other connective tissue diseases.',
  ASLO: 'Elevated ASO titers indicate recent Group A Streptococcus infection, typically associated with rheumatic fever.',
  HBA1C: 'Reflects average glycemic control over the preceding 2 to 3 months. Not valid in hemolytic anemias or recent transfusions.',
  LFT: 'Evaluate liver enzymes in conjunction with clinical symptoms, medications, and viral markers.',
  URIC_ACID: 'Serum uric acid levels may transiently drop during an acute attack of gout. Clinical correlation recommended.',
  THYROID_PROFILE: 'Evaluate thyroid hormones in conjunction with clinical presentation, pregnancy status, and current medications.',
  LIPID_PROFILE: 'Fasting for 10-12 hours required. Assess cardiovascular risk factors alongside lipid panel values.',
  UREA: 'Urea levels reflect renal clearance, dietary protein intake, and hydration state.',
  ELECTROLYTES: 'Specimen collected with minimal stasis and promptly separated to prevent pseudohyperkalemia.',
  CREATININE: 'Serum creatinine provides a reliable index of renal function. Consider estimated GFR (eGFR) calculation.',
  FSH: 'Hormone levels vary markedly with phase of menstrual cycle in females. Reference range correlates with clinical stage.',
  LH: 'Mid-cycle surge triggers ovulation. Evaluated alongside FSH for pituitary-gonadal axis assessment.',
  PROLACTIN: 'Basal morning sample collected in non-stressed state. Elevated in physiological, pharmacological, and pituitary conditions.',
  TESTOSTERONE: 'Diurnal variation exists with highest values in morning. Repeat morning samples advised if borderline.',
  IRON_PROFILE: 'Diurnal variation observed; fasting morning sample preferred. Correlate with complete blood count.',
  ANA_PROFILE: 'ANA screening test. Positive profiles should be evaluated alongside specific autoantibody titers and rheumatology consultation.',
  DENGUE: 'NS1 antigen is positive during day 1-5 of acute phase; IgM and IgG appear after day 4-5.',
  AMYLASE: 'Serum amylase rises within 6-12 hours of acute pancreatitis and returns to normal in 3-5 days.',
  LIPASE: 'Serum lipase remains elevated longer than amylase in acute pancreatitis and provides greater clinical specificity.',
  CALCIUM: 'Total serum calcium is dependent on serum albumin concentration. Correlate with ionized calcium when indicated.'
};

const demoSeedResults = {
  hb: 13.8, wbc: 7500, neutrophils: 64, lymphocytes: 26, eosinophils: 4, monocytes: 5, basophils: 1,
  platelets: 2.6, rbc: 4.8, hct: 43, mcv: 89.5, mch: 28.8, mchc: 32.1, rdw_cv: 13.2, rdw_sd: 42.5,
  abo_group: 'B', rh_factor: 'Positive', crp: 4.2, aec_count: 220, esr: 12,
  glucose_fasting: 92, glucose_postprandial: 124, hba1c: 5.4, eag: 108,
  bilirubin_total: 0.8, bilirubin_direct: 0.2, bilirubin_indirect: 0.6, alt: 28, ast: 24, alp: 88, total_protein: 7.2, albumin: 4.4, globulin: 2.8, ag_ratio: 1.57,
  uric_acid: 5.1, t3_total: 125, t4_total: 8.4, tsh: 2.1,
  cholesterol_total: 182, triglycerides: 135, hdl: 48, ldl: 107, vldl: 27, chol_hdl_ratio: 3.79,
  urea: 26, creatinine: 0.9, sodium: 140, potassium: 4.2, chloride: 102,
  calcium_total: 9.4, amylase: 62, lipase: 34
};

export function makeDemoOrders() {
  const now = Date.now();
  const iso = minutesAgo => new Date(now - minutesAgo * 60000).toISOString();
  const complete = tests => Object.fromEntries(tests.flatMap(code => TESTS[code].parameters).map(key => [key, demoSeedResults[key] || 1]));
  const seeds = [
    { id: 'LF-1028', patientId: 'PT-2041', name: 'Ananya Sharma', age: 32, sex: 'Female', phone: '', email: '', category: 'Walk-in', referrer: 'Dr. Meera Iyer', tests: ['CBC', 'THYROID_PROFILE'], priority: 'Routine', status: 'Collected', minutesAgo: 24, paid: 700, results: {} },
    { id: 'LF-1027', patientId: 'PT-2040', name: 'Rohan Mehta', age: 45, sex: 'Male', phone: '', email: '', category: 'Corporate', referrer: 'Dr. Arjun Rao', tests: ['CBC', 'LFT', 'CREATININE'], priority: 'Urgent', status: 'Processing', minutesAgo: 52, paid: 850, results: { hb: 13.8, wbc: 12800 } },
    { id: 'LF-1026', patientId: 'PT-2039', name: 'Kavya Nair', age: 28, sex: 'Female', phone: '', email: '', category: 'Walk-in', referrer: 'Self', tests: ['CBC', 'HBA1C'], priority: 'Routine', status: 'Review', minutesAgo: 78, paid: 750, results: { ...complete(['CBC', 'HBA1C']), hb: 10.8, hba1c: 6.2 } },
    { id: 'LF-1025', patientId: 'PT-2038', name: 'Vikram Desai', age: 56, sex: 'Male', phone: '', email: '', category: 'Referral', referrer: 'Dr. Meera Iyer', tests: ['LIPID_PROFILE', 'CREATININE'], priority: 'Routine', status: 'Approved', minutesAgo: 115, paid: 650, results: complete(['LIPID_PROFILE', 'CREATININE']) },
    { id: 'LF-1024', patientId: 'PT-2037', name: 'Ishita Kapoor', age: 39, sex: 'Female', phone: '', email: '', category: 'Walk-in', referrer: 'Self', tests: ['LFT'], priority: 'Routine', status: 'Registered', minutesAgo: 8, paid: 0, results: {} }
  ];
  return seeds.map(({ minutesAgo, ...order }) => ({
    ...order,
    amount: order.tests.reduce((total, code) => total + TESTS[code].price, 0),
    paymentMethod: order.paid ? 'UPI' : '',
    createdAt: iso(minutesAgo),
    updatedAt: iso(Math.max(0, minutesAgo - 12)),
    approvedAt: order.status === 'Approved' ? iso(Math.max(0, minutesAgo - 12)) : null,
    notes: '',
    version: 1,
    demo: true
  }));
}
