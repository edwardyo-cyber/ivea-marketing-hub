-- ============================================
-- Phase A: Foundation Database Changes
-- Run this in Supabase SQL Editor
-- ============================================

-- 1a. Create locations table
CREATE TABLE IF NOT EXISTS locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  email TEXT,
  manager TEXT,
  status TEXT DEFAULT 'active',
  google_business_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1b. Add restaurant_id to ALL content tables
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id);
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id);
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id);
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id);
ALTER TABLE media_contacts ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id);
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id);
ALTER TABLE contact_lists ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id);

-- Create indexes for restaurant_id filtering
CREATE INDEX IF NOT EXISTS idx_content_posts_restaurant ON content_posts(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_restaurant ON campaigns(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reviews_restaurant ON reviews(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_restaurant ON social_accounts(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_assets_restaurant ON assets(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_restaurant ON activity_log(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_influencers_restaurant ON influencers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_media_contacts_restaurant ON media_contacts(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_restaurant ON email_campaigns(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_contact_lists_restaurant ON contact_lists(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_locations_restaurant ON locations(restaurant_id);
