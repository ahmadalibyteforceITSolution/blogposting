const fs = require('fs');
const path = require('path');
const { DB_FILE, DEFAULT_CHROME_PATH } = require('./config');

const defaultData = {
  posts: [
    {
      id: 'demo-post-1',
      title: 'Top 10 High-Impact Strategies to Skyrocket Your Blog Traffic',
      url: 'https://example.com/blog/boost-traffic',
      excerpt: 'Learn the battle-tested techniques to multiply organic search and social media visitors to your articles.',
      content: 'Learn the battle-tested techniques to multiply organic search and social media visitors to your articles. Implementing strategic content syndication, social group engagement, and keyword clusters helps you scale fast.',
      imageUrl: '',
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
      name: 'Blogging & Content Creators Hub',
      url: 'https://www.facebook.com/groups/bloggingcreatorshub',
      type: 'group',
      tags: ['Blogging', 'Marketing'],
      enabled: true,
      totalPosts: 0,
      lastPostedAt: null
    },
    {
      id: 'demo-group-2',
      name: 'Digital Marketers & Growth Hackers',
      url: 'https://www.facebook.com/groups/digitalmarketinggrowthhackers',
      type: 'group',
      tags: ['Marketing', 'Tech'],
      enabled: true,
      totalPosts: 0,
      lastPostedAt: null
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
  history: [],
  settings: {
    chromePath: DEFAULT_CHROME_PATH,
    headless: false,
    minDelaySeconds: 45,
    maxDelaySeconds: 90,
    dailyPostLimit: 40,
    spintaxEnabled: true,
    spintaxPrefix: "{Check out|Read our latest article|Brand new blog post|Must-read}: ",
    spintaxSuffix: "\n\n{Let us know your thoughts below!|What do you think?|Read full article on the link above!}"
  }
};

class Database {
  constructor() {
    this.filePath = DB_FILE;
    this.data = this.load();
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
      console.error('Error loading db.json, initializing fresh default database:', err);
    }
    this.save(defaultData);
    return JSON.parse(JSON.stringify(defaultData));
  }

  save(data = this.data) {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save db.json:', err);
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
    return this.data.settings;
  }

  addItem(table, item) {
    if (!this.data[table]) {
      this.data[table] = [];
    }
    this.data[table].unshift(item);
    this.save();
    return item;
  }

  updateItem(table, id, updates) {
    const list = this.data[table] || [];
    const index = list.findIndex(item => item.id === id);
    if (index !== -1) {
      this.data[table][index] = { ...list[index], ...updates };
      this.save();
      return this.data[table][index];
    }
    return null;
  }

  deleteItem(table, id) {
    const list = this.data[table] || [];
    this.data[table] = list.filter(item => item.id !== id);
    this.save();
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
    // Keep max 1000 logs in history
    if (this.data.history.length > 1000) {
      this.data.history = this.data.history.slice(0, 1000);
    }
    this.save();
    return logItem;
  }

  clearHistory() {
    this.data.history = [];
    this.save();
    return true;
  }
}

const db = new Database();
module.exports = db;
