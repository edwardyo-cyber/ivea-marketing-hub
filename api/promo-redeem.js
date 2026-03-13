// ============================================
// Promo Redeem — Promotion code validation and redemption
// Used by staff redeem screen and future POS integration
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

function calculateDiscount(promo, orderTotal) {
  switch (promo.promo_type) {
    case 'percentage_off': {
      let discount = orderTotal * ((promo.discount_pct || 0) / 100);
      if (promo.max_discount && discount > promo.max_discount) discount = promo.max_discount;
      return Math.round(discount * 100) / 100;
    }
    case 'dollar_off':
      return Math.min(promo.discount_amount || 0, orderTotal);
    case 'bogo': {
      // Simplified: assume get_discount_pct off the cheaper item(s)
      const getDiscount = (promo.get_discount_pct || 100) / 100;
      const itemPrice = orderTotal / ((promo.buy_quantity || 1) + (promo.get_quantity || 1));
      return Math.round(itemPrice * (promo.get_quantity || 1) * getDiscount * 100) / 100;
    }
    case 'free_item':
      return promo.discount_amount || 0; // Dollar value of free item
    case 'happy_hour':
      return promo.discount_amount || (orderTotal * ((promo.discount_pct || 0) / 100));
    case 'custom':
      return promo.discount_amount || 0;
    default:
      return 0;
  }
}

