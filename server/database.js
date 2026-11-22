const fs = require('fs');
const path = require('path');
const { DB_FILE, DEFAULT_CHROME_PATH } = require('./config');
const sqlDb = require('./sqlDatabase');

const defaultData = {
  posts: [
    {
      id: 'demo-post-1',
      title: 'Top 10 High-Impact Strategies to Skyrocket Your Blog Traffic',
      url: 'https://example.com/blog/boost-traffic',
      excerpt: 'Learn the battle-tested techniques to multiply organic search and social media visitors to your articles.',
      content: 'Learn the battle-tested techniques to multiply organic search and social media visitors to your articles. Implementing strategic content syndication, social group engagement, and keyword clusters helps you scale fast.',
      imageUrl: '',
      videoUrl: '',
      tags: ['Blogging', 'Marketing', 'Traffic'],
      timesPosted: 0,
      lastPostedAt: null,
      createdAt: new Date().toISOString()
    },
    {
      id: 'demo-post-2',
      title: 'How to Automate Content Distribution Without Getting Flagged',
      url: 'https://example.com/blog/safe-social-automation',
      excerpt: 'A complete blueprint for smart scheduling, randomized intervals, and spintax text variations.',
      content: 'A complete blueprint for smart scheduling, randomized intervals, and spintax text variations. Keep your social accounts healthy while growing multiple channels simultaneously.',
      imageUrl: '',
      videoUrl: '',
      tags: ['Automation', 'SocialMedia', 'Growth'],
      timesPosted: 0,
      lastPostedAt: null,
      createdAt: new Date().toISOString()
    }
  ],
  rss_sources: [
    {
      id: 'demo-rss-1',
      name: 'TechCrunch News',
      url: 'https://techcrunch.com/feed/',
      refreshMinutes: 60,
      autoPost: false,
      targetGroupTags: ['Tech'],
      enabled: true,
      lastFetchedAt: null
    }
  ],
  groups: [
    {
      id: 'demo-group-1',
      name: 'SEO Signals Lab - SEO, Traffic & Affiliate Community',
      url: 'https://www.facebook.com/groups/seosignalslab',
      type: 'group',
      country: 'United States',
      countryCode: 'US',
      niche: 'Blogging & SEO',
      members: '128,400 members',
      memberCount: 128400,
      postApproval: 'NO_APPROVAL_REQUIRED',
      postApprovalLabel: 'Direct Post (No Approval)',
      linkPermission: 'ALLOWED',
      linkPermissionLabel: 'Links Allowed (Confirmed)',
      joinStatus: 'JOINED',
      activity: {
        postsLast7Days: 145,
        postsLast30Days: 610,
        postsPerDay: 21,
        engagementLevel: 'HIGH',
        rankScore: 96
      },
      tags: ['Blogging', 'Marketing', 'US'],
      enabled: true,
      totalPosts: 3,
      lastPostedAt: null,
      verifiedAt: new Date().toISOString()
    },
    {
      id: 'demo-group-2',
      name: 'WPBeginner - WordPress & Blogging Mastermind',
      url: 'https://www.facebook.com/groups/wpbeginner',
      type: 'group',
      country: 'Worldwide',
      countryCode: 'ALL',
      niche: 'Blogging & SEO',
      members: '310,000 members',
      memberCount: 310000,
      postApproval: 'NO_APPROVAL_REQUIRED',
      postApprovalLabel: 'Direct Post (No Approval)',
      linkPermission: 'ALLOWED',
      linkPermissionLabel: 'Links Allowed (Confirmed)',
      joinStatus: 'JOINED',
      activity: {
        postsLast7Days: 390,
        postsLast30Days: 1680,
        postsPerDay: 56,
        engagementLevel: 'HIGH',
        rankScore: 99
      },
      tags: ['SEO', 'Traffic', 'Global'],
      enabled: true,
      totalPosts: 5,
      lastPostedAt: null,
      verifiedAt: new Date().toISOString()
    }
  ],
  campaigns: [
    {
      id: 'demo-campaign-1',
      name: 'Daily Blog Distribution Round-Robin',
      postSource: 'all',
      targetGroupTags: ['Blogging'],
      intervalMinutes: 120,
      repeatCount: 3,
      postsPerRun: 1,
      active: false,
      createdAt: new Date().toISOString(),
      lastRunAt: null
    }
  ],
  tracking_links: [],
  traffic_clicks: [],
  history: [],
  settings: {
    chromePath: DEFAULT_CHROME_PATH,
    headless: false,
    minDelaySeconds: 45,
    maxDelaySeconds: 90,
    dailyPostLimit: 40,
    spintaxEnabled: true,
    spintaxPrefix: "{Check out|Read our latest article|Brand new blog post|Must-read}: ",
    spintaxSuffix: "\n\n{Let us know your thoughts below!|What do you think?|Read full article on the link above!}",
    ga4MeasurementId: "",
    ga4ApiSecret: ""
  }
};

