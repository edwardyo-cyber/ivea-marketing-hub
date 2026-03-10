const AYRSHARE_BASE = 'https://api.ayrshare.com/api';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;
  const API_KEY = process.env.AYRSHARE_API_KEY;

  if (!API_KEY) {
    return res.json({ needsSetup: true, message: 'Ayrshare not configured. Add your API key in Vercel environment variables.' });
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
  };

  try {
    // POST — publish immediately
    if (action === 'post') {
      const { post, platforms, mediaUrls } = req.body || {};
      if (!post || !platforms?.length) return res.status(400).json({ error: 'post text and platforms required' });

      const body = { post, platforms };
      if (mediaUrls?.length) body.mediaUrls = mediaUrls;

      const response = await fetch(`${AYRSHARE_BASE}/post`, {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      const data = await response.json();
      return res.json(data);
    }

    // SCHEDULE — schedule for future
    if (action === 'schedule') {
      const { post, platforms, scheduleDate, mediaUrls } = req.body || {};
      if (!post || !platforms?.length || !scheduleDate) {
        return res.status(400).json({ error: 'post, platforms, and scheduleDate required' });
      }

      const body = { post, platforms, scheduleDate };
      if (mediaUrls?.length) body.mediaUrls = mediaUrls;

      const response = await fetch(`${AYRSHARE_BASE}/post`, {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      const data = await response.json();
      return res.json(data);
    }

    // HISTORY — get post history
    if (action === 'history') {
      const response = await fetch(`${AYRSHARE_BASE}/history`, {
        method: 'GET', headers,
      });
      const data = await response.json();
      return res.json(data);
    }

    // ANALYTICS — get analytics for a post
    if (action === 'analytics') {
      const { id, platforms: plats } = req.query;
      const body = { id };
      if (plats) body.platforms = plats.split(',');

      const response = await fetch(`${AYRSHARE_BASE}/analytics/post`, {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      const data = await response.json();
      return res.json(data);
    }

    // DELETE — delete a post
    if (action === 'delete') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Post id required' });

      const response = await fetch(`${AYRSHARE_BASE}/post`, {
        method: 'DELETE', headers, body: JSON.stringify({ id }),
      });
      const data = await response.json();
      return res.json(data);
    }

    // PROFILES — get connected social profiles
    if (action === 'profiles') {
      const response = await fetch(`${AYRSHARE_BASE}/user`, {
        method: 'GET', headers,
      });
      const data = await response.json();
      return res.json(data);
    }

    return res.status(400).json({ error: 'Invalid action. Use: post, schedule, history, analytics, delete, profiles' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
