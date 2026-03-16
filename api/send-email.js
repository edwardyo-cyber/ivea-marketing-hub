// Send email via SMTP (Nodemailer) — for influencer outreach
const nodemailer = require('nodemailer');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zmdubmumgdyuyjajjxjs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function getSetting(key) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/settings?key=eq.${key}&select=value`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  const data = await res.json();
  return data?.[0]?.value || '';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { to, subject, body, cc, bcc } = req.body;
    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'Missing to, subject, or body' });
    }

    const [host, port, user, pass, senderName, replyTo] = await Promise.all([
      getSetting('smtp_host'),
      getSetting('smtp_port'),
      getSetting('smtp_user'),
      getSetting('smtp_pass'),
      getSetting('email_sender_name'),
      getSetting('email_reply_to'),
    ]);

    if (!host || !user || !pass) {
      return res.status(500).json({ error: 'SMTP not configured. Go to Settings → Email to set up SMTP.' });
    }

    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port) || 587,
      secure: parseInt(port) === 465,
      auth: { user, pass },
    });

    const mailOptions = {
      from: senderName ? `"${senderName}" <${user}>` : user,
      to,
      subject,
      html: body,
      replyTo: replyTo || user,
    };
    if (cc) mailOptions.cc = cc;
    if (bcc) mailOptions.bcc = bcc;

    const info = await transporter.sendMail(mailOptions);
    return res.json({ success: true, messageId: info.messageId, to, subject });
  } catch (err) {
    console.error('Email send error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
