-- Outreach templates for influencer communications
CREATE TABLE IF NOT EXISTS outreach_templates (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email', -- email, sms, dm
  subject TEXT, -- for email only
  body TEXT NOT NULL,
  category TEXT DEFAULT 'general', -- initial_outreach, follow_up, collaboration, gifting, thank_you, re_engage
  platform TEXT, -- for DM: instagram, tiktok, etc.
  variables TEXT DEFAULT '["{{name}}","{{handle}}","{{brand}}","{{rate}}"]', -- JSON array of merge tags
  is_default BOOLEAN DEFAULT false,
  created_by BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Outreach log (sent messages)
CREATE TABLE IF NOT EXISTS outreach_log (
  id BIGSERIAL PRIMARY KEY,
  influencer_id BIGINT NOT NULL,
  template_id BIGINT,
  channel TEXT NOT NULL, -- email, sms, dm_copy
  recipient TEXT, -- email address or phone number
  subject TEXT,
  body TEXT,
  status TEXT DEFAULT 'sent', -- sent, delivered, opened, replied, bounced, failed
  sent_by BIGINT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  opened_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  error_message TEXT
);

-- Seed default templates
INSERT INTO outreach_templates (name, channel, subject, body, category, is_default) VALUES
(
  'Initial Outreach - Collaboration',
  'email',
  'Collaboration Opportunity with {{brand}}',
  '<p>Hi {{name}},</p><p>I''ve been following your content and love what you''re creating! Your audience really resonates with our brand, {{brand}}.</p><p>We''d love to explore a collaboration opportunity with you. We offer competitive rates and performance-based bonuses that reward great content.</p><p>Would you be open to a quick chat this week?</p><p>Best,<br>{{sender_name}}</p>',
  'initial_outreach',
  true
),
(
  'Follow-Up',
  'email',
  'Following up - {{brand}} x {{handle}}',
  '<p>Hi {{name}},</p><p>Just following up on my previous message about a potential collaboration with {{brand}}.</p><p>We have a few exciting campaigns coming up and think you''d be a perfect fit. Happy to share more details whenever works for you!</p><p>Best,<br>{{sender_name}}</p>',
  'follow_up',
  true
),
(
  'Product Gifting',
  'email',
  'We''d love to send you something! 🎁',
  '<p>Hi {{name}},</p><p>We''re huge fans of your content and would love to send you a complimentary experience at {{brand}} — no strings attached!</p><p>If you enjoy it and want to share with your audience, we''d be thrilled, but there''s absolutely no obligation.</p><p>Just let me know the best way to coordinate!</p><p>Cheers,<br>{{sender_name}}</p>',
  'gifting',
  true
),
(
  'Thank You - Post Published',
  'email',
  'Thank you for the amazing content! 🙌',
  '<p>Hi {{name}},</p><p>Just wanted to say a huge thank you for the content you created for {{brand}}. It looks incredible and our team loves it!</p><p>We''d love to continue working together. Let me know if you''re interested in upcoming opportunities.</p><p>Best,<br>{{sender_name}}</p>',
  'thank_you',
  true
),
(
  'Re-Engagement',
  'email',
  'Miss working with you! — {{brand}}',
  '<p>Hi {{name}},</p><p>It''s been a while since our last collaboration and we''d love to reconnect! {{brand}} has some exciting new things in the works.</p><p>Are you open to discussing a new project together?</p><p>Best,<br>{{sender_name}}</p>',
  're_engage',
  true
),
(
  'Quick DM - Initial Outreach',
  'dm',
  NULL,
  'Hey {{name}}! 👋 Love your content. I''m with {{brand}} and we''d love to work with you on a collab. Interested? Can send you more details via email if you DM me your address! 🙏',
  'initial_outreach',
  true
),
(
  'Quick DM - Follow Up',
  'dm',
  NULL,
  'Hey {{name}}! Following up on our collab opportunity with {{brand}}. Would love to chat if you''re interested! 😊',
  'follow_up',
  true
),
(
  'SMS - Quick Outreach',
  'sms',
  NULL,
  'Hi {{name}}, this is {{sender_name}} from {{brand}}. We''d love to discuss a content collaboration with you. Is now a good time to chat? Reply STOP to opt out.',
  'initial_outreach',
  true
),
(
  'SMS - Reminder',
  'sms',
  NULL,
  'Hi {{name}}, friendly reminder about our upcoming collab with {{brand}}. Please submit your content by the deadline. Let me know if you need anything! - {{sender_name}}',
  'follow_up',
  true
)
ON CONFLICT DO NOTHING;
