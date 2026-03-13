-- ============================================
-- Phase D: Competitors Tables (14 tables)
-- Run in Supabase SQL Editor
-- ============================================

-- 1. Competitors
CREATE TABLE IF NOT EXISTS competitors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  website TEXT,
  google_place_id TEXT,
  yelp_business_id TEXT,
  instagram_handle TEXT,
  facebook_page TEXT,
  tiktok_handle TEXT,
  cuisine_type TEXT,
  price_level INTEGER,
  google_rating NUMERIC(3,1),
  google_review_count INTEGER DEFAULT 0,
  yelp_rating NUMERIC(3,1),
  yelp_review_count INTEGER DEFAULT 0,
  photo_url TEXT,
  status TEXT DEFAULT 'active',
  notes TEXT,
  added_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_competitors_restaurant ON competitors(restaurant_id);

-- 2. Competitor Tags
CREATE TABLE IF NOT EXISTS competitor_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_competitor_tags_restaurant ON competitor_tags(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_competitor_tags_competitor ON competitor_tags(competitor_id);

-- 3. Competitor Review Snapshots (daily)
CREATE TABLE IF NOT EXISTS competitor_review_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  avg_rating NUMERIC(3,1),
  total_reviews INTEGER DEFAULT 0,
  new_reviews_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_review_snap_restaurant ON competitor_review_snapshots(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_comp_review_snap_competitor ON competitor_review_snapshots(competitor_id);
CREATE INDEX IF NOT EXISTS idx_comp_review_snap_date ON competitor_review_snapshots(snapshot_date);

-- 4. Competitor Reviews (samples)
CREATE TABLE IF NOT EXISTS competitor_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  author_name TEXT,
  rating INTEGER,
  review_text TEXT,
  review_date TIMESTAMPTZ,
  sentiment TEXT,
  sentiment_score NUMERIC(5,2),
  topics JSONB DEFAULT '[]',
  platform_review_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_reviews_restaurant ON competitor_reviews(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_comp_reviews_competitor ON competitor_reviews(competitor_id);

-- 5. Competitor Social Snapshots
CREATE TABLE IF NOT EXISTS competitor_social_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0,
  avg_engagement_rate NUMERIC(8,4) DEFAULT 0,
  posts_this_week INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_social_snap_restaurant ON competitor_social_snapshots(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_comp_social_snap_competitor ON competitor_social_snapshots(competitor_id);

-- 6. Competitor Social Posts (notable samples)
CREATE TABLE IF NOT EXISTS competitor_social_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  post_type TEXT DEFAULT 'image',
  caption TEXT,
  post_url TEXT,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  screenshot_url TEXT,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_social_posts_restaurant ON competitor_social_posts(restaurant_id);

-- 7. Competitor Menu Items
CREATE TABLE IF NOT EXISTS competitor_menu_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  category TEXT,
  price NUMERIC(10,2),
  description TEXT,
  is_available BOOLEAN DEFAULT true,
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_menu_items_restaurant ON competitor_menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_comp_menu_items_competitor ON competitor_menu_items(competitor_id);

-- 8. Competitor Price History
CREATE TABLE IF NOT EXISTS competitor_price_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES competitor_menu_items(id) ON DELETE CASCADE,
  old_price NUMERIC(10,2),
  new_price NUMERIC(10,2),
  change_pct NUMERIC(8,2),
  detected_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_price_hist_restaurant ON competitor_price_history(restaurant_id);

-- 9. Competitor Promotions
CREATE TABLE IF NOT EXISTS competitor_promotions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  promo_type TEXT,
  start_date DATE,
  end_date DATE,
  channel TEXT,
  screenshot_url TEXT,
  notes TEXT,
  logged_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_promos_restaurant ON competitor_promotions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_comp_promos_competitor ON competitor_promotions(competitor_id);

-- 10. Local Search Rankings
CREATE TABLE IF NOT EXISTS local_search_rankings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  keyword_id UUID REFERENCES tracked_keywords(id) ON DELETE CASCADE,
  competitor_id UUID REFERENCES competitors(id) ON DELETE SET NULL,
  check_date DATE NOT NULL,
  organic_rank INTEGER,
  local_pack_position INTEGER,
  is_you BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_local_search_rankings_restaurant ON local_search_rankings(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_local_search_rankings_date ON local_search_rankings(check_date);

-- 11. Tracked Keywords (for competitor ranking comparison)
CREATE TABLE IF NOT EXISTS tracked_keywords (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  search_volume INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tracked_keywords_restaurant ON tracked_keywords(restaurant_id);

-- 12. Competitor Sentiment Trends
CREATE TABLE IF NOT EXISTS competitor_sentiment_trends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  topic TEXT,
  positive_pct NUMERIC(5,2) DEFAULT 0,
  neutral_pct NUMERIC(5,2) DEFAULT 0,
  negative_pct NUMERIC(5,2) DEFAULT 0,
  sample_size INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_sentiment_restaurant ON competitor_sentiment_trends(restaurant_id);

-- 13. Competitor Alerts
CREATE TABLE IF NOT EXISTS competitor_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  competitor_id UUID REFERENCES competitors(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL,
  condition_metric TEXT,
  condition_operator TEXT DEFAULT 'gt',
  condition_value NUMERIC(10,2),
  notify_via TEXT DEFAULT 'in_app',
  notify_email TEXT,
  is_enabled BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_alerts_restaurant ON competitor_alerts(restaurant_id);

-- 14. Competitor Alert History
CREATE TABLE IF NOT EXISTS competitor_alert_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  alert_id UUID REFERENCES competitor_alerts(id) ON DELETE CASCADE,
  competitor_id UUID REFERENCES competitors(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL,
  title TEXT,
  description TEXT,
  metric_value NUMERIC(10,2),
  action_taken TEXT,
  is_read BOOLEAN DEFAULT false,
  triggered_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_alert_hist_restaurant ON competitor_alert_history(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_comp_alert_hist_alert ON competitor_alert_history(alert_id);

-- 15. Competitor Benchmarks
CREATE TABLE IF NOT EXISTS competitor_benchmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  your_value NUMERIC(10,2),
  competitor_avg NUMERIC(10,2),
  competitor_best NUMERIC(10,2),
  competitor_worst NUMERIC(10,2),
  period_start DATE,
  period_end DATE,
  target_value NUMERIC(10,2),
  target_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_benchmarks_restaurant ON competitor_benchmarks(restaurant_id);
