-- ============================================
-- Phase C: Ads Manager Tables (10 tables)
-- Run in Supabase SQL Editor
-- ============================================

-- 1. Ad Platform Connections
CREATE TABLE IF NOT EXISTS ad_platform_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  account_id TEXT,
  account_name TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes JSONB DEFAULT '[]',
  status TEXT DEFAULT 'disconnected',
  last_synced_at TIMESTAMPTZ,
  connected_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_platform_connections_restaurant ON ad_platform_connections(restaurant_id);

-- 2. Ad Campaigns
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES ad_platform_connections(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  platform_campaign_id TEXT,
  name TEXT NOT NULL,
  objective TEXT,
  campaign_type TEXT,
  status TEXT DEFAULT 'draft',
  budget_type TEXT DEFAULT 'daily',
  budget_amount NUMERIC(10,2),
  start_date DATE,
  end_date DATE,
  target_locations JSONB DEFAULT '[]',
  geo_radius_km NUMERIC(5,1) DEFAULT 10,
  demographics JSONB DEFAULT '{}',
  interests JSONB DEFAULT '[]',
  bidding_strategy TEXT DEFAULT 'maximize_conversions',
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_restaurant ON ad_campaigns(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_platform ON ad_campaigns(platform);

-- 3. Ad Groups
CREATE TABLE IF NOT EXISTS ad_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  platform_group_id TEXT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  targeting JSONB DEFAULT '{}',
  bid_amount NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_groups_restaurant ON ad_groups(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_ad_groups_campaign ON ad_groups(campaign_id);

-- 4. Ad Creatives
CREATE TABLE IF NOT EXISTS ad_creatives (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  group_id UUID REFERENCES ad_groups(id) ON DELETE SET NULL,
  platform_creative_id TEXT,
  creative_type TEXT DEFAULT 'image',
  headlines JSONB DEFAULT '[]',
  descriptions JSONB DEFAULT '[]',
  image_urls JSONB DEFAULT '[]',
  video_url TEXT,
  cta TEXT DEFAULT 'Learn More',
  landing_url TEXT,
  approval_status TEXT DEFAULT 'pending',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_restaurant ON ad_creatives(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign ON ad_creatives(campaign_id);

-- 5. Ad Performance Daily
CREATE TABLE IF NOT EXISTS ad_performance_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  group_id UUID REFERENCES ad_groups(id) ON DELETE SET NULL,
  creative_id UUID REFERENCES ad_creatives(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  report_date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr NUMERIC(8,4) DEFAULT 0,
  cpc NUMERIC(10,2) DEFAULT 0,
  cpm NUMERIC(10,2) DEFAULT 0,
  spend NUMERIC(10,2) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  conversion_value NUMERIC(10,2) DEFAULT 0,
  roas NUMERIC(10,2) DEFAULT 0,
  phone_calls INTEGER DEFAULT 0,
  direction_requests INTEGER DEFAULT 0,
  store_visits INTEGER DEFAULT 0,
  actions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_performance_restaurant ON ad_performance_daily(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_ad_performance_campaign ON ad_performance_daily(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_performance_date ON ad_performance_daily(report_date);

-- 6. Ad Spend By Location
CREATE TABLE IF NOT EXISTS ad_spend_by_location (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  month DATE NOT NULL,
  total_spend NUMERIC(10,2) DEFAULT 0,
  total_impressions INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,
  total_conversion_value NUMERIC(10,2) DEFAULT 0,
  roas NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_spend_location_restaurant ON ad_spend_by_location(restaurant_id);

-- 7. Ad Audiences
CREATE TABLE IF NOT EXISTS ad_audiences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_audience_id TEXT,
  name TEXT NOT NULL,
  audience_type TEXT DEFAULT 'custom',
  segment TEXT,
  member_count INTEGER DEFAULT 0,
  match_rate NUMERIC(5,2),
  source TEXT DEFAULT 'loyalty',
  last_synced_at TIMESTAMPTZ,
  auto_sync BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_audiences_restaurant ON ad_audiences(restaurant_id);

-- 8. Ad Experiments
CREATE TABLE IF NOT EXISTS ad_experiments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hypothesis TEXT,
  test_variable TEXT,
  status TEXT DEFAULT 'draft',
  start_date DATE,
  end_date DATE,
  confidence_level NUMERIC(5,2),
  winner_variant_id UUID,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_experiments_restaurant ON ad_experiments(restaurant_id);

-- 9. Ad Experiment Variants
CREATE TABLE IF NOT EXISTS ad_experiment_variants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  experiment_id UUID REFERENCES ad_experiments(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL,
  variant_type TEXT DEFAULT 'control',
  config JSONB DEFAULT '{}',
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  spend NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_experiment_variants_restaurant ON ad_experiment_variants(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_ad_experiment_variants_experiment ON ad_experiment_variants(experiment_id);

-- 10. Attribution Events
CREATE TABLE IF NOT EXISTS attribution_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES ad_campaigns(id) ON DELETE SET NULL,
  platform TEXT,
  click_id TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  landing_url TEXT,
  event_type TEXT DEFAULT 'click',
  event_value NUMERIC(10,2),
  customer_email TEXT,
  customer_phone TEXT,
  matched_member_id UUID,
  clicked_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attribution_events_restaurant ON attribution_events(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_attribution_events_campaign ON attribution_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_attribution_events_click_id ON attribution_events(click_id);
