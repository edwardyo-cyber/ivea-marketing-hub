// ============================================
// SEO — Combined endpoint for audits + keyword rankings
// Routes: GET/cron = rankings check, POST = on-demand audit
// ============================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zmdubmumgdyuyjajjxjs.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SERP_API_KEY = process.env.SERP_API_KEY;

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

// ---- SEO Audit ----
async function runPageSpeedAudit(pageUrl) {
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(pageUrl)}&category=performance&category=accessibility&category=seo&strategy=mobile`;
  try {
    const res = await fetch(apiUrl);
    if (!res.ok) return null;
    const data = await res.json();
    const categories = data.lighthouseResult?.categories || {};
    return {
      performance: Math.round((categories.performance?.score || 0) * 100),
      accessibility: Math.round((categories.accessibility?.score || 0) * 100),
      seo: Math.round((categories.seo?.score || 0) * 100),
      fcp: data.lighthouseResult?.audits?.['first-contentful-paint']?.numericValue,
      lcp: data.lighthouseResult?.audits?.['largest-contentful-paint']?.numericValue,
      cls: data.lighthouseResult?.audits?.['cumulative-layout-shift']?.numericValue,
      tbt: data.lighthouseResult?.audits?.['total-blocking-time']?.numericValue,
      speed_index: data.lighthouseResult?.audits?.['speed-index']?.numericValue,
    };
  } catch (err) {
    console.error('PageSpeed API error:', err);
    return null;
  }
}

async function analyzePageContent(pageUrl) {
  const issues = [];
  try {
    const res = await fetch(pageUrl, { headers: { 'User-Agent': 'HermesiMediaBot/1.0' } });
    if (!res.ok) {
      issues.push({ issue_type: 'page_error', priority: 'critical', description: `Page returned HTTP ${res.status}`, fix_recommendation: 'Ensure the page URL is correct and the server is responding.' });
      return { issues, html: '' };
    }
    const html = await res.text();
    const lower = html.toLowerCase();

    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    if (!titleMatch || !titleMatch[1].trim()) {
      issues.push({ issue_type: 'missing_title', priority: 'critical', description: 'Page is missing a title tag', fix_recommendation: 'Add a descriptive title tag with your restaurant name, cuisine, and city.' });
    } else if (titleMatch[1].length < 30) {
      issues.push({ issue_type: 'short_title', priority: 'medium', description: `Title tag is only ${titleMatch[1].length} characters`, fix_recommendation: 'Expand title to include cuisine type and city/neighborhood.' });
    }

    if (!html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i)) {
      issues.push({ issue_type: 'missing_meta_description', priority: 'high', description: 'Page is missing a meta description', fix_recommendation: 'Add a meta description (150-160 chars) describing your restaurant.' });
    }

    if (!lower.includes('application/ld+json')) {
      issues.push({ issue_type: 'missing_schema', priority: 'high', description: 'No JSON-LD structured data found', fix_recommendation: 'Add Restaurant schema markup with hours, address, menu, and ratings.' });
    }

    if (!html.match(/<h1[^>]*>(.*?)<\/h1>/i)) {
      issues.push({ issue_type: 'missing_h1', priority: 'medium', description: 'Page is missing an H1 heading', fix_recommendation: 'Add an H1 with your restaurant name.' });
    }

    if (!lower.includes('maps.google') && !lower.includes('google.com/maps') && !lower.includes('maps.googleapis')) {
      issues.push({ issue_type: 'no_map_embed', priority: 'low', description: 'No embedded Google Map found', fix_recommendation: 'Embed a Google Map showing your restaurant location.' });
    }

    if (!lower.includes('name="viewport"') && !lower.includes("name='viewport'")) {
      issues.push({ issue_type: 'no_viewport', priority: 'critical', description: 'Missing viewport meta tag', fix_recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1.0">' });
    }

    const imgTags = html.match(/<img[^>]*>/gi) || [];
    const imgsWithoutAlt = imgTags.filter(img => !img.includes('alt=') || img.match(/alt=["']\s*["']/));
    if (imgsWithoutAlt.length > 3) {
      issues.push({ issue_type: 'missing_alt_text', priority: 'medium', description: `${imgsWithoutAlt.length} images are missing alt text`, fix_recommendation: 'Add descriptive alt text to images with dish names and descriptions.' });
    }

    return { issues, html };
  } catch (err) {
    issues.push({ issue_type: 'fetch_error', priority: 'critical', description: `Could not fetch page: ${err.message}`, fix_recommendation: 'Check that the URL is accessible.' });
    return { issues, html: '' };
  }
}

async function handleAudit(req, res) {
  const { page_url, restaurant_id, user_id } = req.body;
  if (!page_url || !restaurant_id) return res.status(400).json({ error: 'Missing page_url or restaurant_id' });

  const [pageSpeed, contentAnalysis] = await Promise.all([
    runPageSpeedAudit(page_url),
    analyzePageContent(page_url),
  ]);

  const technicalScore = pageSpeed ? pageSpeed.performance : 0;
  const contentScore = Math.max(0, 100 - (contentAnalysis.issues.filter(i => i.priority === 'critical').length * 25) - (contentAnalysis.issues.filter(i => i.priority === 'high').length * 15) - (contentAnalysis.issues.filter(i => i.priority === 'medium').length * 5));
  const localSeoScore = pageSpeed ? pageSpeed.seo : 0;
  const overallScore = Math.round((technicalScore + contentScore + localSeoScore) / 3);

  const auditResult = await supabaseRequest('seo_audits', {
    method: 'POST',
    body: JSON.stringify({
      restaurant_id, page_url, technical_score: technicalScore,
      content_score: contentScore, local_seo_score: localSeoScore, overall_score: overallScore,
      core_web_vitals: pageSpeed ? { fcp: pageSpeed.fcp, lcp: pageSpeed.lcp, cls: pageSpeed.cls, tbt: pageSpeed.tbt } : {},
      run_by: user_id || null,
    }),
  });

  const auditId = auditResult.data?.[0]?.id || auditResult.data?.id;
  if (auditId && contentAnalysis.issues.length > 0) {
    await supabaseRequest('seo_audit_issues', {
      method: 'POST',
      body: JSON.stringify(contentAnalysis.issues.map(issue => ({ restaurant_id, audit_id: auditId, ...issue }))),
    });
  }

  return res.status(200).json({
    data: { audit_id: auditId, overall_score: overallScore, technical_score: technicalScore, content_score: contentScore, local_seo_score: localSeoScore, core_web_vitals: pageSpeed, issues: contentAnalysis.issues },
  });
}

// ---- SEO Rankings (cron) ----
async function checkKeywordRank(keyword, location) {
  if (!SERP_API_KEY) return null;
  const params = new URLSearchParams({ q: keyword, location: location || 'United States', hl: 'en', gl: 'us', api_key: SERP_API_KEY, engine: 'google' });

  try {
    const res = await fetch(`https://serpapi.com/search.json?${params}`);
    if (!res.ok) return null;
    const data = await res.json();

    let organicRank = null, localPackPosition = null, rankingUrl = null;
    const serpFeatures = [];

    if (data.local_results?.places) {
      serpFeatures.push('local_pack');
      data.local_results.places.forEach(place => { if (place.position) localPackPosition = place.position; });
    }
    if (data.organic_results) {
      data.organic_results.forEach(result => {
        if (organicRank === null) { organicRank = result.position; rankingUrl = result.link; }
      });
    }
    if (data.knowledge_graph) serpFeatures.push('knowledge_graph');
    if (data.answer_box) serpFeatures.push('answer_box');
    if (data.top_stories) serpFeatures.push('top_stories');
    if (data.images_results) serpFeatures.push('image_pack');

    return { organic_rank: organicRank, local_pack_position: localPackPosition, ranking_url: rankingUrl, serp_features: serpFeatures };
  } catch (err) {
    console.error(`SERP check error for "${keyword}":`, err);
    return null;
  }
}

