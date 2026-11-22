const { Pool } = require('pg');

const connectionString = 
  process.env.POSTGRES_URL || 
  process.env.POSTGRES_PRISMA_URL || 
  process.env.POSTGRES_URL_NON_POOLING || 
  process.env.DATABASE_URL;

class SqlDatabase {
  constructor() {
    this.pool = null;
    this.isReady = false;

    if (connectionString) {
      this.pool = new Pool({
        connectionString,
        ssl: process.env.NODE_ENV === 'production' || connectionString.includes('sslmode=require') 
          ? { rejectUnauthorized: false } 
          : false
      });
      console.log('🐘 PostgreSQL connection configured for SQL storage.');
      this.initSchema().catch(err => {
        console.error('SQL schema initialization error:', err.message);
      });
    }
  }

  hasPostgres() {
    return !!this.pool;
  }

  async initSchema() {
    if (!this.pool) return;
    try {
      const client = await this.pool.connect();
      try {
        await client.query(`
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

          CREATE TABLE IF NOT EXISTS settings (
            key VARCHAR(100) PRIMARY KEY,
            value JSONB NOT NULL
          );
        `);

        // Check if settings seeded
        const checkSettings = await client.query('SELECT value FROM settings WHERE key = $1', ['general']);
        if (checkSettings.rowCount === 0) {
          await client.query(`
            INSERT INTO settings (key, value) VALUES ($1, $2)
          `, ['general', JSON.stringify({
            headless: true,
            minDelaySeconds: 45,
            maxDelaySeconds: 90,
            dailyPostLimit: 50,
            spintaxEnabled: true,
            spintaxPrefix: "{Check out|Read our latest article|Brand new blog release|Must-read}: ",
            spintaxSuffix: "\n\n{What do you think? Let us know below!|Read the full article at the link above!}"
          })]);
        }

        this.isReady = true;
        console.log('✅ PostgreSQL tables verified and active on Vercel.');
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('Failed to run PostgreSQL migrations:', err);
    }
  }

  // --- Read Operations ---
  async get(table) {
    if (!this.pool) return [];
    try {
      if (table === 'posts') {
        const res = await this.pool.query('SELECT * FROM posts ORDER BY created_at DESC');
        return res.rows.map(r => ({
          id: r.id,
          title: r.title,
          url: r.url,
          excerpt: r.excerpt,
          content: r.content,
          imageUrl: r.image_url,
          videoUrl: r.video_url,
          localImagePath: r.local_image_path,
          localVideoPath: r.local_video_path,
          tags: r.tags || [],
          timesPosted: r.times_posted,
          lastPostedAt: r.last_posted_at,
          createdAt: r.created_at
        }));
      }

      if (table === 'groups') {
        const res = await this.pool.query('SELECT * FROM groups ORDER BY total_posts DESC');
        return res.rows.map(r => ({
          id: r.id,
          name: r.name,
          url: r.url,
          type: r.type,
          tags: r.tags || [],
          enabled: r.enabled,
          totalPosts: r.total_posts,
          lastPostedAt: r.last_posted_at
        }));
      }

      if (table === 'rss_sources') {
        const res = await this.pool.query('SELECT * FROM rss_sources');
        return res.rows.map(r => ({
          id: r.id,
          name: r.name,
          url: r.url,
          refreshMinutes: r.refresh_minutes,
          autoPost: r.auto_post,
          targetGroupTags: r.target_group_tags || [],
          enabled: r.enabled,
          lastFetchedAt: r.last_fetched_at
        }));
      }

      if (table === 'campaigns') {
        const res = await this.pool.query('SELECT * FROM campaigns ORDER BY created_at DESC');
        return res.rows.map(r => ({
          id: r.id,
          name: r.name,
          postSource: r.post_source,
          targetGroupTags: r.target_group_tags || [],
          intervalMinutes: r.interval_minutes,
          repeatCount: r.repeat_count,
          postsPerRun: r.posts_per_run,
          active: r.active,
          createdAt: r.created_at,
          lastRunAt: r.last_run_at
        }));
      }

      if (table === 'history') {
        const res = await this.pool.query('SELECT * FROM history ORDER BY timestamp DESC LIMIT 500');
        return res.rows.map(r => ({
          id: r.id,
          timestamp: r.timestamp,
          groupName: r.group_name,
          groupUrl: r.group_url,
          postTitle: r.post_title,
          postUrl: r.post_url,
          status: r.status,
          errorDetails: r.error_details
        }));
      }

      return [];
    } catch (err) {
      console.error(`Error querying SQL table ${table}:`, err.message);
      return [];
    }
  }

  async getSettings() {
    if (!this.pool) return null;
    try {
      const res = await this.pool.query('SELECT value FROM settings WHERE key = $1', ['general']);
      if (res.rows.length > 0) {
        return res.rows[0].value;
      }
    } catch (err) {
      console.error('Error getting settings from SQL:', err.message);
    }
    return null;
  }

  async updateSettings(newSettings) {
    if (!this.pool) return newSettings;
    try {
      const current = await this.getSettings() || {};
      const merged = { ...current, ...newSettings };
      await this.pool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
        ['general', JSON.stringify(merged)]
      );
      return merged;
    } catch (err) {
      console.error('Error updating settings in SQL:', err.message);
      return newSettings;
    }
  }

