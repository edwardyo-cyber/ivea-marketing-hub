// ============================================
// API Middleware — Server-side Data Gateway
// All frontend data requests go through here
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

// Tables that support restaurant_id filtering
const SCOPED_TABLES = [
  'content_posts', 'campaigns', 'reviews', 'social_accounts',
  'assets', 'activity_log', 'influencers', 'media_contacts',
  'email_campaigns', 'contact_lists', 'locations',
  // SEO tables
  'gbp_listings', 'gbp_posts', 'gbp_photos', 'gbp_questions',
  'seo_keywords', 'keyword_rankings', 'keyword_suggestions',
  'citations', 'citation_sources', 'canonical_nap', 'schema_markup',
  'menu_schema_items', 'seo_audits', 'seo_audit_issues', 'maps_optimization',
  // Ads tables
  'ad_platform_connections', 'ad_campaigns', 'ad_groups', 'ad_creatives',
  'ad_performance_daily', 'ad_spend_by_location', 'ad_audiences',
  'ad_experiments', 'ad_experiment_variants', 'attribution_events',
  // Competitor tables
  'competitors', 'competitor_tags', 'competitor_review_snapshots',
  'competitor_reviews', 'competitor_social_snapshots', 'competitor_social_posts',
  'competitor_menu_items', 'competitor_price_history', 'competitor_promotions',
  'local_search_rankings', 'tracked_keywords', 'competitor_sentiment_trends',
  'competitor_alerts', 'competitor_alert_history', 'competitor_benchmarks',
  // Loyalty tables
  'loyalty_programs', 'loyalty_tiers', 'loyalty_rewards', 'loyalty_members',
  'loyalty_transactions', 'promotions', 'promotion_codes',
  'promotion_redemptions', 'promotion_distributions',
  'automated_triggers', 'pos_integrations',
  // Influencer CRM tables
  'influencer_interactions', 'influencer_campaigns', 'influencer_deliverables',
  'influencer_posts', 'influencer_post_metrics', 'influencer_payments',
  'influencer_promo_codes', 'influencer_ambassador_tiers',
  'influencer_milestones', 'influencer_referrals',
  'outreach_templates', 'outreach_log',
];

// Tables that are global (no restaurant_id)
const GLOBAL_TABLES = ['restaurants', 'employees', 'settings'];

async function validateUser(userId) {
  if (!userId) return null;
  const { data } = await supabaseRequest(
    `employees?id=eq.${userId}&is_active=eq.true&select=*`
  );
  return Array.isArray(data) && data.length ? data[0] : null;
}

