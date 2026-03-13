// ============================================
// Competitors Sync — Daily Google Places + Yelp snapshot collector
// Runs daily via Vercel cron at 4 AM
// ============================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zmdubmumgdyuyjajjxjs.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const YELP_API_KEY = process.env.YELP_API_KEY;

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

async function fetchGooglePlaceDetails(placeId) {
  if (!GOOGLE_PLACES_API_KEY || !placeId) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=rating,user_ratings_total,reviews&key=${GOOGLE_PLACES_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK') return null;
    const result = data.result;
    return {
      rating: result.rating || 0,
      review_count: result.user_ratings_total || 0,
      reviews: (result.reviews || []).slice(0, 5).map(r => ({
        author_name: r.author_name,
        rating: r.rating,
        text: r.text,
        time: r.time ? new Date(r.time * 1000).toISOString() : null,
      })),
    };
  } catch (err) {
    console.error(`Google Places error for ${placeId}:`, err);
    return null;
  }
}

async function fetchYelpDetails(businessId) {
  if (!YELP_API_KEY || !businessId) return null;
  try {
    // Get business details
    const bizRes = await fetch(`https://api.yelp.com/v3/businesses/${businessId}`, {
      headers: { 'Authorization': `Bearer ${YELP_API_KEY}` },
    });
    if (!bizRes.ok) return null;
    const biz = await bizRes.json();

    // Get reviews
    const revRes = await fetch(`https://api.yelp.com/v3/businesses/${businessId}/reviews?limit=3&sort_by=yelp_sort`, {
      headers: { 'Authorization': `Bearer ${YELP_API_KEY}` },
    });
    let reviews = [];
    if (revRes.ok) {
      const revData = await revRes.json();
      reviews = (revData.reviews || []).map(r => ({
        author_name: r.user?.name,
        rating: r.rating,
        text: r.text,
        time: r.time_created,
      }));
    }

    return {
      rating: biz.rating || 0,
      review_count: biz.review_count || 0,
      reviews,
    };
  } catch (err) {
    console.error(`Yelp error for ${businessId}:`, err);
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Get all active competitors
    const { data: competitors } = await supabaseRequest(
      'competitors?status=eq.active&select=*'
    );

    if (!competitors || !competitors.length) {
      return res.status(200).json({ data: { message: 'No active competitors', synced: 0 } });
    }

    const today = new Date().toISOString().split('T')[0];
    let snapshots = 0;
    let reviewsSaved = 0;

    for (const comp of competitors) {
      // Google Places
      if (comp.google_place_id) {
        const google = await fetchGooglePlaceDetails(comp.google_place_id);
        if (google) {
          // Save snapshot
          await supabaseRequest('competitor_review_snapshots', {
            method: 'POST',
            body: JSON.stringify({
              restaurant_id: comp.restaurant_id,
              competitor_id: comp.id,
              platform: 'google',
              snapshot_date: today,
              avg_rating: google.rating,
              total_reviews: google.review_count,
            }),
          });
          snapshots++;

          // Save sample reviews
          for (const review of google.reviews) {
            await supabaseRequest('competitor_reviews', {
              method: 'POST',
              body: JSON.stringify({
                restaurant_id: comp.restaurant_id,
                competitor_id: comp.id,
                platform: 'google',
                author_name: review.author_name,
                rating: review.rating,
                review_text: review.text,
                review_date: review.time,
              }),
            });
            reviewsSaved++;
          }

          // Update competitor record
          await supabaseRequest(`competitors?id=eq.${comp.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              google_rating: google.rating,
              google_review_count: google.review_count,
              updated_at: new Date().toISOString(),
            }),
          });
        }
        await new Promise(r => setTimeout(r, 200)); // Rate limit
      }

      // Yelp
      if (comp.yelp_business_id) {
        const yelp = await fetchYelpDetails(comp.yelp_business_id);
        if (yelp) {
          await supabaseRequest('competitor_review_snapshots', {
            method: 'POST',
            body: JSON.stringify({
              restaurant_id: comp.restaurant_id,
              competitor_id: comp.id,
              platform: 'yelp',
              snapshot_date: today,
              avg_rating: yelp.rating,
              total_reviews: yelp.review_count,
            }),
          });
          snapshots++;

          for (const review of yelp.reviews) {
            await supabaseRequest('competitor_reviews', {
              method: 'POST',
              body: JSON.stringify({
                restaurant_id: comp.restaurant_id,
                competitor_id: comp.id,
                platform: 'yelp',
                author_name: review.author_name,
                rating: review.rating,
                review_text: review.text,
                review_date: review.time,
              }),
            });
            reviewsSaved++;
          }

          await supabaseRequest(`competitors?id=eq.${comp.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              yelp_rating: yelp.rating,
              yelp_review_count: yelp.review_count,
              updated_at: new Date().toISOString(),
            }),
          });
        }
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return res.status(200).json({
      data: {
        message: `Synced ${snapshots} snapshots, ${reviewsSaved} reviews from ${competitors.length} competitors`,
        competitors: competitors.length,
        snapshots,
        reviews: reviewsSaved,
        date: today,
      },
    });
  } catch (err) {
    console.error('Competitors sync error:', err);
    return res.status(500).json({ error: 'Competitors sync failed: ' + err.message });
  }
};
