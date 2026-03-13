-- ============================================
-- Phase E: Loyalty & Promos Tables (11 tables)
-- Run in Supabase SQL Editor
-- ============================================

-- 1. Loyalty Programs
CREATE TABLE IF NOT EXISTS loyalty_programs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  program_type TEXT DEFAULT 'points',
  points_per_dollar NUMERIC(5,2) DEFAULT 1,
  points_per_visit INTEGER DEFAULT 0,
  visit_min_spend NUMERIC(10,2) DEFAULT 0,
  currency_name TEXT DEFAULT 'Points',
  enrollment_bonus INTEGER DEFAULT 0,
  referral_bonus INTEGER DEFAULT 0,
  birthday_bonus INTEGER DEFAULT 0,
  scope TEXT DEFAULT 'chain_wide',
  status TEXT DEFAULT 'active',
  terms_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_restaurant ON loyalty_programs(restaurant_id);

-- 2. Loyalty Tiers
CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  program_id UUID REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tier_order INTEGER DEFAULT 0,
  qualification_threshold NUMERIC(10,2) DEFAULT 0,
  maintain_threshold NUMERIC(10,2) DEFAULT 0,
  qualification_metric TEXT DEFAULT 'spend',
  qualification_period_months INTEGER DEFAULT 12,
  points_multiplier NUMERIC(5,2) DEFAULT 1.0,
  perks JSONB DEFAULT '[]',
  color TEXT DEFAULT '#6b7280',
  icon TEXT DEFAULT 'award',
  grace_period_days INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_tiers_restaurant ON loyalty_tiers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_tiers_program ON loyalty_tiers(program_id);

