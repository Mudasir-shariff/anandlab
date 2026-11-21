export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabaseUrl = process.env.SUPABASE_URL || 'https://zynqvlhxregoxskzhnmu.supabase.co';
  const supabaseAnonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_4jLbQjPP8QbSD161_8xc6g_oquzKV85';

  res.status(200).json({
    supabaseUrl,
    supabaseAnonKey
  });
}
