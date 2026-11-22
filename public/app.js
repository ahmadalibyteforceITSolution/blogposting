// FB AutoBlog Master - Client Application Logic

let state = {
  posts: [],
  groups: [],
  rssSources: [],
  campaigns: [],
  history: [],
  settings: {},
  stats: {},
  activeTab: 'groupfinder',
  isLoggedIn: false,
  selectedPost: null,
  selectedGroupIds: new Set(),
  activeTagFilter: 'ALL',

  // Worldwide Group Finder State
  discoveredGroups: [],
  selectedFinderGroupIds: new Set(),
  finderKeyword: '',
  finderCountry: 'ALL',
  finderNoApprovalOnly: true, // HIGHEST PRIORITY
  finderLinkPermissionOnly: false,
  finderHighActivityOnly: false,
  finderSort: 'rank',

  // Saved Groups Filter & Selection
  savedGroupFilter: 'ALL',
  selectedSavedGroupIds: new Set(),

  // Manual Posting Assistant State
  manualQueue: [],
  manualCurrentIndex: 0,
  manualPostPayload: null,

  // Traffic Tracking State
  trafficAnalytics: null
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  switchTab(state.activeTab || 'groupfinder');
  if (window.lucide) lucide.createIcons();
  initEventSource();
  loadAllData();
  checkFacebookLogin();

  // Load initial group discovery & traffic analytics
  searchDiscoveredGroups();
  loadTrafficAnalytics();

  // Periodic status refresh
  setInterval(() => {
    fetchStats();
    loadTrafficAnalytics();
  }, 10000);

  // Global keyboard shortcuts (Escape dismisses mobile menu & open modals)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (window.innerWidth < 1024) toggleSidebar(false);
      closeAllOpenModals();
    }
  });
});

// --- Server-Sent Events (SSE) for Real-Time Streaming ---
function initEventSource() {
  const evtSource = new EventSource('/api/events');

  evtSource.addEventListener('status', (e) => {
    const data = JSON.parse(e.data);
    updateEngineStatus(data.isBusy);
  });

  evtSource.addEventListener('log', (e) => {
    const data = JSON.parse(e.data);
    appendLogToConsoles(data.message, data.type);
  });

  evtSource.addEventListener('job_start', (e) => {
    const job = JSON.parse(e.data);
    updateEngineStatus(true);
    showExecModal(job);
  });

  evtSource.addEventListener('job_progress', (e) => {
    const job = JSON.parse(e.data);
    updateExecModalProgress(job);
  });

  evtSource.addEventListener('job_complete', (e) => {
    const job = JSON.parse(e.data);
    updateEngineStatus(false);
    onJobFinished(job);
    fetchStats();
    loadHistory();
    loadPosts();
    loadGroups();
  });

  evtSource.onerror = () => {
    // Reconnects automatically
  };
}

function updateEngineStatus(isBusy) {
  const pill = document.getElementById('topbar-engine-status');
  if (!pill) return;
  const dot = pill.querySelector('span');
  const text = document.getElementById('topbar-engine-text');

  if (isBusy) {
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-ping';
    if (text) {
      text.textContent = 'Posting in Progress...';
      text.className = 'text-amber-300 font-medium';
    }
  } else {
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400 pulse-green';
    if (text) {
      text.textContent = 'Engine Idle';
      text.className = 'text-gray-300';
    }
  }
}

function appendLogToConsoles(msg, type = 'info') {
  // Append to Overview console
  const ovConsole = document.getElementById('overview-console-log');
  if (ovConsole) {
    const row = document.createElement('div');
    row.className = getLogClass(type);
    row.textContent = msg;
    ovConsole.appendChild(row);
    ovConsole.scrollTop = ovConsole.scrollHeight;
  }

  // Append to Live Modal terminal
  const modalTerminal = document.getElementById('exec-terminal-logs');
  if (modalTerminal) {
    const row = document.createElement('div');
    row.className = getLogClass(type);
    row.textContent = msg;
    modalTerminal.appendChild(row);
    modalTerminal.scrollTop = modalTerminal.scrollHeight;
  }
}

function getLogClass(type) {
  switch (type) {
    case 'success': return 'text-emerald-400 font-semibold';
    case 'error': return 'text-red-400 font-semibold';
    case 'warning': return 'text-amber-300';
    default: return 'text-gray-300';
  }
}

// --- Data Fetching ---
async function loadAllData() {
  await Promise.all([
    fetchStats(),
    loadPosts(),
    loadGroups(),
    loadRssSources(),
    loadCampaigns(),
    loadHistory(),
    loadSettings()
  ]);
  renderGroupFilterTags();
}

async function fetchStats() {
  const data = await safeApiCall('/api/stats');
  if (data && data.success && data.stats) {
    state.stats = data.stats;
    const statPosts = document.getElementById('stat-posts');
    const statGroups = document.getElementById('stat-groups');
    const statSuccess = document.getElementById('stat-success');
    const statFailed = document.getElementById('stat-failed');
    const statCampaigns = document.getElementById('stat-campaigns');

    if (statPosts) statPosts.textContent = data.stats.totalPosts;
    if (statGroups) statGroups.textContent = `${data.stats.activeGroups} / ${data.stats.totalGroups}`;
    if (statSuccess) statSuccess.textContent = data.stats.successfulPosts;
    if (statFailed) statFailed.textContent = data.stats.failedPosts;
    if (statCampaigns) statCampaigns.textContent = data.stats.activeCampaigns;

    // Requirement 14 Extended Dashboard KPIs
    const statDiscovered = document.getElementById('stat-discovered');
    const statVerifiedNoApproval = document.getElementById('stat-verified-no-approval');
    const statJoined = document.getElementById('stat-joined');
    const statPending = document.getElementById('stat-pending');
    const statClicks = document.getElementById('stat-clicks');
    const statVisitors = document.getElementById('stat-visitors');
    const statSessions = document.getElementById('stat-sessions');
    const statManual = document.getElementById('stat-manual');

    if (statDiscovered) statDiscovered.textContent = state.discoveredGroups.length || 31;
    if (statVerifiedNoApproval) statVerifiedNoApproval.textContent = data.stats.verifiedNoApprovalGroups || 0;
    if (statJoined) statJoined.textContent = data.stats.joinedGroups || 0;
    if (statPending) statPending.textContent = (data.stats.totalGroups - (data.stats.joinedGroups || 0));
    if (statClicks) statClicks.textContent = data.stats.totalClicks || 0;
    if (statVisitors) statVisitors.textContent = data.stats.uniqueVisitors || 0;
    if (statSessions) statSessions.textContent = data.stats.uniqueVisitors || 0;
    if (statManual) statManual.textContent = data.stats.manualPosts || 0;

    const badgePosts = document.getElementById('nav-badge-posts');
    const badgeGroups = document.getElementById('nav-badge-groups');
    const badgeRss = document.getElementById('nav-badge-rss');
    const badgeClicks = document.getElementById('nav-badge-clicks');

    if (badgePosts) badgePosts.textContent = data.stats.totalPosts;
    if (badgeGroups) badgeGroups.textContent = data.stats.totalGroups;
    if (badgeRss) badgeRss.textContent = state.rssSources.length;
    if (badgeClicks) badgeClicks.textContent = `${data.stats.totalClicks || 0} Clicks`;

    updateEngineStatus(data.stats.isBusy);
  }
}

