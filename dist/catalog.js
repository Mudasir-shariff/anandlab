/**
 * Starter laboratory catalog. Reference intervals are illustrative adult ranges.
 * Validate every test, unit, specimen, price and interval against the laboratory's
 * methods, instrument, population and SOPs before using real patient records.
 */
export const CATALOG_NOTICE = 'Illustrative adult reference intervals. Laboratory validation is required before clinical use.';

export const PARAMETERS = {
  // NOTE: min/max are broad illustrative ranges used for flagging only.
  // referenceM/referenceF are sex-specific display strings (illustrative, ICMR-approximate adult ranges).
  // criticalMin/criticalMax are illustrative critical alert thresholds — laboratory must validate ALL before clinical use.
  hb: {
    name: 'Hemoglobin', unit: 'g/dL', min: 12, max: 17.5,
    reference: '12.0 – 17.5', referenceM: '13.5 – 17.5', referenceF: '12.0 – 15.5',
    // Illustrative critical thresholds (ICMR/WHO guidance): validate before use
    criticalMin: 7.0, criticalMax: 21.0
  },
  wbc: {
    name: 'Total leukocyte count', unit: 'cells/µL', min: 4000, max: 11000,
    reference: '4,000 – 11,000',
    criticalMin: 2000, criticalMax: 40000
  },
  neutrophils: { name: 'Neutrophils', unit: '%', min: 40, max: 70, reference: '40 – 70' },
  lymphocytes: { name: 'Lymphocytes', unit: '%', min: 20, max: 40, reference: '20 – 40' },
  eosinophils: { name: 'Eosinophils', unit: '%', min: 1, max: 6, reference: '1 – 6' },
  monocytes: { name: 'Monocytes', unit: '%', min: 2, max: 8, reference: '2 – 8' },
  basophils: { name: 'Basophils', unit: '%', min: 0, max: 1, reference: '0 – 1' },
  platelets: {
    name: 'Platelet count', unit: 'lakh/µL', min: 1.5, max: 4.5,
    reference: '1.5 – 4.5',
    criticalMin: 0.2, criticalMax: 10.0
  },
  rbc: {
    name: 'Total RBC count', unit: 'million/µL', min: 4.0, max: 5.9,
    reference: '4.0 – 5.9', referenceM: '4.5 – 5.9', referenceF: '4.0 – 5.2'
  },
  hct: {
    name: 'Hematocrit (HCT)', unit: '%', min: 36, max: 53,
    reference: '36 – 53', referenceM: '41 – 53', referenceF: '36 – 46',
    criticalMin: 20, criticalMax: 60
  },
  mcv: { name: 'Mean corpuscular volume (MCV)', unit: 'fL', min: 80, max: 100, reference: '80 – 100' },
  mch: { name: 'Mean corpuscular hemoglobin (MCH)', unit: 'pg', min: 27, max: 33, reference: '27 – 33' },
  mchc: { name: 'Mean corpuscular Hb concentration (MCHC)', unit: 'g/dL', min: 31.5, max: 35.5, reference: '31.5 – 35.5' },
  rdw_cv: { name: 'Red cell distribution width (RDW-CV)', unit: '%', min: 11.5, max: 14.5, reference: '11.5 – 14.5' },
  rdw_sd: { name: 'Red cell distribution width (RDW-SD)', unit: 'fL', min: 39, max: 46, reference: '39 – 46' },
  bilirubin_total: {
    name: 'Bilirubin, total', unit: 'mg/dL', min: 0.2, max: 1.2,
    reference: '0.2 – 1.2',
    criticalMax: 15.0
  },
  bilirubin_direct: { name: 'Bilirubin, direct', unit: 'mg/dL', min: 0, max: 0.3, reference: '0.0 – 0.3' },
  alt: { name: 'Alanine aminotransferase (ALT)', unit: 'U/L', min: 7, max: 56, reference: '7 – 56', criticalMax: 1000 },
  ast: { name: 'Aspartate aminotransferase (AST)', unit: 'U/L', min: 10, max: 40, reference: '10 – 40', criticalMax: 1000 },
  alp: { name: 'Alkaline phosphatase (ALP)', unit: 'U/L', min: 44, max: 147, reference: '44 – 147' },
  total_protein: { name: 'Total protein', unit: 'g/dL', min: 6, max: 8.3, reference: '6.0 – 8.3' },
  albumin: { name: 'Albumin', unit: 'g/dL', min: 3.5, max: 5, reference: '3.5 – 5.0', criticalMin: 1.5 },
  urea: { name: 'Blood urea', unit: 'mg/dL', min: 15, max: 45, reference: '15 – 45', criticalMax: 200 },
  creatinine: {
    name: 'Creatinine', unit: 'mg/dL', min: 0.6, max: 1.3,
    reference: '0.6 – 1.3',
    criticalMax: 10.0
  },
  uric_acid: { name: 'Uric acid', unit: 'mg/dL', min: 2.5, max: 7, reference: '2.5 – 7.0' },
  sodium: {
    name: 'Sodium', unit: 'mmol/L', min: 135, max: 145,
    reference: '135 – 145',
    criticalMin: 120, criticalMax: 160
  },
  potassium: {
    name: 'Potassium', unit: 'mmol/L', min: 3.5, max: 5.1,
    reference: '3.5 – 5.1',
    criticalMin: 2.5, criticalMax: 6.5
  },
  hba1c: { name: 'Glycated hemoglobin (HbA1c)', unit: '%', min: 4, max: 5.6, reference: '4.0 – 5.6' },
  tsh: {
    name: 'Thyroid stimulating hormone (TSH)', unit: 'µIU/mL', min: 0.4, max: 4,
    reference: '0.4 – 4.0',
    criticalMin: 0.01, criticalMax: 100
  },
  cholesterol_total: { name: 'Total cholesterol', unit: 'mg/dL', min: 0, max: 200, reference: 'Desirable: < 200' },
  triglycerides: { name: 'Triglycerides', unit: 'mg/dL', min: 0, max: 150, reference: 'Desirable: < 150' },
  hdl: { name: 'HDL cholesterol', unit: 'mg/dL', min: 40, max: 100, reference: '40 – 100' },
  ldl: { name: 'LDL cholesterol', unit: 'mg/dL', min: 0, max: 100, reference: 'Optimal: < 100' },
  vldl: { name: 'VLDL cholesterol', unit: 'mg/dL', min: 5, max: 40, reference: '5 – 40' },
  glucose_fasting: {
    name: 'Blood glucose, fasting', unit: 'mg/dL', min: 70, max: 99,
    reference: '70 – 99',
    criticalMin: 40, criticalMax: 500
  },
  glucose_postprandial: {
    name: 'Blood glucose, 2-hour postprandial', unit: 'mg/dL', min: 70, max: 139,
    reference: '70 – 139',
    criticalMin: 40, criticalMax: 500
  },
  t3_total: { name: 'Triiodothyronine, total (T3)', unit: 'ng/dL', min: 80, max: 200, reference: '80 – 200' },
  t4_total: { name: 'Thyroxine, total (T4)', unit: 'µg/dL', min: 5.1, max: 14.1, reference: '5.1 – 14.1' },
  esr: {
    name: 'Erythrocyte sedimentation rate (ESR)', unit: 'mm/hr', min: 0, max: 20,
    reference: '0 – 20', referenceM: '0 – 15', referenceF: '0 – 20'
  },
  crp: { name: 'C-reactive protein, quantitative', unit: 'mg/L', min: 0, max: 5, reference: '0 – 5', criticalMax: 200 },
  calcium_total: {
    name: 'Calcium, total', unit: 'mg/dL', min: 8.6, max: 10.2,
    reference: '8.6 – 10.2',
    criticalMin: 6.0, criticalMax: 13.0
  },
  chloride: { name: 'Chloride', unit: 'mmol/L', min: 98, max: 107, reference: '98 – 107', criticalMin: 80, criticalMax: 120 },
  serum_iron: { name: 'Iron, serum', unit: 'µg/dL', min: 60, max: 170, reference: '60 – 170' },
  tibc: { name: 'Total iron binding capacity (TIBC)', unit: 'µg/dL', min: 250, max: 450, reference: '250 – 450' },
  transferrin_saturation: { name: 'Transferrin saturation', unit: '%', min: 20, max: 50, reference: '20 – 50' },
  vitamin_d_25oh: { name: 'Vitamin D, 25-hydroxy', unit: 'ng/mL', min: 30, max: 100, reference: '30 – 100' }
};

