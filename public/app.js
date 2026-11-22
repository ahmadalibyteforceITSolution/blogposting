// FB AutoBlog Master - Client Application Logic

let state = {
  posts: [],
  groups: [],
  rssSources: [],
  campaigns: [],
  history: [],
  settings: {},
  stats: {},
  activeTab: 'overview',
  isLoggedIn: false,
  selectedPost: null,
  selectedGroupIds: new Set(),
  activeTagFilter: 'ALL'
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  initEventSource();
  loadAllData();
  checkFacebookLogin();

  // Periodic status refresh
  setInterval(() => {
    fetchStats();
  }, 10000);
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

    const badgePosts = document.getElementById('nav-badge-posts');
    const badgeGroups = document.getElementById('nav-badge-groups');
    const badgeRss = document.getElementById('nav-badge-rss');
    if (badgePosts) badgePosts.textContent = data.stats.totalPosts;
    if (badgeGroups) badgeGroups.textContent = data.stats.totalGroups;
    if (badgeRss) badgeRss.textContent = state.rssSources.length;

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
  oneclick: '1-Click Multi-Poster Studio',
  overview: 'Dashboard & Global Metrics',
  blogs: 'Blog Articles & Content Catalog',
  groups: 'Facebook Target Groups & Audiences',
  autopilot: 'Autonomous 24/7 Campaigns',
  history: 'System Audit & Execution Logs',
  settings: 'Anti-Ban & Engine Settings'
};

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
      <div class="col-span-full bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center space-y-3">
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
    <div class="bg-[#111827] border border-gray-800 rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between hover:border-gray-700 transition">
      <div>
        ${post.imageUrl ? `<img src="${post.imageUrl}" alt="${escapeHtml(post.title)}" class="w-full h-36 object-cover">` : ''}
        <div class="p-4 space-y-2">
          <div class="flex items-center justify-between text-[11px] text-gray-400">
            <span class="flex items-center gap-1">
              <i data-lucide="send" class="w-3 h-3 text-indigo-400"></i> Posted ${post.timesPosted || 0} times
            </span>
            <span>${new Date(post.createdAt).toLocaleDateString()}</span>
          </div>

          <h3 class="font-bold text-sm text-gray-100 line-clamp-2">${escapeHtml(post.title)}</h3>
          <p class="text-xs text-gray-400 line-clamp-3">${escapeHtml(post.excerpt || post.content || '')}</p>

          ${post.tags && post.tags.length > 0 ? `
            <div class="flex flex-wrap gap-1 pt-1">
              ${post.tags.map(t => `<span class="bg-gray-800 text-gray-300 text-[10px] px-2 py-0.5 rounded-md">#${escapeHtml(t)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>

      <div class="p-4 border-t border-gray-800/80 flex items-center justify-between">
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

  if (!state.selectedPost) {
    previewText.textContent = 'Select a post above to preview how it will appear when published to Facebook groups...';
    previewLinkCard.classList.add('hidden');
    return;
  }

  const p = state.selectedPost;
  let text = `📌 ${p.title}\n\n${p.excerpt || ''}\n\n🔗 ${p.url}`;
  if (p.tags && p.tags.length > 0) {
    text += `\n` + p.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' ');
  }
  previewText.textContent = text;

  try {
    const urlObj = new URL(p.url);
    previewDomain.textContent = urlObj.hostname.replace('www.', '').toUpperCase();
  } catch (_) {
    previewDomain.textContent = 'ARTICLE LINK';
  }

  previewTitle.textContent = p.title;
  previewDesc.textContent = p.excerpt || p.title;

  const previewVideoContainer = document.getElementById('preview-video-container');

  if (p.imageUrl) {
    previewImage.src = p.imageUrl;
    previewImage.classList.remove('hidden');
  } else {
    previewImage.classList.add('hidden');
  }

  if (previewVideoContainer) {
    if (p.videoUrl || p.localVideoPath) {
      previewVideoContainer.classList.remove('hidden');
    } else {
      previewVideoContainer.classList.add('hidden');
    }
  }

  previewLinkCard.classList.remove('hidden');
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

  if (state.groups.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="px-5 py-8 text-center text-gray-500 italic">
          No Facebook groups added yet. Click "Add Target Group" or "Bulk Import URLs".
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.groups.map(g => `
    <tr class="hover:bg-gray-800/40 transition">
      <td class="px-5 py-3">
        <div class="font-semibold text-gray-200">${escapeHtml(g.name)}</div>
        <a href="${g.url}" target="_blank" class="text-[11px] text-gray-400 hover:text-indigo-400 truncate max-w-xs block font-mono">
          ${escapeHtml(g.url)}
        </a>
      </td>
      <td class="px-4 py-3 capitalize text-gray-400">
        <span class="px-2 py-0.5 rounded text-[10px] bg-gray-800 border border-gray-700">${g.type || 'group'}</span>
      </td>
      <td class="px-4 py-3">
        <div class="flex flex-wrap gap-1">
          ${(g.tags || []).map(t => `<span class="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] px-1.5 py-0.5 rounded">#${escapeHtml(t)}</span>`).join('')}
        </div>
      </td>
      <td class="px-4 py-3 font-semibold text-gray-300">
        ${g.totalPosts || 0}
      </td>
      <td class="px-4 py-3">
        <button onclick="toggleGroupStatus('${g.id}', ${!g.enabled})" class="px-2 py-0.5 rounded text-[10px] font-semibold ${g.enabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-gray-800 text-gray-500'}">
          ${g.enabled ? 'Active' : 'Disabled'}
        </button>
      </td>
      <td class="px-5 py-3 text-right space-x-2">
        <button onclick="deleteGroup('${g.id}')" class="text-gray-400 hover:text-red-400 p-1">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function renderGroupFilterTags() {
  const container = document.getElementById('group-filter-tags');
  if (!container) return;

  const allTags = new Set(['ALL']);
  state.groups.forEach(g => {
    (g.tags || []).forEach(t => allTags.add(t));
  });

  container.innerHTML = Array.from(allTags).map(tag => `
    <button type="button" onclick="filterGroupsByTag('${tag}')" class="px-2 py-1 rounded-lg text-[10px] font-semibold transition ${state.activeTagFilter === tag ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">
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
    <label class="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-800/60 cursor-pointer text-xs">
      <input type="checkbox" value="${g.id}" ${state.selectedGroupIds.has(g.id) ? 'checked' : ''} onchange="toggleGroupSelection('${g.id}', this.checked)" class="w-4 h-4 accent-indigo-600 rounded">
      <div class="flex-1 truncate">
        <div class="font-semibold text-gray-200">${escapeHtml(g.name)}</div>
        <div class="text-[10px] text-gray-500 truncate">${escapeHtml(g.url)}</div>
      </div>
      <span class="text-[10px] text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">${g.totalPosts || 0} posts</span>
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
      <div class="col-span-full bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center space-y-3">
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
    <div class="bg-[#111827] border border-gray-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4 hover:border-gray-700 transition">
      <div>
        <div class="flex items-center justify-between">
          <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${c.active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-gray-800 text-gray-500'}">
            ${c.active ? 'Active 24/7' : 'Paused'}
          </span>
          <button onclick="deleteCampaign('${c.id}')" class="text-gray-400 hover:text-red-400 p-1">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>

        <h3 class="font-bold text-sm text-gray-100 mt-2">${escapeHtml(c.name)}</h3>

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

      <div class="pt-3 border-t border-gray-800/80">
        <button onclick="toggleCampaignActive('${c.id}', ${!c.active})" class="w-full py-2 rounded-xl text-xs font-semibold ${c.active ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-emerald-600 text-white hover:bg-emerald-500'}">
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
