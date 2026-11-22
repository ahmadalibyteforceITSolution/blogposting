const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../database');
const config = require('../config');
const { fbAutomation } = require('../automation/facebook');
const posterEngine = require('../automation/posterEngine');
const rssService = require('../services/rssService');

// Multer storage for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `upload-${Date.now()}-${Math.round(Math.random() * 1E6)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 } // Support videos up to 250MB
});

const uploadMedia = upload.fields([
  { name: 'imageFile', maxCount: 1 },
  { name: 'videoFile', maxCount: 1 },
  { name: 'mediaFile', maxCount: 1 }
]);

// --- SSE Real-time Stream ---
router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  posterEngine.addSseClient(res);

  // Send initial status
  res.write(`event: status\ndata: ${JSON.stringify(posterEngine.getStatus())}\n\n`);
});

// --- System Statistics ---
router.get('/stats', async (req, res) => {
  try {
    const posts = db.get('posts');
    const groups = db.get('groups');
    const campaigns = db.get('campaigns');
    const history = db.get('history');

    const successCount = history.filter(h => h.status === 'SUCCESS').length;
    const failCount = history.filter(h => h.status === 'FAILED').length;

    res.json({
      success: true,
      stats: {
        totalPosts: posts.length,
        totalGroups: groups.length,
        activeGroups: groups.filter(g => g.enabled).length,
        activeCampaigns: campaigns.filter(c => c.active).length,
        totalHistory: history.length,
        successfulPosts: successCount,
        failedPosts: failCount,
        isBusy: posterEngine.getStatus().isBusy
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Facebook Authentication ---
router.get('/auth/status', async (req, res) => {
  try {
    const settings = db.getSettings();
    if (settings && settings.fbSession && (settings.fbSession.c_user || settings.fbSession.accessToken)) {
      return res.json({ success: true, loggedIn: true, mode: 'cloud' });
    }

    if (config.IS_VERCEL) {
      return res.json({ success: true, loggedIn: false, isVercel: true });
    }

    const status = await fbAutomation.checkLoginStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.json({ success: false, loggedIn: false, error: err.message });
  }
});

router.post('/auth/open-login', async (req, res) => {
  try {
    if (config.IS_VERCEL) {
      return res.status(200).json({
        success: false,
        isVercel: true,
        error: 'Cloud Mode Active: Interactive Chrome window cannot open on Vercel. Please connect using Facebook Cookies (c_user & xs) or run start.bat on your PC.'
      });
    }

    fbAutomation.openLoginBrowser((msg) => {
      posterEngine.log(msg, 'info');
    }).catch(err => {
      posterEngine.log(`Login browser error: ${err.message}`, 'error');
    });

    res.json({ success: true, message: 'Login browser opened. Please check your screen.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/save-session', (req, res) => {
  try {
    const { c_user, xs, accessToken } = req.body;
    const settings = db.getSettings();
    settings.fbSession = {
      c_user: (c_user || '').trim(),
      xs: (xs || '').trim(),
      accessToken: (accessToken || '').trim(),
      connectedAt: new Date().toISOString()
    };
    db.updateSettings(settings);
    res.json({ success: true, message: 'Facebook session saved successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Blog Posts Management ---
router.get('/posts', (req, res) => {
  res.json({ success: true, posts: db.get('posts') });
});

router.post('/posts', uploadMedia, (req, res) => {
  try {
    const { title, url, excerpt, content, tags, imageUrl, videoUrl } = req.body;
    let localImagePath = null;
    let localVideoPath = null;
    let finalImageUrl = imageUrl || '';
    let finalVideoUrl = videoUrl || '';

    const files = req.files || {};
    if (files.imageFile && files.imageFile[0]) {
      localImagePath = files.imageFile[0].path;
      finalImageUrl = `/uploads/${files.imageFile[0].filename}`;
    }
    if (files.videoFile && files.videoFile[0]) {
      localVideoPath = files.videoFile[0].path;
      finalVideoUrl = `/uploads/${files.videoFile[0].filename}`;
    }
    if (files.mediaFile && files.mediaFile[0]) {
      const f = files.mediaFile[0];
      const ext = path.extname(f.originalname).toLowerCase();
      if (['.mp4', '.mov', '.webm', '.avi', '.mkv'].includes(ext)) {
        localVideoPath = f.path;
        finalVideoUrl = `/uploads/${f.filename}`;
      } else {
        localImagePath = f.path;
        finalImageUrl = `/uploads/${f.filename}`;
      }
    }

    const newPost = {
      id: 'post-' + Date.now(),
      title: title || 'Untitled Post',
      url: url || '',
      excerpt: excerpt || '',
      content: content || '',
      imageUrl: finalImageUrl,
      videoUrl: finalVideoUrl,
      localImagePath,
      localVideoPath,
      tags: typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : (tags || []),
      timesPosted: 0,
      lastPostedAt: null,
      createdAt: new Date().toISOString()
    };

    db.addItem('posts', newPost);
    res.json({ success: true, post: newPost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/posts/:id', uploadMedia, (req, res) => {
  try {
    const updates = { ...req.body };
    if (typeof updates.tags === 'string') {
      updates.tags = updates.tags.split(',').map(t => t.trim()).filter(Boolean);
    }
    const files = req.files || {};
    if (files.imageFile && files.imageFile[0]) {
      updates.localImagePath = files.imageFile[0].path;
      updates.imageUrl = `/uploads/${files.imageFile[0].filename}`;
    }
    if (files.videoFile && files.videoFile[0]) {
      updates.localVideoPath = files.videoFile[0].path;
      updates.videoUrl = `/uploads/${files.videoFile[0].filename}`;
    }

    const updated = db.updateItem('posts', req.params.id, updates);
    if (!updated) return res.status(404).json({ error: 'Post not found' });
    res.json({ success: true, post: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/posts/:id', (req, res) => {
  db.deleteItem('posts', req.params.id);
  res.json({ success: true });
});

// Auto-scrape any blog URL
router.post('/posts/scrape-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const scraped = await rssService.scrapeBlogUrl(url);
    res.json({ success: true, post: scraped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Facebook Groups & Pages Management ---
router.get('/groups', (req, res) => {
  res.json({ success: true, groups: db.get('groups') });
});

router.post('/groups', (req, res) => {
  try {
    const { name, url, type = 'group', tags = [] } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const newGroup = {
      id: 'grp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      name: name || 'Facebook Group',
      url: url.trim(),
      type: type || 'group',
      tags: typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : tags,
      enabled: true,
      totalPosts: 0,
      lastPostedAt: null
    };

    db.addItem('groups', newGroup);
    res.json({ success: true, group: newGroup });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk import groups from text lines
router.post('/groups/bulk', (req, res) => {
  try {
    const { text, defaultTag } = req.body;
    if (!text) return res.status(400).json({ error: 'Text input required' });

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const added = [];

    for (const line of lines) {
      let groupUrl = line;
      let groupName = 'Facebook Group';

      // Support comma or tab separated: "GroupName, https://facebook.com/groups/..."
      if (line.includes(',') || line.includes('\t')) {
        const parts = line.split(/[,\t]/);
        if (parts[0].startsWith('http')) {
          groupUrl = parts[0].trim();
          groupName = parts[1]?.trim() || groupName;
        } else {
          groupName = parts[0].trim();
          groupUrl = parts[1]?.trim() || '';
        }
      }

      if (groupUrl.includes('facebook.com')) {
        // Derive clean name if default
        if (groupName === 'Facebook Group') {
          const match = groupUrl.match(/groups\/([^/?]+)/);
          if (match) groupName = decodeURIComponent(match[1]).replace(/[-_.]+/g, ' ');
        }

        const newGroup = {
          id: 'grp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
          name: groupName,
          url: groupUrl,
          type: groupUrl.includes('/groups/') ? 'group' : 'page',
          tags: defaultTag ? [defaultTag] : ['Imported'],
          enabled: true,
          totalPosts: 0,
          lastPostedAt: null
        };

        db.addItem('groups', newGroup);
        added.push(newGroup);
      }
    }

    res.json({ success: true, count: added.length, groups: added });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/groups/:id', (req, res) => {
  try {
    const updates = { ...req.body };
    if (typeof updates.tags === 'string') {
      updates.tags = updates.tags.split(',').map(t => t.trim()).filter(Boolean);
    }
    const updated = db.updateItem('groups', req.params.id, updates);
    if (!updated) return res.status(404).json({ error: 'Group not found' });
    res.json({ success: true, group: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/groups/:id', (req, res) => {
  db.deleteItem('groups', req.params.id);
  res.json({ success: true });
});

// --- RSS Feeds Management ---
router.get('/rss', (req, res) => {
  res.json({ success: true, sources: db.get('rss_sources') });
});

router.post('/rss', (req, res) => {
  try {
    const { name, url, refreshMinutes = 60, autoPost = false, targetGroupTags = [] } = req.body;
    const newSource = {
      id: 'rss-' + Date.now(),
      name: name || 'Blog Feed',
      url: url.trim(),
      refreshMinutes: Number(refreshMinutes) || 60,
      autoPost: !!autoPost,
      targetGroupTags: typeof targetGroupTags === 'string' ? targetGroupTags.split(',').map(t => t.trim()).filter(Boolean) : targetGroupTags,
      enabled: true,
      lastFetchedAt: null
    };

    db.addItem('rss_sources', newSource);
    res.json({ success: true, source: newSource });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/rss/:id', (req, res) => {
  try {
    const updates = { ...req.body };
    if (typeof updates.targetGroupTags === 'string') {
      updates.targetGroupTags = updates.targetGroupTags.split(',').map(t => t.trim()).filter(Boolean);
    }
    const updated = db.updateItem('rss_sources', req.params.id, updates);
    if (!updated) return res.status(404).json({ error: 'RSS Source not found' });
    res.json({ success: true, source: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/rss/:id', (req, res) => {
  db.deleteItem('rss_sources', req.params.id);
  res.json({ success: true });
});

router.post('/rss/:id/fetch', async (req, res) => {
  try {
    const result = await rssService.ingestFeed(req.params.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Auto-Pilot Campaigns Management ---
router.get('/campaigns', (req, res) => {
  res.json({ success: true, campaigns: db.get('campaigns') });
});

router.post('/campaigns', (req, res) => {
  try {
    const { name, postSource = 'all', targetGroupTags = [], intervalMinutes = 120, repeatCount = 1, postsPerRun = 1 } = req.body;
    const newCampaign = {
      id: 'camp-' + Date.now(),
      name: name || 'Scheduled Campaign',
      postSource,
      targetGroupTags: typeof targetGroupTags === 'string' ? targetGroupTags.split(',').map(t => t.trim()).filter(Boolean) : targetGroupTags,
      intervalMinutes: Number(intervalMinutes) || 120,
      repeatCount: Number(repeatCount) || 1,
      postsPerRun: Number(postsPerRun) || 1,
      active: true,
      createdAt: new Date().toISOString(),
      lastRunAt: null
    };

    db.addItem('campaigns', newCampaign);
    res.json({ success: true, campaign: newCampaign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/campaigns/:id', (req, res) => {
  try {
    const updates = { ...req.body };
    const updated = db.updateItem('campaigns', req.params.id, updates);
    if (!updated) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ success: true, campaign: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/campaigns/:id', (req, res) => {
  db.deleteItem('campaigns', req.params.id);
  res.json({ success: true });
});

// --- Execution & Dispatcher (One-Click Multi-Poster) ---
router.post('/poster/dispatch', async (req, res) => {
  try {
    const { postIds, groupIds, repeatCount = 1, customDelayMin, customDelayMax, customMessage } = req.body;

    if (!postIds || postIds.length === 0) {
      return res.status(400).json({ error: 'Please select at least one blog post.' });
    }
    if (!groupIds || groupIds.length === 0) {
      return res.status(400).json({ error: 'Please select at least one target Facebook group or page.' });
    }

    if (posterEngine.getStatus().isBusy) {
      return res.status(409).json({ error: 'A posting session is already running.' });
    }

    // Launch asynchronously in background
    posterEngine.runBatch(postIds, groupIds, {
      repeatCount: Number(repeatCount) || 1,
      customDelayMin: customDelayMin ? Number(customDelayMin) : undefined,
      customDelayMax: customDelayMax ? Number(customDelayMax) : undefined,
      customMessage
    }).catch(err => {
      console.error('Batch error:', err);
    });

    res.json({
      success: true,
      message: 'Multi-post job successfully started!',
      job: posterEngine.getStatus().currentJob
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/poster/cancel', (req, res) => {
  const cancelled = posterEngine.cancelCurrentJob();
  res.json({ success: cancelled });
});

router.get('/poster/status', (req, res) => {
  res.json(posterEngine.getStatus());
});

// --- Logs & History ---
router.get('/history', (req, res) => {
  res.json({ success: true, history: db.get('history') });
});

router.delete('/history', (req, res) => {
  db.clearHistory();
  res.json({ success: true });
});

// --- Settings ---
router.get('/settings', (req, res) => {
  res.json({ success: true, settings: db.getSettings() });
});

router.post('/settings', (req, res) => {
  try {
    const updated = db.updateSettings(req.body);
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