export const TESTS = {
  CBC: { name: 'Complete Blood Count', price: 450, sample: 'EDTA whole blood', department: 'Hematology', parameters: ['hb', 'wbc', 'neutrophils', 'lymphocytes', 'eosinophils', 'monocytes', 'basophils', 'platelets', 'rbc', 'hct', 'mcv', 'mch', 'mchc', 'rdw_cv', 'rdw_sd'] },
  LFT: { name: 'Liver Function Test', price: 700, sample: 'Serum', department: 'Biochemistry', parameters: ['bilirubin_total', 'bilirubin_direct', 'alt', 'ast', 'alp', 'total_protein', 'albumin'] },
  KFT: { name: 'Kidney Function Test', price: 650, sample: 'Serum', department: 'Biochemistry', parameters: ['urea', 'creatinine', 'uric_acid', 'sodium', 'potassium'] },
  HBA1C: { name: 'Glycated Hemoglobin', price: 550, sample: 'EDTA whole blood', department: 'Biochemistry', parameters: ['hba1c'] },
  TSH: { name: 'Thyroid Stimulating Hormone', price: 400, sample: 'Serum', department: 'Immunology', parameters: ['tsh'] },
  LIPID: { name: 'Lipid Profile', price: 750, sample: 'Serum', department: 'Biochemistry', parameters: ['cholesterol_total', 'triglycerides', 'hdl', 'ldl', 'vldl'] },
  GLUCOSE: { name: 'Blood Glucose (Fasting & Postprandial)', price: 200, sample: 'Fluoride plasma, fasting and 2-hour postprandial', department: 'Biochemistry', parameters: ['glucose_fasting', 'glucose_postprandial'] },
  THYROID: { name: 'Thyroid Profile (T3, T4 & TSH)', price: 750, sample: 'Serum', department: 'Immunology', parameters: ['t3_total', 't4_total', 'tsh'] },
  ESR: { name: 'Erythrocyte Sedimentation Rate', price: 150, sample: 'Anticoagulated whole blood; collection tube per method', department: 'Hematology', parameters: ['esr'] },
  CRP: { name: 'C-Reactive Protein (Quantitative)', price: 450, sample: 'Serum', department: 'Immunology', parameters: ['crp'] },
  URIC_ACID: { name: 'Uric Acid', price: 250, sample: 'Serum', department: 'Biochemistry', parameters: ['uric_acid'] },
  CALCIUM: { name: 'Calcium (Total)', price: 250, sample: 'Serum', department: 'Biochemistry', parameters: ['calcium_total'] },
  ELECTROLYTES: { name: 'Serum Electrolytes', price: 500, sample: 'Serum', department: 'Biochemistry', parameters: ['sodium', 'potassium', 'chloride'] },
  IRON: { name: 'Iron Profile', price: 650, sample: 'Serum', department: 'Biochemistry', parameters: ['serum_iron', 'tibc', 'transferrin_saturation'] },
  VITD: { name: 'Vitamin D (25-Hydroxy)', price: 1200, sample: 'Serum', department: 'Immunology', parameters: ['vitamin_d_25oh'] }
};

