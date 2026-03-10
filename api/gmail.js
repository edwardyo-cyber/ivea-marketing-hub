// Gmail API — list messages, read message, send message
const { google } = require('googleapis');

async function getAuth() {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://zmdubmumgdyuyjajjxjs.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  
  // Get tokens from Supabase
  const res1 = await fetch(`${supabaseUrl}/rest/v1/settings?key=eq.gmail_refresh_token&select=value`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const res2 = await fetch(`${supabaseUrl}/rest/v1/settings?key=eq.gmail_access_token&select=value`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  
  const refreshData = await res1.json();
  const accessData = await res2.json();
  
  if (!refreshData.length && !accessData.length) return null;
  
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );
  
  oauth2.setCredentials({
    refresh_token: refreshData[0]?.value,
    access_token: accessData[0]?.value,
  });
  
  // Auto-refresh token
  oauth2.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await fetch(`${supabaseUrl}/rest/v1/settings?key=eq.gmail_access_token`, {
        method: 'DELETE',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      });
      await fetch(`${supabaseUrl}/rest/v1/settings`, {
        method: 'POST',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'gmail_access_token', value: tokens.access_token })
      });
    }
  });
  
  return oauth2;
}

function decodeBody(body) {
  if (!body?.data) return '';
  return Buffer.from(body.data, 'base64url').toString('utf-8');
}

function getEmailBody(payload) {
  if (payload.body?.data) return decodeBody(payload.body);
  if (payload.parts) {
    // Prefer text/html, fallback to text/plain
    const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
    if (htmlPart) return decodeBody(htmlPart.body);
    const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
    if (textPart) return decodeBody(textPart.body);
    // Nested multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = getEmailBody(part);
        if (nested) return nested;
      }
    }
  }
  return '';
}

function getHeader(headers, name) {
  const h = headers?.find(h => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const auth = await getAuth();
  if (!auth) return res.status(401).json({ error: 'Gmail not connected', needsAuth: true });
  
  const gmail = google.gmail({ version: 'v1', auth });
  const action = req.query.action || req.body?.action;
  
  try {
    // --- LIST MESSAGES ---
    if (action === 'list') {
      const q = req.query.q || '';
      const label = req.query.label || 'INBOX';
      const maxResults = parseInt(req.query.max) || 20;
      const pageToken = req.query.pageToken || undefined;
      
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        labelIds: [label],
        q,
        maxResults,
        pageToken,
      });
      
      const messages = listRes.data.messages || [];
      const detailed = await Promise.all(messages.map(async (m) => {
        const msg = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From', 'To', 'Subject', 'Date'] });
        const headers = msg.data.payload?.headers || [];
        return {
          id: msg.data.id,
          threadId: msg.data.threadId,
          snippet: msg.data.snippet,
          from: getHeader(headers, 'From'),
          to: getHeader(headers, 'To'),
          subject: getHeader(headers, 'Subject'),
          date: getHeader(headers, 'Date'),
          labelIds: msg.data.labelIds,
          isUnread: msg.data.labelIds?.includes('UNREAD'),
        };
      }));
      
      return res.json({ messages: detailed, nextPageToken: listRes.data.nextPageToken });
    }
    
    // --- GET SINGLE MESSAGE ---
    if (action === 'get') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Missing message id' });
      
      const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
      const headers = msg.data.payload?.headers || [];
      const body = getEmailBody(msg.data.payload);
      
      // Mark as read
      await gmail.users.messages.modify({ userId: 'me', id, requestBody: { removeLabelIds: ['UNREAD'] } });
      
      return res.json({
        id: msg.data.id,
        threadId: msg.data.threadId,
        from: getHeader(headers, 'From'),
        to: getHeader(headers, 'To'),
        subject: getHeader(headers, 'Subject'),
        date: getHeader(headers, 'Date'),
        body,
        labelIds: msg.data.labelIds,
      });
    }
    
    // --- SEND EMAIL ---
    if (action === 'send' && req.method === 'POST') {
      const { to, subject, body, inReplyTo, threadId } = req.body;
      if (!to || !subject) return res.status(400).json({ error: 'Missing to or subject' });
      
      // Get sender email
      const profile = await gmail.users.getProfile({ userId: 'me' });
      const from = profile.data.emailAddress;
      
      let headers = `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/html; charset=utf-8\r\n`;
      if (inReplyTo) {
        headers += `In-Reply-To: ${inReplyTo}\r\nReferences: ${inReplyTo}\r\n`;
      }
      headers += `\r\n${body}`;
      
      const encoded = Buffer.from(headers).toString('base64url');
      const sendRes = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encoded,
          threadId: threadId || undefined,
        },
      });
      
      return res.json({ success: true, id: sendRes.data.id });
    }
    
    // --- GET LABELS ---
    if (action === 'labels') {
      const labelsRes = await gmail.users.labels.list({ userId: 'me' });
      return res.json({ labels: labelsRes.data.labels });
    }
    
    // --- GET PROFILE ---
    if (action === 'profile') {
      const profile = await gmail.users.getProfile({ userId: 'me' });
      return res.json({ email: profile.data.emailAddress, messagesTotal: profile.data.messagesTotal, threadsTotal: profile.data.threadsTotal });
    }
    
    return res.status(400).json({ error: 'Unknown action. Use: list, get, send, labels, profile' });
  } catch (err) {
    console.error('Gmail API error:', err.message);
    if (err.message?.includes('invalid_grant') || err.message?.includes('Token has been expired')) {
      return res.status(401).json({ error: 'Gmail token expired', needsAuth: true });
    }
    return res.status(500).json({ error: err.message });
  }
};
