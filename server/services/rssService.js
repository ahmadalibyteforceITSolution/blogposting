const Parser = require('rss-parser');
const http = require('http');
const https = require('https');
const db = require('../database');

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['enclosure', 'enclosure'],
      ['content:encoded', 'contentEncoded']
    ]
  }
});

class RssService {
  // Fetches articles from an RSS/Atom feed URL
  async fetchFeed(feedUrl) {
    try {
      const feed = await parser.parseURL(feedUrl);
      const items = (feed.items || []).map(item => {
        let imageUrl = '';
        if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith('image')) {
          imageUrl = item.enclosure.url;
        } else if (item.mediaContent && item.mediaContent.length > 0) {
          imageUrl = item.mediaContent[0].$?.url || item.mediaContent[0].url || '';
        }

        // Clean HTML tags from summary/content
        const rawExcerpt = item.contentSnippet || item.summary || item.content || '';
        const cleanExcerpt = rawExcerpt.replace(/<[^>]*>?/gm, '').trim().substring(0, 300);

        return {
          title: (item.title || 'Untitled Post').trim(),
          url: item.link || '',
          excerpt: cleanExcerpt,
          content: (item.contentEncoded || item.content || cleanExcerpt).substring(0, 1000),
          imageUrl,
          tags: item.categories || [],
          publishedAt: item.isoDate || item.pubDate || new Date().toISOString()
        };
      });

      return {
        title: feed.title || 'RSS Feed',
        description: feed.description || '',
        items
      };
    } catch (err) {
      throw new Error(`Failed to parse RSS feed from ${feedUrl}: ${err.message}`);
    }
  }

  // Ingests feed articles and saves new unique ones into the database
  async ingestFeed(rssSourceId) {
    const source = db.findItem('rss_sources', s => s.id === rssSourceId);
    if (!source) throw new Error('RSS Source not found');

    const feedData = await this.fetchFeed(source.url);
    const existingPosts = db.get('posts');
    const existingUrls = new Set(existingPosts.map(p => p.url.trim().toLowerCase()));

    let addedCount = 0;
    const newlyAdded = [];

    for (const item of feedData.items) {
      if (!item.url || existingUrls.has(item.url.trim().toLowerCase())) {
        continue; // Skip duplicate
      }

      const newPost = {
        id: 'post-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
        title: item.title,
        url: item.url,
        excerpt: item.excerpt,
        content: item.content,
        imageUrl: item.imageUrl,
        tags: Array.from(new Set([...(item.tags || []), ...(source.targetGroupTags || [])])),
        sourceFeedId: source.id,
        timesPosted: 0,
        lastPostedAt: null,
        createdAt: new Date().toISOString()
      };

      db.addItem('posts', newPost);
      existingUrls.add(item.url.trim().toLowerCase());
      addedCount++;
      newlyAdded.push(newPost);
    }

    db.updateItem('rss_sources', source.id, {
      lastFetchedAt: new Date().toISOString(),
      lastItemCount: feedData.items.length
    });

    return {
      addedCount,
      totalInFeed: feedData.items.length,
      newlyAdded
    };
  }

  // Scrapes OpenGraph meta tags from any arbitrary blog post URL
  async scrapeBlogUrl(url) {
    return new Promise((resolve, reject) => {
      try {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return this.scrapeBlogUrl(res.headers.location).then(resolve).catch(reject);
          }

          let data = '';
          res.on('data', chunk => {
            data += chunk;
            if (data.length > 500000) res.destroy(); // Limit data size
          });

          res.on('end', () => {
            const getMeta = (property) => {
              const regex = new RegExp(`<meta\\s+[^>]*(?:property|name)=["'](?:og:|twitter:)?${property}["'][^>]*content=["']([^"']*)["']`, 'i');
              const match = data.match(regex);
              return match ? match[1] : '';
            };

            const getTitle = () => {
              const ogTitle = getMeta('title');
              if (ogTitle) return ogTitle;
              const titleMatch = data.match(/<title[^>]*>([^<]*)<\/title>/i);
              return titleMatch ? titleMatch[1].trim() : 'New Blog Post';
            };

            const getDescription = () => {
              return getMeta('description') || '';
            };

            const getImage = () => {
              return getMeta('image') || '';
            };

            resolve({
              title: getTitle(),
              url,
              excerpt: getDescription(),
              content: getDescription(),
              imageUrl: getImage(),
              tags: ['Blog']
            });
          });
        });

        req.on('error', err => reject(err));
        req.setTimeout(15000, () => {
          req.destroy();
          reject(new Error('Request timed out while scraping URL'));
        });
      } catch (err) {
        reject(err);
      }
    });
  }
}

const rssService = new RssService();
module.exports = rssService;
