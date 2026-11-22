/**
 * FB AutoBlog Master - Website Traffic Tracker & GA4 Integration
 * Tracks link clicks, deduplicates unique visitors and sessions, 
 * enriches with UTM parameters, and syncs with Google Analytics 4.
 */

const crypto = require('crypto');
const db = require('../database');

// Country detection helper from IP or headers
function detectCountryFromRequest(req) {
  // Check common reverse proxy / cloudflare headers
  const cfCountry = req.headers['cf-ipcountry'];
  if (cfCountry && cfCountry.length === 2 && cfCountry !== 'XX') {
    return { countryCode: cfCountry.toUpperCase(), country: getCountryName(cfCountry) };
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = (forwardedFor ? forwardedFor.split(',')[0] : req.socket?.remoteAddress || '127.0.0.1').trim();

  // If local/private IP
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { countryCode: 'US', country: 'United States (Local)' };
  }

  return { countryCode: 'US', country: 'United States' };
}

const COUNTRY_MAP = {
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  DE: 'Germany',
  FR: 'France',
  IN: 'India',
  PK: 'Pakistan',
  NG: 'Nigeria',
  PH: 'Philippines',
  BR: 'Brazil',
  AE: 'United Arab Emirates'
};

function getCountryName(code) {
  return COUNTRY_MAP[code.toUpperCase()] || code.toUpperCase();
}

class TrafficTracker {
  /**
   * Generates unique tracking links for a list of target groups
   */
  generateTrackingLinks({ destinationUrl, postId, groups }) {
    if (!destinationUrl) {
      throw new Error('Destination website URL is required.');
    }

    const createdLinks = [];
    for (const group of groups) {
      const trackingId = 'tr-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5);
      
      const linkRecord = {
        id: trackingId,
        destinationUrl: destinationUrl.trim(),
        postId: postId || 'custom',
        groupId: group.id,
        groupName: group.name,
        groupUrl: group.url,
        country: group.country || 'Worldwide',
        countryCode: group.countryCode || 'ALL',
        createdAt: new Date().toISOString(),
        trackingUrl: `/t/${trackingId}`,
        clicks: 0,
        uniqueVisitors: 0,
        sessions: 0
      };

      db.addItem('tracking_links', linkRecord);
      createdLinks.push(linkRecord);
    }

    return createdLinks;
  }

  /**
   * Records an incoming click from a tracking link
   */
  async recordClick(trackingId, req) {
    const trackingLinks = db.get('tracking_links') || [];
    const link = trackingLinks.find(l => l.id === trackingId);

    if (!link) {
      return null;
    }

    const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || '127.0.0.1').trim();
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const referrer = req.headers['referer'] || req.headers['referrer'] || 'https://www.facebook.com/';
    const { countryCode, country } = detectCountryFromRequest(req);

    // Visitor fingerprint (SHA-256 hash of IP + User-Agent for privacy and deduplication)
    const visitorFingerprint = crypto.createHash('sha256').update(`${ip}-${userAgent}`).digest('hex').substring(0, 16);