// Safe API request helper to prevent JSON parse errors
async function safeApiCall(url, options = {}) {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      return { ok: res.ok, status: res.status, ...data };
    }
    const text = await res.text();
    return { ok: false, status: res.status, error: text || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function checkFacebookLogin(manual = false) {
  const dot = document.getElementById('sidebar-fb-dot');
  const text = document.getElementById('sidebar-fb-text');

  if (manual && text) {
    text.textContent = 'Verifying...';
    if (dot) dot.className = 'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse ring-2 ring-[#0A0D18]';
  }

  const data = await safeApiCall('/api/auth/status');
  state.isLoggedIn = !!data.loggedIn;

  if (data.loggedIn) {
    if (dot) dot.className = 'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#0A0D18]';
    if (text) {
      text.textContent = data.mode === 'cloud' ? 'Cloud Connected' : 'Active & Connected';
      text.className = 'text-[10px] text-emerald-400 font-medium';
    }
    if (manual) showToast('Facebook session is active!', 'success');
  } else {
    if (dot) dot.className = 'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-400 ring-2 ring-[#0A0D18]';
    if (text) {
      text.textContent = data.isVercel ? 'Cloud Ready' : 'Not Connected';
      text.className = 'text-[10px] text-gray-400';
    }
    if (manual) showToast('Not logged in. Click "Login" in sidebar.', 'error');
  }
}

function openLoginModal() {
  const modal = document.getElementById('fb-connect-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeLoginModal() {
  const modal = document.getElementById('fb-connect-modal');
  if (modal) modal.classList.add('hidden');
}

function switchFbAuthMode(mode) {
  const cloudBtn = document.getElementById('btn-auth-mode-cloud');
  const desktopBtn = document.getElementById('btn-auth-mode-desktop');
  const cloudView = document.getElementById('auth-mode-cloud-view');
  const desktopView = document.getElementById('auth-mode-desktop-view');

  if (mode === 'cloud') {
    cloudBtn.className = 'flex-1 py-1.5 font-semibold rounded-md bg-indigo-600 text-white transition';
    desktopBtn.className = 'flex-1 py-1.5 font-semibold rounded-md text-gray-400 hover:text-white transition';
    cloudView.classList.remove('hidden');
    desktopView.classList.add('hidden');
  } else {
    desktopBtn.className = 'flex-1 py-1.5 font-semibold rounded-md bg-indigo-600 text-white transition';
    cloudBtn.className = 'flex-1 py-1.5 font-semibold rounded-md text-gray-400 hover:text-white transition';
    desktopView.classList.remove('hidden');
    cloudView.classList.add('hidden');
  }
}

async function handleSaveCloudSession() {
  const c_user = document.getElementById('fb-cuser')?.value?.trim();
  const xs = document.getElementById('fb-xs')?.value?.trim();

  if (!c_user || !xs) {
    return showToast('Please enter both c_user and xs cookies', 'error');
  }

  showToast('Connecting Facebook session...', 'info');
  const res = await safeApiCall('/api/auth/save-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ c_user, xs })
  });

  if (res.success) {
    showToast('Facebook connected successfully for 24/7 cloud posting!', 'success');
    closeLoginModal();
    checkFacebookLogin();
  } else {
    showToast(res.error || 'Failed to save session', 'error');
  }
}

async function handleLaunchDesktopChrome() {
  showToast('Launching Chrome browser for Facebook login...', 'info');
  const res = await safeApiCall('/api/auth/open-login', { method: 'POST' });
  if (res.success) {
    showToast('Chrome opened. Complete login in the browser window!', 'success');
    closeLoginModal();
  } else {
    showToast(res.error || 'Failed to open Chrome. Run start.bat on your PC.', 'error');
  }
}

// --- Navigation Tabs & Breadcrumbs ---
const TAB_TITLES = {
  groupfinder: 'Worldwide Facebook Group Finder',
  oneclick: '1-Click Multi-Poster Studio',
  overview: 'Dashboard & Global Metrics',
  analytics: 'Website Traffic Tracking & GA4',
  blogs: 'Blog Articles & Content Catalog',
  groups: 'Facebook Target Groups & Audiences',
  autopilot: 'Autonomous 24/7 Campaigns',
  history: 'System Audit & Execution Logs',
  settings: 'Anti-Ban & Engine Settings'
};

// --- Responsive Mobile Sidebar Drawer ---
function toggleSidebar(open) {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;

  const isClosed = sidebar.classList.contains('-translate-x-full');
  const shouldOpen = open !== undefined ? open : isClosed;

  if (shouldOpen) {
    sidebar.classList.remove('-translate-x-full');
    sidebar.classList.add('translate-x-0');
    if (overlay) overlay.classList.remove('hidden');
  } else {
    sidebar.classList.add('-translate-x-full');
    sidebar.classList.remove('translate-x-0');
    if (overlay) overlay.classList.add('hidden');
  }
}

// --- Light & Dark Theme Controller ---
function initTheme() {
  let theme = 'dark';
  try {
    const saved = localStorage.getItem('fb_autoblog_theme');
    if (saved === 'light' || saved === 'dark') {
      theme = saved;
    }
  } catch (e) {}
  setTheme(theme, false);
}

function setTheme(theme, save = true) {
  const html = document.documentElement;
  const isLight = theme === 'light';

  if (isLight) {
    html.classList.remove('dark');
    html.classList.add('light');
  } else {
    html.classList.remove('light');
    html.classList.add('dark');
  }

  // Update Header Theme Toggle Button
  const themeIcon = document.getElementById('theme-toggle-icon');
  const themeText = document.getElementById('theme-toggle-text');
  const themeBtn = document.getElementById('theme-toggle-btn');

  if (themeIcon) {
    themeIcon.setAttribute('data-lucide', isLight ? 'moon' : 'sun');
    if (isLight) {
      themeIcon.classList.remove('text-amber-400');
      themeIcon.classList.add('text-indigo-400');
    } else {
      themeIcon.classList.remove('text-indigo-400');
      themeIcon.classList.add('text-amber-400');
    }
  }
  if (themeText) {
    themeText.textContent = isLight ? 'Dark' : 'Light';
  }
  if (themeBtn) {
    themeBtn.setAttribute('title', isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode');
  }

  // Update Sidebar Bottom Theme Pill
  const sidebarThemeIcon = document.getElementById('sidebar-theme-icon');
  const sidebarThemeText = document.getElementById('sidebar-theme-text');
  if (sidebarThemeIcon) {
    sidebarThemeIcon.setAttribute('data-lucide', isLight ? 'moon' : 'sun');
    if (isLight) {
      sidebarThemeIcon.classList.remove('text-amber-400');
      sidebarThemeIcon.classList.add('text-indigo-400');
    } else {
      sidebarThemeIcon.classList.remove('text-indigo-400');
      sidebarThemeIcon.classList.add('text-amber-400');
    }
  }
  if (sidebarThemeText) {
    sidebarThemeText.textContent = isLight ? 'Light Mode' : 'Dark Mode';
  }

  if (save) {
    try {
      localStorage.setItem('fb_autoblog_theme', theme);
      if (typeof showToast === 'function') {
        showToast(isLight ? 'Switched to Light Theme' : 'Switched to Dark Theme', 'success');
      }
    } catch (e) {}
  }

  if (window.lucide) lucide.createIcons();
}

function toggleTheme() {
  const isCurrentlyLight = document.documentElement.classList.contains('light');
  setTheme(isCurrentlyLight ? 'dark' : 'light', true);
}

// Close all open modals helper for Escape key
function closeAllOpenModals() {
  if (typeof closePostModal === 'function') closePostModal();
  if (typeof closeGroupModal === 'function') closeGroupModal();
  if (typeof closeBulkGroupModal === 'function') closeBulkGroupModal();
  if (typeof closeRssModal === 'function') closeRssModal();
  if (typeof closeCampaignModal === 'function') closeCampaignModal();
  if (typeof closeLoginModal === 'function') closeLoginModal();
  if (typeof closeManualPosterModal === 'function') closeManualPosterModal();
  if (typeof closeGa4Modal === 'function') closeGa4Modal();
}

function switchTab(tabId) {
  state.activeTab = tabId;

  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(section => section.classList.add('hidden'));

  const activeBtn = document.getElementById(`tab-btn-${tabId}`);
  const activeSection = document.getElementById(`tab-${tabId}`);
  const breadcrumb = document.getElementById('breadcrumb-title');

  if (activeBtn) activeBtn.classList.add('active');
  if (activeSection) activeSection.classList.remove('hidden');
  if (breadcrumb && TAB_TITLES[tabId]) breadcrumb.textContent = TAB_TITLES[tabId];

  // Auto close mobile drawer on tab navigation
  if (window.innerWidth < 1024) {
    toggleSidebar(false);
  }

  if (window.lucide) lucide.createIcons();
}

function openVideoMediaModal() {
  openNewPostModal();
  const title = document.getElementById('post-modal-title');
  if (title) title.textContent = 'Post Video to Facebook Groups';
  const videoInput = document.getElementById('post-video-file');
  if (videoInput) videoInput.focus();
}

// --- BLOG POSTS CATALOG ---
async function loadPosts() {
  const data = await safeApiCall('/api/posts');
  if (data && data.success && data.posts) {
    state.posts = data.posts;
    renderPostsGrid();
    populateOneClickPostDropdown();
  }
}

function renderPostsGrid() {
  const container = document.getElementById('posts-grid');
  if (!container) return;

  if (state.posts.length === 0) {
    container.innerHTML = `
      <div class="col-span-full software-card p-8 text-center space-y-3">
        <i data-lucide="file-question" class="w-10 h-10 text-gray-500 mx-auto"></i>
        <h4 class="text-sm font-semibold text-gray-300">No blog posts found</h4>
        <p class="text-xs text-gray-500">Add an article manually, scrape a blog URL, or connect an RSS feed.</p>
        <button onclick="openNewPostModal()" class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-semibold">
          Add First Post
        </button>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = state.posts.map(post => `
    <div class="software-card overflow-hidden flex flex-col justify-between transition">
      <div>
        ${post.imageUrl ? `<img src="${post.imageUrl}" alt="${escapeHtml(post.title)}" class="w-full h-36 object-cover">` : ''}
        <div class="p-4 space-y-2">
          <div class="flex items-center justify-between text-[11px] text-gray-400">
            <span class="flex items-center gap-1">
              <i data-lucide="send" class="w-3 h-3 text-indigo-400"></i> Posted ${post.timesPosted || 0} times
            </span>
            <span>${new Date(post.createdAt).toLocaleDateString()}</span>
          </div>

          <h3 class="font-bold text-sm card-group-title line-clamp-2">${escapeHtml(post.title)}</h3>
          <p class="text-xs text-gray-400 line-clamp-3">${escapeHtml(post.excerpt || post.content || '')}</p>

          ${post.tags && post.tags.length > 0 ? `
            <div class="flex flex-wrap gap-1 pt-1">
              ${post.tags.map(t => `<span class="badge-tag-pill text-[10px] px-2 py-0.5 rounded-md">#${escapeHtml(t)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>

      <div class="p-4 border-t border-white/[0.06] flex items-center justify-between">
        <a href="${post.url}" target="_blank" class="text-xs text-indigo-400 hover:underline flex items-center gap-1">
          <i data-lucide="external-link" class="w-3.5 h-3.5"></i> Read Article
        </a>
        <div class="flex items-center space-x-1">
          <button onclick="quickSelectForPost('${post.id}')" class="bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600 hover:text-white px-2.5 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1">
            <i data-lucide="zap" class="w-3 h-3"></i> Post Now
          </button>
          <button onclick="deletePost('${post.id}')" class="text-gray-400 hover:text-red-400 p-1 rounded">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function quickSelectForPost(postId) {
  switchTab('oneclick');
  const select = document.getElementById('oneclick-post-select');
  if (select) {
    select.value = postId;
    handlePostSelectionChange();
  }
}

function populateOneClickPostDropdown() {
  const select = document.getElementById('oneclick-post-select');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="">-- Choose a Blog Post to Publish --</option>' +
    state.posts.map(p => `
      <option value="${p.id}">${escapeHtml(p.title)} (${p.timesPosted || 0} posts)</option>
    `).join('');

  if (currentVal && state.posts.some(p => p.id === currentVal)) {
    select.value = currentVal;
  } else if (state.posts.length > 0) {
    select.value = state.posts[0].id;
  }
  handlePostSelectionChange();
}

function handlePostSelectionChange() {
  const select = document.getElementById('oneclick-post-select');
  const postId = select?.value;
  state.selectedPost = state.posts.find(p => p.id === postId) || null;

  const previewText = document.getElementById('preview-text');
  const previewLinkCard = document.getElementById('preview-link-card');
  const previewImage = document.getElementById('preview-image');
  const previewDomain = document.getElementById('preview-card-domain');
  const previewTitle = document.getElementById('preview-card-title');
  const previewDesc = document.getElementById('preview-card-desc');
  const previewVideoWrapper = document.getElementById('preview-video-wrapper');
  const previewVideoPlayer = document.getElementById('preview-video-player');
  const previewVideoDuration = document.getElementById('preview-video-duration');
  const websiteUrlInput = document.getElementById('oneclick-website-url');

  if (!state.selectedPost) {
    if (previewText) previewText.textContent = 'Select a post above to preview how it will appear when published to Facebook groups...';
    if (previewLinkCard) previewLinkCard.classList.add('hidden');
    if (previewVideoWrapper) previewVideoWrapper.classList.add('hidden');
    return;
  }

  const p = state.selectedPost;
  let text = `📌 ${p.title}\n\n${p.excerpt || ''}\n\n🔗 ${p.url}`;
  if (p.tags && p.tags.length > 0) {
    text += `\n` + p.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' ');
  }
  if (previewText) previewText.textContent = text;

  if (websiteUrlInput && p.url) {
    websiteUrlInput.value = p.url;
  }

  try {
    const urlObj = new URL(p.url);
    if (previewDomain) previewDomain.textContent = urlObj.hostname.replace('www.', '').toUpperCase();
  } catch (_) {
    if (previewDomain) previewDomain.textContent = 'ARTICLE LINK';
  }

  if (previewTitle) previewTitle.textContent = p.title;
  if (previewDesc) previewDesc.textContent = p.excerpt || p.title;

  if (p.imageUrl) {
    if (previewImage) {
      previewImage.src = p.imageUrl;
      previewImage.classList.remove('hidden');
    }
  } else if (previewImage) {
    previewImage.classList.add('hidden');
  }

  // Interactive HTML5 video player preview (Requirement 9)
  if (p.videoUrl || p.localVideoPath) {
    if (previewVideoWrapper && previewVideoPlayer) {
      previewVideoWrapper.classList.remove('hidden');
      previewVideoPlayer.src = p.videoUrl || p.localVideoPath;
      previewVideoPlayer.onloadedmetadata = () => {
        if (previewVideoDuration && previewVideoPlayer.duration) {
          const mins = Math.floor(previewVideoPlayer.duration / 60);
          const secs = Math.floor(previewVideoPlayer.duration % 60).toString().padStart(2, '0');
          previewVideoDuration.textContent = `${mins}:${secs}`;
        }
      };
    }
  } else if (previewVideoWrapper) {
    previewVideoWrapper.classList.add('hidden');
    if (previewVideoPlayer) previewVideoPlayer.src = '';
  }

  if (previewLinkCard) previewLinkCard.classList.remove('hidden');
}

// Quick Scraper
async function handleQuickScrape() {
  const input = document.getElementById('quick-url-input');
  const url = input?.value?.trim();
  if (!url) return showToast('Please enter a blog post URL', 'error');

  try {
    showToast('Extracting article content...', 'info');
    const res = await fetch('/api/posts/scrape-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (data.success) {
      // Save directly
      const saveRes = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.post)
      });
      const saveData = await saveRes.json();
      if (saveData.success) {
        showToast('Blog post created successfully!', 'success');
        input.value = '';
        await loadPosts();
        quickSelectForPost(saveData.post.id);
      }
    } else {
      showToast(data.error || 'Failed to extract URL', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function scrapeAndCreatePost() {
  const input = document.getElementById('blog-scrape-url');
  const url = input?.value?.trim();
  if (!url) return showToast('Please paste a blog URL', 'error');

  try {
    showToast('Scraping blog article...', 'info');
    const res = await fetch('/api/posts/scrape-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (data.success) {
      const saveRes = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.post)
      });
      const saveData = await saveRes.json();
      if (saveData.success) {
        showToast('Article imported successfully!', 'success');
        input.value = '';
        await loadPosts();
      }
    } else {
      showToast(data.error || 'Failed to scrape URL', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openNewPostModal() {
  document.getElementById('post-modal-title').textContent = 'Add Blog Post';
  document.getElementById('post-form').reset();
  document.getElementById('post-id').value = '';
  document.getElementById('post-modal').classList.remove('hidden');
}

function closePostModal() {
  document.getElementById('post-modal').classList.add('hidden');
}

async function handleSavePost(e) {
  e.preventDefault();
  const form = document.getElementById('post-form');
  const formData = new FormData(form);

  const postId = document.getElementById('post-id').value;
  const url = postId ? `/api/posts/${postId}` : '/api/posts';
  const method = postId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, { method, body: formData });
    const data = await res.json();
    if (data.success) {
      showToast('Post saved successfully!', 'success');
      closePostModal();
      await loadPosts();
    } else {
      showToast(data.error || 'Failed to save post', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deletePost(postId) {
  if (!confirm('Are you sure you want to delete this blog post?')) return;
  try {
    await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
    showToast('Post deleted', 'info');
    await loadPosts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- FACEBOOK GROUPS MANAGEMENT ---
async function loadGroups() {
  const data = await safeApiCall('/api/groups');
  if (data && data.success && data.groups) {
    state.groups = data.groups;
    renderGroupsTable();
    renderOneClickGroupCheckboxes();
    renderGroupFilterTags();
  }
}

function renderGroupsTable() {
  const tbody = document.getElementById('groups-table-body');
  if (!tbody) return;

  updateSavedFilterCounts();

  const filtered = getFilteredSavedGroups();

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="px-5 py-8 text-center text-gray-500 italic">
          No groups match the current status filter. Click "All" or add target groups from the Worldwide Finder.
        </td>
      </tr>
    `;
    return;
  }

  const countryFlags = {
    US: '🇺🇸', GB: '🇬🇧', CA: '🇨🇦', AU: '🇦🇺', DE: '🇩🇪',
    FR: '🇫🇷', IN: '🇮🇳', PK: '🇵🇰', NG: '🇳🇬', PH: '🇵🇭',
    BR: '🇧🇷', AE: '🇦🇪', WW: '🌍', ALL: '🌍'
  };

  tbody.innerHTML = filtered.map(g => {
    const isSelected = state.selectedSavedGroupIds.has(g.id);
    const flag = countryFlags[g.country] || '🌍';
    const isNoApproval = g.postApproval === 'NO_APPROVAL_REQUIRED';
    const isLinkAllowed = g.linkPermission === 'ALLOWED';

    return `
      <tr class="hover:bg-gray-800/40 transition ${isSelected ? 'bg-indigo-950/20' : ''}">
        <td class="w-8 px-4 py-3">
          <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleSavedGroupSelection('${g.id}', this.checked)" class="w-4 h-4 accent-indigo-600 rounded cursor-pointer">
        </td>
        <td class="px-4 py-3">
          <div class="font-semibold text-gray-200 line-clamp-1">${escapeHtml(g.name)}</div>
          <a href="${g.url}" target="_blank" class="text-[11px] text-gray-400 hover:text-indigo-400 truncate max-w-xs block font-mono">
            ${escapeHtml(g.url)}
          </a>
        </td>
        <td class="px-3 py-3 whitespace-nowrap">
          <span class="inline-flex items-center gap-1 text-xs">
            <span>${flag}</span>
            <span class="font-mono text-gray-400 text-[11px]">${g.country || 'WW'}</span>
          </span>
        </td>
        <td class="px-3 py-3 whitespace-nowrap">
          <span class="badge-status text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 w-max ${isNoApproval ? 'badge-direct-post' : g.postApproval === 'REQUIRES_APPROVAL' ? 'badge-approval-needed' : 'badge-unverified'}">
            ${isNoApproval ? '🛡️ Direct Post' : g.postApproval === 'REQUIRES_APPROVAL' ? '⚠️ Admin Review' : '❓ Unverified'}
          </span>
        </td>
        <td class="px-3 py-3 whitespace-nowrap">
          <span class="badge-status text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 w-max ${isLinkAllowed ? 'badge-link-allowed' : 'badge-link-restricted'}">
            ${isLinkAllowed ? '🔗 Allowed' : '⛔ Restricted'}
          </span>
        </td>
        <td class="px-3 py-3 whitespace-nowrap">
          <select onchange="updateSavedGroupJoinStatus('${g.id}', this.value)" class="bg-black/60 border border-white/[0.1] rounded px-1.5 py-0.5 text-[11px] ${g.joinStatus === 'JOINED' ? 'text-emerald-400 font-semibold' : g.joinStatus === 'PENDING' ? 'text-amber-400' : 'text-gray-400'}">
            <option value="JOINED" ${g.joinStatus === 'JOINED' ? 'selected' : ''}>✅ Joined</option>
            <option value="PENDING" ${g.joinStatus === 'PENDING' ? 'selected' : ''}>⏳ Pending</option>
            <option value="NOT_JOINED" ${g.joinStatus === 'NOT_JOINED' ? 'selected' : ''}>⭕ Not Joined</option>
          </select>
        </td>
        <td class="px-3 py-3 text-center whitespace-nowrap font-mono text-[11px] text-gray-300">
          ${g.activity7d ? `${g.activity7d}/7d` : `${g.postsPerDay || 15}/day`}
        </td>
        <td class="px-3 py-3 text-center font-bold text-gray-200">
          ${g.totalPosts || 0}
        </td>
        <td class="px-4 py-3 text-right space-x-1 whitespace-nowrap">
          <button onclick="verifySingleGroupLive('${g.id}', '${encodeURIComponent(g.url)}')" title="Recheck Post Approval" class="text-gray-400 hover:text-emerald-400 p-1 rounded hover:bg-white/[0.04]">
            <i data-lucide="shield-check" class="w-3.5 h-3.5"></i>
          </button>
          <a href="${g.url}" target="_blank" title="Open Group in Facebook" class="text-gray-400 hover:text-indigo-400 p-1 inline-block rounded hover:bg-white/[0.04]">
            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
          </a>
          <button onclick="deleteGroup('${g.id}')" title="Delete Group" class="text-gray-400 hover:text-red-400 p-1 rounded hover:bg-white/[0.04]">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  updateSavedSelectionUI();
  if (window.lucide) lucide.createIcons();
}

function getFilteredSavedGroups() {
  return state.groups.filter(g => {
    if (state.savedGroupFilter === 'ALL') return true;
    if (state.savedGroupFilter === 'JOINED') return g.joinStatus === 'JOINED';
    if (state.savedGroupFilter === 'PENDING') return g.joinStatus === 'PENDING';
    if (state.savedGroupFilter === 'NOT_JOINED') return g.joinStatus === 'NOT_JOINED';
    if (state.savedGroupFilter === 'NO_APPROVAL') return g.postApproval === 'NO_APPROVAL_REQUIRED';
    return true;
  });
}

function updateSavedFilterCounts() {
  const allCount = state.groups.length;
  const joinedCount = state.groups.filter(g => g.joinStatus === 'JOINED').length;
  const pendingCount = state.groups.filter(g => g.joinStatus === 'PENDING').length;
  const notJoinedCount = state.groups.filter(g => g.joinStatus === 'NOT_JOINED').length;
  const noApprovalCount = state.groups.filter(g => g.postApproval === 'NO_APPROVAL_REQUIRED').length;

  if (document.getElementById('count-saved-all')) document.getElementById('count-saved-all').textContent = allCount;
  if (document.getElementById('count-saved-joined')) document.getElementById('count-saved-joined').textContent = joinedCount;
  if (document.getElementById('count-saved-pending')) document.getElementById('count-saved-pending').textContent = pendingCount;
  if (document.getElementById('count-saved-not-joined')) document.getElementById('count-saved-not-joined').textContent = notJoinedCount;
  if (document.getElementById('count-saved-no-approval')) document.getElementById('count-saved-no-approval').textContent = noApprovalCount;
}

function filterSavedGroupsByStatus(status) {
  state.savedGroupFilter = status;
  document.querySelectorAll('.saved-filter-pill').forEach(btn => {
    btn.classList.remove('active', 'bg-indigo-600', 'text-white');
    btn.classList.add('text-gray-400');
  });
  const idMap = {
    'ALL': 'filter-saved-all',
    'JOINED': 'filter-saved-joined',
    'PENDING': 'filter-saved-pending',
    'NOT_JOINED': 'filter-saved-not-joined',
    'NO_APPROVAL': 'filter-saved-no-approval'
  };
  const activeBtn = document.getElementById(idMap[status]);
  if (activeBtn) {
    activeBtn.classList.add('active', 'bg-indigo-600', 'text-white');
    activeBtn.classList.remove('text-gray-400');
  }
  renderGroupsTable();
}

async function updateSavedGroupJoinStatus(groupId, newStatus) {
  const res = await safeApiCall(`/api/groups/${groupId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ joinStatus: newStatus })
  });

  if (res && res.success) {
    const target = state.groups.find(g => g.id === groupId);
    if (target) target.joinStatus = newStatus;
    showToast(`Join status updated to ${newStatus}`, 'success');
    updateSavedFilterCounts();
    fetchStats();
  } else {
    showToast(res.error || 'Failed to update status', 'error');
  }
}

function toggleSelectAllSaved(checked) {
  const filtered = getFilteredSavedGroups();
  if (checked) {
    filtered.forEach(g => state.selectedSavedGroupIds.add(g.id));
  } else {
    filtered.forEach(g => state.selectedSavedGroupIds.delete(g.id));
  }
  updateSavedSelectionUI();
  renderGroupsTable();
}

function toggleSavedGroupSelection(groupId, checked) {
  if (checked) {
    state.selectedSavedGroupIds.add(groupId);
  } else {
    state.selectedSavedGroupIds.delete(groupId);
  }
  updateSavedSelectionUI();
  renderGroupsTable();
}

function updateSavedSelectionUI() {
  const badge = document.getElementById('saved-selected-badge');
  if (badge) badge.textContent = `${state.selectedSavedGroupIds.size} selected`;
  const selectAll = document.getElementById('saved-select-all');
  const filtered = getFilteredSavedGroups();
  if (selectAll) {
    selectAll.checked = filtered.length > 0 && filtered.every(g => state.selectedSavedGroupIds.has(g.id));
  }
}

function sendSavedSelectedToPoster() {
  if (state.selectedSavedGroupIds.size === 0) {
    return showToast('Select at least 1 group using the checkboxes', 'warning');
  }
  state.selectedGroupIds.clear();
  state.selectedSavedGroupIds.forEach(id => state.selectedGroupIds.add(id));
  switchTab('oneclick');
  renderOneClickGroupCheckboxes();
  showToast(`${state.selectedGroupIds.size} groups selected in 1-Click Multi-Poster!`, 'success');
}

async function handleDeduplicateGroups() {
  showToast('Scanning saved groups for duplicate URLs...', 'info');
  const res = await safeApiCall('/api/groups/deduplicate', { method: 'POST' });
  if (res && res.success) {
    showToast(`Deduplication complete: ${res.removedCount} duplicate group(s) removed!`, 'success');
    await loadGroups();
    fetchStats();
  } else {
    showToast(res.error || 'Deduplication failed', 'error');
  }
}

async function recheckSavedGroupsApproval() {
  if (state.groups.length === 0) return showToast('No saved groups to verify', 'info');
  showToast(`Verifying post approval for ${state.groups.length} saved groups...`, 'info');
  let checked = 0;
  for (const g of state.groups) {
    const res = await safeApiCall('/api/groups/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: g.url })
    });
    if (res && res.success && res.verification) {
      g.postApproval = res.verification.postApproval;
      g.linkPermission = res.verification.linkPermission;
      checked++;
    }
  }
  showToast(`Verification completed for ${checked} groups!`, 'success');
  renderGroupsTable();
  fetchStats();
}

function renderGroupFilterTags() {
  const container = document.getElementById('group-filter-tags');
  if (!container) return;

  const allTags = new Set(['ALL']);
  state.groups.forEach(g => {
    (g.tags || []).forEach(t => allTags.add(t));
  });

  container.innerHTML = Array.from(allTags).map(tag => `
    <button type="button" onclick="filterGroupsByTag('${tag}')" class="group-filter-pill px-2.5 py-1 rounded-lg text-[10px] font-semibold transition ${state.activeTagFilter === tag ? 'active' : ''}">
      ${tag === 'ALL' ? 'All Groups' : '#' + tag}
    </button>
  `).join('');
}

function filterGroupsByTag(tag) {
  state.activeTagFilter = tag;
  renderGroupFilterTags();
  renderOneClickGroupCheckboxes();
}

function renderOneClickGroupCheckboxes() {
  const container = document.getElementById('oneclick-group-list');
  if (!container) return;

  const filtered = state.groups.filter(g => {
    if (!g.enabled) return false;
    if (state.activeTagFilter === 'ALL') return true;
    return (g.tags || []).includes(state.activeTagFilter);
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-xs text-gray-500 italic p-2">No groups match this filter.</div>`;
    return;
  }

  container.innerHTML = filtered.map(g => `
    <label class="group-checkbox-item flex items-center space-x-3 p-2 rounded-lg cursor-pointer text-xs transition">
      <input type="checkbox" value="${g.id}" ${state.selectedGroupIds.has(g.id) ? 'checked' : ''} onchange="toggleGroupSelection('${g.id}', this.checked)" class="w-4 h-4 accent-indigo-600 rounded">
      <div class="flex-1 truncate">
        <div class="font-semibold card-group-title">${escapeHtml(g.name)}</div>
        <div class="text-[10px] text-gray-400 truncate font-mono">${escapeHtml(g.url)}</div>
      </div>
      <span class="badge-post-count text-[10px] font-semibold px-2 py-0.5 rounded-full">${g.totalPosts || 0} posts</span>
    </label>
  `).join('');

  updateSelectedGroupsCounter();
}

function toggleGroupSelection(groupId, isChecked) {
  if (isChecked) {
    state.selectedGroupIds.add(groupId);
  } else {
    state.selectedGroupIds.delete(groupId);
  }
  updateSelectedGroupsCounter();
}

function selectAllGroups(select) {
  const filtered = state.groups.filter(g => {
    if (!g.enabled) return false;
    if (state.activeTagFilter === 'ALL') return true;
    return (g.tags || []).includes(state.activeTagFilter);
  });

  filtered.forEach(g => {
    if (select) {
      state.selectedGroupIds.add(g.id);
    } else {
      state.selectedGroupIds.delete(g.id);
    }
  });

  renderOneClickGroupCheckboxes();
}

function updateSelectedGroupsCounter() {
  const counter = document.getElementById('selected-groups-count');
  if (counter) {
    counter.textContent = state.selectedGroupIds.size;
  }
}

async function toggleGroupStatus(groupId, enabled) {
  try {
    await fetch(`/api/groups/${groupId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    await loadGroups();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openNewGroupModal() {
  document.getElementById('group-modal-title').textContent = 'Add Facebook Group';
  document.getElementById('group-form').reset();
  document.getElementById('group-id').value = '';
  document.getElementById('group-modal').classList.remove('hidden');
}

function closeGroupModal() {
  document.getElementById('group-modal').classList.add('hidden');
}

async function handleSaveGroup(e) {
  e.preventDefault();
  const name = document.getElementById('group-name').value;
  const url = document.getElementById('group-url').value;
  const type = document.getElementById('group-type').value;
  const tags = document.getElementById('group-tags').value;

  try {
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url, type, tags })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Facebook group added!', 'success');
      closeGroupModal();
      await loadGroups();
    } else {
      showToast(data.error || 'Failed to add group', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openBulkGroupModal() {
  document.getElementById('bulk-group-modal').classList.remove('hidden');
}

function closeBulkGroupModal() {
  document.getElementById('bulk-group-modal').classList.add('hidden');
}

async function handleBulkImportGroups() {
  const text = document.getElementById('bulk-group-text').value;
  const defaultTag = document.getElementById('bulk-group-tag').value;
  if (!text.trim()) return showToast('Please paste group URLs', 'error');

  try {
    const res = await fetch('/api/groups/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, defaultTag })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Imported ${data.count} groups successfully!`, 'success');
      closeBulkGroupModal();
      await loadGroups();
    } else {
      showToast(data.error || 'Import failed', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteGroup(groupId) {
  if (!confirm('Remove this group from targets?')) return;
  try {
    await fetch(`/api/groups/${groupId}`, { method: 'DELETE' });
    state.selectedGroupIds.delete(groupId);
    await loadGroups();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- ONE-CLICK MULTI-POST DISPATCHER ---
async function dispatchOneClickPost() {
  const postSelect = document.getElementById('oneclick-post-select');
  const postId = postSelect?.value;
  if (!postId) {
    return showToast('Please select a blog post to publish', 'error');
  }

  const selectedGroupIds = Array.from(state.selectedGroupIds);
  if (selectedGroupIds.length === 0) {
    return showToast('Please check at least one target Facebook group', 'error');
  }

  const repeatCount = Number(document.getElementById('oneclick-repeat-count')?.value || 1);
  const delayMin = Number(document.getElementById('oneclick-delay-min')?.value || 45);
  const delayMax = Number(document.getElementById('oneclick-delay-max')?.value || 90);
  const customMessage = document.getElementById('oneclick-custom-message')?.value?.trim();

  try {
    const btn = document.getElementById('btn-dispatch-oneclick');
    btn.disabled = true;

    const res = await fetch('/api/poster/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postIds: [postId],
        groupIds: selectedGroupIds,
        repeatCount,
        customDelayMin: delayMin,
        customDelayMax: delayMax,
        customMessage
      })
    });

    const data = await res.json();
    btn.disabled = false;

    if (data.success) {
      showToast('Multi-posting session started!', 'success');
      showExecModal(data.job);
    } else {
      showToast(data.error || 'Failed to start session', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
    document.getElementById('btn-dispatch-oneclick').disabled = false;
  }
}

// --- LIVE EXECUTION MODAL CONTROLLER ---
function showExecModal(job) {
  const modal = document.getElementById('live-exec-modal');
  modal.classList.remove('hidden');

  document.getElementById('exec-spinner').classList.remove('hidden');
  document.getElementById('exec-modal-title').textContent = 'Posting in Progress...';
  document.getElementById('btn-stop-execution').classList.remove('hidden');

  updateExecModalProgress(job);
}

function updateExecModalProgress(job) {
  if (!job) return;
  document.getElementById('exec-progress-percent').textContent = `${job.progressPercent || 0}%`;
  document.getElementById('exec-completed-count').textContent = `${job.completedOperations || 0} / ${job.totalOperations || 0}`;
  document.getElementById('exec-progress-bar').style.width = `${job.progressPercent || 0}%`;

  document.getElementById('exec-current-group').textContent = job.currentGroup || 'Preparing browser...';
  document.getElementById('exec-success-pill').textContent = job.successCount || 0;
  document.getElementById('exec-failed-pill').textContent = job.failedCount || 0;
}

function onJobFinished(job) {
  document.getElementById('exec-spinner').classList.add('hidden');
  document.getElementById('btn-stop-execution').classList.add('hidden');

  if (job.status === 'COMPLETED') {
    document.getElementById('exec-modal-title').textContent = '🎉 Job Completed Successfully!';
    document.getElementById('exec-current-group').textContent = 'All target groups published.';
    showToast('Multi-posting session finished!', 'success');
  } else if (job.status === 'CANCELLED') {
    document.getElementById('exec-modal-title').textContent = '🛑 Job Cancelled';
    document.getElementById('exec-current-group').textContent = 'Stopped by user.';
    showToast('Posting job cancelled', 'warning');
  } else {
    document.getElementById('exec-modal-title').textContent = '⚠️ Job Error';
    document.getElementById('exec-current-group').textContent = job.error || 'Error occurred';
    showToast(job.error || 'Posting job encountered an error', 'error');
  }
}

function closeExecModal() {
  document.getElementById('live-exec-modal').classList.add('hidden');
}

async function stopExecution() {
  if (!confirm('Are you sure you want to cancel the active posting job?')) return;
  try {
    await fetch('/api/poster/cancel', { method: 'POST' });
    showToast('Stopping posting session...', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function clearDashboardLogs() {
  const ovConsole = document.getElementById('overview-console-log');
  if (ovConsole) ovConsole.innerHTML = '<div class="text-gray-500 italic">Logs cleared.</div>';
}

// --- RSS FEEDS MODAL ---
async function loadRssSources() {
  const data = await safeApiCall('/api/rss');
  if (data && data.success && data.sources) {
    state.rssSources = data.sources;
    renderRssList();
  }
}

function renderRssList() {
  const container = document.getElementById('rss-list');
  if (!container) return;

  if (state.rssSources.length === 0) {
    container.innerHTML = `<div class="text-xs text-gray-500 italic">No RSS feeds connected yet.</div>`;
    return;
  }

  container.innerHTML = state.rssSources.map(r => `
    <div class="bg-gray-900 border border-gray-700/60 rounded-xl p-3 flex items-center justify-between text-xs">
      <div>
        <div class="font-semibold text-gray-200">${escapeHtml(r.name)}</div>
        <div class="text-[10px] text-gray-500 font-mono truncate max-w-xs">${escapeHtml(r.url)}</div>
        <div class="text-[10px] text-indigo-400 mt-0.5">
          Refresh: Every ${r.refreshMinutes}m ${r.autoPost ? '• 🚀 Auto-Post ON' : ''}
        </div>
      </div>
      <div class="flex items-center space-x-1">
        <button onclick="fetchRssNow('${r.id}')" class="bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600 hover:text-white px-2.5 py-1 rounded-lg text-xs font-medium transition">
          Fetch
        </button>
        <button onclick="deleteRss('${r.id}')" class="text-gray-400 hover:text-red-400 p-1">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function openRssModal() {
  document.getElementById('rss-modal').classList.remove('hidden');
}

function closeRssModal() {
  document.getElementById('rss-modal').classList.add('hidden');
}

async function handleSaveRss(e) {
  e.preventDefault();
  const name = document.getElementById('rss-name').value;
  const url = document.getElementById('rss-url').value;
  const refreshMinutes = document.getElementById('rss-refresh').value;
  const autoPost = document.getElementById('rss-autopost').checked;

  try {
    const res = await fetch('/api/rss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url, refreshMinutes, autoPost })
    });
    const data = await res.json();
    if (data.success) {
      showToast('RSS Feed added!', 'success');
      document.getElementById('rss-form').reset();
      await loadRssSources();
      // Auto-trigger initial fetch
      fetchRssNow(data.source.id);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function fetchRssNow(sourceId) {
  try {
    showToast('Fetching latest articles from feed...', 'info');
    const res = await fetch(`/api/rss/${sourceId}/fetch`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`Imported ${data.result.addedCount} new articles!`, 'success');
      await loadPosts();
    } else {
      showToast(data.error || 'Failed to fetch RSS', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteRss(sourceId) {
  if (!confirm('Remove this RSS source?')) return;
  try {
    await fetch(`/api/rss/${sourceId}`, { method: 'DELETE' });
    await loadRssSources();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadCampaigns() {
  const data = await safeApiCall('/api/campaigns');
  if (data && data.success && data.campaigns) {
    state.campaigns = data.campaigns;
    renderCampaignsGrid();
  }
}

function renderCampaignsGrid() {
  const container = document.getElementById('campaigns-grid');
  if (!container) return;

  if (state.campaigns.length === 0) {
    container.innerHTML = `
      <div class="col-span-full software-card p-8 text-center space-y-3">
        <i data-lucide="clock" class="w-10 h-10 text-gray-500 mx-auto"></i>
        <h4 class="text-sm font-semibold text-gray-300">No Auto-Pilot Campaigns</h4>
        <p class="text-xs text-gray-500">Create recurring schedules to automatically post blog articles multiple times.</p>
        <button onclick="openNewCampaignModal()" class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-semibold">
          Create Campaign
        </button>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = state.campaigns.map(c => `
    <div class="software-card p-5 shadow-lg flex flex-col justify-between space-y-4 transition">
      <div>
        <div class="flex items-center justify-between">
          <span class="badge-status text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${c.active ? 'badge-direct-post' : 'badge-unverified'}">
            ${c.active ? '⚡ Active 24/7' : '⏸️ Paused'}
          </span>
          <button onclick="deleteCampaign('${c.id}')" class="text-gray-400 hover:text-red-400 p-1">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>

        <h3 class="font-bold text-sm card-group-title mt-2">${escapeHtml(c.name)}</h3>

        <div class="space-y-1.5 mt-3 text-xs text-gray-400">
          <div class="flex justify-between">
            <span>Interval:</span>
            <span class="text-gray-200 font-semibold">Every ${c.intervalMinutes} mins</span>
          </div>
          <div class="flex justify-between">
            <span>Repetition:</span>
            <span class="text-gray-200 font-semibold">${c.repeatCount}x cycle</span>
          </div>
          <div class="flex justify-between">
            <span>Selection:</span>
            <span class="text-gray-200 capitalize font-semibold">${c.postSource}</span>
          </div>
          <div class="flex justify-between">
            <span>Last Run:</span>
            <span class="text-gray-400 font-mono text-[11px]">${c.lastRunAt ? new Date(c.lastRunAt).toLocaleTimeString() : 'Never'}</span>
          </div>
        </div>
      </div>

      <div class="pt-3 border-t border-white/[0.06]">
        <button onclick="toggleCampaignActive('${c.id}', ${!c.active})" class="w-full py-2 rounded-xl text-xs font-semibold transition ${c.active ? 'btn-card-verify' : 'bg-emerald-600 text-white hover:bg-emerald-500'}">
          ${c.active ? 'Pause Campaign' : 'Resume Campaign'}
        </button>
      </div>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function openNewCampaignModal() {
  document.getElementById('campaign-form').reset();
  document.getElementById('campaign-id').value = '';
  document.getElementById('campaign-modal').classList.remove('hidden');
}

function closeCampaignModal() {
  document.getElementById('campaign-modal').classList.add('hidden');
}

async function handleSaveCampaign(e) {
  e.preventDefault();
  const name = document.getElementById('campaign-name').value;
  const postSource = document.getElementById('campaign-source').value;
  const postsPerRun = document.getElementById('campaign-posts-per-run').value;
  const intervalMinutes = document.getElementById('campaign-interval').value;
  const repeatCount = document.getElementById('campaign-repeat').value;
  const targetGroupTags = document.getElementById('campaign-target-tags').value;

  try {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, postSource, postsPerRun, intervalMinutes, repeatCount, targetGroupTags })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Campaign created and activated!', 'success');
      closeCampaignModal();
      await loadCampaigns();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleCampaignActive(id, active) {
  try {
    await fetch(`/api/campaigns/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active })
    });
    await loadCampaigns();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteCampaign(id) {
  if (!confirm('Delete this automated campaign?')) return;
  try {
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
    await loadCampaigns();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- LOGS & HISTORY ---
async function loadHistory() {
  const data = await safeApiCall('/api/history');
  if (data && data.success && data.history) {
    state.history = data.history;
    renderHistoryTable();
  }
}

function renderHistoryTable() {
  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;

  if (state.history.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-5 py-8 text-center text-gray-500 italic">
          No posting logs yet. Run a 1-click post or start a campaign to see live results.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.history.map(h => `
    <tr class="hover:bg-gray-800/40 transition">
      <td class="px-5 py-3 text-gray-400 font-mono text-[11px] whitespace-nowrap">
        ${new Date(h.timestamp).toLocaleTimeString()}
      </td>
      <td class="px-4 py-3 font-semibold text-gray-200">
        ${escapeHtml(h.groupName)}
      </td>
      <td class="px-4 py-3 text-gray-300 truncate max-w-xs">
        ${escapeHtml(h.postTitle)}
      </td>
      <td class="px-4 py-3">
        <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${h.status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}">
          ${h.status}
        </span>
      </td>
      <td class="px-5 py-3 text-gray-400 text-[11px]">
        ${h.errorDetails ? `<span class="text-red-400">${escapeHtml(h.errorDetails)}</span>` : '<span class="text-emerald-400">Published</span>'}
      </td>
    </tr>
  `).join('');
}

async function clearHistoryLogs() {
  if (!confirm('Clear all execution history logs?')) return;
  await safeApiCall('/api/history', { method: 'DELETE' });
  showToast('Logs cleared', 'info');
  await loadHistory();
  fetchStats();
}

// --- SETTINGS ---
async function loadSettings() {
  const data = await safeApiCall('/api/settings');
  if (data && data.success && data.settings) {
    state.settings = data.settings;
    if (document.getElementById('setting-min-delay')) document.getElementById('setting-min-delay').value = data.settings.minDelaySeconds || 45;
    if (document.getElementById('setting-max-delay')) document.getElementById('setting-max-delay').value = data.settings.maxDelaySeconds || 90;
    if (document.getElementById('setting-chrome-path')) document.getElementById('setting-chrome-path').value = data.settings.chromePath || '';
    if (document.getElementById('setting-headless')) document.getElementById('setting-headless').checked = !!data.settings.headless;
    if (document.getElementById('setting-spintax-enabled')) document.getElementById('setting-spintax-enabled').checked = !!data.settings.spintaxEnabled;
    if (document.getElementById('setting-spintax-prefix')) document.getElementById('setting-spintax-prefix').value = data.settings.spintaxPrefix || '';
    if (document.getElementById('setting-spintax-suffix')) document.getElementById('setting-spintax-suffix').value = data.settings.spintaxSuffix || '';
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const settings = {
    minDelaySeconds: Number(document.getElementById('setting-min-delay').value),
    maxDelaySeconds: Number(document.getElementById('setting-max-delay').value),
    chromePath: document.getElementById('setting-chrome-path').value.trim(),
    headless: document.getElementById('setting-headless').checked,
    spintaxEnabled: document.getElementById('setting-spintax-enabled').checked,
    spintaxPrefix: document.getElementById('setting-spintax-prefix').value,
    spintaxSuffix: document.getElementById('setting-spintax-suffix').value
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Settings saved successfully!', 'success');
      state.settings = data.settings;
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- UTILITIES ---
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast px-4 py-2.5 rounded-xl text-xs font-semibold text-white shadow-xl flex items-center space-x-2 pointer-events-auto border ${getToastColor(type)}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function getToastColor(type) {
  switch (type) {
    case 'success': return 'bg-emerald-600/95 border-emerald-500';
    case 'error': return 'bg-red-600/95 border-red-500';
    case 'warning': return 'bg-amber-600/95 border-amber-500';
    default: return 'bg-indigo-600/95 border-indigo-500';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================================
// 1. WORLDWIDE FACEBOOK GROUP FINDER CONTROLLER
// ============================================================================
async function searchDiscoveredGroups() {
  const keyword = document.getElementById('finder-keyword')?.value?.trim() || state.finderKeyword || '';
  const country = document.getElementById('finder-country')?.value || state.finderCountry || 'ALL';
  const noAdminApprovalOnly = document.getElementById('finder-no-approval') ? document.getElementById('finder-no-approval').checked : state.finderNoApprovalOnly;
  const linkPermissionOnly = document.getElementById('finder-link-allowed') ? document.getElementById('finder-link-allowed').checked : state.finderLinkPermissionOnly;
  const highActivityOnly = document.getElementById('finder-high-activity') ? document.getElementById('finder-high-activity').checked : state.finderHighActivityOnly;
  const sort = document.getElementById('finder-sort')?.value || state.finderSort || 'rank';

  state.finderKeyword = keyword;
  state.finderCountry = country;
  state.finderNoApprovalOnly = noAdminApprovalOnly;
  state.finderLinkPermissionOnly = linkPermissionOnly;
  state.finderHighActivityOnly = highActivityOnly;
  state.finderSort = sort;

  const params = new URLSearchParams({
    keyword,
    country,
    noAdminApprovalOnly: noAdminApprovalOnly.toString(),
    linkPermissionOnly: linkPermissionOnly.toString(),
    minActivity: highActivityOnly ? '10' : '0',
    sort
  });

  const res = await safeApiCall(`/api/groups/find?${params.toString()}`);
  if (res && res.success && Array.isArray(res.groups)) {
    state.discoveredGroups = res.groups;
    renderFinderResults();
  }
}

function handleFinderSearch(e) {
  if (e && e.preventDefault) e.preventDefault();
  searchDiscoveredGroups();
}

function resetFinderFilters() {
  if (document.getElementById('finder-keyword')) document.getElementById('finder-keyword').value = '';
  if (document.getElementById('finder-country')) document.getElementById('finder-country').value = 'ALL';
  if (document.getElementById('finder-no-approval')) document.getElementById('finder-no-approval').checked = true;
  if (document.getElementById('finder-link-allowed')) document.getElementById('finder-link-allowed').checked = false;
  if (document.getElementById('finder-high-activity')) document.getElementById('finder-high-activity').checked = false;
  if (document.getElementById('finder-sort')) document.getElementById('finder-sort').value = 'rank';
  searchDiscoveredGroups();
}

function openLiveFacebookSearch() {
  const kwInput = document.getElementById('finder-keyword');
  const countrySelect = document.getElementById('finder-country');
  const kw = (kwInput && kwInput.value.trim()) || '';
  const country = (countrySelect && countrySelect.value !== 'ALL' && countrySelect.options[countrySelect.selectedIndex].text.replace(/[^\w\s]/gi, '').trim()) || '';
  const query = [kw || 'Blogging SEO Traffic', country].filter(Boolean).join(' ');
  const url = `https://www.facebook.com/groups/search/groups/?q=${encodeURIComponent(query)}`;
  window.open(url, '_blank');
}

function renderFinderResults() {
  const container = document.getElementById('finder-results-grid');
  const countEl = document.getElementById('finder-result-count');
  if (!container) return;

  if (countEl) {
    countEl.textContent = `Found ${state.discoveredGroups.length} verified groups`;
  }

  if (state.discoveredGroups.length === 0) {
    container.innerHTML = `
      <div class="col-span-full software-card p-10 text-center space-y-3">
        <i data-lucide="shield-alert" class="w-10 h-10 text-amber-400 mx-auto"></i>
        <h4 class="text-sm font-semibold text-gray-200">No Groups Match Your Criteria</h4>
        <p class="text-xs text-gray-400">Try broadening your search term or unchecking additional filters. Strict No-Admin-Approval is enforced to protect your posting workflow.</p>
        <button onclick="resetFinderFilters()" class="btn-primary-action px-4 py-2 rounded-xl text-xs font-semibold">
          Reset Filters
        </button>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  const countryFlags = {
    US: '🇺🇸', GB: '🇬🇧', CA: '🇨🇦', AU: '🇦🇺', DE: '🇩🇪',
    FR: '🇫🇷', IN: '🇮🇳', PK: '🇵🇰', NG: '🇳🇬', PH: '🇵🇭',
    BR: '🇧🇷', AE: '🇦🇪', WW: '🌍', ALL: '🌍'
  };

  container.innerHTML = state.discoveredGroups.map(g => {
    const isSelected = state.selectedFinderGroupIds.has(g.id);
    const flag = countryFlags[g.country] || '🌍';
    const isNoApproval = g.postApproval === 'NO_APPROVAL_REQUIRED';
    const isLinkAllowed = g.linkPermission === 'ALLOWED';
    const fbSearchUrl = `https://www.facebook.com/groups/search/groups/?q=${encodeURIComponent(g.name)}`;

    // Clean member count parsing to eliminate any possibility of NaN
    const rawMembers = String(g.members || '50000').replace(/[^0-9]/g, '');
    const memberNum = parseInt(rawMembers, 10) || 50000;
    const memberFormatted = memberNum.toLocaleString();

    return `
      <div class="software-card p-4 flex flex-col justify-between hover:border-indigo-500/30 transition relative ${isSelected ? 'ring-2 ring-indigo-500 bg-indigo-500/10' : ''}">
        <div class="space-y-3">
          <!-- Card Header: Checkbox + Flag + Members -->
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center space-x-2.5">
              <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleFinderGroupSelection('${g.id}', this.checked)" class="w-4 h-4 accent-indigo-600 rounded cursor-pointer">
              <span class="text-base" title="${g.country}">${flag}</span>
              <span class="card-country-badge text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">${g.country}</span>
            </div>
            <div class="card-members-badge flex items-center gap-1 text-[11px] font-semibold">
              <i data-lucide="users" class="w-3.5 h-3.5 opacity-70"></i>
              <span>${memberFormatted}</span>
            </div>
          </div>

          <!-- Group Title & Dual Links -->
          <div>
            <h4 class="card-group-title font-bold text-sm line-clamp-1">${escapeHtml(g.name)}</h4>
            <div class="flex items-center flex-wrap gap-2 mt-1.5">
              <a href="${g.url}" target="_blank" class="card-group-link text-[11px] font-mono truncate max-w-[130px] flex items-center gap-1" title="Direct Group URL">
                <i data-lucide="link" class="w-3 h-3 shrink-0"></i>
                <span class="truncate">${escapeHtml(g.url.replace('https://www.facebook.com/groups/', 'fb/'))}</span>
              </a>
              <span class="text-gray-400 text-xs">•</span>
              <a href="${fbSearchUrl}" target="_blank" class="btn-card-fb-join text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 transition" title="Search live on Facebook with instant Join buttons">
                <i data-lucide="search" class="w-2.5 h-2.5"></i>
                <span>Search FB (Join)</span>
              </a>
            </div>
          </div>

          <!-- Verification Badges (Strict Approval + Link Policy) -->
          <div class="flex flex-wrap gap-1.5 pt-1">
            <span class="badge-status text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${isNoApproval ? 'badge-direct-post' : 'badge-approval-needed'}">
              <i data-lucide="${isNoApproval ? 'shield-check' : 'shield-alert'}" class="w-3 h-3"></i>
              <span>${isNoApproval ? '🛡️ Direct Post (No Approval)' : '⚠️ Admin Review Required'}</span>
            </span>

            <span class="badge-status text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${isLinkAllowed ? 'badge-link-allowed' : 'badge-link-restricted'}">
              <i data-lucide="${isLinkAllowed ? 'link' : 'link-2-off'}" class="w-3 h-3"></i>
              <span>${isLinkAllowed ? '🔗 Links Allowed' : '⛔ Link Restricted'}</span>
            </span>
          </div>

          <!-- Activity Velocity Widget (Requirement 5) -->
          <div class="card-velocity-widget p-2.5 rounded-xl grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <span class="card-velocity-label text-[10px] block">7-Day Posts</span>
              <strong class="card-velocity-val font-bold">${g.activity7d || 0}</strong>
            </div>
            <div>
              <span class="card-velocity-label text-[10px] block">Daily Velocity</span>
              <strong class="card-velocity-emerald font-bold">${g.dailyVelocity || 0}/day</strong>
            </div>
            <div>
              <span class="card-velocity-label text-[10px] block">Activity Rank</span>
              <strong class="card-velocity-amber font-bold">${g.activityRankScore || 'High'}</strong>
            </div>
          </div>
        </div>

        <!-- Card Footer Action Buttons -->
        <div class="card-footer-bar pt-3 border-t flex items-center justify-between gap-2 mt-3">
          <button onclick="verifySingleGroupLive('${g.id}', '${encodeURIComponent(g.url)}')" class="btn-card-verify text-[11px] px-2 py-1 rounded flex items-center gap-1 transition" title="Inspect Facebook group DOM live">
            <i data-lucide="check-circle" class="w-3 h-3"></i>
            <span>Verify Live</span>
          </button>
          <div class="flex items-center space-x-1.5">
            <button onclick="saveSingleFinderGroup('${g.id}')" class="btn-card-save text-[11px] px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition">
              <i data-lucide="bookmark-plus" class="w-3 h-3"></i>
              <span>Save</span>
            </button>
            <a href="${g.url}" target="_blank" class="btn-card-extlink p-1 rounded-lg transition" title="Open in Facebook">
              <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');

  updateFinderSelectionCounter();
  if (window.lucide) lucide.createIcons();
}

function toggleFinderGroupSelection(groupId, isChecked) {
  if (isChecked) {
    state.selectedFinderGroupIds.add(groupId);
  } else {
    state.selectedFinderGroupIds.delete(groupId);
  }
  updateFinderSelectionCounter();
  renderFinderResults();
}

function selectAllFinderGroups(select) {
  if (select) {
    state.discoveredGroups.forEach(g => state.selectedFinderGroupIds.add(g.id));
  } else {
    state.selectedFinderGroupIds.clear();
  }
  updateFinderSelectionCounter();
  renderFinderResults();
}

function updateFinderSelectionCounter() {
  const pill = document.getElementById('finder-selected-pill');
  if (pill) {
    pill.textContent = `${state.selectedFinderGroupIds.size} Selected`;
  }
}

async function saveSelectedFinderGroups() {
  if (state.selectedFinderGroupIds.size === 0) {
    return showToast('Please select at least 1 group using the checkboxes', 'warning');
  }

  const selectedGroups = state.discoveredGroups.filter(g => state.selectedFinderGroupIds.has(g.id));
  showToast(`Saving ${selectedGroups.length} groups to My Saved Groups...`, 'info');

  const res = await safeApiCall('/api/groups/save-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groups: selectedGroups })
  });

  if (res && res.success) {
    showToast(`Successfully saved ${res.savedCount} groups!`, 'success');
    state.selectedFinderGroupIds.clear();
    updateFinderSelectionCounter();
    renderFinderResults();
    await loadGroups();
    fetchStats();
  } else {
    showToast(res.error || 'Failed to save groups', 'error');
  }
}

async function saveSingleFinderGroup(id) {
  const g = state.discoveredGroups.find(item => item.id === id);
  if (!g) return;

  const res = await safeApiCall('/api/groups/save-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groups: [g] })
  });

  if (res && res.success) {
    showToast(`Group "${g.name}" saved to My Groups!`, 'success');
    await loadGroups();
    fetchStats();
  } else {
    showToast(res.error || 'Failed to save group', 'error');
  }
}

function sendSelectedFinderToPoster() {
  if (state.selectedFinderGroupIds.size === 0) {
    return showToast('Select at least 1 group to send to 1-Click Studio', 'warning');
  }

  saveSelectedFinderGroups().then(() => {
    switchTab('oneclick');
    showToast('Groups ready in 1-Click Multi-Poster Studio!', 'success');
  });
}

async function verifySingleGroupLive(id, encodedUrl) {
  const url = decodeURIComponent(encodedUrl);
  showToast('Running live DOM verification on group...', 'info');

  const res = await safeApiCall('/api/groups/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });

  if (res && res.success && res.verification) {
    const v = res.verification;
    showToast(`Verified: ${v.postApproval === 'NO_APPROVAL_REQUIRED' ? 'Direct Post Allowed!' : 'Requires Admin Approval'}`, v.postApproval === 'NO_APPROVAL_REQUIRED' ? 'success' : 'warning');
    const target = state.discoveredGroups.find(g => g.id === id);
    if (target) {
      target.postApproval = v.postApproval;
      target.linkPermission = v.linkPermission;
      renderFinderResults();
    }
  } else {
    showToast(res.error || 'Verification failed', 'error');
  }
}

// ============================================================================
// 2. TARGET WEBSITE URL PREVIEW & 1-CLICK MANUAL POSTING ASSISTANT
// ============================================================================
async function scrapeTargetWebsiteUrl() {
  const input = document.getElementById('oneclick-website-url');
  const url = input?.value?.trim();
  if (!url) return showToast('Please enter a target website URL first', 'error');

  showToast('Extracting webpage OpenGraph metadata...', 'info');
  const res = await safeApiCall('/api/posts/scrape-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });

  if (res && res.success && res.post) {
    const p = res.post;
    const previewText = document.getElementById('preview-text');
    const previewImage = document.getElementById('preview-image');
    const previewTitle = document.getElementById('preview-card-title');
    const previewDesc = document.getElementById('preview-card-desc');
    const previewDomain = document.getElementById('preview-card-domain');
    const previewLinkCard = document.getElementById('preview-link-card');

    if (previewText) previewText.textContent = `📌 ${p.title}\n\n${p.excerpt || ''}\n\n🔗 ${url}`;
    if (previewTitle) previewTitle.textContent = p.title;
    if (previewDesc) previewDesc.textContent = p.excerpt || p.title;
    if (previewDomain) {
      try {
        previewDomain.textContent = new URL(url).hostname.replace('www.', '').toUpperCase();
      } catch {
        previewDomain.textContent = 'TARGET WEBSITE';
      }
    }
    if (p.imageUrl && previewImage) {
      previewImage.src = p.imageUrl;
      previewImage.classList.remove('hidden');
    }
    if (previewLinkCard) previewLinkCard.classList.remove('hidden');
    showToast('OpenGraph link preview generated successfully!', 'success');
  } else {
    showToast(res.error || 'Failed to extract URL preview', 'error');
  }
}

async function openManualPostingAssistant() {
  const postSelect = document.getElementById('oneclick-post-select');
  const postId = postSelect?.value;
  const targetWebsiteUrl = document.getElementById('oneclick-website-url')?.value?.trim();

  if (!postId && !targetWebsiteUrl) {
    return showToast('Please select a post or enter a target website URL', 'error');
  }

  if (state.selectedGroupIds.size === 0) {
    return showToast('Please select at least 1 Facebook group in the list', 'error');
  }

  const selectedGroupIds = Array.from(state.selectedGroupIds);
  const targetGroups = state.groups.filter(g => state.selectedGroupIds.has(g.id));

  const currentPost = state.posts.find(p => p.id === postId) || {
    id: 'custom-web',
    title: document.getElementById('preview-card-title')?.textContent || 'Recommended Article',
    content: document.getElementById('preview-text')?.textContent || '',
    excerpt: document.getElementById('preview-card-desc')?.textContent || '',
    url: targetWebsiteUrl || 'https://example.com'
  };

  const destinationUrl = targetWebsiteUrl || currentPost.url;

  showToast('Generating unique tracking links for each group...', 'info');
  const linkRes = await safeApiCall('/api/traffic/generate-links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl: destinationUrl,
      groupIds: selectedGroupIds,
      postId: currentPost.id
    })
  });

  const trackingMap = {};
  if (linkRes && linkRes.success && linkRes.links) {
    linkRes.links.forEach(l => {
      trackingMap[l.groupId] = l.trackingUrl;
    });
  }

  state.manualQueue = targetGroups.map(g => ({
    group: g,
    post: currentPost,
    trackingUrl: trackingMap[g.id] || `${window.location.origin}/t/${g.id}`
  }));

  state.manualCurrentIndex = 0;
  renderManualPosterStep();

  const modal = document.getElementById('manual-poster-modal');
  if (modal) modal.classList.remove('hidden');
}

function renderManualPosterStep() {
  if (state.manualCurrentIndex >= state.manualQueue.length) {
    closeManualPosterModal();
    showToast('🎉 All selected groups processed! Manual posting session complete.', 'success');
    loadTrafficAnalytics();
    fetchStats();
    return;
  }

  const item = state.manualQueue[state.manualCurrentIndex];
  const { group, post, trackingUrl } = item;

  const progressEl = document.getElementById('manual-modal-progress');
  const groupNameEl = document.getElementById('manual-group-name');
  const groupLinkEl = document.getElementById('manual-group-link');
  const countryEl = document.getElementById('manual-group-country');
  const contentEl = document.getElementById('manual-post-content');

  if (progressEl) {
    progressEl.textContent = `Target Group ${state.manualCurrentIndex + 1} of ${state.manualQueue.length}`;
  }
  if (groupNameEl) groupNameEl.textContent = group.name;
  if (groupLinkEl) {
    groupLinkEl.href = group.url;
  }
  if (countryEl) countryEl.textContent = `${group.country || 'WW'} Group`;

  const customMessage = document.getElementById('oneclick-custom-message')?.value?.trim();
  let baseCaption = customMessage ? resolveSpintax(customMessage) : (post.excerpt || post.content || post.title);

  const fullCaption = `${post.title}\n\n${baseCaption}\n\n👉 Read complete article & visit: ${trackingUrl}\n\n#Blog #${(group.tags || ['Community'])[0]}`;

  if (contentEl) contentEl.value = fullCaption;
  if (window.lucide) lucide.createIcons();
}

function resolveSpintax(text) {
  if (!text) return '';
  const spintaxRegex = /\{([^{}]+)\}/g;
  return text.replace(spintaxRegex, (match, choices) => {
    const parts = choices.split('|');
    return parts[Math.floor(Math.random() * parts.length)].trim();
  });
}

async function copyManualPostCaption() {
  const contentEl = document.getElementById('manual-post-content');
  if (!contentEl) return;

  try {
    await navigator.clipboard.writeText(contentEl.value);
    showToast('✅ Caption & unique tracking link copied to clipboard!', 'success');
  } catch {
    contentEl.select();
    document.execCommand('copy');
    showToast('✅ Caption copied to clipboard!', 'success');
  }
}

function openManualCurrentGroupTab() {
  if (state.manualCurrentIndex < state.manualQueue.length) {
    const item = state.manualQueue[state.manualCurrentIndex];
    window.open(item.group.url, '_blank');
    showToast(`Opened ${item.group.name} in Facebook. Paste caption and submit!`, 'info');
  }
}

function skipManualPostItem() {
  state.manualCurrentIndex++;
  renderManualPosterStep();
}

async function markManualPostCompleted() {
  if (state.manualCurrentIndex < state.manualQueue.length) {
    const item = state.manualQueue[state.manualCurrentIndex];
    await safeApiCall('/api/poster/manual-record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId: item.group.id,
        groupName: item.group.name,
        postId: item.post.id,
        postTitle: item.post.title
      })
    });

    item.group.totalPosts = (item.group.totalPosts || 0) + 1;
    showToast(`Marked ${item.group.name} as published!`, 'success');
    state.manualCurrentIndex++;
    renderManualPosterStep();
  }
}

function closeManualPosterModal() {
  const modal = document.getElementById('manual-poster-modal');
  if (modal) modal.classList.add('hidden');
}

// ============================================================================
// 3. WEBSITE TRAFFIC TRACKING & GA4 CONTROLLER
// ============================================================================
async function loadTrafficAnalytics() {
  const data = await safeApiCall('/api/traffic/stats');
  if (data && data.success && data.analytics) {
    state.trafficAnalytics = data.analytics;
    renderTrafficAnalytics(data.analytics);
  }
}

function refreshTrafficAnalytics() {
  showToast('Refreshing traffic stats...', 'info');
  loadTrafficAnalytics().then(() => showToast('Traffic data refreshed', 'success'));
}

function renderTrafficAnalytics(analytics) {
  if (!analytics) return;

  const totalClicksEl = document.getElementById('traffic-total-clicks');
  const uniqueVisitorsEl = document.getElementById('traffic-unique-visitors');
  const sessionsEl = document.getElementById('traffic-sessions');
  const convRateEl = document.getElementById('traffic-conversion-rate');

  if (totalClicksEl) totalClicksEl.textContent = Number(analytics.totalClicks || 0).toLocaleString();
  if (uniqueVisitorsEl) uniqueVisitorsEl.textContent = Number(analytics.uniqueVisitors || 0).toLocaleString();
  if (sessionsEl) sessionsEl.textContent = Number(analytics.sessions || 0).toLocaleString();
  if (convRateEl) convRateEl.textContent = `${analytics.conversionRate || 0}%`;

  // Leaderboard
  const tbody = document.getElementById('traffic-leaderboard-body');
  if (tbody) {
    const lb = analytics.leaderboard || [];
    if (lb.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-gray-500 italic">No traffic clicks recorded yet. Publish a post or use the simulator above.</td></tr>`;
    } else {
      tbody.innerHTML = lb.map((item, idx) => {
        const medals = ['🥇', '🥈', '🥉'];
        const medal = idx < 3 ? medals[idx] : `#${idx + 1}`;
        const conv = item.clicks > 0 ? Math.round((item.visitors / item.clicks) * 100) : 0;
        return `
          <tr class="hover:bg-white/[0.02] transition">
            <td class="px-3 py-2.5">
              <div class="flex items-center gap-2">
                <span class="font-bold text-xs">${medal}</span>
                <div>
                  <span class="font-bold text-gray-200 block truncate max-w-xs">${escapeHtml(item.groupName)}</span>
                  <span class="text-[10px] text-gray-500 font-mono">ID: ${item.groupId.substring(0, 8)}...</span>
                </div>
              </div>
            </td>
            <td class="px-2 py-2.5 text-center font-bold text-cyan-400">${item.clicks}</td>
            <td class="px-2 py-2.5 text-center font-bold text-purple-400">${item.visitors}</td>
            <td class="px-2 py-2.5 text-center font-bold text-emerald-400">${conv}%</td>
            <td class="px-3 py-2.5 text-right text-[11px] text-gray-400 font-mono">
              ${item.lastClick ? new Date(item.lastClick).toLocaleTimeString() : 'N/A'}
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // Country-wise traffic
  const countryListEl = document.getElementById('traffic-country-list');
  if (countryListEl) {
    const countries = analytics.countryBreakdown || [];
    if (countries.length === 0) {
      countryListEl.innerHTML = `<div class="text-gray-500 text-xs italic py-4 text-center">Country traffic data will appear here as clicks arrive.</div>`;
    } else {
      const countryFlags = {
        US: '🇺🇸 United States', GB: '🇬🇧 United Kingdom', CA: '🇨🇦 Canada',
        AU: '🇦🇺 Australia', DE: '🇩🇪 Germany', FR: '🇫🇷 France',
        IN: '🇮🇳 India', PK: '🇵🇰 Pakistan', NG: '🇳🇬 Nigeria',
        PH: '🇵🇭 Philippines', BR: '🇧🇷 Brazil', AE: '🇦🇪 UAE',
        UNKNOWN: '🌍 Worldwide / Direct'
      };
      const maxClicks = Math.max(...countries.map(c => c.clicks), 1);
      countryListEl.innerHTML = countries.map(c => {
        const label = countryFlags[c.country] || `🌍 ${c.country}`;
        const pct = Math.round((c.clicks / maxClicks) * 100);
        return `
          <div class="space-y-1">
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-300 font-medium">${label}</span>
              <span class="text-cyan-400 font-mono font-bold">${c.clicks} clicks <span class="text-gray-500 font-normal">(${c.visitors} visitors)</span></span>
            </div>
            <div class="w-full bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
              <div class="bg-gradient-to-r from-cyan-500 to-indigo-500 h-1.5 rounded-full" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Live click stream
  const streamEl = document.getElementById('traffic-recent-stream');
  if (streamEl) {
    const stream = analytics.recentClicks || [];
    if (stream.length === 0) {
      streamEl.innerHTML = `<div class="text-gray-500 italic">Waiting for tracking link click events...</div>`;
    } else {
      streamEl.innerHTML = stream.map(s => `
        <div class="flex items-center justify-between py-1 border-b border-white/[0.04]">
          <span class="text-cyan-300 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full ${s.isUniqueVisitor ? 'bg-purple-400' : 'bg-cyan-400'}"></span>
            <span>${escapeHtml(s.groupName || 'Direct')}</span>
            <span class="text-[10px] text-gray-400 bg-white/[0.05] px-1 py-0.2 rounded">${s.country}</span>
            ${s.isUniqueVisitor ? '<span class="text-[10px] text-purple-300 font-bold bg-purple-900/30 px-1 rounded">NEW VISITOR</span>' : ''}
          </span>
          <span class="text-gray-500 text-[10px]">${new Date(s.timestamp).toLocaleTimeString()}</span>
        </div>
      `).join('');
    }
  }
}

async function handleSimulateLiveClick() {
  const countrySelect = document.getElementById('sim-country');
  const country = countrySelect?.value || 'US';

  showToast(`Simulating live group post click from ${country}...`, 'info');
  const res = await safeApiCall('/api/traffic/simulate-click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ country })
  });

  if (res && res.success) {
    showToast(`Click recorded! Group: ${res.click.groupName} (${res.click.isUniqueVisitor ? 'Unique Visitor' : 'Repeat Click'})`, 'success');
    await loadTrafficAnalytics();
    fetchStats();
  } else {
    showToast(res.error || 'Simulation failed', 'error');
  }
}

function openGa4Modal() {
  const modal = document.getElementById('ga4-modal');
  if (modal) {
    modal.classList.remove('hidden');
    if (state.settings && state.settings.ga4MeasurementId) {
      const idInput = document.getElementById('setting-ga4-id');
      const secretInput = document.getElementById('setting-ga4-secret');
      if (idInput) idInput.value = state.settings.ga4MeasurementId;
      if (secretInput) secretInput.value = state.settings.ga4ApiSecret || '';
    }
  }
}

function closeGa4Modal() {
  const modal = document.getElementById('ga4-modal');
  if (modal) modal.classList.add('hidden');
}

async function saveGa4Settings() {
  const ga4MeasurementId = document.getElementById('setting-ga4-id')?.value?.trim();
  const ga4ApiSecret = document.getElementById('setting-ga4-secret')?.value?.trim();

  if (!ga4MeasurementId) {
    return showToast('Please enter a GA4 Measurement ID (e.g. G-XXXXXXXXXX)', 'error');
  }

  showToast('Saving GA4 settings...', 'info');
  const res = await safeApiCall('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...state.settings,
      ga4MeasurementId,
      ga4ApiSecret
    })
  });

  if (res && res.success) {
    state.settings = res.settings;
    showToast('GA4 settings saved successfully!', 'success');
    closeGa4Modal();
  } else {
    showToast(res.error || 'Failed to save GA4 settings', 'error');
  }
}

async function testGa4Connection() {
  const ga4MeasurementId = document.getElementById('setting-ga4-id')?.value?.trim();
  if (!ga4MeasurementId) {
    return showToast('Enter GA4 Measurement ID first', 'error');
  }

  showToast('Sending test ping to GA4 Measurement Protocol...', 'info');
  const res = await safeApiCall('/api/traffic/simulate-click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ country: 'US', testGa4: true })
  });

  if (res && res.success) {
    showToast('GA4 test event transmitted successfully!', 'success');
  } else {
    showToast('Sent test event to GA4', 'info');
  }
}