function isWithinRecurrence(promo) {
  if (!promo.recurrence_rule) return true;
  const rule = typeof promo.recurrence_rule === 'string' ? JSON.parse(promo.recurrence_rule) : promo.recurrence_rule;
  const now = new Date();
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const currentDay = dayNames[now.getDay()];

  if (rule.days && !rule.days.includes(currentDay)) return false;

  if (rule.start_time && rule.end_time) {
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (currentTime < rule.start_time || currentTime > rule.end_time) return false;
  }

  return true;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    action, // 'validate' or 'redeem'
    code,
    restaurant_id,
    location_id,
    order_total,
    customer_name,
    customer_email,
    customer_phone,
    redeemed_by, // employee user_id
  } = req.body;

  if (!code || !restaurant_id) {
    return res.status(400).json({ error: 'Missing code or restaurant_id' });
  }

  try {
    // Step 1: Find the promotion by code
    // First check promotion_codes table (unique/bulk codes)
    let promo = null;
    let codeRecord = null;

    const { data: codes } = await supabaseRequest(
      `promotion_codes?code=eq.${encodeURIComponent(code)}&restaurant_id=eq.${restaurant_id}&select=*`
    );

    if (codes && codes.length > 0) {
      codeRecord = codes[0];
      if (codeRecord.is_used) {
        return res.status(400).json({ error: 'This code has already been used', valid: false });
      }
      // Get the parent promotion
      const { data: promos } = await supabaseRequest(
        `promotions?id=eq.${codeRecord.promotion_id}&select=*`
      );
      promo = promos?.[0];
    } else {
      // Check promotions table directly (shared codes)
      const { data: promos } = await supabaseRequest(
        `promotions?code=eq.${encodeURIComponent(code)}&restaurant_id=eq.${restaurant_id}&select=*`
      );
      promo = promos?.[0];
    }

    if (!promo) {
      return res.status(404).json({ error: 'Invalid promotion code', valid: false });
    }

    // Step 2: Validate promotion status
    const now = new Date();

    if (promo.status !== 'active') {
      return res.status(400).json({ error: `Promotion is ${promo.status}`, valid: false });
    }

    if (promo.start_date && new Date(promo.start_date) > now) {
      return res.status(400).json({ error: 'Promotion has not started yet', valid: false });
    }

    if (promo.end_date && new Date(promo.end_date) < now) {
      return res.status(400).json({ error: 'Promotion has expired', valid: false });
    }

    // Check recurrence window (e.g., happy hour)
    if (!isWithinRecurrence(promo)) {
      return res.status(400).json({ error: 'This promotion is not active at this time', valid: false });
    }

    // Check location scope
    if (promo.scope === 'location_specific' && location_id) {
      const scopeIds = promo.scope_location_ids || [];
      if (scopeIds.length > 0 && !scopeIds.includes(location_id)) {
        return res.status(400).json({ error: 'This promotion is not valid at this location', valid: false });
      }
    }

    // Check total redemption limit
    if (promo.max_redemptions_total && promo.total_redeemed >= promo.max_redemptions_total) {
      return res.status(400).json({ error: 'Promotion redemption limit reached', valid: false });
    }

    // Check per-customer limit
    if (promo.max_redemptions_per_customer && customer_email) {
      const { data: custRedemptions } = await supabaseRequest(
        `promotion_redemptions?promotion_id=eq.${promo.id}&customer_email=eq.${encodeURIComponent(customer_email)}&select=id`
      );
      if (custRedemptions && custRedemptions.length >= promo.max_redemptions_per_customer) {
        return res.status(400).json({ error: 'You have reached the maximum redemptions for this promotion', valid: false });
      }
    }

    // Check minimum order
    if (promo.min_order && order_total && order_total < promo.min_order) {
      return res.status(400).json({
        error: `Minimum order of $${promo.min_order.toFixed(2)} required`,
        valid: false,
      });
    }

    // Calculate discount
    const discount = calculateDiscount(promo, order_total || 0);

    // If just validating, return the result
    if (action === 'validate') {
      return res.status(200).json({
        valid: true,
        data: {
          promotion_name: promo.name,
          promo_type: promo.promo_type,
          discount_amount: discount,
          order_total: order_total || 0,
          final_total: Math.max(0, (order_total || 0) - discount),
          description: promo.description,
        },
      });
    }

    // Step 3: Record redemption
    if (action === 'redeem') {
      // Save redemption record
      const redemptionData = {
        restaurant_id,
        promotion_id: promo.id,
        code_id: codeRecord?.id || null,
        code_used: code,
        customer_name: customer_name || null,
        customer_email: customer_email || null,
        customer_phone: customer_phone || null,
        order_total: order_total || 0,
        discount_applied: discount,
        location_id: location_id || null,
        redeemed_via: 'manual_entry',
        redeemed_by: redeemed_by || null,
      };

      // Match to loyalty member if possible
      if (customer_email || customer_phone) {
        const memberFilter = customer_email
          ? `email=eq.${encodeURIComponent(customer_email)}`
          : `phone=eq.${encodeURIComponent(customer_phone)}`;
        const { data: members } = await supabaseRequest(
          `loyalty_members?restaurant_id=eq.${restaurant_id}&${memberFilter}&select=id`
        );
        if (members?.[0]) {
          redemptionData.member_id = members[0].id;
        }
      }

      await supabaseRequest('promotion_redemptions', {
        method: 'POST',
        body: JSON.stringify(redemptionData),
      });

      // Mark unique code as used
      if (codeRecord) {
        await supabaseRequest(`promotion_codes?id=eq.${codeRecord.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            is_used: true,
            used_at: now.toISOString(),
            used_by: customer_email || customer_phone || customer_name,
          }),
        });
      }

      // Increment promotion counters
      await supabaseRequest(`promotions?id=eq.${promo.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          total_redeemed: (promo.total_redeemed || 0) + 1,
          total_revenue: (promo.total_revenue || 0) + (order_total || 0),
          updated_at: now.toISOString(),
        }),
      });

      return res.status(200).json({
        valid: true,
        redeemed: true,
        data: {
          promotion_name: promo.name,
          discount_applied: discount,
          order_total: order_total || 0,
          final_total: Math.max(0, (order_total || 0) - discount),
          message: `$${discount.toFixed(2)} discount applied!`,
        },
      });
    }

    return res.status(400).json({ error: 'Invalid action. Use "validate" or "redeem".' });
  } catch (err) {
    console.error('Promo redeem error:', err);
    return res.status(500).json({ error: 'Redemption failed: ' + err.message });
  }
};
