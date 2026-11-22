/**
 * Comprehensive Automated Test Suite
 * Tests all 8 First Working Demo requirements & new services end-to-end
 */

const assert = require('assert');
const db = require('./server/database');
const { groupFinderService } = require('./server/services/groupFinderService');
const { groupVerifier } = require('./server/services/groupVerifier');
const { trafficTracker } = require('./server/services/trafficTracker');

async function runTestSuite() {
  console.log('====================================================');
  console.log('🚀 RUNNING FACEBOOK AUTO GROUP & TRAFFIC TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  // 1. Group Finder Worldwide & Strict Verification Tests
  console.log('--- 1. Worldwide Group Finder & Strict No-Approval ---');

  test('Strict No-Admin-Approval Filter: Only returns verified direct post groups', () => {
    const res = groupFinderService.findGroups({ noAdminApprovalOnly: true });
    assert(res.groups.length > 0, 'Should find groups');
    res.groups.forEach(g => {
      assert.strictEqual(g.postApproval, 'NO_APPROVAL_REQUIRED', `Group ${g.name} must have NO_APPROVAL_REQUIRED`);
    });
  });

  test('Country-Wise Filtering: Supports US, GB, CA, AU, IN, PK, etc.', () => {
    const usRes = groupFinderService.findGroups({ country: 'US', noAdminApprovalOnly: false });
    assert(usRes.groups.length > 0, 'Should return US groups');
    usRes.groups.forEach(g => assert(['US', 'ALL'].includes(g.countryCode)));

    const inRes = groupFinderService.findGroups({ country: 'IN', noAdminApprovalOnly: false });
    assert(inRes.groups.length > 0, 'Should return IN groups');
    inRes.groups.forEach(g => assert(['IN', 'ALL'].includes(g.countryCode)));

    const gbRes = groupFinderService.findGroups({ country: 'GB', noAdminApprovalOnly: false });
    assert(gbRes.groups.length > 0, 'Should return GB groups');
    gbRes.groups.forEach(g => assert(['GB', 'ALL'].includes(g.countryCode)));
  });

  test('Keyword Search Filter: Finds niche-relevant groups', () => {
    const cryptoRes = groupFinderService.findGroups({ keyword: 'Crypto', noAdminApprovalOnly: false });
    assert(cryptoRes.groups.length > 0, 'Should find Crypto groups');
    cryptoRes.groups.forEach(g => {
      const match = g.name.toLowerCase().includes('crypto') ||
                    g.niche.toLowerCase().includes('crypto');
      assert(match, `Group ${g.name} should match keyword crypto`);
    });
  });

  test('Link Permission Filter: Confirms link allowed vs restricted', () => {
    const linkRes = groupFinderService.findGroups({ linkPermissionOnly: true });
    assert(linkRes.groups.length > 0, 'Should return link allowed groups');
    linkRes.groups.forEach(g => {
      assert.strictEqual(g.linkPermission, 'ALLOWED', `Group ${g.name} must have ALLOWED link permission`);
    });
  });

  test('Active Group Analyzer: High daily velocity filter', () => {
    const highActivityRes = groupFinderService.findGroups({ minActivity: 'HIGH', noAdminApprovalOnly: false });
    assert(highActivityRes.groups.length > 0, 'Should return active groups');
    highActivityRes.groups.forEach(g => {
      assert.strictEqual(g.activity.engagementLevel, 'HIGH', `Group ${g.name} should be HIGH engagement`);
    });
  });

  test('Group Discovery Deduplication: No duplicate URLs in discovery catalog', () => {
    const all = groupFinderService.findGroups({ noAdminApprovalOnly: false });
    const urls = new Set();
    all.groups.forEach(g => {
      const norm = g.url.toLowerCase().replace(/\/$/, '');
      assert(!urls.has(norm), `Duplicate URL found: ${norm}`);
      urls.add(norm);
    });
  });

  // 2. Live Verification Engine
  console.log('\n--- 2. Live Verification Engine ---');

  await asyncTest('DOM & URL Verification Heuristics', async () => {
    const verified = await groupVerifier.verifyGroup('https://www.facebook.com/groups/bloggerspassioncommunity');
    assert(verified, 'Verification object returned');
    assert(['NO_APPROVAL_REQUIRED', 'REQUIRES_APPROVAL', 'UNVERIFIED'].includes(verified.postApproval));
    assert(['ALLOWED', 'RESTRICTED', 'UNVERIFIED'].includes(verified.linkPermission));
    assert(verified.activity && typeof verified.activity.postsPerDay === 'number');
  });

  // 3. Database Batch Save & Deduplication
  console.log('\n--- 3. Database Batch Save & Deduplication ---');

  await asyncTest('Batch Save Discovered Groups & Deduplication', async () => {
    const testGroup1 = {
      id: 'grp-test-dedup-1',
      name: 'Test Discovery Group 1',
      url: 'https://www.facebook.com/groups/test_discovery_group_unique_1',
      country: 'United States',
      countryCode: 'US',
      postApproval: 'NO_APPROVAL_REQUIRED',
      linkPermission: 'ALLOWED',
      joinStatus: 'NOT_JOINED',
      enabled: true
    };
    const testGroup2Duplicate = {
      id: 'grp-test-dedup-2',
      name: 'Test Discovery Group 1 (Duplicate)',
      url: 'https://www.facebook.com/groups/test_discovery_group_unique_1/', // trailing slash
      country: 'United States',
      countryCode: 'US',
      postApproval: 'NO_APPROVAL_REQUIRED',
      linkPermission: 'ALLOWED',
      joinStatus: 'NOT_JOINED',
      enabled: true
    };

    db.addItem('groups', testGroup1);
    db.addItem('groups', testGroup2Duplicate);

    // Test Deduplication
    const dedupRes = db.deduplicateGroups();
    assert(dedupRes.removedCount >= 1, 'Should have removed at least 1 duplicate');
  });

  await asyncTest('Update Join Status (JOINED, PENDING, NOT_JOINED)', async () => {
    const groups = db.get('groups');
    assert(groups.length > 0, 'Should have groups');
    const target = groups[0];

    const updated = db.updateItem('groups', target.id, { joinStatus: 'JOINED' });
    assert(updated, 'Status should update');
    assert.strictEqual(updated.joinStatus, 'JOINED');
  });

  // 4. Traffic Tracking & Attribution System
  console.log('\n--- 4. Traffic Tracking & UTM Attribution System ---');

  let testTrackingLink;
  await asyncTest('Unique Tracking Link Generator with Clean UTM Tagging', async () => {
    const targetUrl = 'https://mywebsite.com/awesome-blog-post';
    const groups = db.get('groups');
    assert(groups.length > 0, 'Groups must exist');

    const generated = trafficTracker.generateTrackingLinks({
      destinationUrl: targetUrl,
      groups: [groups[0]],
      postId: 'test-post-1'
    });
    assert(generated.length === 1, 'One link generated');
    testTrackingLink = generated[0];

    assert(testTrackingLink.id, 'Should have tracking id');
    assert(testTrackingLink.trackingUrl.includes(`/t/${testTrackingLink.id}`));
    assert.strictEqual(testTrackingLink.destinationUrl, targetUrl);

    // Verify redirect URL contains all UTM parameters
    const redirectUrl = trafficTracker.buildUtmUrl(testTrackingLink.destinationUrl, {
      groupName: testTrackingLink.groupName,
      country: testTrackingLink.countryCode,
      trackingId: testTrackingLink.id
    });
    assert(redirectUrl.includes('utm_source=facebook'), 'Has utm_source');
    assert(redirectUrl.includes('utm_medium=group_post'), 'Has utm_medium');
    assert(redirectUrl.includes('utm_campaign=fb_traffic_booster'), 'Has utm_campaign');
    assert(redirectUrl.includes(`fb_ref=${testTrackingLink.id}`), 'Has fb_ref');
  });

  await asyncTest('Click Attribution & 24h Unique Visitor Fingerprinting', async () => {
    assert(testTrackingLink, 'testTrackingLink required');

    // First click from IP 198.51.100.1
    const res1 = await trafficTracker.recordClick(testTrackingLink.id, {
      headers: {
        'x-forwarded-for': '198.51.100.1',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        'cf-ipcountry': 'US'
      }
    });
    const click1 = res1.clickEvent;
    assert(click1.isUniqueVisitor === true, 'First click must be a Unique Visitor');
    assert(click1.isNewSession === true, 'First click must be a New Session');

    // Second click from SAME IP + UA within 24h (Repeat raw click)
    const res2 = await trafficTracker.recordClick(testTrackingLink.id, {
      headers: {
        'x-forwarded-for': '198.51.100.1',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        'cf-ipcountry': 'US'
      }
    });
    const click2 = res2.clickEvent;
    assert(click2.isUniqueVisitor === false, 'Second click from same user is NOT a unique visitor');

    // Third click from DIFFERENT IP 203.0.113.5
    const res3 = await trafficTracker.recordClick(testTrackingLink.id, {
      headers: {
        'x-forwarded-for': '203.0.113.5',
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        'cf-ipcountry': 'GB'
      }
    });
    const click3 = res3.clickEvent;
    assert(click3.isUniqueVisitor === true, 'Click from new IP is a Unique Visitor');
  });

  await asyncTest('Traffic Analytics Aggregation (Leaderboard & Country Stats)', async () => {
    const stats = trafficTracker.getTrafficAnalytics();
    assert(stats.overview.totalClicks >= 3, 'Total clicks >= 3');
    assert(stats.overview.uniqueVisitors >= 2, 'Unique visitors >= 2');
    assert(stats.overview.totalClicks > stats.overview.uniqueVisitors, 'Total clicks separated from unique visitors');
    assert(stats.bestGroups.length > 0, 'Leaderboard populated');
    assert(stats.countryBreakdown.length > 0, 'Country breakdown populated');
    assert(stats.recentClicks.length > 0, 'Recent click stream populated');
  });

  // 5. Manual Posting Assistant Recording
  console.log('\n--- 5. Manual Posting Assistant Recording ---');

  await asyncTest('Record Manual Publication & Update Group Post Count', async () => {
    const groups = db.get('groups');
    const g = groups[0];
    const initialPosts = g.totalPosts || 0;

    db.updateItem('groups', g.id, { totalPosts: initialPosts + 1 });
    db.addLog({
      groupId: g.id,
      groupName: g.name,
      postId: 'test-p1',
      postTitle: 'Test Manual Article',
      status: 'SUCCESS',
      type: 'MANUAL_ASSISTANT'
    });

    const updatedGroups = db.get('groups');
    const updatedG = updatedGroups.find(item => item.id === g.id);
    assert.strictEqual(updatedG.totalPosts, initialPosts + 1, 'Total posts incremented');
  });

  // 6. Global Stats Aggregation (Requirement 14)
  console.log('\n--- 6. Dashboard Metrics & Global Stats ---');

  test('Database contains groups, posts, tracking links, and clicks', () => {
    const groups = db.get('groups');
    const posts = db.get('posts');
    const trackingLinks = db.get('tracking_links');
    const clicks = db.get('traffic_clicks');

    assert(groups.length > 0, 'Has groups');
    assert(posts.length > 0, 'Has posts');
    assert(trackingLinks.length > 0, 'Has tracking links');
    assert(clicks.length > 0, 'Has traffic clicks');
  });

  console.log('\n====================================================');
  console.log(`🎉 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
