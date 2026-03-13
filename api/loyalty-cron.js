// ============================================
// Loyalty Cron — Birthday triggers, tier evaluation, promo expiry
// Runs daily via Vercel cron at 3 AM
// ============================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zmdubmumgdyuyjajjxjs.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;

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

async function sendSMS(to, body) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_PHONE) return false;
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: TWILIO_PHONE, Body: body }),
      }
    );
    return res.ok;
  } catch { return false; }
}

function fillTemplate(template, member, extraVars = {}) {
  let msg = template || '';
  msg = msg.replace(/{first_name}/g, member.first_name || 'Friend');
  msg = msg.replace(/{last_name}/g, member.last_name || '');
  msg = msg.replace(/{points}/g, String(member.points_balance || 0));
  for (const [k, v] of Object.entries(extraVars)) {
    msg = msg.replace(new RegExp(`{${k}}`, 'g'), String(v));
  }
  return msg;
}

// Task 1: Expire promotions past end_date
async function expirePromotions() {
  const now = new Date().toISOString();
  const { data } = await supabaseRequest(
    `promotions?status=eq.active&end_date=lt.${now}&select=id`
  );
  if (!data || !data.length) return 0;

  for (const promo of data) {
    await supabaseRequest(`promotions?id=eq.${promo.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'expired', updated_at: now }),
    });
  }
  return data.length;
}

// Task 2: Process automated triggers (birthday, anniversary, inactivity)
async function processTriggers() {
  const { data: triggers } = await supabaseRequest(
    'automated_triggers?is_enabled=eq.true&select=*'
  );
  if (!triggers || !triggers.length) return { sent: 0, types: [] };

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  let totalSent = 0;
  const typesProcessed = [];

  for (const trigger of triggers) {
    let members = [];

    if (trigger.trigger_type === 'birthday') {
      // Find members whose birthday is in X days
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + (trigger.days_before || 0));
      const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
      const dd = String(targetDate.getDate()).padStart(2, '0');

      // Get all active members for this restaurant with birthdays
      const { data: allMembers } = await supabaseRequest(
        `loyalty_members?restaurant_id=eq.${trigger.restaurant_id}&status=eq.active&select=*`
      );
      members = (allMembers || []).filter(m => {
        if (!m.birthday) return false;
        const bday = m.birthday.split('-');
        return bday[1] === mm && bday[2] === dd;
      });
    } else if (trigger.trigger_type === 'anniversary') {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + (trigger.days_before || 0));
      const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
      const dd = String(targetDate.getDate()).padStart(2, '0');

      const { data: allMembers } = await supabaseRequest(
        `loyalty_members?restaurant_id=eq.${trigger.restaurant_id}&status=eq.active&select=*`
      );
      members = (allMembers || []).filter(m => {
        if (!m.enrollment_date) return false;
        const ed = m.enrollment_date.split('-');
        return ed[1] === mm && ed[2] === dd;
      });
    } else if (trigger.trigger_type === 'inactivity') {
      const cutoffDate = new Date(today);
      cutoffDate.setDate(cutoffDate.getDate() - (trigger.inactivity_days || 30));
      const cutoff = cutoffDate.toISOString();

      const { data: inactive } = await supabaseRequest(
        `loyalty_members?restaurant_id=eq.${trigger.restaurant_id}&status=eq.active&last_visit_at=lt.${cutoff}&select=*`
      );
      members = inactive || [];
    } else if (trigger.trigger_type === 'milestone') {
      // Check for members who just hit a milestone
      const metric = trigger.milestone_metric || 'visit_count';
      const value = trigger.milestone_value || 10;
      const { data: allMembers } = await supabaseRequest(
        `loyalty_members?restaurant_id=eq.${trigger.restaurant_id}&status=eq.active&${metric}=eq.${value}&select=*`
      );
      members = allMembers || [];
    }

    if (members.length === 0) continue;
    typesProcessed.push(trigger.trigger_type);

    // Get promotion details if linked
    let promoCode = '';
    let promoExpiry = '';
    if (trigger.promotion_id) {
      const { data: promo } = await supabaseRequest(
        `promotions?id=eq.${trigger.promotion_id}&select=code,end_date`
      );
      if (promo?.[0]) {
        promoCode = promo[0].code || '';
        promoExpiry = promo[0].end_date ? new Date(promo[0].end_date).toLocaleDateString() : '';
      }
    }

    for (const member of members) {
      const msg = fillTemplate(trigger.message_template, member, {
        code: promoCode,
        expiry: promoExpiry,
      });

      // Award bonus points if configured
      if (trigger.bonus_points > 0) {
        const newBalance = (member.points_balance || 0) + trigger.bonus_points;
        await supabaseRequest('loyalty_transactions', {
          method: 'POST',
          body: JSON.stringify({
            restaurant_id: trigger.restaurant_id,
            member_id: member.id,
            transaction_type: 'bonus',
            points: trigger.bonus_points,
            balance_after: newBalance,
            description: `${trigger.trigger_type} bonus`,
            source: 'automated_trigger',
            reference_id: trigger.id,
          }),
        });
        await supabaseRequest(`loyalty_members?id=eq.${member.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            points_balance: newBalance,
            points_lifetime: (member.points_lifetime || 0) + trigger.bonus_points,
          }),
        });
      }

      // Send SMS if channel includes sms
      if ((trigger.channel === 'sms' || trigger.channel === 'both') && member.phone && msg) {
        await sendSMS(member.phone, msg);
      }

      totalSent++;
    }

    // Update trigger stats
    await supabaseRequest(`automated_triggers?id=eq.${trigger.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        last_run_at: new Date().toISOString(),
        total_sent: (trigger.total_sent || 0) + members.length,
      }),
    });
  }

  return { sent: totalSent, types: typesProcessed };
}

// Task 3: Evaluate tiers (monthly — check if it's the 1st)
async function evaluateTiers() {
  const today = new Date();
  if (today.getDate() !== 1) return { evaluated: 0 }; // Only run on 1st of month

  const { data: programs } = await supabaseRequest(
    'loyalty_programs?status=eq.active&select=*'
  );
  if (!programs || !programs.length) return { evaluated: 0 };

  let evaluated = 0;

  for (const program of programs) {
    const { data: tiers } = await supabaseRequest(
      `loyalty_tiers?program_id=eq.${program.id}&select=*&order=qualification_threshold.asc`
    );
    if (!tiers || tiers.length < 2) continue;

    const { data: members } = await supabaseRequest(
      `loyalty_members?program_id=eq.${program.id}&status=eq.active&select=*`
    );
    if (!members) continue;

    for (const member of members) {
      const metric = member.total_spend || 0; // Default to spend-based
      let newTier = tiers[0]; // Default to lowest tier

      for (const tier of tiers) {
        if (metric >= tier.qualification_threshold) {
          newTier = tier;
        }
      }

      // Check if tier changed
      if (member.tier_id !== newTier.id) {
        const oldTierId = member.tier_id;
        await supabaseRequest(`loyalty_members?id=eq.${member.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            tier_id: newTier.id,
            tier_qualified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        });
        evaluated++;
      }
    }
  }

  return { evaluated };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const [expired, triggerResult, tierResult] = await Promise.all([
      expirePromotions(),
      processTriggers(),
      evaluateTiers(),
    ]);

    return res.status(200).json({
      data: {
        message: 'Loyalty cron completed',
        promotions_expired: expired,
        triggers_sent: triggerResult.sent,
        trigger_types: triggerResult.types,
        tiers_evaluated: tierResult.evaluated,
        run_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Loyalty cron error:', err);
    return res.status(500).json({ error: 'Loyalty cron failed: ' + err.message });
  }
};
