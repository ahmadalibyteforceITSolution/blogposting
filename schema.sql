-- =========================================================================
-- FB AutoBlog Master — PostgreSQL Schema for Vercel Postgres / Neon / Supabase
-- =========================================================================

-- 1. Blog Articles & Videos Catalog Table
CREATE TABLE IF NOT EXISTS posts (
  id VARCHAR(100) PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  excerpt TEXT,
  content TEXT,
  image_url TEXT,
  video_url TEXT,
  local_image_path TEXT,
  local_video_path TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  times_posted INTEGER DEFAULT 0,
  last_posted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Target Facebook Groups & Audiences Table
CREATE TABLE IF NOT EXISTS groups (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'group',
  country VARCHAR(100) DEFAULT 'Worldwide',
  country_code VARCHAR(10) DEFAULT 'ALL',
  niche VARCHAR(100),
  members VARCHAR(100),
  member_count INTEGER DEFAULT 0,
  post_approval VARCHAR(50) DEFAULT 'NO_APPROVAL_REQUIRED',
  link_permission VARCHAR(50) DEFAULT 'ALLOWED',
  join_status VARCHAR(50) DEFAULT 'NOT_JOINED',
  activity_score INTEGER DEFAULT 0,
  posts_last_7_days INTEGER DEFAULT 0,
  posts_last_30_days INTEGER DEFAULT 0,
  tags JSONB DEFAULT '[]'::jsonb,
  enabled BOOLEAN DEFAULT TRUE,
  total_posts INTEGER DEFAULT 0,
  last_posted_at TIMESTAMP WITH TIME ZONE,
  verified_at TIMESTAMP WITH TIME ZONE
);

-- 2b. Website Traffic Tracking Links Table
CREATE TABLE IF NOT EXISTS tracking_links (
  id VARCHAR(100) PRIMARY KEY,
  destination_url TEXT NOT NULL,
  post_id VARCHAR(100),
  group_id VARCHAR(100),
  group_name VARCHAR(255),
  group_url TEXT,
  country VARCHAR(100),
  country_code VARCHAR(10),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  clicks INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  sessions INTEGER DEFAULT 0
);

-- 2c. Real-Time Traffic Click Events & Visitor Audit Table
CREATE TABLE IF NOT EXISTS traffic_clicks (
  id VARCHAR(100) PRIMARY KEY,
  tracking_id VARCHAR(100) NOT NULL,
  group_id VARCHAR(100),
  group_name VARCHAR(255),
  post_id VARCHAR(100),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  masked_ip VARCHAR(100),
  fingerprint VARCHAR(100),
  user_agent TEXT,
  referrer TEXT,
  country VARCHAR(100),
  country_code VARCHAR(10),
  is_unique_visitor BOOLEAN DEFAULT TRUE,
  is_new_session BOOLEAN DEFAULT TRUE
);

-- 3. RSS / Blog Feeds Table
CREATE TABLE IF NOT EXISTS rss_sources (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  refresh_minutes INTEGER DEFAULT 60,
  auto_post BOOLEAN DEFAULT FALSE,
  target_group_tags JSONB DEFAULT '[]'::jsonb,
  enabled BOOLEAN DEFAULT TRUE,
  last_fetched_at TIMESTAMP WITH TIME ZONE
);

-- 4. Autonomous 24/7 Campaigns Table
CREATE TABLE IF NOT EXISTS campaigns (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  post_source VARCHAR(50) DEFAULT 'all',
  target_group_tags JSONB DEFAULT '[]'::jsonb,
  interval_minutes INTEGER DEFAULT 120,
  repeat_count INTEGER DEFAULT 1,
  posts_per_run INTEGER DEFAULT 1,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_run_at TIMESTAMP WITH TIME ZONE
);

-- 5. Execution History & Audit Logs Table
CREATE TABLE IF NOT EXISTS history (
  id VARCHAR(100) PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  group_name VARCHAR(255),
  group_url TEXT,
  post_title TEXT,
  post_url TEXT,
  status VARCHAR(50) NOT NULL,
  error_details TEXT
);

-- 6. Application Settings Table (Key/Value JSON)
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL
);

-- Seed Default Settings
INSERT INTO settings (key, value)
VALUES (
  'general',
  '{
    "headless": true,
    "minDelaySeconds": 45,
    "maxDelaySeconds": 90,
    "dailyPostLimit": 50,
    "spintaxEnabled": true,
    "spintaxPrefix": "{Check out|Read our latest article|Brand new blog release|Must-read}: ",
    "spintaxSuffix": "\n\n{What do you think? Let us know below!|Read the full article at the link above!}"
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