/** Optional explanatory report text; these notes do not interpret an individual patient. */
export const reportNotes = {
  CBC: 'The complete blood count measures red cells, white cells and platelets. Interpret findings with the clinical history and, when indicated, a peripheral blood film. Reference intervals vary with age and sex.',
  LFT: 'Interpret liver enzymes, bilirubin and protein measurements together with clinical findings, medication history and previous results. An isolated result does not establish a diagnosis.',
  KFT: 'Interpret renal markers with hydration status, medications and the clinical context. Creatinine-based assessment may require a separately validated eGFR calculation.',
  HBA1C: 'HbA1c reflects longer-term glycemic exposure. Altered red cell survival, hemoglobin variants and recent transfusion can affect the result; correlate with glucose measurements.',
  TSH: 'Interpret TSH with the clinical presentation and other thyroid measurements when appropriate. Pregnancy, medications and assay interference may require different reference intervals.',
  LIPID: 'Interpret lipid measurements with the patient’s cardiovascular risk and treatment goals. Record fasting status and the laboratory method used for LDL cholesterol.',
  GLUCOSE: 'Fasting and postprandial values require correctly timed, separately identified samples. Record the fasting duration and meal or glucose-load timing; interpret with the clinical context.',
  THYROID: 'This panel reports total T3 and total T4 together with TSH. Binding-protein changes, pregnancy, medications and assay interference can affect total hormone measurements.',
  ESR: 'ESR is a nonspecific measurement influenced by the method, age, sex and blood-cell characteristics. Interpret with symptoms and other laboratory findings.',
  CRP: 'This is a standard quantitative CRP measurement, not a high-sensitivity cardiovascular-risk assay. Correlate with clinical findings and trends over time.',
  URIC_ACID: 'Interpret serum uric acid with renal function, medications and the clinical presentation. A single measurement does not establish or exclude gout.',
  CALCIUM: 'Total calcium is influenced by serum albumin and other factors. Consider albumin or a separately measured ionized calcium when clinically indicated.',
  ELECTROLYTES: 'Collection conditions, hemolysis and delays in separation can affect electrolytes. Confirm unexpected findings using the laboratory’s specimen-quality and critical-value procedures.',
  IRON: 'Serum iron varies with timing and recent intake. Interpret with TIBC, transferrin saturation and, when indicated, ferritin and inflammatory markers.',
  VITD: 'This assay reports total 25-hydroxyvitamin D. Interpret against the laboratory’s validated assay and local clinical guidance; target intervals vary by guideline and patient group.'
};

