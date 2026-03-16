-- ============================================
-- Phase F: Influencer CRM Tables
-- Full relationship management, post tracking,
-- performance-based payments, ambassador program
-- ============================================

-- 1. Influencer Interactions (CRM timeline)
CREATE TABLE IF NOT EXISTS influencer_interactions (
  id BIGSERIAL PRIMARY KEY,
  influencer_id BIGINT NOT NULL,
  restaurant_id UUID,
  employee_id BIGINT,
  type TEXT NOT NULL DEFAULT 'note', -- dm, email, call, meeting, gift, sample, note
  subject TEXT,
  notes TEXT,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Influencer-Campaign assignments
CREATE TABLE IF NOT EXISTS influencer_campaigns (
  id BIGSERIAL PRIMARY KEY,
  influencer_id BIGINT NOT NULL,
  campaign_id BIGINT,
  restaurant_id UUID,
  status TEXT DEFAULT 'assigned', -- assigned, in_progress, delivered, completed, cancelled
  base_rate NUMERIC(10,2) DEFAULT 0,
  bonus_per_10k_views NUMERIC(10,2) DEFAULT 0,
  bonus_per_1k_reposts NUMERIC(10,2) DEFAULT 0,
  bonus_per_1k_forwards NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Deliverables per campaign assignment
CREATE TABLE IF NOT EXISTS influencer_deliverables (
  id BIGSERIAL PRIMARY KEY,
  influencer_campaign_id BIGINT NOT NULL,
  influencer_id BIGINT NOT NULL,
  restaurant_id UUID,
  type TEXT NOT NULL DEFAULT 'post', -- post, reel, story, video, review, live
  platform TEXT,
  description TEXT,
  due_date DATE,
  status TEXT DEFAULT 'pending', -- pending, submitted, approved, revision_needed, published
  draft_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Influencer Posts (tracked content)
CREATE TABLE IF NOT EXISTS influencer_posts (
  id BIGSERIAL PRIMARY KEY,
  influencer_id BIGINT NOT NULL,
  influencer_campaign_id BIGINT,
  deliverable_id BIGINT,
  restaurant_id UUID,
  platform TEXT NOT NULL,
  post_type TEXT DEFAULT 'post', -- post, reel, story, video, live, tweet
  post_url TEXT,
  caption TEXT,
  posted_at TIMESTAMPTZ,
  -- Latest metrics (updated manually or via snapshot)
  views BIGINT DEFAULT 0,
  likes BIGINT DEFAULT 0,
  comments BIGINT DEFAULT 0,
  shares BIGINT DEFAULT 0,
  reposts BIGINT DEFAULT 0,
  forwards BIGINT DEFAULT 0,
  saves BIGINT DEFAULT 0,
  link_clicks BIGINT DEFAULT 0,
  promo_code_uses INT DEFAULT 0,
  -- Calculated
  engagement_total BIGINT GENERATED ALWAYS AS (likes + comments + shares + reposts + forwards + saves) STORED,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Post metric snapshots (track performance over time)
CREATE TABLE IF NOT EXISTS influencer_post_metrics (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL,
  influencer_id BIGINT NOT NULL,
  restaurant_id UUID,
  snapshot_label TEXT DEFAULT 'manual', -- 24h, 48h, 7d, 30d, manual
  views BIGINT DEFAULT 0,
  likes BIGINT DEFAULT 0,
  comments BIGINT DEFAULT 0,
  shares BIGINT DEFAULT 0,
  reposts BIGINT DEFAULT 0,
  forwards BIGINT DEFAULT 0,
  saves BIGINT DEFAULT 0,
  link_clicks BIGINT DEFAULT 0,
  promo_code_uses INT DEFAULT 0,
  captured_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Payments
CREATE TABLE IF NOT EXISTS influencer_payments (
  id BIGSERIAL PRIMARY KEY,
  influencer_id BIGINT NOT NULL,
  influencer_campaign_id BIGINT,
  restaurant_id UUID,
  type TEXT DEFAULT 'campaign', -- campaign, bonus, ambassador_reward, referral
  status TEXT DEFAULT 'pending', -- pending, invoiced, paid, cancelled
  base_amount NUMERIC(10,2) DEFAULT 0,
  performance_bonus NUMERIC(10,2) DEFAULT 0,
  total_amount NUMERIC(10,2) DEFAULT 0,
  -- Performance metrics used for calculation
  total_views BIGINT DEFAULT 0,
  total_reposts BIGINT DEFAULT 0,
  total_forwards BIGINT DEFAULT 0,
  -- Rate used
  rate_per_10k_views NUMERIC(10,2) DEFAULT 0,
  rate_per_1k_reposts NUMERIC(10,2) DEFAULT 0,
  rate_per_1k_forwards NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  invoice_number TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Promo codes assigned to influencers
CREATE TABLE IF NOT EXISTS influencer_promo_codes (
  id BIGSERIAL PRIMARY KEY,
  influencer_id BIGINT NOT NULL,
  campaign_id BIGINT,
  restaurant_id UUID,
  code TEXT NOT NULL,
  discount_type TEXT DEFAULT 'percent', -- percent, fixed
  discount_value NUMERIC(10,2) DEFAULT 0,
  uses INT DEFAULT 0,
  max_uses INT,
  revenue_generated NUMERIC(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Ambassador tiers
CREATE TABLE IF NOT EXISTS influencer_ambassador_tiers (
  id BIGSERIAL PRIMARY KEY,
  restaurant_id UUID,
  name TEXT NOT NULL, -- Bronze, Silver, Gold, Platinum
  min_collabs INT DEFAULT 0,
  rate_bonus_percent INT DEFAULT 0,
  perks TEXT, -- JSON array of perk descriptions
  color TEXT DEFAULT '#94a3b8',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Milestones / badges
CREATE TABLE IF NOT EXISTS influencer_milestones (
  id BIGSERIAL PRIMARY KEY,
  influencer_id BIGINT NOT NULL,
  restaurant_id UUID,
  type TEXT NOT NULL, -- first_post, 100k_views, 5_campaigns, 10_campaigns, top_performer, referral
  label TEXT NOT NULL,
  description TEXT,
  earned_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Referrals
CREATE TABLE IF NOT EXISTS influencer_referrals (
  id BIGSERIAL PRIMARY KEY,
  referrer_id BIGINT NOT NULL, -- influencer who referred
  referred_id BIGINT NOT NULL, -- new influencer
  restaurant_id UUID,
  bonus_amount NUMERIC(10,2) DEFAULT 0,
  bonus_paid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Insert default ambassador tiers
-- ============================================
INSERT INTO influencer_ambassador_tiers (name, min_collabs, rate_bonus_percent, perks, color, sort_order) VALUES
  ('Bronze', 0, 0, '["Standard rates", "Campaign access"]', '#cd7f32', 1),
  ('Silver', 3, 10, '["10% rate bonus", "Early campaign access", "Priority outreach"]', '#c0c0c0', 2),
  ('Gold', 10, 20, '["20% rate bonus", "Product gifting", "Exclusive events", "Featured on brand page"]', '#ffd700', 3),
  ('Platinum', 25, 30, '["30% rate bonus", "Revenue sharing", "Long-term contracts", "Brand ambassador title", "Co-creation opportunities"]', '#e5e4e2', 4)
ON CONFLICT DO NOTHING;
