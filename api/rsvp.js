// ============================================
// RSVP API — Handles invite confirmations/declines via link
// Influencers click Confirm or Decline in their email,
// which hits this endpoint and auto-updates the invite status.
// ============================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zmdubmumgdyuyjajjxjs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseRequest(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...options.headers,
    },
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

module.exports = async (req, res) => {
  const { token, action } = req.query;

  if (!token || !action || !['confirm', 'decline'].includes(action)) {
    return res.status(400).send(renderPage('Invalid Link', 'This RSVP link is invalid or incomplete. Please check the link in your email and try again.', 'error'));
  }

  // Look up the invite by token
  const invites = await supabaseRequest(`event_invites?rsvp_token=eq.${token}&select=*`);
  if (!Array.isArray(invites) || !invites.length) {
    return res.status(404).send(renderPage('Invite Not Found', 'This RSVP link has expired or is no longer valid.', 'error'));
  }

  const invite = invites[0];

  // Check if already responded
  if (invite.status === 'confirmed' || invite.status === 'declined') {
    const alreadyStatus = invite.status === 'confirmed' ? 'confirmed' : 'declined';
    return res.send(renderPage(
      'Already Responded',
      `You've already <strong>${alreadyStatus}</strong> this invitation. If you need to change your response, please contact us directly.`,
      'info'
    ));
  }

  // Update the invite status
  const newStatus = action === 'confirm' ? 'confirmed' : 'declined';
  await supabaseRequest(`event_invites?rsvp_token=eq.${token}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: newStatus,
      rsvp_date: new Date().toISOString(),
    }),
  });

  // Get event details for the confirmation page
  let eventName = 'the event';
  let eventDate = '';
  let eventTime = '';
  let eventLocation = '';
  if (invite.event_id) {
    const events = await supabaseRequest(`events?id=eq.${invite.event_id}&select=name,date,time,location`);
    if (Array.isArray(events) && events.length) {
      eventName = events[0].name || eventName;
      eventDate = events[0].date || '';
      eventTime = events[0].time || '';
      eventLocation = events[0].location || '';
    }
  }

  if (action === 'confirm') {
    const details = [
      eventDate ? `<p style="margin:4px 0;color:#555;">📅 <strong>${eventDate}</strong>${eventTime ? ' at ' + eventTime : ''}</p>` : '',
      eventLocation ? `<p style="margin:4px 0;color:#555;">📍 ${eventLocation}</p>` : '',
    ].join('');
    return res.send(renderPage(
      'You\'re Confirmed!',
      `Thank you for confirming your attendance at <strong>${eventName}</strong>! We're excited to have you.${details ? '<div style="margin-top:16px;padding:16px;background:#f0fdf4;border-radius:8px">' + details + '</div>' : ''}`,
      'success'
    ));
  } else {
    return res.send(renderPage(
      'RSVP Declined',
      `We're sorry you can't make it to <strong>${eventName}</strong>. Maybe next time! If your plans change, feel free to reach out to us.`,
      'declined'
    ));
  }
};

function renderPage(title, message, type) {
  const colors = {
    success: { bg: '#f0fdf4', border: '#22c55e', icon: '✅' },
    declined: { bg: '#fef2f2', border: '#ef4444', icon: '🙁' },
    error: { bg: '#fef2f2', border: '#ef4444', icon: '⚠️' },
    info: { bg: '#eff6ff', border: '#3b82f6', icon: 'ℹ️' },
  };
  const c = colors[type] || colors.info;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Ivea Restaurant Group</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; background: #f8f9fa; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #fff; border-radius: 16px; padding: 48px 40px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); border-top: 4px solid ${c.border}; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 12px; color: #1a1a2e; }
    .message { font-size: 15px; line-height: 1.6; color: #555; }
    .footer { margin-top: 32px; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${c.icon}</div>
    <h1>${title}</h1>
    <div class="message">${message}</div>
    <div class="footer">Ivea Restaurant Group</div>
  </div>
</body>
</html>`;
}