function buildQueryString(table, { filters, order, limit, select, restaurant_id } = {}) {
  let params = [];
  const selectFields = select || '*';
  params.push(`select=${encodeURIComponent(selectFields)}`);

  // Auto-inject restaurant_id for scoped tables
  if (restaurant_id && SCOPED_TABLES.includes(table)) {
    params.push(`restaurant_id=eq.${restaurant_id}`);
  }

  // Apply additional filters
  if (filters) {
    for (const [key, val] of Object.entries(filters)) {
      if (typeof val === 'object' && val !== null) {
        // Support operators: { eq, neq, gt, gte, lt, lte, like, ilike, in, is }
        for (const [op, v] of Object.entries(val)) {
          if (op === 'or') {
            params.push(`or=(${v})`);
          } else {
            params.push(`${key}=${op}.${v}`);
          }
        }
      } else {
        params.push(`${key}=eq.${val}`);
      }
    }
  }

  // Ordering
  if (order) {
    const parts = Array.isArray(order) ? order : [order];
    const orderStr = parts.map(o => {
      if (typeof o === 'string') return o;
      return `${o.column}.${o.ascending === false ? 'desc' : 'asc'}${o.nullsFirst ? '.nullsfirst' : ''}`;
    }).join(',');
    params.push(`order=${encodeURIComponent(orderStr)}`);
  }

  // Limit
  if (limit) params.push(`limit=${limit}`);

  return `${table}?${params.join('&')}`;
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Server configuration error: missing service key' });
  }

  const { action, table, filters, data, id, user_id, restaurant_id, select, order, limit, onConflict } = req.body;

  if (!action || !table) {
    return res.status(400).json({ error: 'Missing action or table' });
  }

  // Validate user
  const user = await validateUser(user_id);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or inactive user' });
  }

  // Security: prevent access to tables not in our whitelist
  const allTables = [...SCOPED_TABLES, ...GLOBAL_TABLES];
  if (!allTables.includes(table)) {
    return res.status(403).json({ error: `Access to table "${table}" is not allowed` });
  }

  // Security: if restaurant_id is provided for a scoped table, ensure it's valid
  if (restaurant_id && SCOPED_TABLES.includes(table)) {
    const { data: restData } = await supabaseRequest(
      `restaurants?id=eq.${restaurant_id}&select=id`
    );
    if (!Array.isArray(restData) || !restData.length) {
      return res.status(403).json({ error: 'Invalid restaurant_id' });
    }
  }

  try {
    let result;

    switch (action) {
      case 'select': {
        const qs = buildQueryString(table, { filters, order, limit, select, restaurant_id });
        result = await supabaseRequest(qs);
        break;
      }

      case 'insert': {
        // Auto-inject restaurant_id into insert data
        let insertData = Array.isArray(data) ? data : [data];
        if (restaurant_id && SCOPED_TABLES.includes(table)) {
          insertData = insertData.map(d => ({ ...d, restaurant_id }));
        }
        result = await supabaseRequest(table, {
          method: 'POST',
          body: JSON.stringify(insertData.length === 1 ? insertData[0] : insertData),
        });
        break;
      }

      case 'update': {
        if (!id && !filters) {
          return res.status(400).json({ error: 'Update requires id or filters' });
        }
        let path = table;
        if (id) {
          path += `?id=eq.${id}`;
        } else if (filters) {
          const filterParts = [];
          for (const [key, val] of Object.entries(filters)) {
            if (typeof val === 'object' && val !== null) {
              for (const [op, v] of Object.entries(val)) {
                filterParts.push(`${key}=${op}.${v}`);
              }
            } else {
              filterParts.push(`${key}=eq.${val}`);
            }
          }
          path += `?${filterParts.join('&')}`;
        }
        // Security: scope updates to restaurant_id
        if (restaurant_id && SCOPED_TABLES.includes(table)) {
          path += `&restaurant_id=eq.${restaurant_id}`;
        }
        result = await supabaseRequest(path, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
        break;
      }

      case 'delete': {
        if (!id && !filters) {
          return res.status(400).json({ error: 'Delete requires id or filters' });
        }
        let path = table;
        if (id) {
          path += `?id=eq.${id}`;
        } else if (filters) {
          const filterParts = [];
          for (const [key, val] of Object.entries(filters)) {
            filterParts.push(`${key}=eq.${val}`);
          }
          path += `?${filterParts.join('&')}`;
        }
        if (restaurant_id && SCOPED_TABLES.includes(table)) {
          path += `&restaurant_id=eq.${restaurant_id}`;
        }
        result = await supabaseRequest(path, { method: 'DELETE' });
        break;
      }

      case 'upsert': {
        let upsertData = Array.isArray(data) ? data : [data];
        if (restaurant_id && SCOPED_TABLES.includes(table)) {
          upsertData = upsertData.map(d => ({ ...d, restaurant_id }));
        }
        const resolution = onConflict ? `resolution=merge-duplicates&on_conflict=${onConflict}` : 'resolution=merge-duplicates';
        result = await supabaseRequest(`${table}?${resolution}`, {
          method: 'POST',
          body: JSON.stringify(upsertData.length === 1 ? upsertData[0] : upsertData),
          prefer: 'return=representation,resolution=merge-duplicates',
        });
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    if (result.error) {
      return res.status(result.status || 500).json({ error: result.error });
    }

    return res.status(200).json({ data: result.data });
  } catch (err) {
    console.error('API data error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
