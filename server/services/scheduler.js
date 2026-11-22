const cron = require('node-cron');
const db = require('../database');
const rssService = require('./rssService');
const posterEngine = require('../automation/posterEngine');

class AutoScheduler {
  constructor() {
    this.jobs = new Map();
    this.ticker = null;
  }

  start() {
    console.log('⏰ Auto-Pilot Scheduler initialized.');

    // Run every minute ticker to evaluate campaigns and RSS feeds
    this.ticker = cron.schedule('* * * * *', async () => {
      try {
        await this.checkRssFeeds();
        await this.checkCampaigns();
      } catch (err) {
        console.error('Scheduler tick error:', err);
      }
    });
  }

  stop() {
    if (this.ticker) {
      this.ticker.stop();
      this.ticker = null;
    }
  }

  // Periodic RSS ingestion check
  async checkRssFeeds() {
    const rssSources = db.get('rss_sources').filter(s => s.enabled);
    const now = Date.now();

    for (const source of rssSources) {
      const intervalMs = (source.refreshMinutes || 60) * 60 * 1000;
      const lastFetched = source.lastFetchedAt ? new Date(source.lastFetchedAt).getTime() : 0;

      if (now - lastFetched >= intervalMs) {
        try {
          console.log(`[Scheduler] Checking RSS Feed: ${source.name} (${source.url})`);
          const result = await rssService.ingestFeed(source.id);

          if (result.addedCount > 0) {
            posterEngine.log(`[RSS Auto-Ingest] Found ${result.addedCount} new post(s) from "${source.name}".`, 'info');

            // If auto-post is enabled on this RSS source, automatically trigger multi-post
            if (source.autoPost && result.newlyAdded.length > 0) {
              const matchingGroups = db.get('groups').filter(g => {
                if (!g.enabled) return false;
                if (!source.targetGroupTags || source.targetGroupTags.length === 0) return true;
                return (g.tags || []).some(t => source.targetGroupTags.includes(t));
              });

              if (matchingGroups.length > 0) {
                const postIds = result.newlyAdded.map(p => p.id);
                const groupIds = matchingGroups.map(g => g.id);

                posterEngine.log(`[RSS Auto-Post] Auto-triggering post of ${postIds.length} new article(s) to ${groupIds.length} group(s)...`, 'info');
                
                // Run in background if not already busy
                if (!posterEngine.getStatus().isBusy) {
                  posterEngine.runBatch(postIds, groupIds, { repeatCount: 1 }).catch(e => {
                    console.error('RSS auto-post run failed:', e);
                  });
                }
              }
            }
          }
        } catch (feedErr) {
          console.error(`Error processing RSS feed ${source.url}:`, feedErr.message);
        }
      }
    }
  }

  // Periodic Campaign execution check
  async checkCampaigns() {
    const campaigns = db.get('campaigns').filter(c => c.active);
    const now = Date.now();

    for (const campaign of campaigns) {
      const intervalMs = (campaign.intervalMinutes || 120) * 60 * 1000;
      const lastRun = campaign.lastRunAt ? new Date(campaign.lastRunAt).getTime() : 0;

      if (now - lastRun >= intervalMs) {
        if (posterEngine.getStatus().isBusy) {
          console.log(`[Campaign ${campaign.name}] Waiting because poster engine is busy.`);
          continue;
        }

        try {
          console.log(`[Campaign ${campaign.name}] Triggering scheduled run...`);
          let postsToRun = [];

          if (campaign.postIds && campaign.postIds.length > 0) {
            postsToRun = db.get('posts').filter(p => campaign.postIds.includes(p.id));
          } else {
            // Sort by timesPosted ascending to pick least posted articles
            const allPosts = db.get('posts');
            if (campaign.postSource === 'random') {
              postsToRun = allPosts.sort(() => 0.5 - Math.random()).slice(0, campaign.postsPerRun || 1);
            } else {
              // Round robin / least posted first
              postsToRun = allPosts.sort((a, b) => (a.timesPosted || 0) - (b.timesPosted || 0)).slice(0, campaign.postsPerRun || 1);
            }
          }

          let groupsToTarget = [];
          if (campaign.targetGroupIds && campaign.targetGroupIds.length > 0) {
            groupsToTarget = db.get('groups').filter(g => campaign.targetGroupIds.includes(g.id) && g.enabled);
          } else if (campaign.targetGroupTags && campaign.targetGroupTags.length > 0) {
            groupsToTarget = db.get('groups').filter(g => g.enabled && (g.tags || []).some(t => campaign.targetGroupTags.includes(t)));
          } else {
            groupsToTarget = db.get('groups').filter(g => g.enabled);
          }

          if (postsToRun.length > 0 && groupsToTarget.length > 0) {
            db.updateItem('campaigns', campaign.id, { lastRunAt: new Date().toISOString() });

            posterEngine.runBatch(
              postsToRun.map(p => p.id),
              groupsToTarget.map(g => g.id),
              {
                repeatCount: campaign.repeatCount || 1
              }
            ).catch(err => {
              console.error(`Error in campaign execution:`, err);
            });
          }
        } catch (campErr) {
          console.error(`Error running campaign ${campaign.name}:`, campErr);
        }
      }
    }
  }
}

const scheduler = new AutoScheduler();
module.exports = scheduler;
