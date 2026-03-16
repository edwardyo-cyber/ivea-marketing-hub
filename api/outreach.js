// Unified outreach API — email (SMTP) + SMS (Twilio)
// Actions: send_email, sms_conversations, sms_thread, sms_send, sms_status
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || req.body?.action;

  try {
    // ===== EMAIL: Send via SMTP =====
    if (action === 'send_email') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

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
    }

    // ===== SMS: Twilio =====
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !twilioNumber) {
      return res.status(500).json({ error: 'Twilio credentials not configured', needsSetup: true });
    }

    const twilio = require('twilio')(accountSid, authToken);

    // --- LIST CONVERSATIONS ---
    if (action === 'conversations') {
      const limit = parseInt(req.query.limit) || 100;
      const [sent, received] = await Promise.all([
        twilio.messages.list({ from: twilioNumber, limit }),
        twilio.messages.list({ to: twilioNumber, limit }),
      ]);

      const allMsgs = [...sent, ...received].sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));
      const convos = {};
      for (const msg of allMsgs) {
        const contact = msg.from === twilioNumber ? msg.to : msg.from;
        if (!convos[contact]) {
          convos[contact] = {
            phone: contact,
            lastMessage: msg.body,
            lastDate: msg.dateCreated,
            direction: msg.from === twilioNumber ? 'outbound' : 'inbound',
            unread: msg.from !== twilioNumber && msg.status !== 'read',
            messageCount: 0,
          };
        }
        convos[contact].messageCount++;
      }
      const conversations = Object.values(convos).sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
      return res.json({ conversations, twilioNumber });
    }

    // --- GET THREAD ---
    if (action === 'thread') {
      const phone = req.query.phone;
      if (!phone) return res.status(400).json({ error: 'Missing phone number' });
      const limit = parseInt(req.query.limit) || 50;
      const [sent, received] = await Promise.all([
        twilio.messages.list({ from: twilioNumber, to: phone, limit }),
        twilio.messages.list({ to: twilioNumber, from: phone, limit }),
      ]);
      const messages = [...sent, ...received]
        .sort((a, b) => new Date(a.dateCreated) - new Date(b.dateCreated))
        .map(m => ({
          sid: m.sid, body: m.body, from: m.from, to: m.to,
          direction: m.from === twilioNumber ? 'outbound' : 'inbound',
          status: m.status, date: m.dateCreated,
        }));
      return res.json({ messages, phone, twilioNumber });
    }

    // --- SEND SMS ---
    if (action === 'send' && req.method === 'POST') {
      const { to, body } = req.body;
      if (!to || !body) return res.status(400).json({ error: 'Missing to or body' });
      const msg = await twilio.messages.create({ body, from: twilioNumber, to });
      return res.json({ success: true, sid: msg.sid, status: msg.status });
    }

    // --- CHECK STATUS ---
    if (action === 'status') {
      const account = await twilio.api.accounts(accountSid).fetch();
      return res.json({ connected: true, friendlyName: account.friendlyName, twilioNumber });
    }

    return res.status(400).json({ error: 'Unknown action. Use: send_email, conversations, thread, send, status' });
  } catch (err) {
    console.error('Outreach error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
