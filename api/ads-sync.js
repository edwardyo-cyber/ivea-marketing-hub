// ============================================
// Ads Sync — Daily performance data pull from Google Ads + Meta
// Runs daily via Vercel cron at 5 AM
// ============================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zmdubmumgdyuyjajjxjs.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GOOGLE_ADS_DEV_TOKEN = process.env.GOOGLE_ADS_DEV_TOKEN;

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

async function refreshToken(connection) {
  // Refresh OAuth token if expired
  if (!connection.refresh_token) return connection;
  const now = new Date();
  const expires = connection.token_expires_at ? new Date(connection.token_expires_at) : now;
  if (expires > now) return connection; // Still valid

  try {
    let tokenUrl, body;
    if (connection.platform === 'google_ads') {
      tokenUrl = 'https://oauth2.googleapis.com/token';
      body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: connection.refresh_token,
        client_id: process.env.GOOGLE_ADS_CLIENT_ID,
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      });
    } else if (connection.platform === 'meta') {
      tokenUrl = 'https://graph.facebook.com/v18.0/oauth/access_token';
      body = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        fb_exchange_token: connection.access_token,
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
      });
    }

    if (tokenUrl) {
      const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (res.ok) {
        const data = await res.json();
        const newExpiry = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
        await supabaseRequest(`ad_platform_connections?id=eq.${connection.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            access_token: data.access_token,
            token_expires_at: newExpiry,
            updated_at: new Date().toISOString(),
          }),
        });
        connection.access_token = data.access_token;
      }
    }
  } catch (err) {
    console.error(`Token refresh failed for ${connection.platform}:`, err);
  }
  return connection;
}

async function syncGoogleAds(connection, yesterday) {
  if (!GOOGLE_ADS_DEV_TOKEN || !connection.access_token) return [];

  try {
    const query = `
      SELECT campaign.id, campaign.name, campaign.status,
             metrics.impressions, metrics.clicks, metrics.cost_micros,
             metrics.conversions, metrics.conversions_value,
             metrics.phone_calls, metrics.interactions
      FROM campaign
      WHERE segments.date = '${yesterday}'
    `;

    const res = await fetch(
      `https://googleads.googleapis.com/v15/customers/${connection.account_id}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${connection.access_token}`,
          'developer-token': GOOGLE_ADS_DEV_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }
    );

    if (!res.ok) {
      console.error('Google Ads API error:', await res.text());
      return [];
    }

    const data = await res.json();
    const results = [];

    for (const batch of (data || [])) {
      for (const row of (batch.results || [])) {
        const m = row.metrics || {};
        const spend = (m.cost_micros || 0) / 1000000;
        const clicks = m.clicks || 0;
        const impressions = m.impressions || 0;

        results.push({
          restaurant_id: connection.restaurant_id,
          campaign_id: null, // Would need mapping from platform_campaign_id
          platform: 'google_ads',
          report_date: yesterday,
          impressions,
          clicks,
          ctr: impressions > 0 ? clicks / impressions : 0,
          cpc: clicks > 0 ? spend / clicks : 0,
          cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
          spend,
          conversions: Math.round(m.conversions || 0),
          conversion_value: m.conversions_value || 0,
          roas: spend > 0 ? (m.conversions_value || 0) / spend : 0,
          phone_calls: m.phone_calls || 0,
        });
      }
    }
    return results;
  } catch (err) {
    console.error('Google Ads sync error:', err);
    return [];
  }
}

async function syncMetaAds(connection, yesterday) {
  if (!connection.access_token) return [];

  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/act_${connection.account_id}/insights?` +
      `fields=campaign_id,campaign_name,impressions,clicks,ctr,cpc,cpm,spend,actions,action_values` +
      `&time_range={"since":"${yesterday}","until":"${yesterday}"}` +
      `&level=campaign` +
      `&access_token=${connection.access_token}`
    );

    if (!res.ok) {
      console.error('Meta Ads API error:', await res.text());
      return [];
    }

    const data = await res.json();
    const results = [];

    for (const row of (data.data || [])) {
      const spend = parseFloat(row.spend || 0);
      const clicks = parseInt(row.clicks || 0);
      const impressions = parseInt(row.impressions || 0);

      // Extract conversions from actions array
      let conversions = 0;
      let conversionValue = 0;
      for (const action of (row.actions || [])) {
        if (['purchase', 'lead', 'complete_registration'].includes(action.action_type)) {
          conversions += parseInt(action.value || 0);
        }
      }
      for (const av of (row.action_values || [])) {
        if (['purchase', 'lead'].includes(av.action_type)) {
          conversionValue += parseFloat(av.value || 0);
        }
      }

      results.push({
        restaurant_id: connection.restaurant_id,
        campaign_id: null,
        platform: 'meta',
        report_date: yesterday,
        impressions,
        clicks,
        ctr: parseFloat(row.ctr || 0),
        cpc: parseFloat(row.cpc || 0),
        cpm: parseFloat(row.cpm || 0),
        spend,
        conversions,
        conversion_value: conversionValue,
        roas: spend > 0 ? conversionValue / spend : 0,
        actions: row.actions || [],
      });
    }
    return results;
  } catch (err) {
    console.error('Meta Ads sync error:', err);
    return [];
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Get all active ad platform connections
    const { data: connections } = await supabaseRequest(
      'ad_platform_connections?status=eq.connected&select=*'
    );

    if (!connections || !connections.length) {
      return res.status(200).json({ data: { message: 'No active ad connections', synced: 0 } });
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    let totalRecords = 0;

    for (let conn of connections) {
      conn = await refreshToken(conn);
      let records = [];

      if (conn.platform === 'google_ads') {
        records = await syncGoogleAds(conn, yesterday);
      } else if (conn.platform === 'meta') {
        records = await syncMetaAds(conn, yesterday);
      }

      if (records.length > 0) {
        await supabaseRequest('ad_performance_daily', {
          method: 'POST',
          body: JSON.stringify(records),
        });
        totalRecords += records.length;
      }

      // Update last_synced_at
      await supabaseRequest(`ad_platform_connections?id=eq.${conn.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ last_synced_at: new Date().toISOString() }),
      });
    }

    return res.status(200).json({
      data: {
        message: `Synced ${totalRecords} performance records from ${connections.length} connections`,
        synced: totalRecords,
        date: yesterday,
      },
    });
  } catch (err) {
    console.error('Ads sync cron error:', err);
    return res.status(500).json({ error: 'Ads sync failed: ' + err.message });
  }
};