async function handleRankings(req, res) {
  if (!SERP_API_KEY) return res.status(200).json({ data: { message: 'SERP API key not configured. Skipping rank checks.' } });

  const { data: keywords } = await supabaseRequest('seo_keywords?is_tracked=eq.true&select=*');
  if (!keywords || !keywords.length) return res.status(200).json({ data: { message: 'No tracked keywords', checked: 0 } });

  const restaurantIds = [...new Set(keywords.map(k => k.restaurant_id))];
  const { data: restaurants } = await supabaseRequest(`restaurants?id=in.(${restaurantIds.join(',')})&select=id,name,city,state`);
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
      rankings.push({ restaurant_id: kw.restaurant_id, keyword_id: kw.id, check_date: today, ...result, geo_point: location });
      checked++;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (rankings.length > 0) {
    await supabaseRequest('keyword_rankings', { method: 'POST', body: JSON.stringify(rankings) });
  }

  return res.status(200).json({ data: { message: `Checked ${checked} keywords`, checked, date: today } });
}

// ---- Main router ----
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // POST with page_url = audit, GET or POST without page_url = rankings cron
    if (req.method === 'POST' && req.body?.action === 'audit') {
      return await handleAudit(req, res);
    }
    return await handleRankings(req, res);
  } catch (err) {
    console.error('SEO endpoint error:', err);
    return res.status(500).json({ error: 'SEO request failed: ' + err.message });
  }
};