const demoSeedResults = {
  hb: 14.2, wbc: 7200, neutrophils: 62, lymphocytes: 28, eosinophils: 4,
  monocytes: 5, basophils: 1, platelets: 2.8, rbc: 4.6, hct: 42,
  mcv: 91.3, mch: 30.9, mchc: 33.8, rdw_cv: 13.1, rdw_sd: 42,
  hba1c: 5.3,
  cholesterol_total: 178, triglycerides: 118, hdl: 52, ldl: 92, vldl: 24,
  urea: 28, creatinine: 0.9, uric_acid: 4.6, sodium: 139, potassium: 4.2
};

/** All generated records are fictional and must remain separate from live data. */
export function makeDemoOrders() {
  const now = Date.now();
  const iso = minutesAgo => new Date(now - minutesAgo * 60000).toISOString();
  const complete = tests => Object.fromEntries(tests.flatMap(code => TESTS[code].parameters).map(key => [key, demoSeedResults[key]]));
  const seeds = [
    { id: 'LF-1028', patientId: 'PT-2041', name: 'Ananya Sharma', age: 32, sex: 'Female', phone: '', email: '', category: 'Walk-in', referrer: 'Dr. Meera Iyer', tests: ['CBC', 'TSH'], priority: 'Routine', status: 'Collected', minutesAgo: 24, paid: 850, results: {} },
    { id: 'LF-1027', patientId: 'PT-2040', name: 'Rohan Mehta', age: 45, sex: 'Male', phone: '', email: '', category: 'Corporate', referrer: 'Dr. Arjun Rao', tests: ['CBC', 'LFT', 'KFT'], priority: 'Urgent', status: 'Processing', minutesAgo: 52, paid: 1000, results: { hb: 13.8, wbc: 12800 } },
    { id: 'LF-1026', patientId: 'PT-2039', name: 'Kavya Nair', age: 28, sex: 'Female', phone: '', email: '', category: 'Walk-in', referrer: 'Self', tests: ['CBC', 'HBA1C'], priority: 'Routine', status: 'Review', minutesAgo: 78, paid: 1000, results: { ...complete(['CBC', 'HBA1C']), hb: 10.8, hba1c: 6.2 } },
    { id: 'LF-1025', patientId: 'PT-2038', name: 'Vikram Desai', age: 56, sex: 'Male', phone: '', email: '', category: 'Referral', referrer: 'Dr. Meera Iyer', tests: ['LIPID', 'KFT'], priority: 'Routine', status: 'Approved', minutesAgo: 115, paid: 1400, results: complete(['LIPID', 'KFT']) },
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
