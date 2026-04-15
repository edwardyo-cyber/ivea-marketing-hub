/* ============================================
   mock-data.js — Demo / Preview Data
   Intercepts all db calls and returns fake data
   so every section of the app renders with content.
   ============================================ */

const MOCK = {
  restaurants: [
    { id: 1, name: 'Ivea Downtown', address: '123 Main St, Los Angeles, CA 90012', phone: '(213) 555-0101', email: 'downtown@ivea.com', google_place_id: 'ChIJ_fake_1', city: 'Los Angeles', state: 'CA', zip: '90012', cuisine: 'Mediterranean', is_active: true, created_at: '2024-01-01T00:00:00Z' },
    { id: 2, name: 'Ivea West Hollywood', address: '456 Sunset Blvd, West Hollywood, CA 90069', phone: '(323) 555-0202', email: 'weho@ivea.com', google_place_id: 'ChIJ_fake_2', city: 'West Hollywood', state: 'CA', zip: '90069', cuisine: 'Mediterranean', is_active: true, created_at: '2024-02-01T00:00:00Z' },
    { id: 3, name: 'Ivea Santa Monica', address: '789 Ocean Ave, Santa Monica, CA 90401', phone: '(310) 555-0303', email: 'sm@ivea.com', google_place_id: 'ChIJ_fake_3', city: 'Santa Monica', state: 'CA', zip: '90401', cuisine: 'Mediterranean', is_active: true, created_at: '2024-03-01T00:00:00Z' },
  ],

  content_posts: [
    { id: 1, title: 'Summer Mezze Board 🌿', body: 'Beat the heat with our legendary mezze board — hummus, tabbouleh, fresh pita, and more. Perfect for sharing. Available all summer long. #IveaEats #MediterraneanFood #LA', tags: ['summer','mezze','food'], platform: 'instagram', status: 'published', restaurant_id: 1, created_at: '2026-04-01T10:00:00Z', scheduled_at: null },
    { id: 2, title: 'New Happy Hour Menu', body: 'Happy hour just got happier 🍷 Join us Mon–Fri 3–6pm for half-price wines and discounted small plates. Tag a friend you\'d bring!', tags: ['happyhour','wine','deals'], platform: 'instagram', status: 'published', restaurant_id: 2, created_at: '2026-03-28T09:00:00Z', scheduled_at: null },
    { id: 3, title: 'Chef\'s Table Event Announcement', body: 'We\'re hosting an exclusive Chef\'s Table dinner on April 20th. 6 courses, wine pairings, and an intimate evening with Chef Youssef. Limited seats — DM to reserve.', tags: ['chefstable','finedining','exclusive'], platform: 'instagram', status: 'draft', restaurant_id: 1, created_at: '2026-04-05T14:00:00Z', scheduled_at: '2026-04-15T12:00:00Z' },
    { id: 4, title: 'Weekend Brunch Launch 🥂', body: 'Brunch is officially here! Saturdays & Sundays 10am–3pm. Shakshuka, avocado toast, bottomless mimosas and more. Reserve your table now via link in bio.', tags: ['brunch','weekend','mimosas'], platform: 'facebook', status: 'published', restaurant_id: 3, created_at: '2026-03-20T08:00:00Z', scheduled_at: null },
    { id: 5, title: 'Behind the Scenes: Kitchen Stories', body: 'Ever wonder what goes into your favourite dish? 🎬 Watch our head chef walk through the making of our signature lamb kofta from scratch. Full video on YouTube.', tags: ['behindthescenes','kitchen','chef'], platform: 'tiktok', status: 'published', restaurant_id: 2, created_at: '2026-03-15T11:00:00Z', scheduled_at: null },
    { id: 6, title: 'Mother\'s Day Pre-Order', body: 'Treat mom to something special 💐 Pre-order our Mother\'s Day catering package — feeds 6–8 people and includes a complimentary dessert platter. Order by May 5th.', tags: ['mothersday','catering','family'], platform: 'instagram', status: 'draft', restaurant_id: 1, created_at: '2026-04-08T10:00:00Z', scheduled_at: '2026-05-01T12:00:00Z' },
  ],

  campaigns: [
    { id: 1, name: 'Summer Launch 2026', status: 'active', budget: 5000, spent: 2340, start_date: '2026-06-01', end_date: '2026-08-31', platform: 'instagram', restaurant_id: 1, goal: 'brand_awareness', impressions: 48200, clicks: 1820, conversions: 94, created_at: '2026-05-15T00:00:00Z' },
    { id: 2, name: 'Happy Hour Promo', status: 'active', budget: 1500, spent: 890, start_date: '2026-03-01', end_date: '2026-05-31', platform: 'facebook', restaurant_id: 2, goal: 'traffic', impressions: 22100, clicks: 940, conversions: 61, created_at: '2026-02-20T00:00:00Z' },
    { id: 3, name: 'Brunch Weekend Blast', status: 'completed', budget: 2000, spent: 1980, start_date: '2026-02-01', end_date: '2026-03-31', platform: 'instagram', restaurant_id: 3, goal: 'conversions', impressions: 31500, clicks: 2100, conversions: 188, created_at: '2026-01-25T00:00:00Z' },
    { id: 4, name: 'Chef\'s Table Awareness', status: 'draft', budget: 3000, spent: 0, start_date: '2026-04-20', end_date: '2026-05-20', platform: 'google', restaurant_id: 1, goal: 'brand_awareness', impressions: 0, clicks: 0, conversions: 0, created_at: '2026-04-09T00:00:00Z' },
  ],

  email_campaigns: [
    { id: 1, name: 'April Newsletter', subject: 'What\'s New at Ivea 🌿', status: 'sent', sent_at: '2026-04-01T10:00:00Z', opens: 1240, clicks: 380, unsubscribes: 8, recipient_count: 4200, restaurant_id: null, created_at: '2026-03-28T00:00:00Z' },
    { id: 2, name: 'Happy Hour Announcement', subject: 'Half-price wine starts NOW 🍷', status: 'sent', sent_at: '2026-03-25T15:00:00Z', opens: 980, clicks: 290, unsubscribes: 3, recipient_count: 3800, restaurant_id: 2, created_at: '2026-03-24T00:00:00Z' },
    { id: 3, name: 'Mother\'s Day Promotion', subject: 'Treat Mom to the Best 💐', status: 'draft', sent_at: null, opens: 0, clicks: 0, unsubscribes: 0, recipient_count: 0, restaurant_id: null, created_at: '2026-04-08T00:00:00Z' },
  ],

  influencers: [
    { id: 1, name: 'Sofia Reyes', handle: '@sofiaeatslа', platform: 'instagram', followers: 142000, engagement_rate: 4.2, pipeline_stage: 'contracted', category: 'food', email: 'sofia@reyes.media', phone: '(323) 555-1001', rate: 1200, last_contacted: '2026-04-02T00:00:00Z', notes: 'Loves Mediterranean cuisine, very responsive.', created_at: '2025-11-01T00:00:00Z' },
    { id: 2, name: 'Marcus Chen', handle: '@marcusfoodtours', platform: 'tiktok', followers: 89000, engagement_rate: 6.8, pipeline_stage: 'negotiation', category: 'food', email: 'marcus@chenfood.com', phone: '(213) 555-1002', rate: 800, last_contacted: '2026-03-30T00:00:00Z', notes: 'Strong TikTok presence, younger audience 18-24.', created_at: '2025-12-01T00:00:00Z' },
    { id: 3, name: 'Aisha Williams', handle: '@aishaeatswell', platform: 'instagram', followers: 215000, engagement_rate: 3.1, pipeline_stage: 'prospect', category: 'lifestyle', email: 'aisha@williamspr.com', phone: null, rate: 2500, last_contacted: '2026-03-15T00:00:00Z', notes: 'Premium lifestyle creator, focus on wellness.', created_at: '2026-01-05T00:00:00Z' },
    { id: 4, name: 'Jake Moreno', handle: '@jakeeatsla', platform: 'youtube', followers: 54000, engagement_rate: 5.5, pipeline_stage: 'completed', category: 'food', email: 'jake@morenomedia.com', phone: '(310) 555-1004', rate: 600, last_contacted: '2026-02-10T00:00:00Z', notes: 'Great for long-form restaurant reviews.', created_at: '2025-10-15T00:00:00Z' },
    { id: 5, name: 'Priya Nair', handle: '@priyafoodie', platform: 'instagram', followers: 78000, engagement_rate: 7.2, pipeline_stage: 'contracted', category: 'food', email: 'priya@nairmedia.com', phone: '(818) 555-1005', rate: 750, last_contacted: '2026-04-05T00:00:00Z', notes: 'Highly engaged micro-influencer, authentic content.', created_at: '2026-02-01T00:00:00Z' },
  ],

  influencer_posts: [
    // Sofia Reyes (id:1) — 6 posts → GOLD tier
    { id: 1,  influencer_id: 1, title: 'Mezze Night at Ivea', platform: 'instagram', post_url: 'https://instagram.com/p/fake1', posted_at: '2026-03-20T18:00:00Z', views: 28400, likes: 3100, comments: 142, saves: 890, reach: 41200, status: 'published', restaurant_id: 1 },
    { id: 5,  influencer_id: 1, title: 'Happy Hour at Ivea WeHo', platform: 'instagram', post_url: 'https://instagram.com/p/fake5', posted_at: '2026-02-10T17:00:00Z', views: 22100, likes: 2400, comments: 98, saves: 610, reach: 33000, status: 'published', restaurant_id: 2 },
    { id: 6,  influencer_id: 1, title: 'Sunday Brunch 🥂', platform: 'instagram', post_url: 'https://instagram.com/p/fake6', posted_at: '2026-01-18T11:00:00Z', views: 19800, likes: 2100, comments: 87, saves: 540, reach: 28000, status: 'published', restaurant_id: 3 },
    { id: 7,  influencer_id: 1, title: 'Chef Youssef Behind the Scenes', platform: 'instagram', post_url: 'https://instagram.com/p/fake7', posted_at: '2025-12-05T14:00:00Z', views: 31000, likes: 3400, comments: 160, saves: 980, reach: 46000, status: 'published', restaurant_id: 1 },
    { id: 8,  influencer_id: 1, title: 'Holiday Mezze Special', platform: 'instagram', post_url: 'https://instagram.com/p/fake8', posted_at: '2025-11-20T16:00:00Z', views: 25000, likes: 2700, comments: 110, saves: 720, reach: 37000, status: 'published', restaurant_id: 1 },
    { id: 9,  influencer_id: 1, title: 'Fall Menu Launch', platform: 'instagram', post_url: 'https://instagram.com/p/fake9', posted_at: '2025-10-01T12:00:00Z', views: 18600, likes: 1980, comments: 74, saves: 490, reach: 27000, status: 'published', restaurant_id: 2 },
    // Marcus Chen (id:2) — 3 posts → SILVER tier
    { id: 2,  influencer_id: 2, title: 'Ivea TikTok Takeover', platform: 'tiktok', post_url: 'https://tiktok.com/@marcusfoodtours/fake2', posted_at: '2026-03-25T20:00:00Z', views: 94000, likes: 7200, comments: 340, saves: 1200, reach: 94000, status: 'published', restaurant_id: 2 },
    { id: 10, influencer_id: 2, title: 'Best Lamb Kofta in LA?', platform: 'tiktok', post_url: 'https://tiktok.com/@marcusfoodtours/fake10', posted_at: '2026-01-14T19:00:00Z', views: 61000, likes: 4900, comments: 210, saves: 880, reach: 61000, status: 'published', restaurant_id: 1 },
    { id: 11, influencer_id: 2, title: 'Ivea Santa Monica Brunch Review', platform: 'tiktok', post_url: 'https://tiktok.com/@marcusfoodtours/fake11', posted_at: '2025-12-18T20:00:00Z', views: 48000, likes: 3600, comments: 175, saves: 720, reach: 48000, status: 'published', restaurant_id: 3 },
    // Jake Moreno (id:4) — 4 posts → SILVER tier
    { id: 4,  influencer_id: 4, title: 'Full Restaurant Review: Ivea Downtown', platform: 'youtube', post_url: 'https://youtube.com/watch?v=fake4', posted_at: '2026-02-15T14:00:00Z', views: 22000, likes: 980, comments: 87, saves: 0, reach: 22000, status: 'published', restaurant_id: 1 },
    { id: 12, influencer_id: 4, title: 'Ivea WeHo — Is the Hype Real?', platform: 'youtube', post_url: 'https://youtube.com/watch?v=fake12', posted_at: '2025-11-10T15:00:00Z', views: 18400, likes: 810, comments: 64, saves: 0, reach: 18400, status: 'published', restaurant_id: 2 },
    { id: 13, influencer_id: 4, title: 'Mediterranean Hidden Gems in LA', platform: 'youtube', post_url: 'https://youtube.com/watch?v=fake13', posted_at: '2025-09-22T14:00:00Z', views: 31000, likes: 1400, comments: 112, saves: 0, reach: 31000, status: 'published', restaurant_id: 1 },
    { id: 14, influencer_id: 4, title: 'Ivea Brunch — Worth the Wait?', platform: 'youtube', post_url: 'https://youtube.com/watch?v=fake14', posted_at: '2025-08-05T13:00:00Z', views: 14200, likes: 620, comments: 48, saves: 0, reach: 14200, status: 'published', restaurant_id: 3 },
    // Priya Nair (id:5) — 2 posts → BRONZE tier
    { id: 3,  influencer_id: 5, title: 'Brunch Vibes 🌸', platform: 'instagram', post_url: 'https://instagram.com/p/fake3', posted_at: '2026-04-06T11:00:00Z', views: 12000, likes: 1840, comments: 96, saves: 420, reach: 18000, status: 'published', restaurant_id: 3 },
    { id: 15, influencer_id: 5, title: 'Ivea Downtown — First Impressions', platform: 'instagram', post_url: 'https://instagram.com/p/fake15', posted_at: '2026-03-01T10:00:00Z', views: 9400, likes: 1340, comments: 62, saves: 290, reach: 13500, status: 'published', restaurant_id: 1 },
    // Aisha Williams (id:3) — 0 posts → no tier yet
  ],

  influencer_payments: [
    { id: 1, influencer_id: 1, amount: 1200, status: 'paid', paid_at: '2026-03-25T00:00:00Z', description: 'March Instagram post — mezze campaign', created_at: '2026-03-01T00:00:00Z' },
    { id: 2, influencer_id: 2, amount: 800, status: 'pending', paid_at: null, description: 'TikTok takeover — April campaign', created_at: '2026-04-01T00:00:00Z' },
    { id: 3, influencer_id: 4, amount: 600, status: 'paid', paid_at: '2026-02-20T00:00:00Z', description: 'YouTube review — Downtown location', created_at: '2026-02-01T00:00:00Z' },
    { id: 4, influencer_id: 5, amount: 750, status: 'paid', paid_at: '2026-04-08T00:00:00Z', description: 'Brunch Instagram post', created_at: '2026-04-01T00:00:00Z' },
  ],

  influencer_interactions: [
    { id: 1, influencer_id: 1, type: 'email', notes: 'Sent campaign brief for summer mezze collab. She\'s interested.', created_at: '2026-04-02T10:00:00Z' },
    { id: 2, influencer_id: 2, type: 'dm', notes: 'Followed up on TikTok rate negotiation. Waiting on counter-offer.', created_at: '2026-03-30T14:00:00Z' },
    { id: 3, influencer_id: 3, type: 'email', notes: 'Sent intro email with media kit and partnership overview.', created_at: '2026-03-15T09:00:00Z' },
    { id: 4, influencer_id: 5, type: 'call', notes: 'Called to confirm brunch shoot date. Confirmed for April 6.', created_at: '2026-04-04T11:00:00Z' },
  ],

  influencer_milestones: [
    { id: 1, influencer_id: 1, title: 'First Post Published', achieved_at: '2026-03-20T00:00:00Z', notes: 'Mezze campaign post went live' },
    { id: 2, influencer_id: 4, title: 'Review Video Hit 20K Views', achieved_at: '2026-02-22T00:00:00Z', notes: 'Downtown review crossed 20K in one week' },
  ],

  influencer_ambassador_tiers: [
    { id: 1, name: 'Bronze', min_collabs: 1, benefits: 'Complimentary meal for 2', sort_order: 1, color: '#cd7f32', rate_bonus_percent: 5 },
    { id: 2, name: 'Silver', min_collabs: 3, benefits: 'Comp meal + 20% off personal dining', sort_order: 2, color: '#c0c0c0', rate_bonus_percent: 10 },
    { id: 3, name: 'Gold', min_collabs: 6, benefits: 'Comp meals + event invites + co-branded content', sort_order: 3, color: '#ffd700', rate_bonus_percent: 15 },
  ],

  outreach_templates: [
    { id: 1, name: 'Initial Intro', subject: 'Collab Opportunity — Ivea Restaurant Group', body: 'Hi {{name}},\n\nWe\'re huge fans of your content and think you\'d be a perfect fit for Ivea Restaurant Group. We\'d love to explore a collaboration around our new summer menu.\n\nWould you be open to a quick chat?\n\nBest,\nThe Ivea Team', created_at: '2026-01-01T00:00:00Z' },
    { id: 2, name: 'Follow-Up', subject: 'Following up — Ivea Collab', body: 'Hi {{name}},\n\nJust circling back on our previous message! We\'d love to partner with you for an upcoming campaign. Let us know if you have any questions.\n\nBest,\nThe Ivea Team', created_at: '2026-01-15T00:00:00Z' },
    { id: 3, name: 'Campaign Brief', subject: 'Campaign Brief — Ivea Summer 2026', body: 'Hi {{name}},\n\nPlease find attached the full brief for our Summer 2026 campaign. Key deliverables: 1x feed post, 2x stories. Compensation: ${{rate}}.\n\nLet us know if you\'re in!\n\nThe Ivea Team', created_at: '2026-02-01T00:00:00Z' },
  ],

  outreach_log: [
    { id: 1, influencer_id: 1, template_id: 1, channel: 'email', status: 'replied', sent_at: '2026-03-10T10:00:00Z', notes: 'She replied positively within 24h' },
    { id: 2, influencer_id: 2, template_id: 1, channel: 'dm', status: 'sent', sent_at: '2026-03-28T14:00:00Z', notes: 'Sent via TikTok DM' },
    { id: 3, influencer_id: 3, template_id: 1, channel: 'email', status: 'no_reply', sent_at: '2026-03-15T09:00:00Z', notes: 'No response yet' },
    { id: 4, influencer_id: 5, template_id: 3, channel: 'email', status: 'replied', sent_at: '2026-04-01T09:00:00Z', notes: 'Confirmed and signed off on brief' },
  ],

  events: [
    { id: 1, title: 'Chef\'s Table Dinner', description: 'An exclusive 6-course tasting menu with wine pairings hosted by Chef Youssef.', date: '2026-04-20', time: '7:00 PM', location: 'Ivea Downtown', capacity: 12, rsvps: 9, status: 'upcoming', restaurant_id: 1, created_at: '2026-04-01T00:00:00Z' },
    { id: 2, title: 'Wine & Mezze Evening', description: 'A relaxed evening of curated wines paired with our full mezze spread. Perfect for groups.', date: '2026-05-10', time: '6:30 PM', location: 'Ivea West Hollywood', capacity: 30, rsvps: 18, status: 'upcoming', restaurant_id: 2, created_at: '2026-04-05T00:00:00Z' },
    { id: 3, title: 'Brunch Pop-Up: Santa Monica', description: 'One-time outdoor brunch pop-up on the patio. Live music, bottomless mimosas, full menu.', date: '2026-03-15', time: '10:00 AM', location: 'Ivea Santa Monica', capacity: 60, rsvps: 58, status: 'completed', restaurant_id: 3, created_at: '2026-02-20T00:00:00Z' },
  ],

  event_invites: [
    { id: 1, event_id: 1, name: 'Sofia Reyes', email: 'sofia@reyes.media', status: 'confirmed', rsvp_token: 'tok_abc123def456', email_sent: true, email_sent_at: '2026-04-02T10:00:00Z', rsvp_date: '2026-04-02T14:22:00Z', created_at: '2026-04-02T00:00:00Z' },
    { id: 2, event_id: 1, name: 'Priya Nair', email: 'priya@nairmedia.com', status: 'confirmed', rsvp_token: 'tok_ghi789jkl012', email_sent: true, email_sent_at: '2026-04-03T09:30:00Z', rsvp_date: '2026-04-03T16:45:00Z', created_at: '2026-04-03T00:00:00Z' },
    { id: 3, event_id: 2, name: 'Marcus Chen', email: 'marcus@chenfood.com', status: 'pending', rsvp_token: 'tok_mno345pqr678', email_sent: true, email_sent_at: '2026-04-06T11:00:00Z', rsvp_date: null, created_at: '2026-04-06T00:00:00Z' },
  ],

  media_contacts: [
    { id: 1, name: 'Rachel Kim', outlet: 'LA Times Food', email: 'rkim@latimes.com', phone: '(213) 555-2001', beat: 'Restaurant Reviews', last_contacted: '2026-03-01T00:00:00Z', notes: 'Covered our opening. Very positive review.', created_at: '2025-09-01T00:00:00Z' },
    { id: 2, name: 'Derek Santos', outlet: 'Eater LA', email: 'dsantos@eater.com', phone: null, beat: 'Openings & Events', last_contacted: '2026-02-15T00:00:00Z', notes: 'Interested in Chef\'s Table story.', created_at: '2025-10-01T00:00:00Z' },
    { id: 3, name: 'Jenna Park', outlet: 'Los Angeles Magazine', email: 'jpark@lamag.com', phone: '(323) 555-2003', beat: 'Food & Drink', last_contacted: '2026-01-20T00:00:00Z', notes: 'Pitched summer feature — awaiting response.', created_at: '2025-11-01T00:00:00Z' },
  ],

  reviews: [
    { id: 1, restaurant_id: 1, platform: 'google', author: 'Emily T.', rating: 5, text: 'Absolutely incredible food. The lamb kofta is the best I\'ve had outside of Lebanon. Service was warm and attentive. Will be back!', published_at: '2026-04-05T00:00:00Z', responded: false, sentiment: 'positive' },
    { id: 2, restaurant_id: 2, platform: 'yelp', author: 'Michael B.', rating: 4, text: 'Great atmosphere and the mezze board is perfect for groups. The wine selection is solid. Only knock is the wait on a Saturday night.', published_at: '2026-04-03T00:00:00Z', responded: true, sentiment: 'positive' },
    { id: 3, restaurant_id: 3, platform: 'google', author: 'Sarah L.', rating: 2, text: 'Food was okay but service was really slow. Waited 45 minutes for our mains. The location is beautiful but won\'t rush back.', published_at: '2026-04-01T00:00:00Z', responded: false, sentiment: 'negative' },
    { id: 4, restaurant_id: 1, platform: 'google', author: 'James R.', rating: 5, text: 'Hidden gem! We came for a birthday dinner and the chef sent out a complimentary dessert. That\'s the kind of hospitality you rarely see anymore.', published_at: '2026-03-28T00:00:00Z', responded: true, sentiment: 'positive' },
    { id: 5, restaurant_id: 2, platform: 'tripadvisor', author: 'Anna M.', rating: 3, text: 'Decent food, nothing extraordinary. Prices feel a bit steep for the portion sizes. The drinks are excellent though.', published_at: '2026-03-25T00:00:00Z', responded: false, sentiment: 'neutral' },
  ],

  social_accounts: [
    { id: 1, platform: 'instagram', handle: '@iveadowntown', followers: 18400, following: 820, posts: 312, avg_reach: 6200, avg_engagement: 4.1, restaurant_id: 1, connected: true, created_at: '2024-01-01T00:00:00Z' },
    { id: 2, platform: 'instagram', handle: '@iveaweho', followers: 12100, following: 540, posts: 198, avg_reach: 4100, avg_engagement: 3.8, restaurant_id: 2, connected: true, created_at: '2024-02-01T00:00:00Z' },
    { id: 3, platform: 'tiktok', handle: '@ivearestaurants', followers: 9800, following: 120, posts: 87, avg_reach: 22000, avg_engagement: 8.4, restaurant_id: null, connected: true, created_at: '2024-06-01T00:00:00Z' },
    { id: 4, platform: 'facebook', handle: 'Ivea Restaurant Group', followers: 6200, following: 0, posts: 420, avg_reach: 2800, avg_engagement: 1.9, restaurant_id: null, connected: true, created_at: '2023-01-01T00:00:00Z' },
  ],

  employees: [
    { id: 1, name: 'Chris Yum', email: 'chris@ivea.com', role: 'admin', restaurant_id: null, pin: '0000', is_active: true, created_at: '2024-01-01T00:00:00Z' },
    { id: 2, name: 'Maria Lopez', email: 'maria@ivea.com', role: 'manager', restaurant_id: 1, pin: '1111', is_active: true, created_at: '2024-01-15T00:00:00Z' },
    { id: 3, name: 'David Park', email: 'david@ivea.com', role: 'marketing', restaurant_id: null, pin: '2222', is_active: true, created_at: '2024-02-01T00:00:00Z' },
    { id: 4, name: 'Nina Okafor', email: 'nina@ivea.com', role: 'manager', restaurant_id: 2, pin: '3333', is_active: true, created_at: '2024-03-01T00:00:00Z' },
  ],

  assets: [
    { id: 1, name: 'Mezze Board Hero', type: 'image', url: 'https://images.unsplash.com/photo-1541014741259-de529411b96a?w=800', tags: ['food','mezze'], restaurant_id: 1, created_at: '2026-03-01T00:00:00Z' },
    { id: 2, name: 'Restaurant Interior', type: 'image', url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800', tags: ['interior','ambiance'], restaurant_id: 1, created_at: '2026-02-15T00:00:00Z' },
    { id: 3, name: 'Brunch Spread', type: 'image', url: 'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=800', tags: ['brunch','food'], restaurant_id: 3, created_at: '2026-03-20T00:00:00Z' },
  ],

  contact_lists: [
    { id: 1, name: 'All Subscribers', count: 4200, created_at: '2024-01-01T00:00:00Z' },
    { id: 2, name: 'Loyalty Members', count: 1840, created_at: '2024-06-01T00:00:00Z' },
    { id: 3, name: 'VIP Guests', count: 320, created_at: '2024-09-01T00:00:00Z' },
  ],

  activity_log: [
    { id: 1, user_id: 1, action: 'publish_post', description: 'Published "Summer Mezze Board" to Instagram', created_at: '2026-04-01T10:05:00Z' },
    { id: 2, user_id: 3, action: 'add_influencer', description: 'Added influencer: @sofiaeatslа', created_at: '2026-03-30T09:00:00Z' },
    { id: 3, user_id: 1, action: 'send_campaign', description: 'Sent April Newsletter to 4,200 subscribers', created_at: '2026-04-01T10:00:00Z' },
    { id: 4, user_id: 2, action: 'respond_review', description: 'Responded to 5-star Google review — Ivea Downtown', created_at: '2026-03-29T14:30:00Z' },
    { id: 5, user_id: 3, action: 'create_event', description: 'Created Chef\'s Table Dinner event', created_at: '2026-04-01T11:00:00Z' },
    { id: 6, user_id: 1, action: 'payment_sent', description: 'Marked payment $1,200 paid to @sofiaeatslа', created_at: '2026-03-25T16:00:00Z' },
  ],

  settings: [
    { key: 'brand_name', value: 'Ivea Restaurant Group' },
    { key: 'primary_color', value: '#4f8ef7' },
    { key: 'timezone', value: 'America/Los_Angeles' },
  ],

  influencer_post_metrics: [],

  promotions: [
    { id: 1, name: 'Happy Hour 20% Off', promo_type: 'percentage_off', discount_value: 20, code: 'HAPPY20', status: 'active', redemption_count: 142, max_redemptions: 500, expires_at: '2026-06-30', description: 'Mon–Fri 3–6pm, 20% off all food and drinks.', created_at: '2026-01-01T00:00:00Z' },
    { id: 2, name: 'Buy One Get One Mezze', promo_type: 'bogo', discount_value: null, code: 'BOGOMEZZE', status: 'active', redemption_count: 67, max_redemptions: 200, expires_at: '2026-05-31', description: 'Buy any mezze board, get a second 50% off.', created_at: '2026-02-01T00:00:00Z' },
    { id: 3, name: 'Birthday Free Dessert', promo_type: 'free_item', discount_value: null, code: 'BDAYDESSERT', status: 'active', redemption_count: 38, max_redemptions: null, expires_at: null, description: 'Show your ID on your birthday for a complimentary dessert.', created_at: '2026-01-01T00:00:00Z' },
    { id: 4, name: 'Spring $10 Off', promo_type: 'dollar_off', discount_value: 10, code: 'SPRING10', status: 'expired', redemption_count: 310, max_redemptions: 300, expires_at: '2026-03-31', description: '$10 off any order over $50.', created_at: '2025-12-01T00:00:00Z' },
    { id: 5, name: 'Loyalty Double Points Weekend', promo_type: 'custom', discount_value: null, code: 'DBLPTS', status: 'active', redemption_count: 89, max_redemptions: null, expires_at: '2026-04-30', description: 'Earn double loyalty points on all weekend orders.', created_at: '2026-04-01T00:00:00Z' },
  ],

  promotion_redemptions: [
    { id: 1,  code: 'HAPPY20',    promotion_name: 'Happy Hour 20% Off',       customer_name: 'Jessica M.',   customer_email: 'jessica@email.com',  location_name: 'Ivea Downtown',       redeemed_at: '2026-04-10T17:32:00Z' },
    { id: 2,  code: 'HAPPY20',    promotion_name: 'Happy Hour 20% Off',       customer_name: 'Tom R.',       customer_email: 'tom@email.com',      location_name: 'Ivea West Hollywood', redeemed_at: '2026-04-10T16:45:00Z' },
    { id: 3,  code: 'BOGOMEZZE',  promotion_name: 'Buy One Get One Mezze',    customer_name: 'Sara K.',      customer_email: 'sara@email.com',     location_name: 'Ivea Santa Monica',   redeemed_at: '2026-04-09T19:10:00Z' },
    { id: 4,  code: 'BDAYDESSERT',promotion_name: 'Birthday Free Dessert',    customer_name: 'Daniel P.',    customer_email: 'daniel@email.com',   location_name: 'Ivea Downtown',       redeemed_at: '2026-04-09T20:05:00Z' },
    { id: 5,  code: 'HAPPY20',    promotion_name: 'Happy Hour 20% Off',       customer_name: 'Lisa W.',      customer_email: 'lisa@email.com',     location_name: 'Ivea Downtown',       redeemed_at: '2026-04-08T15:55:00Z' },
    { id: 6,  code: 'DBLPTS',     promotion_name: 'Loyalty Double Points',    customer_name: 'Carlos N.',    customer_email: 'carlos@email.com',   location_name: 'Ivea West Hollywood', redeemed_at: '2026-04-06T13:20:00Z' },
    { id: 7,  code: 'BOGOMEZZE',  promotion_name: 'Buy One Get One Mezze',    customer_name: 'Amy T.',       customer_email: 'amy@email.com',      location_name: 'Ivea Downtown',       redeemed_at: '2026-04-05T18:40:00Z' },
    { id: 8,  code: 'DBLPTS',     promotion_name: 'Loyalty Double Points',    customer_name: 'Kevin H.',     customer_email: 'kevin@email.com',    location_name: 'Ivea Santa Monica',   redeemed_at: '2026-04-05T12:15:00Z' },
    { id: 9,  code: 'BDAYDESSERT',promotion_name: 'Birthday Free Dessert',    customer_name: 'Nina F.',      customer_email: 'nina@email.com',     location_name: 'Ivea West Hollywood', redeemed_at: '2026-04-04T19:30:00Z' },
    { id: 10, code: 'HAPPY20',    promotion_name: 'Happy Hour 20% Off',       customer_name: 'Mark S.',      customer_email: 'mark@email.com',     location_name: 'Ivea Santa Monica',   redeemed_at: '2026-04-04T16:10:00Z' },
  ],

  loyalty_programs: [
    { id: 1, name: 'Ivea Rewards Club', program_type: 'points_based', points_per_dollar: 2, status: 'active', member_count: 1840, created_at: '2024-06-01T00:00:00Z' },
  ],

  loyalty_members: [
    { id: 1, name: 'Jessica Martinez', email: 'jessica@email.com', phone: '(310) 555-3001', points_balance: 2840, tier: 'Gold', total_spent: 1420, visit_count: 34, joined_at: '2024-07-01T00:00:00Z', last_visit: '2026-04-10T00:00:00Z', restaurant_id: 1 },
    { id: 2, name: 'Tom Rodriguez',    email: 'tom@email.com',     phone: '(323) 555-3002', points_balance: 1560, tier: 'Silver', total_spent: 780, visit_count: 19, joined_at: '2024-09-15T00:00:00Z', last_visit: '2026-04-10T00:00:00Z', restaurant_id: 2 },
    { id: 3, name: 'Sara Kim',         email: 'sara@email.com',    phone: '(213) 555-3003', points_balance: 920,  tier: 'Silver', total_spent: 460, visit_count: 12, joined_at: '2024-11-01T00:00:00Z', last_visit: '2026-04-09T00:00:00Z', restaurant_id: 3 },
    { id: 4, name: 'Daniel Park',      email: 'daniel@email.com',  phone: null,             points_balance: 3200, tier: 'Gold',   total_spent: 1600, visit_count: 41, joined_at: '2024-06-15T00:00:00Z', last_visit: '2026-04-09T00:00:00Z', restaurant_id: 1 },
    { id: 5, name: 'Lisa Wong',        email: 'lisa@email.com',    phone: '(818) 555-3005', points_balance: 480,  tier: 'Bronze', total_spent: 240, visit_count: 6,  joined_at: '2025-02-01T00:00:00Z', last_visit: '2026-04-08T00:00:00Z', restaurant_id: 1 },
    { id: 6, name: 'Carlos Navarro',   email: 'carlos@email.com',  phone: '(310) 555-3006', points_balance: 1100, tier: 'Silver', total_spent: 550, visit_count: 15, joined_at: '2024-10-01T00:00:00Z', last_visit: '2026-04-06T00:00:00Z', restaurant_id: 2 },
    { id: 7, name: 'Amy Tran',         email: 'amy@email.com',     phone: '(323) 555-3007', points_balance: 640,  tier: 'Bronze', total_spent: 320, visit_count: 8,  joined_at: '2025-01-10T00:00:00Z', last_visit: '2026-04-05T00:00:00Z', restaurant_id: 1 },
    { id: 8, name: 'Kevin Huang',      email: 'kevin@email.com',   phone: '(213) 555-3008', points_balance: 4100, tier: 'Gold',   total_spent: 2050, visit_count: 52, joined_at: '2024-06-01T00:00:00Z', last_visit: '2026-04-05T00:00:00Z', restaurant_id: 3 },
  ],
};

// ─── Install mock interceptor ───────────────────────────────────────────────
(function installMock() {
  // Wait for db to be defined
  function applyMock() {
    if (typeof db === 'undefined') {
      setTimeout(applyMock, 50);
      return;
    }

    const _originalRequest = db._request.bind(db);

    db._request = async function(body) {
      const { action, table, filters, order, limit } = body;

      // Only intercept select actions; let writes pass through (they'll fail silently)
      if (action !== 'select') {
        // Silently swallow writes in demo mode
        return { data: null, error: null };
      }

      const rows = MOCK[table];
      if (!rows) {
        // Table not in mock — return empty
        return { data: [], error: null };
      }

      let result = [...rows];

      // Apply simple equality filters
      if (filters) {
        for (const [col, val] of Object.entries(filters)) {
          if (col === '__or') continue;
          if (val && typeof val === 'object') continue; // skip complex filters
          result = result.filter(r => r[col] == val);
        }
      }

      // Apply order
      if (order) {
        result.sort((a, b) => {
          const av = a[order.column], bv = b[order.column];
          if (av == null) return 1;
          if (bv == null) return -1;
          return order.ascending ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
        });
      }

      // Apply limit
      if (limit) result = result.slice(0, limit);

      return { data: result, error: null };
    };

    console.log('[mock-data] ✅ Demo data active — all db reads returning fake data');
  }

  applyMock();
})();
