-- ============================================
-- Phase G: Gifting, Events, Hashtags, Review AI
-- ============================================

-- 1. Influencer Gifts / Comps
CREATE TABLE IF NOT EXISTS influencer_gifts (
  id BIGSERIAL PRIMARY KEY,
  influencer_id BIGINT NOT NULL,
  restaurant_id UUID,
  type TEXT NOT NULL DEFAULT 'meal',       -- meal, gift_card, product, experience
  description TEXT,
  value NUMERIC(10,2) DEFAULT 0,
  sent_date DATE,
  status TEXT DEFAULT 'pending',           -- pending, sent, received, posted
  follow_up_date DATE,
  follow_up_done BOOLEAN DEFAULT false,
  linked_post_id BIGINT,
  notes TEXT,
  created_by BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_influencer_gifts_influencer ON influencer_gifts(influencer_id);
CREATE INDEX IF NOT EXISTS idx_influencer_gifts_status ON influencer_gifts(status);

-- 2. Events
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'tasting',    -- tasting, launch, event, meetup
  date DATE NOT NULL,
  time TEXT,
  restaurant_id UUID,
  location TEXT,
  description TEXT,
  capacity INT DEFAULT 0,
  status TEXT DEFAULT 'draft',             -- draft, published, cancelled, completed
  notes TEXT,
  created_by BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

-- 3. Event Invites
CREATE TABLE IF NOT EXISTS event_invites (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL,
  influencer_id BIGINT NOT NULL,
  status TEXT DEFAULT 'invited',           -- invited, confirmed, declined, attended, no_show
  rsvp_date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_invites_event ON event_invites(event_id);
CREATE INDEX IF NOT EXISTS idx_event_invites_influencer ON event_invites(influencer_id);

-- 4. Hashtags
CREATE TABLE IF NOT EXISTS hashtags (
  id BIGSERIAL PRIMARY KEY,
  hashtag TEXT NOT NULL,
  platform TEXT DEFAULT 'instagram',
  is_branded BOOLEAN DEFAULT false,
  total_posts INT DEFAULT 0,
  total_reach BIGINT DEFAULT 0,
  last_seen DATE,
  restaurant_id UUID,
  notes TEXT,
  created_by BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hashtags_branded ON hashtags(is_branded);

-- 5. UGC Posts (User-Generated Content)
CREATE TABLE IF NOT EXISTS ugc_posts (
  id BIGSERIAL PRIMARY KEY,
  hashtag_id BIGINT,
  platform TEXT,
  author_handle TEXT,
  post_url TEXT,
  caption TEXT,
  reach BIGINT DEFAULT 0,
  engagement BIGINT DEFAULT 0,
  restaurant_id UUID,
  spotted_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ugc_posts_hashtag ON ugc_posts(hashtag_id);

-- 6. Add AI draft columns to reviews
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS ai_draft_response TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS response_tone TEXT;