class Database {
  constructor() {
    this.filePath = DB_FILE;
    this.data = this.load();

    // If connected to PostgreSQL (e.g. on Vercel), sync from SQL
    if (sqlDb.hasPostgres()) {
      this.syncFromSql().catch(err => {
        console.warn('Initial SQL sync warning:', err.message);
      });
    }
  }

  async syncFromSql() {
    if (!sqlDb.hasPostgres()) return;
    try {
      const [posts, groups, rssSources, campaigns, history, settings] = await Promise.all([
        sqlDb.get('posts'),
        sqlDb.get('groups'),
        sqlDb.get('rss_sources'),
        sqlDb.get('campaigns'),
        sqlDb.get('history'),
        sqlDb.getSettings()
      ]);

      if (posts.length > 0) this.data.posts = posts;
      if (groups.length > 0) this.data.groups = groups;
      if (rssSources.length > 0) this.data.rss_sources = rssSources;
      if (campaigns.length > 0) this.data.campaigns = campaigns;
      if (history.length > 0) this.data.history = history;
      if (settings) this.data.settings = { ...this.data.settings, ...settings };

      console.log(`🐘 SQL Sync Complete: Loaded ${this.data.posts.length} posts, ${this.data.groups.length} groups from PostgreSQL.`);
    } catch (err) {
      console.error('SQL Sync error:', err.message);
    }
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          ...defaultData,
          ...parsed,
          settings: { ...defaultData.settings, ...(parsed.settings || {}) }
        };
      }
    } catch (err) {
      console.error('Error loading local DB, initializing default state:', err.message);
    }
    this.save(defaultData);
    return JSON.parse(JSON.stringify(defaultData));
  }

  save(data = this.data) {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      // In serverless read-only environments, local disk writes are ignored safely
    }
  }

  get(table) {
    return this.data[table] || [];
  }

  getSettings() {
    return this.data.settings;
  }

  updateSettings(newSettings) {
    this.data.settings = { ...this.data.settings, ...newSettings };
    this.save();
    if (sqlDb.hasPostgres()) {
      sqlDb.updateSettings(this.data.settings).catch(() => {});
    }
    return this.data.settings;
  }

  addItem(table, item) {
    if (!this.data[table]) {
      this.data[table] = [];
    }
    this.data[table].unshift(item);
    this.save();

    if (sqlDb.hasPostgres()) {
      sqlDb.addItem(table, item).catch(err => {
        console.error(`SQL insert error on ${table}:`, err.message);
      });
    }
    return item;
  }

  updateItem(table, id, updates) {
    const list = this.data[table] || [];
    const index = list.findIndex(item => item.id === id);
    if (index !== -1) {
      this.data[table][index] = { ...list[index], ...updates };
      this.save();

      if (sqlDb.hasPostgres()) {
        sqlDb.updateItem(table, id, updates).catch(err => {
          console.error(`SQL update error on ${table}:`, err.message);
        });
      }
      return this.data[table][index];
    }
    return null;
  }

  deleteItem(table, id) {
    const list = this.data[table] || [];
    this.data[table] = list.filter(item => item.id !== id);
    this.save();

    if (sqlDb.hasPostgres()) {
      sqlDb.deleteItem(table, id).catch(err => {
        console.error(`SQL delete error on ${table}:`, err.message);
      });
    }
    return true;
  }

  findItem(table, predicate) {
    return (this.data[table] || []).find(predicate);
  }

  addLog(entry) {
    const logItem = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString(),
      ...entry
    };
    if (!this.data.history) this.data.history = [];
    this.data.history.unshift(logItem);
    if (this.data.history.length > 1000) {
      this.data.history = this.data.history.slice(0, 1000);
    }
    this.save();

    if (sqlDb.hasPostgres()) {
      sqlDb.addLog(entry).catch(() => {});
    }
    return logItem;
  }

  clearHistory() {
    this.data.history = [];
    this.save();
    if (sqlDb.hasPostgres()) {
      sqlDb.clearHistory().catch(() => {});
    }
    return true;
  }

  deduplicateGroups() {
    const originalCount = (this.data.groups || []).length;
    const seenUrls = new Set();
    const uniqueGroups = [];

    for (const group of (this.data.groups || [])) {
      const normalized = (group.url || '').toLowerCase().trim().replace(/\/$/, '');
      if (normalized && !seenUrls.has(normalized)) {
        seenUrls.add(normalized);
        uniqueGroups.push(group);
      }
    }

    this.data.groups = uniqueGroups;
    this.save();
    return {
      originalCount,
      removedCount: originalCount - uniqueGroups.length,
      remainingCount: uniqueGroups.length
    };
  }
}

const db = new Database();
module.exports = db;
