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
  tags JSONB DEFAULT '[]'::jsonb,
  enabled BOOLEAN DEFAULT TRUE,
  total_posts INTEGER DEFAULT 0,
  last_posted_at TIMESTAMP WITH TIME ZONE
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
