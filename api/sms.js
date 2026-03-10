// Twilio SMS API — list conversations, send/receive messages
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !twilioNumber) {
    return res.status(500).json({ error: 'Twilio credentials not configured', needsSetup: true });
  }

  const twilio = require('twilio')(accountSid, authToken);
  const action = req.query.action || req.body?.action;

  try {
    // --- LIST CONVERSATIONS (unique contacts with last message) ---
    if (action === 'conversations') {
      const limit = parseInt(req.query.limit) || 100;
      
      // Get recent sent + received messages
      const [sent, received] = await Promise.all([
        twilio.messages.list({ from: twilioNumber, limit }),
        twilio.messages.list({ to: twilioNumber, limit }),
      ]);

      // Merge and group by contact number
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

    // --- GET MESSAGES FOR A CONTACT ---
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
          sid: m.sid,
          body: m.body,
          from: m.from,
          to: m.to,
          direction: m.from === twilioNumber ? 'outbound' : 'inbound',
          status: m.status,
          date: m.dateCreated,
        }));

      return res.json({ messages, phone, twilioNumber });
    }

    // --- SEND SMS ---
    if (action === 'send' && req.method === 'POST') {
      const { to, body } = req.body;
      if (!to || !body) return res.status(400).json({ error: 'Missing to or body' });

      const msg = await twilio.messages.create({
        body,
        from: twilioNumber,
        to,
      });

      return res.json({ success: true, sid: msg.sid, status: msg.status });
    }

    // --- CHECK STATUS ---
    if (action === 'status') {
      // Verify credentials work
      const account = await twilio.api.accounts(accountSid).fetch();
      return res.json({ 
        connected: true, 
        friendlyName: account.friendlyName,
        twilioNumber,
      });
    }

    return res.status(400).json({ error: 'Unknown action. Use: conversations, thread, send, status' });
  } catch (err) {
    console.error('Twilio error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
