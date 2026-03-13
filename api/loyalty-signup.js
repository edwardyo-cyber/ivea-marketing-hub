// ============================================
// Loyalty Signup — Public-facing customer enrollment endpoint
// Used by QR code sign-up forms and website widgets
// ============================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zmdubmumgdyuyjajjxjs.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseRequest(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...options.headers,
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) return { error: data, status: res.status };
  return { data, status: res.status };
}

module.exports = async (req, res) => {
  // CORS for public-facing endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { restaurant_id, first_name, last_name, email, phone, birthday, source } = req.body;

  if (!restaurant_id) {
    return res.status(400).json({ error: 'Missing restaurant_id' });
  }
  if (!email && !phone) {
    return res.status(400).json({ error: 'Email or phone number is required' });
  }

  try {
    // Find the active loyalty program for this restaurant
    const { data: programs } = await supabaseRequest(
      `loyalty_programs?restaurant_id=eq.${restaurant_id}&status=eq.active&select=*&limit=1`
    );
    if (!programs || !programs.length) {
      return res.status(404).json({ error: 'No active loyalty program found' });
    }
    const program = programs[0];

    // Check for existing member (deduplication by email or phone)
    let existingFilter = '';
    if (email) {
      existingFilter = `loyalty_members?restaurant_id=eq.${restaurant_id}&email=eq.${encodeURIComponent(email)}&select=id,first_name,points_balance`;
    } else {
      existingFilter = `loyalty_members?restaurant_id=eq.${restaurant_id}&phone=eq.${encodeURIComponent(phone)}&select=id,first_name,points_balance`;
    }
    const { data: existing } = await supabaseRequest(existingFilter);
    if (existing && existing.length > 0) {
      return res.status(200).json({
        data: {
          already_enrolled: true,
          member_id: existing[0].id,
          message: `Welcome back, ${existing[0].first_name || 'friend'}! You already have ${existing[0].points_balance || 0} ${program.currency_name || 'points'}.`,
        },
      });
    }

    // Get the default (lowest) tier
    const { data: tiers } = await supabaseRequest(
      `loyalty_tiers?program_id=eq.${program.id}&select=*&order=qualification_threshold.asc&limit=1`
    );
    const defaultTier = tiers?.[0] || null;

    // Create member
    const enrollmentBonus = program.enrollment_bonus || 0;
    const memberData = {
      restaurant_id,
      program_id: program.id,
      first_name: first_name || '',
      last_name: last_name || '',
      email: email || null,
      phone: phone || null,
      birthday: birthday || null,
      enrollment_source: source || 'qr_code',
      points_balance: enrollmentBonus,
      points_lifetime: enrollmentBonus,
      tier_id: defaultTier?.id || null,
      status: 'active',
    };

    const { data: newMember, error } = await supabaseRequest('loyalty_members', {
      method: 'POST',
      body: JSON.stringify(memberData),
    });

    if (error) {
      console.error('Member creation error:', error);
      return res.status(500).json({ error: 'Could not create member' });
    }

    const memberId = Array.isArray(newMember) ? newMember[0]?.id : newMember?.id;

    // Record enrollment bonus transaction
    if (enrollmentBonus > 0 && memberId) {
      await supabaseRequest('loyalty_transactions', {
        method: 'POST',
        body: JSON.stringify({
          restaurant_id,
          member_id: memberId,
          transaction_type: 'bonus',
          points: enrollmentBonus,
          balance_after: enrollmentBonus,
          description: 'Enrollment bonus',
          source: 'system',
        }),
      });
    }

    return res.status(201).json({
      data: {
        already_enrolled: false,
        member_id: memberId,
        points_balance: enrollmentBonus,
        tier: defaultTier?.name || 'Member',
        message: `Welcome to ${program.name || 'our loyalty program'}! ${enrollmentBonus > 0 ? `You've earned ${enrollmentBonus} ${program.currency_name || 'points'} as a welcome bonus!` : ''}`,
      },
    });
  } catch (err) {
    console.error('Loyalty signup error:', err);
    return res.status(500).json({ error: 'Signup failed: ' + err.message });
  }
};
