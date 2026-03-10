// Gmail OAuth2 — handle callback, store tokens
const { google } = require('googleapis');

module.exports = async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'No code provided' });

  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/gmail-callback`
  );

  try {
    const { tokens } = await oauth2.getToken(code);
    
    // Store tokens in Supabase settings
    const supabaseUrl = process.env.SUPABASE_URL || 'https://zmdubmumgdyuyjajjxjs.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
    
    // Upsert refresh token
    await fetch(`${supabaseUrl}/rest/v1/settings?key=eq.gmail_refresh_token`, {
      method: 'DELETE',
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    await fetch(`${supabaseUrl}/rest/v1/settings`, {
      method: 'POST',
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'gmail_refresh_token', value: tokens.refresh_token || '' })
    });
    await fetch(`${supabaseUrl}/rest/v1/settings?key=eq.gmail_access_token`, {
      method: 'DELETE',
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    await fetch(`${supabaseUrl}/rest/v1/settings`, {
      method: 'POST',
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'gmail_access_token', value: tokens.access_token || '' })
    });

    // Redirect back to app
    res.redirect('/?page=inbox&connected=true');
  } catch (err) {
    console.error('Gmail OAuth error:', err);
    res.status(500).json({ error: 'Failed to authenticate with Gmail', details: err.message });
  }
};
