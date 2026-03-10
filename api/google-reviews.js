const { google } = require('googleapis');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;
  const ACCESS_TOKEN = process.env.GOOGLE_BUSINESS_ACCESS_TOKEN;
  const ACCOUNT_ID = process.env.GOOGLE_BUSINESS_ACCOUNT_ID;

  // If no credentials, return demo data so the UI still works
  if (!ACCESS_TOKEN || !ACCOUNT_ID) {
    return res.json({ needsSetup: true, message: 'Google Business Profile not configured. Add credentials in Vercel environment variables.' });
  }

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: ACCESS_TOKEN });

  try {
    if (action === 'locations') {
      const mybusiness = google.mybusinessbusinessinformation({ version: 'v1', auth: oauth2Client });
      const response = await mybusiness.accounts.locations.list({
        parent: `accounts/${ACCOUNT_ID}`,
        readMask: 'name,title,storefrontAddress',
        pageSize: 100,
      });
      return res.json({ locations: response.data.locations || [] });
    }

    if (action === 'list') {
      const locationName = req.query.location || '';
      if (!locationName) return res.json({ error: 'Location name required' });

      const mybusiness = google.mybusinessaccountmanagement({ version: 'v1', auth: oauth2Client });
      // Use the v4 API for reviews
      const response = await fetch(
        `https://mybusiness.googleapis.com/v4/${locationName}/reviews?pageSize=${req.query.max || 50}`,
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
      );
      const data = await response.json();
      return res.json({ reviews: data.reviews || [], totalReviewCount: data.totalReviewCount || 0, averageRating: data.averageRating || 0 });
    }

    if (action === 'reply') {
      const { reviewName, comment } = req.body || {};
      if (!reviewName || !comment) return res.status(400).json({ error: 'reviewName and comment required' });

      const response = await fetch(
        `https://mybusiness.googleapis.com/v4/${reviewName}/reply`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment }),
        }
      );
      const data = await response.json();
      return res.json({ success: true, reply: data });
    }

    if (action === 'fetch-all') {
      // Fetch all locations, then all reviews, return combined
      const locResponse = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${ACCOUNT_ID}/locations?readMask=name,title&pageSize=100`,
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
      );
      const locData = await locResponse.json();
      const locations = locData.locations || [];
      
      let allReviews = [];
      for (const loc of locations) {
        try {
          const revResponse = await fetch(
            `https://mybusiness.googleapis.com/v4/${loc.name}/reviews?pageSize=50`,
            { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
          );
          const revData = await revResponse.json();
          const reviews = (revData.reviews || []).map(r => ({
            google_review_id: r.name,
            reviewer_name: r.reviewer?.displayName || 'Anonymous',
            rating: r.starRating === 'FIVE' ? 5 : r.starRating === 'FOUR' ? 4 : r.starRating === 'THREE' ? 3 : r.starRating === 'TWO' ? 2 : 1,
            review_text: r.comment || '',
            platform: 'google',
            restaurant_name: loc.title,
            created_at: r.createTime,
            is_responded: !!r.reviewReply,
            response_text: r.reviewReply?.comment || '',
            status: r.reviewReply ? 'responded' : 'pending',
          }));
          allReviews = allReviews.concat(reviews);
        } catch (e) { /* skip failed location */ }
      }
      return res.json({ reviews: allReviews, count: allReviews.length });
    }

    return res.status(400).json({ error: 'Invalid action. Use: locations, list, reply, fetch-all' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
