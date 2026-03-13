// ============================================
// SEO Audit Runner — On-demand audit for restaurant pages
// Triggered from the SEO dashboard
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
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'HermesiMediaBot/1.0' },
    });
    if (!res.ok) {
      issues.push({
        issue_type: 'page_error',
        priority: 'critical',
        description: `Page returned HTTP ${res.status}`,
        fix_recommendation: 'Ensure the page URL is correct and the server is responding.',
      });
      return { issues, html: '' };
    }
    const html = await res.text();
    const lower = html.toLowerCase();

    // Title tag check
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    if (!titleMatch || !titleMatch[1].trim()) {
      issues.push({
        issue_type: 'missing_title',
        priority: 'critical',
        description: 'Page is missing a title tag',
        fix_recommendation: 'Add a descriptive title tag with your restaurant name, cuisine, and city.',
      });
    } else {
      const title = titleMatch[1];
      if (title.length < 30) {
        issues.push({
          issue_type: 'short_title',
          priority: 'medium',
          description: `Title tag is only ${title.length} characters`,
          fix_recommendation: 'Expand title to include cuisine type and city/neighborhood.',
        });
      }
    }

    // Meta description check
    const metaDescMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
    if (!metaDescMatch) {
      issues.push({
        issue_type: 'missing_meta_description',
        priority: 'high',
        description: 'Page is missing a meta description',
        fix_recommendation: 'Add a meta description (150-160 chars) describing your restaurant.',
      });
    }

    // Schema markup check
    if (!lower.includes('application/ld+json')) {
      issues.push({
        issue_type: 'missing_schema',
        priority: 'high',
        description: 'No JSON-LD structured data found',
        fix_recommendation: 'Add Restaurant schema markup with hours, address, menu, and ratings.',
      });
    }

    // H1 check
    const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (!h1Match) {
      issues.push({
        issue_type: 'missing_h1',
        priority: 'medium',
        description: 'Page is missing an H1 heading',
        fix_recommendation: 'Add an H1 with your restaurant name.',
      });
    }

    // Google Maps embed check
    if (!lower.includes('maps.google') && !lower.includes('google.com/maps') && !lower.includes('maps.googleapis')) {
      issues.push({
        issue_type: 'no_map_embed',
        priority: 'low',
        description: 'No embedded Google Map found',
        fix_recommendation: 'Embed a Google Map showing your restaurant location.',
      });
    }

    // Mobile viewport check
    if (!lower.includes('name="viewport"') && !lower.includes("name='viewport'")) {
      issues.push({
        issue_type: 'no_viewport',
        priority: 'critical',
        description: 'Missing viewport meta tag — site may not be mobile-friendly',
        fix_recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1.0">',
      });
    }

    // Image alt text check
    const imgTags = html.match(/<img[^>]*>/gi) || [];
    const imgsWithoutAlt = imgTags.filter(img => !img.includes('alt=') || img.match(/alt=["']\s*["']/));
    if (imgsWithoutAlt.length > 3) {
      issues.push({
        issue_type: 'missing_alt_text',
        priority: 'medium',
        description: `${imgsWithoutAlt.length} images are missing alt text`,
        fix_recommendation: 'Add descriptive alt text to images with dish names and descriptions.',
      });
    }

    return { issues, html };
  } catch (err) {
    issues.push({
      issue_type: 'fetch_error',
      priority: 'critical',
      description: `Could not fetch page: ${err.message}`,
      fix_recommendation: 'Check that the URL is accessible and not blocked by a firewall.',
    });
    return { issues, html: '' };
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { page_url, restaurant_id, user_id } = req.body;
  if (!page_url || !restaurant_id) {
    return res.status(400).json({ error: 'Missing page_url or restaurant_id' });
  }

  try {
    // Run PageSpeed + content analysis in parallel
    const [pageSpeed, contentAnalysis] = await Promise.all([
      runPageSpeedAudit(page_url),
      analyzePageContent(page_url),
    ]);

    const technicalScore = pageSpeed ? pageSpeed.performance : 0;
    const contentScore = Math.max(0, 100 - (contentAnalysis.issues.filter(i => i.priority === 'critical').length * 25) - (contentAnalysis.issues.filter(i => i.priority === 'high').length * 15) - (contentAnalysis.issues.filter(i => i.priority === 'medium').length * 5));
    const localSeoScore = pageSpeed ? pageSpeed.seo : 0;
    const overallScore = Math.round((technicalScore + contentScore + localSeoScore) / 3);

    // Save audit
    const auditResult = await supabaseRequest('seo_audits', {
      method: 'POST',
      body: JSON.stringify({
        restaurant_id,
        page_url,
        technical_score: technicalScore,
        content_score: contentScore,
        local_seo_score: localSeoScore,
        overall_score: overallScore,
        core_web_vitals: pageSpeed ? {
          fcp: pageSpeed.fcp,
          lcp: pageSpeed.lcp,
          cls: pageSpeed.cls,
          tbt: pageSpeed.tbt,
        } : {},
        run_by: user_id || null,
      }),
    });

    const auditId = auditResult.data?.[0]?.id || auditResult.data?.id;

    // Save issues
    if (auditId && contentAnalysis.issues.length > 0) {
      const issueRecords = contentAnalysis.issues.map(issue => ({
        restaurant_id,
        audit_id: auditId,
        ...issue,
      }));
      await supabaseRequest('seo_audit_issues', {
        method: 'POST',
        body: JSON.stringify(issueRecords),
      });
    }

    return res.status(200).json({
      data: {
        audit_id: auditId,
        overall_score: overallScore,
        technical_score: technicalScore,
        content_score: contentScore,
        local_seo_score: localSeoScore,
        core_web_vitals: pageSpeed,
        issues: contentAnalysis.issues,
      },
    });
  } catch (err) {
    console.error('SEO audit error:', err);
    return res.status(500).json({ error: 'Audit failed: ' + err.message });
  }
};
