// ============================================
// SEO Rankings — Keyword rank checking via SERP API
// Runs daily via Vercel cron at 6 AM
// ============================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zmdubmumgdyuyjajjxjs.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SERP_API_KEY = process.env.SERP_API_KEY; // DataForSEO or SerpApi key

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

async function checkKeywordRank(keyword, location) {
  if (!SERP_API_KEY) return null;

  // SerpApi format (adjust for DataForSEO if needed)
  const params = new URLSearchParams({
    q: keyword,
    location: location || 'United States',
    hl: 'en',
    gl: 'us',
    api_key: SERP_API_KEY,
    engine: 'google',
  });

  try {
    const res = await fetch(`https://serpapi.com/search.json?${params}`);
    if (!res.ok) return null;
    const data = await res.json();

    let organicRank = null;
    let localPackPosition = null;
    let rankingUrl = null;
    const serpFeatures = [];

    // Check local pack (map results)
    if (data.local_results?.places) {
      serpFeatures.push('local_pack');
      // Check if our restaurant is in the local pack
      data.local_results.places.forEach((place, i) => {
        // Match logic would need restaurant name/address
        if (place.position) localPackPosition = place.position;
      });
    }

    // Check organic results
    if (data.organic_results) {
      data.organic_results.forEach((result, i) => {
        if (organicRank === null) {
          organicRank = result.position;
          rankingUrl = result.link;
        }
      });
    }

    // Detect SERP features
    if (data.knowledge_graph) serpFeatures.push('knowledge_graph');
    if (data.answer_box) serpFeatures.push('answer_box');
    if (data.top_stories) serpFeatures.push('top_stories');
    if (data.images_results) serpFeatures.push('image_pack');

    return {
      organic_rank: organicRank,
      local_pack_position: localPackPosition,
      ranking_url: rankingUrl,
      serp_features: serpFeatures,
    };
  } catch (err) {
    console.error(`SERP check error for "${keyword}":`, err);
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SERP_API_KEY) {
    return res.status(200).json({ data: { message: 'SERP API key not configured. Skipping rank checks.' } });
  }

  try {
    // Get all active tracked keywords
    const { data: keywords } = await supabaseRequest(
      'seo_keywords?is_tracked=eq.true&select=*'
    );

    if (!keywords || !keywords.length) {
      return res.status(200).json({ data: { message: 'No tracked keywords', checked: 0 } });
    }

    // Get restaurant locations for geo-targeting
    const restaurantIds = [...new Set(keywords.map(k => k.restaurant_id))];
    const { data: restaurants } = await supabaseRequest(
      `restaurants?id=in.(${restaurantIds.join(',')})&select=id,name,city,state`
    );
    const restaurantMap = {};
    (restaurants || []).forEach(r => { restaurantMap[r.id] = r; });

    const today = new Date().toISOString().split('T')[0];
    let checked = 0;
    const rankings = [];

    for (const kw of keywords) {
      const restaurant = restaurantMap[kw.restaurant_id];
      const location = restaurant ? `${restaurant.city}, ${restaurant.state}` : null;

      const result = await checkKeywordRank(kw.keyword, location);
      if (result) {
        rankings.push({
          restaurant_id: kw.restaurant_id,
          keyword_id: kw.id,
          check_date: today,
          organic_rank: result.organic_rank,
          local_pack_position: result.local_pack_position,
          ranking_url: result.ranking_url,
          serp_features: result.serp_features,
          geo_point: location,
        });
        checked++;
      }

      // Rate limit: 1 request per second
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Batch insert rankings
    if (rankings.length > 0) {
      await supabaseRequest('keyword_rankings', {
        method: 'POST',
        body: JSON.stringify(rankings),
      });
    }

    return res.status(200).json({
      data: {
        message: `Checked ${checked} keywords`,
        checked,
        date: today,
      },
    });
  } catch (err) {
    console.error('SEO rankings cron error:', err);
    return res.status(500).json({ error: 'Rankings check failed: ' + err.message });
  }
};