-- 3. Loyalty Rewards
CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  program_id UUID REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  reward_type TEXT DEFAULT 'free_item',
  points_required INTEGER NOT NULL,
  dollar_value NUMERIC(10,2) DEFAULT 0,
  min_tier_id UUID REFERENCES loyalty_tiers(id) ON DELETE SET NULL,
  menu_item TEXT,
  discount_pct NUMERIC(5,2),
  discount_amount NUMERIC(10,2),
  image_url TEXT,
  availability_start DATE,
  availability_end DATE,
  max_redemptions_total INTEGER,
  max_redemptions_per_member INTEGER,
  max_per_period TEXT,
  display_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  total_redeemed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_restaurant ON loyalty_rewards(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_program ON loyalty_rewards(program_id);

-- 4. Loyalty Members
CREATE TABLE IF NOT EXISTS loyalty_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  program_id UUID REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  birthday DATE,
  enrollment_date DATE DEFAULT CURRENT_DATE,
  enrollment_source TEXT DEFAULT 'staff_entry',
  points_balance INTEGER DEFAULT 0,
  points_lifetime INTEGER DEFAULT 0,
  visit_count INTEGER DEFAULT 0,
  total_spend NUMERIC(10,2) DEFAULT 0,
  avg_order_value NUMERIC(10,2) DEFAULT 0,
  tier_id UUID REFERENCES loyalty_tiers(id) ON DELETE SET NULL,
  tier_qualified_at TIMESTAMPTZ,
  preferred_location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  tags JSONB DEFAULT '[]',
  notes TEXT,
  status TEXT DEFAULT 'active',
  last_visit_at TIMESTAMPTZ,
  referred_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_members_restaurant ON loyalty_members(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_members_program ON loyalty_members(program_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_members_email ON loyalty_members(email);
CREATE INDEX IF NOT EXISTS idx_loyalty_members_phone ON loyalty_members(phone);
CREATE INDEX IF NOT EXISTS idx_loyalty_members_tier ON loyalty_members(tier_id);

-- 5. Loyalty Transactions
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  member_id UUID REFERENCES loyalty_members(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL,
  points INTEGER NOT NULL,
  balance_after INTEGER,
  description TEXT,
  order_total NUMERIC(10,2),
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'manual',
  reference_id TEXT,
  reason TEXT,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_restaurant ON loyalty_transactions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_member ON loyalty_transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_type ON loyalty_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_date ON loyalty_transactions(created_at);

-- 6. Promotions
CREATE TABLE IF NOT EXISTS promotions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  promo_type TEXT NOT NULL,
  code TEXT,
  discount_pct NUMERIC(5,2),
  discount_amount NUMERIC(10,2),
  max_discount NUMERIC(10,2),
  min_order NUMERIC(10,2) DEFAULT 0,
  buy_quantity INTEGER,
  get_quantity INTEGER,
  get_discount_pct NUMERIC(5,2),
  free_item TEXT,
  applicable_items JSONB DEFAULT '[]',
  scope TEXT DEFAULT 'chain_wide',
  scope_location_ids JSONB DEFAULT '[]',
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  recurrence_rule JSONB,
  max_redemptions_total INTEGER,
  max_redemptions_per_customer INTEGER,
  is_stackable BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'draft',
  total_redeemed INTEGER DEFAULT 0,
  total_revenue NUMERIC(10,2) DEFAULT 0,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_promotions_restaurant ON promotions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_promotions_code ON promotions(code);
CREATE INDEX IF NOT EXISTS idx_promotions_status ON promotions(status);

-- 7. Promotion Codes (individual/bulk unique codes)
CREATE TABLE IF NOT EXISTS promotion_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  promotion_id UUID REFERENCES promotions(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  is_used BOOLEAN DEFAULT false,
  used_at TIMESTAMPTZ,
  used_by TEXT,
  batch_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_promotion_codes_restaurant ON promotion_codes(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_promotion_codes_promotion ON promotion_codes(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_codes_code ON promotion_codes(code);

-- 8. Promotion Redemptions
CREATE TABLE IF NOT EXISTS promotion_redemptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  promotion_id UUID REFERENCES promotions(id) ON DELETE CASCADE,
  code_id UUID REFERENCES promotion_codes(id) ON DELETE SET NULL,
  code_used TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  member_id UUID REFERENCES loyalty_members(id) ON DELETE SET NULL,
  order_total NUMERIC(10,2),
  discount_applied NUMERIC(10,2),
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  redeemed_via TEXT DEFAULT 'manual_entry',
  redeemed_by UUID REFERENCES employees(id),
  redeemed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_restaurant ON promotion_redemptions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promotion ON promotion_redemptions(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_date ON promotion_redemptions(redeemed_at);

-- 9. Promotion Distributions
CREATE TABLE IF NOT EXISTS promotion_distributions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  promotion_id UUID REFERENCES promotions(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  recipients INTEGER DEFAULT 0,
  opens INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  redemptions INTEGER DEFAULT 0,
  cost NUMERIC(10,2) DEFAULT 0,
  sent_at TIMESTAMPTZ DEFAULT now(),
  sent_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_promo_distributions_restaurant ON promotion_distributions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_promo_distributions_promotion ON promotion_distributions(promotion_id);

-- 10. Automated Triggers
CREATE TABLE IF NOT EXISTS automated_triggers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  days_before INTEGER DEFAULT 0,
  days_after INTEGER DEFAULT 0,
  inactivity_days INTEGER,
  milestone_metric TEXT,
  milestone_value NUMERIC(10,2),
  promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL,
  bonus_points INTEGER DEFAULT 0,
  message_template TEXT,
  channel TEXT DEFAULT 'sms',
  is_enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  total_sent INTEGER DEFAULT 0,
  total_redeemed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automated_triggers_restaurant ON automated_triggers(restaurant_id);

-- 11. POS Integrations (future)
CREATE TABLE IF NOT EXISTS pos_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  pos_system TEXT,
  api_key TEXT,
  webhook_url TEXT,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'disconnected',
  last_synced_at TIMESTAMPTZ,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_integrations_restaurant ON pos_integrations(restaurant_id);