  // --- Write Operations ---
  async addItem(table, item) {
    if (!this.pool) return item;
    try {
      if (table === 'posts') {
        await this.pool.query(`
          INSERT INTO posts (id, title, url, excerpt, content, image_url, video_url, local_image_path, local_video_path, tags, times_posted, last_posted_at, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
          item.id,
          item.title,
          item.url,
          item.excerpt || '',
          item.content || '',
          item.imageUrl || '',
          item.videoUrl || '',
          item.localImagePath || null,
          item.localVideoPath || null,
          JSON.stringify(item.tags || []),
          item.timesPosted || 0,
          item.lastPostedAt || null,
          item.createdAt || new Date().toISOString()
        ]);
      }

      if (table === 'groups') {
        await this.pool.query(`
          INSERT INTO groups (id, name, url, type, tags, enabled, total_posts, last_posted_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          item.id,
          item.name,
          item.url,
          item.type || 'group',
          JSON.stringify(item.tags || []),
          item.enabled !== false,
          item.totalPosts || 0,
          item.lastPostedAt || null
        ]);
      }

      if (table === 'rss_sources') {
        await this.pool.query(`
          INSERT INTO rss_sources (id, name, url, refresh_minutes, auto_post, target_group_tags, enabled, last_fetched_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          item.id,
          item.name,
          item.url,
          item.refreshMinutes || 60,
          !!item.autoPost,
          JSON.stringify(item.targetGroupTags || []),
          item.enabled !== false,
          item.lastFetchedAt || null
        ]);
      }

      if (table === 'campaigns') {
        await this.pool.query(`
          INSERT INTO campaigns (id, name, post_source, target_group_tags, interval_minutes, repeat_count, posts_per_run, active, created_at, last_run_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          item.id,
          item.name,
          item.postSource || 'all',
          JSON.stringify(item.targetGroupTags || []),
          item.intervalMinutes || 120,
          item.repeatCount || 1,
          item.postsPerRun || 1,
          item.active !== false,
          item.createdAt || new Date().toISOString(),
          item.lastRunAt || null
        ]);
      }

      return item;
    } catch (err) {
      console.error(`Error inserting into SQL table ${table}:`, err.message);
      return item;
    }
  }

  async updateItem(table, id, updates) {
    if (!this.pool) return null;
    try {
      if (table === 'posts') {
        if (updates.timesPosted !== undefined || updates.lastPostedAt !== undefined) {
          await this.pool.query(
            'UPDATE posts SET times_posted = COALESCE($1, times_posted), last_posted_at = COALESCE($2, last_posted_at) WHERE id = $3',
            [updates.timesPosted, updates.lastPostedAt, id]
          );
        }
      }

      if (table === 'groups') {
        if (updates.enabled !== undefined) {
          await this.pool.query('UPDATE groups SET enabled = $1 WHERE id = $2', [updates.enabled, id]);
        }
        if (updates.totalPosts !== undefined || updates.lastPostedAt !== undefined) {
          await this.pool.query(
            'UPDATE groups SET total_posts = COALESCE($1, total_posts), last_posted_at = COALESCE($2, last_posted_at) WHERE id = $3',
            [updates.totalPosts, updates.lastPostedAt, id]
          );
        }
      }

      if (table === 'campaigns') {
        if (updates.active !== undefined) {
          await this.pool.query('UPDATE campaigns SET active = $1 WHERE id = $2', [updates.active, id]);
        }
        if (updates.lastRunAt !== undefined) {
          await this.pool.query('UPDATE campaigns SET last_run_at = $1 WHERE id = $2', [updates.lastRunAt, id]);
        }
      }

      return updates;
    } catch (err) {
      console.error(`Error updating SQL table ${table}:`, err.message);
      return null;
    }
  }

  async deleteItem(table, id) {
    if (!this.pool) return false;
    try {
      await this.pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      return true;
    } catch (err) {
      console.error(`Error deleting from SQL table ${table}:`, err.message);
      return false;
    }
  }

  async addLog(entry) {
    if (!this.pool) return entry;
    try {
      const id = 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
      await this.pool.query(`
        INSERT INTO history (id, timestamp, group_name, group_url, post_title, post_url, status, error_details)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        id,
        new Date().toISOString(),
        entry.groupName,
        entry.groupUrl,
        entry.postTitle,
        entry.postUrl,
        entry.status,
        entry.errorDetails || null
      ]);
      return { id, ...entry };
    } catch (err) {
      console.error('Error inserting log into SQL:', err.message);
      return entry;
    }
  }

  async clearHistory() {
    if (!this.pool) return false;
    try {
      await this.pool.query('TRUNCATE TABLE history');
      return true;
    } catch (err) {
      console.error('Error clearing history in SQL:', err.message);
      return false;
    }
  }
}

const sqlDb = new SqlDatabase();
module.exports = sqlDb;
