-- ============================================
-- Phase B: SEO Feature Tables (12 tables)
-- Run in Supabase SQL Editor
-- ============================================

-- 1. GBP Listings
CREATE TABLE IF NOT EXISTS gbp_listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  google_place_id TEXT,
  name TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  categories JSONB DEFAULT '[]',
  hours JSONB DEFAULT '{}',
  special_hours JSONB DEFAULT '[]',
  attributes JSONB DEFAULT '{}',
  description TEXT,
  verification_status TEXT DEFAULT 'unverified',
  sync_status TEXT DEFAULT 'pending',
  last_synced_at TIMESTAMPTZ,
  insights JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gbp_listings_restaurant ON gbp_listings(restaurant_id);

-- 2. GBP Posts
CREATE TABLE IF NOT EXISTS gbp_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES gbp_listings(id) ON DELETE CASCADE,
  post_type TEXT DEFAULT 'standard',
  summary TEXT,
  cta_type TEXT,
  cta_url TEXT,
  media_url TEXT,
  status TEXT DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  google_post_id TEXT,
  insights JSONB DEFAULT '{}',
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gbp_posts_restaurant ON gbp_posts(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_gbp_posts_listing ON gbp_posts(listing_id);

-- 3. GBP Photos
CREATE TABLE IF NOT EXISTS gbp_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES gbp_listings(id) ON DELETE CASCADE,
  category TEXT DEFAULT 'other',
  url TEXT,
  google_photo_id TEXT,
  view_count INTEGER DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gbp_photos_restaurant ON gbp_photos(restaurant_id);

-- 4. GBP Questions
CREATE TABLE IF NOT EXISTS gbp_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES gbp_listings(id) ON DELETE CASCADE,
  question_text TEXT,
  author_name TEXT,
  asked_at TIMESTAMPTZ,
  answer_text TEXT,
  answered_by UUID REFERENCES employees(id),
  answered_at TIMESTAMPTZ,
  status TEXT DEFAULT 'unanswered',
  suggested_answer TEXT,
  google_question_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gbp_questions_restaurant ON gbp_questions(restaurant_id);

-- 5. SEO Keywords
CREATE TABLE IF NOT EXISTS seo_keywords (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  keyword_type TEXT DEFAULT 'custom',
  search_volume INTEGER,
  difficulty NUMERIC(5,2),
  is_tracked BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_restaurant ON seo_keywords(restaurant_id);

-- 6. Keyword Rankings
CREATE TABLE IF NOT EXISTS keyword_rankings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  keyword_id UUID REFERENCES seo_keywords(id) ON DELETE CASCADE,
  check_date DATE NOT NULL,
  organic_rank INTEGER,
  local_pack_position INTEGER,
  serp_features JSONB DEFAULT '[]',
  ranking_url TEXT,
  geo_point TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_keyword_rankings_restaurant ON keyword_rankings(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_keyword_rankings_keyword ON keyword_rankings(keyword_id);
CREATE INDEX IF NOT EXISTS idx_keyword_rankings_date ON keyword_rankings(check_date);

-- 7. Keyword Suggestions
CREATE TABLE IF NOT EXISTS keyword_suggestions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  suggestion_type TEXT DEFAULT 'auto',
  relevance_score NUMERIC(5,2),
  search_volume INTEGER,
  difficulty NUMERIC(5,2),
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_keyword_suggestions_restaurant ON keyword_suggestions(restaurant_id);

-- 8. Citations
CREATE TABLE IF NOT EXISTS citations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  source_id UUID REFERENCES citation_sources(id),
  listed_name TEXT,
  listed_address TEXT,
  listed_phone TEXT,
  listed_website TEXT,
  listing_url TEXT,
  nap_match_status TEXT DEFAULT 'unknown',
  last_checked_at TIMESTAMPTZ,
  fix_submitted_at TIMESTAMPTZ,
  fix_verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_citations_restaurant ON citations(restaurant_id);

-- 9. Citation Sources
CREATE TABLE IF NOT EXISTS citation_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT,
  importance_tier INTEGER DEFAULT 2,
  category TEXT DEFAULT 'directory',
  submit_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_citation_sources_restaurant ON citation_sources(restaurant_id);

-- 10. Canonical NAP
CREATE TABLE IF NOT EXISTS canonical_nap (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  website TEXT,
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_canonical_nap_restaurant ON canonical_nap(restaurant_id);

-- 11. Schema Markup
CREATE TABLE IF NOT EXISTS schema_markup (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  schema_type TEXT DEFAULT 'Restaurant',
  json_ld JSONB DEFAULT '{}',
  page_url TEXT,
  validation_status TEXT DEFAULT 'pending',
  validation_errors JSONB DEFAULT '[]',
  is_deployed BOOLEAN DEFAULT false,
  deployed_at TIMESTAMPTZ,
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schema_markup_restaurant ON schema_markup(restaurant_id);

-- Menu Schema Items (for schema generation)
CREATE TABLE IF NOT EXISTS menu_schema_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2),
  currency TEXT DEFAULT 'USD',
  category TEXT,
  dietary_flags JSONB DEFAULT '[]',
  image_url TEXT,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_menu_schema_items_restaurant ON menu_schema_items(restaurant_id);

-- 12. SEO Audits
CREATE TABLE IF NOT EXISTS seo_audits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  page_url TEXT,
  technical_score INTEGER,
  content_score INTEGER,
  local_seo_score INTEGER,
  overall_score INTEGER,
  core_web_vitals JSONB DEFAULT '{}',
  run_by UUID REFERENCES employees(id),
  run_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seo_audits_restaurant ON seo_audits(restaurant_id);

-- SEO Audit Issues
CREATE TABLE IF NOT EXISTS seo_audit_issues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  audit_id UUID REFERENCES seo_audits(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',
  description TEXT,
  fix_recommendation TEXT,
  is_fixed BOOLEAN DEFAULT false,
  fixed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seo_audit_issues_restaurant ON seo_audit_issues(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_seo_audit_issues_audit ON seo_audit_issues(audit_id);

-- Maps Optimization
CREATE TABLE IF NOT EXISTS maps_optimization (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES gbp_listings(id) ON DELETE CASCADE,
  pin_accuracy TEXT DEFAULT 'unknown',
  direction_requests INTEGER DEFAULT 0,
  phone_calls INTEGER DEFAULT 0,
  website_clicks INTEGER DEFAULT 0,
  discovery_direct INTEGER DEFAULT 0,
  discovery_category INTEGER DEFAULT 0,
  discovery_maps INTEGER DEFAULT 0,
  photo_views JSONB DEFAULT '{}',
  snapshot_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maps_optimization_restaurant ON maps_optimization(restaurant_id);