    const trafficClicks = db.get('traffic_clicks') || [];
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);

    // Check if unique visitor in last 24 hours
    const recentVisitorClick = trafficClicks.find(c => 
      c.trackingId === trackingId &&
      c.fingerprint === visitorFingerprint &&
      new Date(c.timestamp) > oneDayAgo
    );
    const isUniqueVisitor = !recentVisitorClick;

    // Check if new session in last 30 minutes
    const recentSessionClick = trafficClicks.find(c =>
      c.trackingId === trackingId &&
      c.fingerprint === visitorFingerprint &&
      new Date(c.timestamp) > thirtyMinAgo
    );
    const isNewSession = !recentSessionClick;

    // Mask IP for privacy (e.g. 192.168.xxx.xxx)
    const ipParts = ip.split('.');
    const maskedIp = ipParts.length === 4 ? `${ipParts[0]}.${ipParts[1]}.*.*` : 'IP Protected';

    const clickEvent = {
      id: 'clk-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      trackingId,
      groupId: link.groupId,
      groupName: link.groupName,
      postId: link.postId,
      timestamp: now.toISOString(),
      maskedIp,
      fingerprint: visitorFingerprint,
      userAgent,
      referrer,
      country,
      countryCode,
      isUniqueVisitor,
      isNewSession
    };

    db.addItem('traffic_clicks', clickEvent);

    // Update aggregate stats on link record
    link.clicks = (link.clicks || 0) + 1;
    if (isUniqueVisitor) link.uniqueVisitors = (link.uniqueVisitors || 0) + 1;
    if (isNewSession) link.sessions = (link.sessions || 0) + 1;
    db.updateItem('tracking_links', link.id, link);

    // Sync to Google Analytics 4 if configured
    this.sendToGA4(link, clickEvent).catch(err => {
      console.warn('GA4 dispatch notice:', err.message);
    });

    // Build Final Destination URL with Full UTM Parameters
    const finalUrl = this.buildUtmUrl(link.destinationUrl, {
      groupName: link.groupName,
      country: countryCode,
      trackingId
    });

    return {
      destinationUrl: finalUrl,
      clickEvent
    };
  }

  /**
   * Appends UTM parameters to destination URL
   */
  buildUtmUrl(baseUrl, { groupName, country, trackingId }) {
    try {
      const url = new URL(baseUrl);
      const cleanSlug = (groupName || 'facebook_group').toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 30);
      
      url.searchParams.set('utm_source', 'facebook');
      url.searchParams.set('utm_medium', 'group_post');
      url.searchParams.set('utm_campaign', 'fb_traffic_booster');
      url.searchParams.set('utm_content', cleanSlug);
      url.searchParams.set('utm_term', (country || 'global').toLowerCase());
      url.searchParams.set('fb_ref', trackingId);

      return url.toString();
    } catch (_) {
      const delimiter = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${delimiter}utm_source=facebook&utm_medium=group_post&utm_campaign=fb_traffic_booster&fb_ref=${trackingId}`;
    }
  }

  /**
   * Dispatches GA4 Measurement Protocol Event
   */
  async sendToGA4(link, clickEvent) {
    const settings = db.getSettings();
    const measurementId = settings.ga4MeasurementId;
    const apiSecret = settings.ga4ApiSecret;

    if (!measurementId || !apiSecret) {
      return; // GA4 not configured
    }

    try {
      const endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;
      const payload = {
        client_id: clickEvent.fingerprint,
        events: [
          {
            name: 'facebook_group_click',
            params: {
              group_name: link.groupName,
              group_id: link.groupId,
              country: clickEvent.country,
              is_unique_visitor: clickEvent.isUniqueVisitor ? 1 : 0,
              is_new_session: clickEvent.isNewSession ? 1 : 0
            }
          }
        ]
      };

      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      // Non-blocking error
    }
  }

  /**
   * Aggregates Complete Traffic Analytics
   */
  getTrafficAnalytics() {
    const trackingLinks = db.get('tracking_links') || [];
    const trafficClicks = db.get('traffic_clicks') || [];

    const totalClicks = trafficClicks.length;
    const uniqueVisitors = trafficClicks.filter(c => c.isUniqueVisitor).length;
    const totalSessions = trafficClicks.filter(c => c.isNewSession).length;
    const clickToVisitorRate = totalClicks > 0 ? Math.round((uniqueVisitors / totalClicks) * 100) : 0;

    // Group-wise Leaderboard
    const groupStats = {};
    for (const click of trafficClicks) {
      const gId = click.groupId || 'unknown';
      if (!groupStats[gId]) {
        groupStats[gId] = {
          groupId: gId,
          groupName: click.groupName || 'Unknown Group',
          clicks: 0,
          uniqueVisitors: 0,
          sessions: 0,
          lastClickAt: click.timestamp
        };
      }
      groupStats[gId].clicks += 1;
      if (click.isUniqueVisitor) groupStats[gId].uniqueVisitors += 1;
      if (click.isNewSession) groupStats[gId].sessions += 1;
      if (new Date(click.timestamp) > new Date(groupStats[gId].lastClickAt)) {
        groupStats[gId].lastClickAt = click.timestamp;
      }
    }

    const bestGroups = Object.values(groupStats)
      .map(g => ({
        ...g,
        conversionRate: g.clicks > 0 ? Math.round((g.uniqueVisitors / g.clicks) * 100) : 0
      }))
      .sort((a, b) => b.clicks - a.clicks);

    // Country-wise breakdown
    const countryStats = {};
    for (const click of trafficClicks) {
      const cCode = click.countryCode || 'ALL';
      const cName = click.country || 'Worldwide';
      if (!countryStats[cCode]) {
        countryStats[cCode] = {
          countryCode: cCode,
          country: cName,
          clicks: 0,
          uniqueVisitors: 0
        };
      }
      countryStats[cCode].clicks += 1;
      if (click.isUniqueVisitor) countryStats[cCode].uniqueVisitors += 1;
    }

    const countryBreakdown = Object.values(countryStats)
      .map(c => ({
        ...c,
        percentage: totalClicks > 0 ? Math.round((c.clicks / totalClicks) * 100) : 0
      }))
      .sort((a, b) => b.clicks - a.clicks);

    // Post-wise performance
    const posts = db.get('posts') || [];
    const postStats = {};
    for (const click of trafficClicks) {
      const pId = click.postId || 'custom';
      if (!postStats[pId]) {
        const postObj = posts.find(p => p.id === pId);
        postStats[pId] = {
          postId: pId,
          postTitle: postObj ? postObj.title : 'Custom Post Link',
          clicks: 0,
          uniqueVisitors: 0
        };
      }
      postStats[pId].clicks += 1;
      if (click.isUniqueVisitor) postStats[pId].uniqueVisitors += 1;
    }
    const postBreakdown = Object.values(postStats).sort((a, b) => b.clicks - a.clicks);

    const summaryData = {
      totalClicks,
      uniqueVisitors,
      totalSessions,
      clickToVisitorRate,
      totalTrackingLinks: trackingLinks.length
    };

    return {
      summary: summaryData,
      overview: summaryData,
      totalClicks,
      uniqueVisitors,
      sessions: totalSessions,
      conversionRate: clickToVisitorRate,
      leaderboard: bestGroups,
      bestGroups,
      countryBreakdown,
      postBreakdown,
      recentClicks: trafficClicks.slice(0, 30)
    };
  }
}

const trafficTracker = new TrafficTracker();

module.exports = {
  TrafficTracker,
  trafficTracker
};
