const { fbAutomation, sleep, randomBetween } = require('./facebook');
const db = require('../database');

class PosterEngine {
  constructor() {
    this.currentJob = null;
    this.isCancelled = false;
    this.sseClients = new Set();
  }

  // Register SSE Client for real-time dashboard events
  addSseClient(res) {
    this.sseClients.add(res);
    res.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  // Broadcast event to all connected dashboard tabs
  broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch (err) {
        this.sseClients.delete(client);
      }
    }
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `[${timestamp}] ${message}`;
    console.log(formatted);
    this.broadcast('log', { message: formatted, type, timestamp });
  }

  cancelCurrentJob() {
    if (this.currentJob && this.currentJob.status === 'RUNNING') {
      this.isCancelled = true;
      this.log('Cancellation requested by user. Terminating job after current step...', 'warning');
      return true;
    }
    return false;
  }

  getStatus() {
    return {
      currentJob: this.currentJob,
      isBusy: !!(this.currentJob && this.currentJob.status === 'RUNNING')
    };
  }

  // Execute a multi-post batch
  // postIds: array of blog post IDs to post
  // groupIds: array of Facebook group/page IDs to target
  // options: { repeatCount: 1, customDelayMin: null, customDelayMax: null, customMessage: '' }
  async runBatch(postIds, groupIds, options = {}) {
    if (this.currentJob && this.currentJob.status === 'RUNNING') {
      throw new Error('Another posting job is currently running. Please wait or cancel it first.');
    }

    const posts = db.get('posts').filter(p => postIds.includes(p.id));
    const groups = db.get('groups').filter(g => groupIds.includes(g.id) && g.enabled !== false);

    if (posts.length === 0) {
      throw new Error('No valid blog posts found for execution.');
    }
    if (groups.length === 0) {
      throw new Error('No enabled Facebook groups or pages selected.');
    }

    const settings = db.getSettings();
    const delayMin = options.customDelayMin || settings.minDelaySeconds || 45;
    const delayMax = options.customDelayMax || settings.maxDelaySeconds || 90;
    const repeatCount = options.repeatCount || 1;

    this.isCancelled = false;
    const totalOperations = posts.length * groups.length * repeatCount;

    this.currentJob = {
      id: 'job-' + Date.now(),
      status: 'RUNNING',
      startedAt: new Date().toISOString(),
      totalOperations,
      completedOperations: 0,
      successCount: 0,
      failedCount: 0,
      currentGroup: '',
      currentPost: '',
      progressPercent: 0
    };

    this.broadcast('job_start', this.currentJob);
    this.log(`🚀 Starting Multi-Posting Session: ${posts.length} post(s) to ${groups.length} group(s), repeating ${repeatCount} time(s). Total actions: ${totalOperations}.`, 'info');

    try {
      for (let cycle = 1; cycle <= repeatCount; cycle++) {
        if (this.isCancelled) break;
        if (repeatCount > 1) {
          this.log(`--- Starting Posting Cycle #${cycle} of ${repeatCount} ---`, 'info');
        }

        for (const post of posts) {
          if (this.isCancelled) break;

          for (const group of groups) {
            if (this.isCancelled) break;

            this.currentJob.currentGroup = group.name;
            this.currentJob.currentPost = post.title;
            this.broadcast('job_progress', this.currentJob);

            this.log(`Posting "${post.title.substring(0, 45)}..." to group [${group.name}]...`, 'info');

            let postSuccess = false;
            let errorMsg = null;

            // Prepare customized post payload with unique tracking link per group
            let postPayload = { ...post };
            if (post.url) {
              try {
                const { trafficTracker } = require('../services/trafficTracker');
                const config = require('../config');
                const existingLinks = db.get('tracking_links') || [];
                let link = existingLinks.find(l => l.groupId === group.id && l.postId === post.id);
                if (!link) {
                  const generated = trafficTracker.generateTrackingLinks({
                    destinationUrl: post.url,
                    postId: post.id,
                    groups: [group]
                  });
                  link = generated[0];
                }
                if (link) {
                  const port = config.PORT || 3000;
                  const trackingUrl = `http://localhost:${port}/t/${link.id}`;
                  postPayload.url = trackingUrl;
                  postPayload.originalUrl = post.url;
                  postPayload.trackingUrl = trackingUrl;
                }
              } catch (_) {}
            }

            try {
              await fbAutomation.postToTarget(group.url, postPayload, {
                customMessage: options.customMessage,
                onProgress: (statusMsg) => {
                  this.log(`[${group.name}] ${statusMsg}`, 'info');
                }
              });

              postSuccess = true;
              this.currentJob.successCount++;
              this.log(`✅ Successfully posted to ${group.name} with unique tracking link`, 'success');

              // Update stats
              db.updateItem('posts', post.id, {
                timesPosted: (post.timesPosted || 0) + 1,
                lastPostedAt: new Date().toISOString()
              });
              db.updateItem('groups', group.id, {
                totalPosts: (group.totalPosts || 0) + 1,
                lastPostedAt: new Date().toISOString()
              });

              db.addLog({
                groupName: group.name,
                groupUrl: group.url,
                postTitle: post.title,
                postUrl: post.url,
                status: 'SUCCESS',
                errorDetails: null
              });

            } catch (err) {
              errorMsg = err.message;
              this.currentJob.failedCount++;
              this.log(`❌ Failed posting to ${group.name}: ${err.message}`, 'error');

              db.addLog({
                groupName: group.name,
                groupUrl: group.url,
                postTitle: post.title,
                postUrl: post.url,
                status: 'FAILED',
                errorDetails: err.message
              });
            }

            this.currentJob.completedOperations++;
            this.currentJob.progressPercent = Math.round(
              (this.currentJob.completedOperations / totalOperations) * 100
            );
            this.broadcast('job_progress', this.currentJob);

            // Anti-Ban randomized delay between posts (skip delay on final item)
            if (this.currentJob.completedOperations < totalOperations && !this.isCancelled) {
              const waitSec = randomBetween(delayMin, delayMax);
              this.log(`⏳ Safety Anti-Spam delay: Waiting ${waitSec} seconds before next post...`, 'info');
              
              for (let w = 0; w < waitSec; w++) {
                if (this.isCancelled) break;
                await sleep(1000);
              }
            }
          }
        }
      }

      if (this.isCancelled) {
        this.currentJob.status = 'CANCELLED';
        this.log('🛑 Multi-posting job was stopped by user.', 'warning');
      } else {
        this.currentJob.status = 'COMPLETED';
        this.log(`🎉 Job finished! Total Success: ${this.currentJob.successCount}, Failed: ${this.currentJob.failedCount}`, 'success');
      }

      this.currentJob.finishedAt = new Date().toISOString();
      this.broadcast('job_complete', this.currentJob);
      return this.currentJob;

    } catch (criticalErr) {
      this.currentJob.status = 'ERROR';
      this.currentJob.error = criticalErr.message;
      this.log(`💥 Critical job error: ${criticalErr.message}`, 'error');
      this.broadcast('job_complete', this.currentJob);
      throw criticalErr;
    }
  }
}

const posterEngine = new PosterEngine();
module.exports = posterEngine;
