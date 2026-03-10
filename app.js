/* ============================================
   IVEA Marketing Hub — Main Application
   ============================================ */

// --- Supabase Init ---
const SUPABASE_URL = 'https://zmdubmumgdyuyjajjxjs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptZHVibXVtZ2R5dXlqYWpqeGpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTIxMjQsImV4cCI6MjA4ODY4ODEyNH0.91FozXtednnxnKMTPJVNeOr1is4-du9dofPu4NuR2QE';
let OPENAI_KEY = ''; // Loaded from Supabase settings at runtime
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- State ---
let currentUser = null;
let currentPage = 'dashboard';
let aiMessages = [];
let notifications = [];
let chartInstances = {};

// --- Helpers ---
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const el = (tag, attrs = {}, children = []) => {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'className') e.className = v;
    else if (k === 'innerHTML') e.innerHTML = v;
    else if (k === 'textContent') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  });
  children.forEach(c => { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
};

function toast(msg, type = 'info') {
  const t = el('div', { className: `toast ${type}`, innerHTML: `<span>${msg}</span>` });
  $('#toast-container').appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function timeAgo(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function badgeHTML(text, type) {
  if (!text) return '';
  const cls = type || text.toLowerCase().replace(/\s+/g, '-');
  return `<span class="badge badge-${cls}">${text}</span>`;
}

function starsHTML(rating) {
  const full = Math.round(rating || 0);
  return '<span class="stars">' + '★'.repeat(full) + '</span><span class="stars-empty">' + '★'.repeat(5 - full) + '</span>';
}

function parseJSON(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

function platformIcon(p) {
  const map = { instagram: 'instagram', facebook: 'facebook', twitter: 'twitter', tiktok: 'music-2', linkedin: 'linkedin', youtube: 'youtube', google: 'search', yelp: 'star', tripadvisor: 'map-pin', pinterest: 'pin' };
  return map[p?.toLowerCase()] || 'globe';
}

function getInitials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function csvExport(data, filename) {
  if (!data.length) return toast('No data to export', 'error');
  const keys = Object.keys(data[0]);
  const csv = [keys.join(','), ...data.map(r => keys.map(k => {
    let v = r[k];
    if (v === null || v === undefined) v = '';
    if (typeof v === 'object') v = JSON.stringify(v);
    return `"${String(v).replace(/"/g, '""')}"`;
  }).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `${filename}.csv` });
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('CSV exported successfully', 'success');
}

async function logActivity(action, details) {
  if (!currentUser) return;
  await sb.from('activity_log').insert({ employee_id: currentUser.id, action, details });
}

function showLoading(container) {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
}

// --- Storage helpers (graceful fallback for sandboxed iframes) ---
const _ls = () => { try { return window['local' + 'Storage']; } catch { return null; } };
const storage = {
  _mem: {},
  get(k) { const s = _ls(); return s ? s.getItem(k) : (this._mem[k] || null); },
  set(k, v) { const s = _ls(); if (s) s.setItem(k, v); else this._mem[k] = v; },
  remove(k) { const s = _ls(); if (s) s.removeItem(k); else delete this._mem[k]; }
};

// --- Auth ---
function initAuth() {
  const saved = storage.get('ivea_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    showApp();
    return;
  }
  showLogin();
}

function showLogin() {
  $('#login-screen').classList.remove('hidden');
  $('#app-shell').classList.add('hidden');
  const inputs = $$('.code-input');
  inputs.forEach((inp, i) => {
    inp.value = '';
    inp.addEventListener('input', (e) => {
      if (e.target.value && i < 3) inputs[i + 1].focus();
      if (inputs.every(x => x.value)) tryLogin();
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && i > 0) inputs[i - 1].focus();
    });
  });
  setTimeout(() => inputs[0].focus(), 100);
  $('#login-btn').onclick = tryLogin;
}

async function tryLogin() {
  const code = $$('.code-input').map(i => i.value).join('');
  if (code.length !== 4) return;
  $('#login-error').textContent = '';
  const { data, error } = await sb.from('employees').select('*').eq('login_code', code).eq('is_active', true);
  if (error || !data?.length) {
    $('#login-error').textContent = 'Invalid code. Please try again.';
    $$('.code-input').forEach(i => i.value = '');
    $$('.code-input')[0].focus();
    return;
  }
  currentUser = data[0];
  storage.set('ivea_user', JSON.stringify(currentUser));
  await logActivity('login', `${currentUser.name} signed in`);
  showApp();
}

function logout() {
  logActivity('logout', `${currentUser.name} signed out`);
  currentUser = null;
  storage.remove('ivea_user');
  showLogin();
}

function hasRole(...roles) {
  return roles.includes(currentUser?.role);
}

// --- App Shell ---
async function showApp() {
  $('#login-screen').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
  // Load OpenAI key from Supabase settings
  try {
    const { data } = await sb.from('settings').select('value').eq('key', 'openai_api_key').single();
    if (data) OPENAI_KEY = data.value;
  } catch(e) { console.log('No OpenAI key in settings'); }
  renderSidebar();
  renderHeader();
  initGlobalSearch();
  initAI();
  initNotifications();
  navigate(currentPage);
  lucide.createIcons();
}

// --- Sidebar ---
const NAV_ITEMS = [
  { section: null, items: [{ id: 'dashboard', icon: 'layout-dashboard', label: 'Dashboard' }] },
  { section: 'Content', items: [
    { id: 'content', icon: 'file-text', label: 'Content Hub' },
    { id: 'calendar', icon: 'calendar', label: 'Unified Calendar' },
  ]},
  { section: 'Outreach', items: [
    { id: 'influencers', icon: 'users', label: 'Influencers' },
    { id: 'campaigns', icon: 'megaphone', label: 'Campaigns' },
    { id: 'media', icon: 'newspaper', label: 'Local Media' },
  ]},
  { section: 'Communications', items: [
    { id: 'email-sms', icon: 'mail', label: 'Email & SMS' },
    { id: 'reviews', icon: 'message-square', label: 'Reviews' },
  ]},
  { section: 'Analytics', items: [
    { id: 'reports', icon: 'bar-chart-3', label: 'Reports' },
    { id: 'social-accounts', icon: 'share-2', label: 'Social Accounts' },
  ]},
  { section: 'Management', items: [
    { id: 'team', icon: 'user-cog', label: 'Team' },
    { id: 'audit-log', icon: 'scroll-text', label: 'Audit Log' },
    { id: 'settings', icon: 'settings', label: 'Settings' },
  ]},
];

function renderSidebar() {
  const nav = $('#sidebar-nav');
  nav.innerHTML = '';
  NAV_ITEMS.forEach(group => {
    const sec = el('div', { className: 'nav-section' });
    if (group.section) sec.appendChild(el('div', { className: 'nav-section-title', textContent: group.section }));
    group.items.forEach(item => {
      if (item.id === 'settings' && !hasRole('Owner')) return;
      const ni = el('div', {
        className: `nav-item${currentPage === item.id ? ' active' : ''}`,
        innerHTML: `<i data-lucide="${item.icon}"></i><span>${item.label}</span>`,
        onClick: () => navigate(item.id),
      });
      sec.appendChild(ni);
    });
    nav.appendChild(sec);
  });
  // User
  const u = $('#sidebar-user');
  u.innerHTML = `
    <div class="user-avatar" style="background:${currentUser.avatar_color || '#4f98a3'}">${getInitials(currentUser.name)}</div>
    <div class="sidebar-user-info">
      <div class="sidebar-user-name">${currentUser.name}</div>
      <div class="sidebar-user-role">${currentUser.title || currentUser.role}</div>
    </div>
    <button class="logout-btn" title="Logout"><i data-lucide="log-out"></i></button>
  `;
  u.querySelector('.logout-btn').onclick = logout;
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

// --- Header ---
function renderHeader() {
  const hu = $('#header-user');
  hu.innerHTML = `
    <div class="user-avatar" style="background:${currentUser.avatar_color || '#4f98a3'};width:28px;height:28px;font-size:11px">${getInitials(currentUser.name)}</div>
    <span class="header-user-name">${currentUser.name.split(' ')[0]}</span>
  `;
  // Hamburger
  $('#hamburger-btn').onclick = () => {
    $('#sidebar').classList.toggle('open');
    let ov = $('.sidebar-overlay');
    if (!ov) {
      ov = el('div', { className: 'sidebar-overlay' });
      ov.onclick = () => { $('#sidebar').classList.remove('open'); ov.classList.remove('open'); };
      document.body.appendChild(ov);
    }
    ov.classList.toggle('open');
  };
}

// --- Routing ---
function navigate(page) {
  currentPage = page;
  // Update sidebar active
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  $$('.nav-item').forEach(n => {
    const label = n.querySelector('span')?.textContent;
    const match = NAV_ITEMS.flatMap(g => g.items).find(i => i.id === page);
    if (match && label === match.label) n.classList.add('active');
  });
  // Close mobile sidebar
  $('#sidebar').classList.remove('open');
  const ov = $('.sidebar-overlay');
  if (ov) ov.classList.remove('open');
  // Render page
  const pc = $('#page-content');
  showLoading(pc);
  const pages = {
    'dashboard': renderDashboard,
    'content': renderContent,
    'calendar': renderCalendar,
    'influencers': renderInfluencers,
    'campaigns': renderCampaigns,
    'media': renderMedia,
    'email-sms': renderEmailSms,
    'reviews': renderReviews,
    'reports': renderReports,
    'social-accounts': renderSocialAccounts,
    'team': renderTeam,
    'audit-log': renderAuditLog,
    'settings': renderSettings,
  };
  if (pages[page]) pages[page](pc);
  else pc.innerHTML = '<div class="empty-state"><h4>Page not found</h4></div>';
}

// --- Modal Helpers ---
function openModal(title, bodyHTML, footerHTML) {
  const o = $('#modal-overlay');
  $('#modal-header').innerHTML = `<h3>${title}</h3><button class="modal-close" onclick="closeModal()"><i data-lucide="x"></i></button>`;
  $('#modal-body').innerHTML = bodyHTML;
  $('#modal-footer').innerHTML = footerHTML || '';
  o.classList.add('open');
  lucide.createIcons({ nameAttr: 'data-lucide' });
  o.onclick = (e) => { if (e.target === o) closeModal(); };
}

function closeModal() {
  $('#modal-overlay').classList.remove('open');
}

function openConfirm(title, body, onConfirm) {
  const o = $('#confirm-overlay');
  $('#confirm-header').innerHTML = `<h3>${title}</h3>`;
  $('#confirm-body').innerHTML = body;
  $('#confirm-footer').innerHTML = `<button class="btn btn-secondary" id="confirm-cancel">Cancel</button><button class="btn btn-danger" id="confirm-ok">Confirm</button>`;
  o.classList.add('open');
  $('#confirm-cancel').onclick = () => o.classList.remove('open');
  $('#confirm-ok').onclick = () => { o.classList.remove('open'); onConfirm(); };
  o.onclick = (e) => { if (e.target === o) o.classList.remove('open'); };
}

// --- Employee lookup cache ---
let employeeCache = {};
async function getEmployees() {
  if (Object.keys(employeeCache).length) return employeeCache;
  const { data } = await sb.from('employees').select('*').order('name');
  if (data) data.forEach(e => employeeCache[e.id] = e);
  return employeeCache;
}
function employeeName(id) { return employeeCache[id]?.name || '—'; }
function employeeOptions(selected) {
  return Object.values(employeeCache).map(e =>
    `<option value="${e.id}" ${e.id === selected ? 'selected' : ''}>${e.name}</option>`
  ).join('');
}

// --- Sortable Table ---
function makeSortable(tableEl, data, renderRow, tbody) {
  const headers = $$('th[data-key]', tableEl);
  let sortKey = null, sortDir = 'asc';
  headers.forEach(th => {
    th.onclick = () => {
      const key = th.dataset.key;
      if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortKey = key; sortDir = 'asc'; }
      headers.forEach(h => h.querySelector('.sort-icon') && (h.querySelector('.sort-icon').textContent = ''));
      let icon = th.querySelector('.sort-icon');
      if (!icon) { icon = el('span', { className: 'sort-icon' }); th.appendChild(icon); }
      icon.textContent = sortDir === 'asc' ? ' ▲' : ' ▼';
      data.sort((a, b) => {
        let va = a[key], vb = b[key];
        if (va == null) va = '';
        if (vb == null) vb = '';
        if (typeof va === 'number') return sortDir === 'asc' ? va - vb : vb - va;
        return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      });
      tbody.innerHTML = '';
      data.forEach(r => tbody.innerHTML += renderRow(r));
    };
  });
}

// ============================================
// PAGE: Dashboard
// ============================================
async function renderDashboard(container) {
  await getEmployees();
  const [postsRes, campaignsRes, influencersRes, reviewsRes, restaurantsRes, socialRes, activityRes] = await Promise.all([
    sb.from('content_posts').select('*'),
    sb.from('campaigns').select('*'),
    sb.from('influencers').select('*'),
    sb.from('reviews').select('*'),
    sb.from('restaurants').select('*'),
    sb.from('social_accounts').select('*'),
    sb.from('activity_log').select('*').order('created_at', { ascending: false }).limit(20),
  ]);
  const posts = postsRes.data || [];
  const campaigns = campaignsRes.data || [];
  const influencers = influencersRes.data || [];
  const reviews = reviewsRes.data || [];
  const restaurants = restaurantsRes.data || [];
  const social = socialRes.data || [];
  const activity = activityRes.data || [];

  const teamCount = Object.values(employeeCache).filter(e => e.is_active).length;
  const brandCount = restaurants.length;
  const locationCount = restaurants.reduce((s, r) => s + (r.location_count || 0), 0);
  const now = new Date();
  const weekAgo = new Date(now - 7 * 86400000);
  const postsThisWeek = posts.filter(p => new Date(p.created_at) >= weekAgo).length;
  const pendingApprovals = posts.filter(p => p.status === 'review').length;
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
  const avgEngagement = social.length ? (social.reduce((s, a) => s + (parseFloat(a.engagement_rate) || 0), 0) / social.length).toFixed(1) : '0';

  // Insights
  const urgentReviews = reviews.filter(r => r.rating <= 2 && r.status !== 'responded' && !r.is_responded);
  const underSpending = campaigns.filter(c => c.status === 'active' && c.budget > 0 && (c.spend / c.budget) < 0.3);
  const stalledInfluencers = influencers.filter(i => i.pipeline_stage === 'outreach' && i.last_contacted && (now - new Date(i.last_contacted)) > 7 * 86400000);

  container.innerHTML = `
    <h1 class="page-title">Dashboard</h1>
    <p class="page-subtitle">Welcome back, ${currentUser.name.split(' ')[0]}. Here's your marketing overview.</p>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Team Members</div><div class="kpi-value">${teamCount}</div></div>
      <div class="kpi-card"><div class="kpi-label">Brands</div><div class="kpi-value">${brandCount}</div></div>
      <div class="kpi-card"><div class="kpi-label">Locations</div><div class="kpi-value">${locationCount}</div></div>
      <div class="kpi-card"><div class="kpi-label">Posts This Week</div><div class="kpi-value">${postsThisWeek}</div></div>
      <div class="kpi-card"><div class="kpi-label">Pending Approvals</div><div class="kpi-value" style="color:${pendingApprovals > 0 ? 'var(--warning)' : ''}">${pendingApprovals}</div></div>
      <div class="kpi-card"><div class="kpi-label">Active Campaigns</div><div class="kpi-value" style="color:var(--success)">${activeCampaigns}</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg Engagement</div><div class="kpi-value">${avgEngagement}%</div></div>
    </div>
    <div class="quick-actions">
      <button class="quick-action" onclick="navigate('content')"><i data-lucide="plus"></i> New Post</button>
      <button class="quick-action" onclick="navigate('campaigns')"><i data-lucide="megaphone"></i> Plan Campaign</button>
      <button class="quick-action" onclick="navigate('influencers')"><i data-lucide="user-plus"></i> Add Influencer</button>
      <button class="quick-action" onclick="navigate('calendar')"><i data-lucide="calendar"></i> View Calendar</button>
    </div>
    ${(urgentReviews.length || underSpending.length || stalledInfluencers.length || pendingApprovals > 0) ? `
    <h3 class="section-title">Action Insights</h3>
    <div class="insight-grid">
      ${urgentReviews.length ? `<div class="insight-card danger"><div class="insight-title">⚠ Urgent Reviews</div><div class="insight-desc">${urgentReviews.length} negative review(s) need responses</div></div>` : ''}
      ${underSpending.length ? `<div class="insight-card"><div class="insight-title">💰 Under-Spending Campaigns</div><div class="insight-desc">${underSpending.length} campaign(s) below 30% budget utilization</div></div>` : ''}
      ${stalledInfluencers.length ? `<div class="insight-card info"><div class="insight-title">📞 Stalled Influencer Deals</div><div class="insight-desc">${stalledInfluencers.length} outreach contact(s) not followed up in 7+ days</div></div>` : ''}
      ${pendingApprovals > 0 ? `<div class="insight-card"><div class="insight-title">📝 Pending Review Backlog</div><div class="insight-desc">${pendingApprovals} post(s) awaiting approval</div></div>` : ''}
    </div>` : ''}
    <h3 class="section-title">Recent Activity</h3>
    <div class="card">
      <div class="activity-feed" id="activity-feed">
        ${activity.length ? activity.map(a => `
          <div class="activity-item">
            <div class="activity-icon"><i data-lucide="activity" style="width:14px;height:14px;color:var(--text-muted)"></i></div>
            <div class="activity-text">
              <span class="action">${employeeName(a.employee_id)}</span> — ${a.action}: ${a.details || ''}
              <div class="activity-time">${timeAgo(a.created_at)}</div>
            </div>
          </div>
        `).join('') : '<div class="empty-state"><p>No recent activity yet.</p></div>'}
      </div>
    </div>
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

// ============================================
// PAGE: Content Hub
// ============================================
async function renderContent(container) {
  await getEmployees();
  container.innerHTML = `
    <h1 class="page-title">Content Hub</h1>
    <p class="page-subtitle">Manage posts, calendar, and brand assets</p>
    <div class="tabs">
      <button class="tab active" data-tab="posts">Posts</button>
      <button class="tab" data-tab="content-cal">Calendar</button>
      <button class="tab" data-tab="assets">Asset Library</button>
    </div>
    <div id="content-tab-content"></div>
  `;
  const tabs = $$('.tab', container);
  tabs.forEach(t => t.onclick = () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    loadContentTab(t.dataset.tab);
  });
  loadContentTab('posts');
}

async function loadContentTab(tab) {
  const c = $('#content-tab-content');
  showLoading(c);
  if (tab === 'posts') await renderPostsTab(c);
  else if (tab === 'content-cal') await renderContentCalTab(c);
  else if (tab === 'assets') await renderAssetsTab(c);
}

async function renderPostsTab(container) {
  const { data: posts } = await sb.from('content_posts').select('*').order('created_at', { ascending: false });
  const items = posts || [];
  let selected = new Set();
  const statusOpts = ['draft', 'review', 'approved', 'scheduled', 'published'];

  function renderTable(filtered) {
    return `
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Filter posts..." id="posts-filter"></div>
      <select class="form-select" style="width:150px" id="posts-status-filter">
        <option value="">All Statuses</option>
        ${statusOpts.map(s => `<option value="${s}">${s}</option>`).join('')}
      </select>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="csvExport(${JSON.stringify(filtered).replace(/"/g, '&quot;')}, 'posts')"><i data-lucide="download"></i> Export</button>
        <button class="btn btn-primary btn-sm" id="new-post-btn"><i data-lucide="plus"></i> New Post</button>
      </div>
    </div>
    <div id="posts-bulk-bar"></div>
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th style="width:36px"><input type="checkbox" id="posts-select-all"></th>
          <th data-key="title">Title</th>
          <th data-key="platforms">Platforms</th>
          <th data-key="status">Status</th>
          <th data-key="scheduled_date">Scheduled</th>
          <th data-key="assigned_to">Assigned To</th>
          <th>Actions</th>
        </tr></thead>
        <tbody id="posts-tbody">${filtered.map(postRow).join('')}</tbody>
      </table>
    </div>`;
  }

  function postRow(p) {
    const platforms = parseJSON(p.platforms).map(pl => `<span class="badge badge-platform">${pl}</span>`).join(' ');
    return `<tr data-id="${p.id}">
      <td><input type="checkbox" class="post-check" value="${p.id}"></td>
      <td>${p.title || 'Untitled'}</td>
      <td>${platforms}</td>
      <td>${badgeHTML(p.status)}</td>
      <td>${formatDate(p.scheduled_date)}</td>
      <td>${employeeName(p.assigned_to)}</td>
      <td class="table-actions">
        <button class="btn-icon btn-ghost" onclick="editPost('${p.id}')"><i data-lucide="edit-2"></i></button>
        <button class="btn-icon btn-ghost" onclick="deletePost('${p.id}')"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>`;
  }

  container.innerHTML = renderTable(items);
  lucide.createIcons({ nameAttr: 'data-lucide' });

  // Filter
  const filterInput = $('#posts-filter');
  const statusFilter = $('#posts-status-filter');
  function applyFilter() {
    const q = filterInput.value.toLowerCase();
    const st = statusFilter.value;
    const filtered = items.filter(p => {
      const match = !q || p.title?.toLowerCase().includes(q) || (p.body || '').toLowerCase().includes(q);
      const stMatch = !st || p.status === st;
      return match && stMatch;
    });
    $('#posts-tbody').innerHTML = filtered.map(postRow).join('');
    lucide.createIcons({ nameAttr: 'data-lucide' });
    bindCheckboxes();
  }
  filterInput?.addEventListener('input', applyFilter);
  statusFilter?.addEventListener('change', applyFilter);

  // Select all & bulk
  function bindCheckboxes() {
    selected = new Set();
    $$('.post-check').forEach(cb => {
      cb.checked = false;
      cb.onchange = () => {
        if (cb.checked) selected.add(cb.value); else selected.delete(cb.value);
        updateBulk();
      };
    });
  }
  function updateBulk() {
    const bar = $('#posts-bulk-bar');
    if (selected.size === 0) { bar.innerHTML = ''; return; }
    bar.innerHTML = `<div class="bulk-bar">${selected.size} selected
      <select class="form-select" style="width:140px;margin-left:8px" id="bulk-status-sel">
        <option value="">Change Status...</option>
        ${statusOpts.map(s => `<option value="${s}">${s}</option>`).join('')}
      </select>
      <button class="btn btn-danger btn-sm" id="bulk-delete-posts">Delete Selected</button>
    </div>`;
    $('#bulk-status-sel').onchange = async function() {
      if (!this.value) return;
      for (const id of selected) await sb.from('content_posts').update({ status: this.value }).eq('id', id);
      toast('Status updated', 'success');
      loadContentTab('posts');
    };
    $('#bulk-delete-posts').onclick = () => openConfirm('Delete Posts', `Delete ${selected.size} post(s)?`, async () => {
      for (const id of selected) await sb.from('content_posts').delete().eq('id', id);
      toast('Posts deleted', 'success');
      loadContentTab('posts');
    });
  }
  bindCheckboxes();
  const selectAll = $('#posts-select-all');
  if (selectAll) selectAll.onchange = () => {
    $$('.post-check').forEach(cb => { cb.checked = selectAll.checked; if (cb.checked) selected.add(cb.value); else selected.delete(cb.value); });
    updateBulk();
  };

  // New post
  $('#new-post-btn').onclick = () => editPost(null);

  // Make table sortable
  const table = $('table', container);
  if (table) makeSortable(table, items, postRow, $('#posts-tbody'));
}

window.editPost = async function(id) {
  let post = {};
  if (id) {
    const { data } = await sb.from('content_posts').select('*').eq('id', id).single();
    post = data || {};
  }
  const allPlatforms = ['Instagram', 'Facebook', 'Twitter', 'TikTok', 'LinkedIn', 'YouTube', 'Pinterest'];
  const selectedPlatforms = parseJSON(post.platforms).map(p => p.toLowerCase());
  openModal(id ? 'Edit Post' : 'New Post', `
    <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="post-title" value="${post.title || ''}"></div>
    <div class="form-group"><label class="form-label">Body</label><textarea class="form-textarea" id="post-body" rows="4">${post.body || ''}</textarea></div>
    <div class="form-group"><label class="form-label">Platforms</label>
      <div class="chip-select" id="post-platforms">${allPlatforms.map(p => `<div class="chip ${selectedPlatforms.includes(p.toLowerCase()) ? 'selected' : ''}" data-value="${p}">${p}</div>`).join('')}</div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Status</label>
        <select class="form-select" id="post-status">
          ${['draft','review','approved','scheduled','published'].map(s => `<option value="${s}" ${post.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Assigned To</label>
        <select class="form-select" id="post-assigned"><option value="">Unassigned</option>${employeeOptions(post.assigned_to)}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Scheduled Date</label><input class="form-input" type="date" id="post-date" value="${post.scheduled_date || ''}"></div>
      <div class="form-group"><label class="form-label">Scheduled Time</label><input class="form-input" type="time" id="post-time" value="${post.scheduled_time || ''}"></div>
    </div>
    <div class="form-group"><label class="form-label">Tags (comma-separated)</label><input class="form-input" id="post-tags" value="${parseJSON(post.tags).join(', ')}"></div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="post-notes" rows="2">${post.notes || ''}</textarea></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-post-btn">Save</button>`);

  // Chip select
  $$('#post-platforms .chip').forEach(c => c.onclick = () => c.classList.toggle('selected'));

  $('#save-post-btn').onclick = async () => {
    const obj = {
      title: $('#post-title').value,
      body: $('#post-body').value,
      platforms: $$('#post-platforms .chip.selected').map(c => c.dataset.value),
      status: $('#post-status').value,
      assigned_to: $('#post-assigned').value || null,
      scheduled_date: $('#post-date').value || null,
      scheduled_time: $('#post-time').value || null,
      tags: $('#post-tags').value.split(',').map(t => t.trim()).filter(Boolean),
      notes: $('#post-notes').value,
    };
    if (id) {
      obj.updated_at = new Date().toISOString();
      await sb.from('content_posts').update(obj).eq('id', id);
      await logActivity('update_post', `Updated post: ${obj.title}`);
    } else {
      obj.created_by = currentUser.id;
      await sb.from('content_posts').insert(obj);
      await logActivity('create_post', `Created post: ${obj.title}`);
    }
    closeModal();
    toast(id ? 'Post updated' : 'Post created', 'success');
    loadContentTab('posts');
  };
};

window.deletePost = function(id) {
  openConfirm('Delete Post', 'Are you sure you want to delete this post?', async () => {
    await sb.from('content_posts').delete().eq('id', id);
    await logActivity('delete_post', 'Deleted a post');
    toast('Post deleted', 'success');
    loadContentTab('posts');
  });
};

// Content Calendar Tab
async function renderContentCalTab(container) {
  const { data: posts } = await sb.from('content_posts').select('*');
  renderMonthCalendar(container, posts || [], 'scheduled_date', (p) => {
    return `<div class="calendar-event" style="background:${statusColor(p.status)};color:#fff;font-size:10px;padding:1px 4px;border-radius:3px;margin-bottom:2px" title="${p.title}">${p.title?.slice(0, 20) || 'Post'}</div>`;
  });
}

function statusColor(s) {
  const m = { draft: '#666', review: '#f59e0b', approved: '#3b82f6', scheduled: '#8b5cf6', published: '#22c55e', active: '#22c55e', planning: '#f59e0b', paused: '#ef4444', completed: '#3b82f6', sent: '#22c55e' };
  return m[s] || '#666';
}

function renderMonthCalendar(container, items, dateField, renderEvent, multiSource) {
  let viewDate = new Date();
  function render() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const prevMonth = new Date(year, month, 0);
    const today = new Date();
    const monthName = viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    let cells = '';
    // Previous month padding
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevMonth.getDate() - i;
      cells += `<div class="calendar-day other-month"><div class="calendar-day-num">${d}</div></div>`;
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
      let events = '';
      if (multiSource) {
        events = multiSource(dateStr);
      } else {
        const dayItems = items.filter(i => i[dateField]?.startsWith(dateStr));
        events = dayItems.map(renderEvent).join('');
      }
      cells += `<div class="calendar-day${isToday ? ' today' : ''}" data-date="${dateStr}"><div class="calendar-day-num">${d}</div>${events}</div>`;
    }
    // Next month padding
    const totalCells = startDow + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      cells += `<div class="calendar-day other-month"><div class="calendar-day-num">${d}</div></div>`;
    }

    container.innerHTML = `
      <div class="calendar-container">
        <div class="calendar-header">
          <button class="btn btn-ghost btn-sm" id="cal-prev"><i data-lucide="chevron-left"></i></button>
          <h3>${monthName}</h3>
          <button class="btn btn-ghost btn-sm" id="cal-next"><i data-lucide="chevron-right"></i></button>
        </div>
        <div class="calendar-grid">
          <div class="calendar-day-header">Sun</div><div class="calendar-day-header">Mon</div><div class="calendar-day-header">Tue</div><div class="calendar-day-header">Wed</div><div class="calendar-day-header">Thu</div><div class="calendar-day-header">Fri</div><div class="calendar-day-header">Sat</div>
          ${cells}
        </div>
      </div>
    `;
    lucide.createIcons({ nameAttr: 'data-lucide' });
    $('#cal-prev').onclick = () => { viewDate.setMonth(viewDate.getMonth() - 1); render(); };
    $('#cal-next').onclick = () => { viewDate.setMonth(viewDate.getMonth() + 1); render(); };
  }
  render();
}

// Assets Tab
async function renderAssetsTab(container) {
  const { data: assets } = await sb.from('assets').select('*').order('created_at', { ascending: false });
  const items = assets || [];
  const typeIcons = { image: 'image', document: 'file-text', template: 'layout', video: 'video' };

  container.innerHTML = `
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Filter assets..." id="assets-filter"></div>
      <div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="new-asset-btn"><i data-lucide="plus"></i> Add Asset</button></div>
    </div>
    <div class="account-grid" id="assets-grid">
      ${items.map(a => `
        <div class="account-card">
          <div class="account-card-header">
            <div class="account-platform-icon" style="background:var(--bg-hover)"><i data-lucide="${typeIcons[a.file_type] || 'file'}" style="width:20px;height:20px;color:var(--accent)"></i></div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:13px" class="truncate">${a.name}</div>
              <div style="font-size:11px;color:var(--text-muted)">${a.file_type} · ${a.category || ''}</div>
            </div>
            <button class="btn-icon btn-ghost" onclick="deleteAsset('${a.id}')"><i data-lucide="trash-2"></i></button>
          </div>
          <div class="tag-list">${parseJSON(a.tags).map(t => `<span class="tag">${t}</span>`).join('')}</div>
        </div>
      `).join('')}
      ${!items.length ? '<div class="empty-state"><p>No assets yet. Add your first asset!</p></div>' : ''}
    </div>
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });

  $('#assets-filter')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    $$('#assets-grid .account-card').forEach(card => {
      card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });

  $('#new-asset-btn').onclick = () => {
    openModal('Add Asset', `
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="asset-name"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">File Type</label>
          <select class="form-select" id="asset-type"><option value="image">Image</option><option value="document">Document</option><option value="template">Template</option><option value="video">Video</option></select>
        </div>
        <div class="form-group"><label class="form-label">Category</label>
          <select class="form-select" id="asset-category"><option value="brand">Brand</option><option value="content">Content</option><option value="template">Template</option></select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">File URL</label><input class="form-input" id="asset-url" placeholder="https://..."></div>
      <div class="form-group"><label class="form-label">Tags (comma-separated)</label><input class="form-input" id="asset-tags"></div>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-asset-btn">Save</button>`);
    $('#save-asset-btn').onclick = async () => {
      await sb.from('assets').insert({
        name: $('#asset-name').value,
        file_type: $('#asset-type').value,
        category: $('#asset-category').value,
        file_url: $('#asset-url').value,
        tags: $('#asset-tags').value.split(',').map(t => t.trim()).filter(Boolean),
        uploaded_by: currentUser.id,
      });
      closeModal();
      toast('Asset added', 'success');
      loadContentTab('assets');
    };
  };
}

window.deleteAsset = function(id) {
  openConfirm('Delete Asset', 'Are you sure you want to delete this asset?', async () => {
    await sb.from('assets').delete().eq('id', id);
    toast('Asset deleted', 'success');
    loadContentTab('assets');
  });
};

// ============================================
// PAGE: Unified Calendar
// ============================================
async function renderCalendar(container) {
  const [postsRes, campaignsRes, emailsRes, influencersRes] = await Promise.all([
    sb.from('content_posts').select('*'),
    sb.from('campaigns').select('*'),
    sb.from('email_campaigns').select('*'),
    sb.from('influencers').select('*'),
  ]);
  const posts = postsRes.data || [];
  const campaigns = campaignsRes.data || [];
  const emails = emailsRes.data || [];
  const influencers = influencersRes.data || [];

  const sources = { posts: true, campaigns: true, emails: true, influencers: true };
  const colors = { posts: '#8b5cf6', campaigns: '#22c55e', emails: '#3b82f6', influencers: '#f59e0b' };

  container.innerHTML = `
    <h1 class="page-title">Unified Calendar</h1>
    <p class="page-subtitle">All marketing events across modules</p>
    <div class="filter-toggles" id="cal-filters">
      <div class="filter-toggle active" data-source="posts"><span class="filter-dot" style="background:#8b5cf6"></span> Posts</div>
      <div class="filter-toggle active" data-source="campaigns"><span class="filter-dot" style="background:#22c55e"></span> Campaigns</div>
      <div class="filter-toggle active" data-source="emails"><span class="filter-dot" style="background:#3b82f6"></span> Email/SMS</div>
      <div class="filter-toggle active" data-source="influencers"><span class="filter-dot" style="background:#f59e0b"></span> Influencers</div>
    </div>
    <div id="unified-cal-container"></div>
  `;

  $$('#cal-filters .filter-toggle').forEach(f => f.onclick = () => {
    f.classList.toggle('active');
    sources[f.dataset.source] = f.classList.contains('active');
    renderCal();
  });

  function renderCal() {
    renderMonthCalendar($('#unified-cal-container'), [], null, null, (dateStr) => {
      let events = '';
      if (sources.posts) posts.filter(p => p.scheduled_date?.startsWith(dateStr)).forEach(p => {
        events += `<div class="calendar-event" style="background:${colors.posts};color:#fff" title="Post: ${p.title}">${p.title?.slice(0, 15) || 'Post'}</div>`;
      });
      if (sources.campaigns) campaigns.filter(c => c.start_date?.startsWith(dateStr)).forEach(c => {
        events += `<div class="calendar-event" style="background:${colors.campaigns};color:#fff" title="Campaign: ${c.name}">${c.name?.slice(0, 15)}</div>`;
      });
      if (sources.emails) emails.filter(e => e.send_date?.startsWith(dateStr)).forEach(e => {
        events += `<div class="calendar-event" style="background:${colors.emails};color:#fff" title="Email: ${e.name}">${e.name?.slice(0, 15)}</div>`;
      });
      if (sources.influencers) influencers.filter(i => i.last_contacted?.startsWith(dateStr)).forEach(i => {
        events += `<div class="calendar-event" style="background:${colors.influencers};color:#fff" title="Influencer: ${i.name}">${i.name?.slice(0, 15)}</div>`;
      });
      return events;
    });
  }
  renderCal();
}

// ============================================
// PAGE: Influencers
// ============================================
async function renderInfluencers(container) {
  await getEmployees();
  const { data: influencers } = await sb.from('influencers').select('*').order('created_at', { ascending: false });
  const items = influencers || [];
  const stages = ['prospect', 'outreach', 'negotiation', 'contracted', 'completed'];
  const stageColors = { prospect: '#666', outreach: '#3b82f6', negotiation: '#f59e0b', contracted: '#22c55e', completed: '#8b5cf6' };
  let activeFilter = '';
  let selected = new Set();

  function stageCounts() {
    return stages.map(s => ({ stage: s, count: items.filter(i => i.pipeline_stage === s).length }));
  }

  function filtered() {
    return activeFilter ? items.filter(i => i.pipeline_stage === activeFilter) : items;
  }

  function rowHTML(i) {
    return `<tr data-id="${i.id}">
      <td><input type="checkbox" class="inf-check" value="${i.id}"></td>
      <td>${i.name}</td>
      <td>${i.handle || '—'}</td>
      <td>${i.platform || '—'}</td>
      <td>${i.followers?.toLocaleString() || '—'}</td>
      <td>${i.engagement_rate != null ? i.engagement_rate + '%' : '—'}</td>
      <td>${i.rate || '—'}</td>
      <td>${badgeHTML(i.pipeline_stage)}</td>
      <td>${employeeName(i.contact_owner)}</td>
      <td>${formatDate(i.last_contacted)}</td>
      <td class="table-actions">
        <button class="btn-icon btn-ghost" onclick="editInfluencer('${i.id}')"><i data-lucide="edit-2"></i></button>
        <button class="btn-icon btn-ghost" onclick="deleteInfluencer('${i.id}')"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>`;
  }

  function render() {
    const f = filtered();
    container.innerHTML = `
      <h1 class="page-title">Influencers</h1>
      <p class="page-subtitle">Manage influencer pipeline and relationships</p>
      <div class="pipeline-grid">
        ${stageCounts().map(s => `
          <div class="pipeline-card ${activeFilter === s.stage ? 'active' : ''}" style="border-top-color:${stageColors[s.stage]}" data-stage="${s.stage}">
            <div class="pipeline-count" style="color:${stageColors[s.stage]}">${s.count}</div>
            <div class="pipeline-label">${s.stage}</div>
          </div>
        `).join('')}
      </div>
      <div class="table-toolbar">
        <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Filter influencers..." id="inf-filter"></div>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" id="inf-export"><i data-lucide="download"></i> Export</button>
          <button class="btn btn-primary btn-sm" id="new-inf-btn"><i data-lucide="plus"></i> Add Influencer</button>
        </div>
      </div>
      <div id="inf-bulk-bar"></div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th style="width:36px"><input type="checkbox" id="inf-select-all"></th>
            <th data-key="name">Name</th>
            <th data-key="handle">Handle</th>
            <th data-key="platform">Platform</th>
            <th data-key="followers">Followers</th>
            <th data-key="engagement_rate">Engagement</th>
            <th data-key="rate">Rate</th>
            <th data-key="pipeline_stage">Stage</th>
            <th>Owner</th>
            <th data-key="last_contacted">Last Contact</th>
            <th>Actions</th>
          </tr></thead>
          <tbody id="inf-tbody">${f.map(rowHTML).join('')}</tbody>
        </table>
      </div>
    `;
    lucide.createIcons({ nameAttr: 'data-lucide' });

    // Pipeline clicks
    $$('.pipeline-card', container).forEach(c => c.onclick = () => {
      activeFilter = activeFilter === c.dataset.stage ? '' : c.dataset.stage;
      render();
    });

    // Filter
    $('#inf-filter')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      $$('#inf-tbody tr').forEach(tr => {
        tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    // Export
    $('#inf-export').onclick = () => csvExport(f, 'influencers');
    // New
    $('#new-inf-btn').onclick = () => editInfluencer(null);

    // Bulk
    selected = new Set();
    function bindCheck() {
      $$('.inf-check').forEach(cb => {
        cb.onchange = () => { if (cb.checked) selected.add(cb.value); else selected.delete(cb.value); updateBulk(); };
      });
    }
    function updateBulk() {
      const bar = $('#inf-bulk-bar');
      if (!selected.size) { bar.innerHTML = ''; return; }
      bar.innerHTML = `<div class="bulk-bar">${selected.size} selected
        <select class="form-select" style="width:150px;margin-left:8px" id="bulk-stage-sel">
          <option value="">Change Stage...</option>
          ${stages.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
        <button class="btn btn-danger btn-sm" id="bulk-delete-inf">Delete</button>
      </div>`;
      $('#bulk-stage-sel').onchange = async function() {
        if (!this.value) return;
        for (const id of selected) await sb.from('influencers').update({ pipeline_stage: this.value }).eq('id', id);
        toast('Stage updated', 'success');
        renderInfluencers(container);
      };
      $('#bulk-delete-inf').onclick = () => openConfirm('Delete Influencers', `Delete ${selected.size} influencer(s)?`, async () => {
        for (const id of selected) await sb.from('influencers').delete().eq('id', id);
        toast('Deleted', 'success');
        renderInfluencers(container);
      });
    }
    bindCheck();
    const selectAll = $('#inf-select-all');
    if (selectAll) selectAll.onchange = () => {
      $$('.inf-check').forEach(cb => { cb.checked = selectAll.checked; if (cb.checked) selected.add(cb.value); else selected.delete(cb.value); });
      updateBulk();
    };

    // Sort
    const table = $('table', container);
    if (table) makeSortable(table, f, rowHTML, $('#inf-tbody'));
  }
  render();
}

window.editInfluencer = async function(id) {
  let inf = {};
  if (id) {
    const { data } = await sb.from('influencers').select('*').eq('id', id).single();
    inf = data || {};
  }
  const stages = ['prospect', 'outreach', 'negotiation', 'contracted', 'completed'];
  openModal(id ? 'Edit Influencer' : 'Add Influencer', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="inf-name" value="${inf.name || ''}"></div>
      <div class="form-group"><label class="form-label">Handle</label><input class="form-input" id="inf-handle" value="${inf.handle || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Platform</label>
        <select class="form-select" id="inf-platform">
          ${['Instagram','TikTok','YouTube','Twitter','Facebook','LinkedIn'].map(p => `<option ${inf.platform === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Pipeline Stage</label>
        <select class="form-select" id="inf-stage">
          ${stages.map(s => `<option value="${s}" ${inf.pipeline_stage === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Followers</label><input class="form-input" type="number" id="inf-followers" value="${inf.followers || ''}"></div>
      <div class="form-group"><label class="form-label">Engagement Rate (%)</label><input class="form-input" type="number" step="0.1" id="inf-engagement" value="${inf.engagement_rate || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Rate ($)</label><input class="form-input" type="number" id="inf-rate" value="${inf.rate || ''}"></div>
      <div class="form-group"><label class="form-label">Category</label><input class="form-input" id="inf-category" value="${inf.category || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="inf-email" value="${inf.email || ''}"></div>
      <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="inf-phone" value="${inf.phone || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Location</label><input class="form-input" id="inf-location" value="${inf.location || ''}"></div>
      <div class="form-group"><label class="form-label">Contact Owner</label>
        <select class="form-select" id="inf-owner"><option value="">None</option>${employeeOptions(inf.contact_owner)}</select>
      </div>
    </div>
    <div class="form-group"><label class="form-label">Tags (comma-separated)</label><input class="form-input" id="inf-tags" value="${parseJSON(inf.tags).join(', ')}"></div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="inf-notes">${inf.notes || ''}</textarea></div>
    <div id="inf-dup-warning" style="color:var(--warning);font-size:12px;margin-top:4px"></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-inf-btn">Save</button>`);

  // Duplicate detection
  async function checkDup() {
    const name = $('#inf-name').value.trim();
    const handle = $('#inf-handle').value.trim();
    if (!name && !handle) return;
    let query = sb.from('influencers').select('id,name,handle');
    if (name) query = query.ilike('name', `%${name}%`);
    const { data } = await query;
    const dups = (data || []).filter(d => d.id !== id);
    if (dups.length) {
      $('#inf-dup-warning').textContent = `⚠ Possible duplicate: ${dups.map(d => d.name).join(', ')}`;
    } else {
      $('#inf-dup-warning').textContent = '';
    }
  }
  $('#inf-name')?.addEventListener('blur', checkDup);
  $('#inf-handle')?.addEventListener('blur', checkDup);

  $('#save-inf-btn').onclick = async () => {
    const obj = {
      name: $('#inf-name').value,
      handle: $('#inf-handle').value,
      platform: $('#inf-platform').value,
      pipeline_stage: $('#inf-stage').value,
      followers: parseInt($('#inf-followers').value) || null,
      engagement_rate: parseFloat($('#inf-engagement').value) || null,
      rate: parseFloat($('#inf-rate').value) || null,
      category: $('#inf-category').value,
      email: $('#inf-email').value,
      phone: $('#inf-phone').value,
      location: $('#inf-location').value,
      contact_owner: $('#inf-owner').value || null,
      tags: $('#inf-tags').value.split(',').map(t => t.trim()).filter(Boolean),
      notes: $('#inf-notes').value,
    };
    if (id) {
      obj.updated_at = new Date().toISOString();
      await sb.from('influencers').update(obj).eq('id', id);
      await logActivity('update_influencer', `Updated influencer: ${obj.name}`);
    } else {
      await sb.from('influencers').insert(obj);
      await logActivity('create_influencer', `Added influencer: ${obj.name}`);
    }
    closeModal();
    toast(id ? 'Influencer updated' : 'Influencer added', 'success');
    navigate('influencers');
  };
};

window.deleteInfluencer = function(id) {
  openConfirm('Delete Influencer', 'Are you sure?', async () => {
    await sb.from('influencers').delete().eq('id', id);
    await logActivity('delete_influencer', 'Deleted an influencer');
    toast('Deleted', 'success');
    navigate('influencers');
  });
};

// ============================================
// PAGE: Campaigns
// ============================================
async function renderCampaigns(container) {
  await getEmployees();
  const { data: campaigns } = await sb.from('campaigns').select('*').order('created_at', { ascending: false });
  const items = campaigns || [];

  function rowHTML(c) {
    const pct = c.budget > 0 ? Math.round((c.spend / c.budget) * 100) : 0;
    const pctColor = pct < 30 ? 'var(--warning)' : pct > 90 ? 'var(--danger)' : 'var(--success)';
    return `<tr>
      <td>${c.name}</td>
      <td>${badgeHTML(c.campaign_type)}</td>
      <td>${badgeHTML(c.status)}</td>
      <td>${formatDate(c.start_date)} — ${formatDate(c.end_date)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="progress-bar" style="width:80px"><div class="progress-fill" style="width:${pct}%;background:${pctColor}"></div></div>
          <span style="font-size:11px">$${(c.spend || 0).toLocaleString()} / $${(c.budget || 0).toLocaleString()}</span>
        </div>
      </td>
      <td>${parseJSON(c.platforms).map(p => `<span class="badge badge-platform">${p}</span>`).join(' ')}</td>
      <td>${c.kpi_actual || '—'} / ${c.kpi_target || '—'}</td>
      <td class="table-actions">
        <button class="btn-icon btn-ghost" onclick="editCampaign('${c.id}')"><i data-lucide="edit-2"></i></button>
        <button class="btn-icon btn-ghost" onclick="deleteCampaign('${c.id}')"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>`;
  }

  container.innerHTML = `
    <h1 class="page-title">Campaigns</h1>
    <p class="page-subtitle">Plan and manage marketing campaigns</p>
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Filter campaigns..." id="camp-filter"></div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" id="camp-export"><i data-lucide="download"></i> Export</button>
        <button class="btn btn-primary btn-sm" id="new-camp-btn"><i data-lucide="plus"></i> New Campaign</button>
      </div>
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th data-key="name">Name</th>
          <th data-key="campaign_type">Type</th>
          <th data-key="status">Status</th>
          <th>Dates</th>
          <th data-key="spend">Budget / Spend</th>
          <th>Platforms</th>
          <th>KPI</th>
          <th>Actions</th>
        </tr></thead>
        <tbody id="camp-tbody">${items.map(rowHTML).join('')}</tbody>
      </table>
    </div>
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });

  $('#camp-filter')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    $$('#camp-tbody tr').forEach(tr => tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none');
  });
  $('#camp-export').onclick = () => csvExport(items, 'campaigns');
  $('#new-camp-btn').onclick = () => editCampaign(null);
}

window.editCampaign = async function(id) {
  let c = {};
  if (id) {
    const { data } = await sb.from('campaigns').select('*').eq('id', id).single();
    c = data || {};
  }
  const types = ['seasonal', 'promotion', 'brand', 'influencer'];
  const statuses = ['planning', 'active', 'paused', 'completed'];
  const allPlatforms = ['Instagram', 'Facebook', 'Twitter', 'TikTok', 'LinkedIn', 'YouTube'];
  const selPlatforms = parseJSON(c.platforms).map(p => p.toLowerCase());

  openModal(id ? 'Edit Campaign' : 'New Campaign', `
    <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="camp-name" value="${c.name || ''}"></div>
    <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="camp-desc">${c.description || ''}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Type</label>
        <select class="form-select" id="camp-type">${types.map(t => `<option value="${t}" ${c.campaign_type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label class="form-label">Status</label>
        <select class="form-select" id="camp-status">${statuses.map(s => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Start Date</label><input class="form-input" type="date" id="camp-start" value="${c.start_date || ''}"></div>
      <div class="form-group"><label class="form-label">End Date</label><input class="form-input" type="date" id="camp-end" value="${c.end_date || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Budget ($)</label><input class="form-input" type="number" id="camp-budget" value="${c.budget || ''}"></div>
      <div class="form-group"><label class="form-label">Spend ($)</label><input class="form-input" type="number" id="camp-spend" value="${c.spend || ''}"></div>
    </div>
    <div class="form-group"><label class="form-label">Platforms</label>
      <div class="chip-select" id="camp-platforms">${allPlatforms.map(p => `<div class="chip ${selPlatforms.includes(p.toLowerCase()) ? 'selected' : ''}" data-value="${p}">${p}</div>`).join('')}</div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">KPI Target</label><input class="form-input" id="camp-kpi-target" value="${c.kpi_target || ''}"></div>
      <div class="form-group"><label class="form-label">KPI Actual</label><input class="form-input" id="camp-kpi-actual" value="${c.kpi_actual || ''}"></div>
    </div>
    <div class="form-group"><label class="form-label">Owner</label>
      <select class="form-select" id="camp-owner"><option value="">None</option>${employeeOptions(c.owner_id)}</select>
    </div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="camp-notes">${c.notes || ''}</textarea></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-camp-btn">Save</button>`);

  $$('#camp-platforms .chip').forEach(ch => ch.onclick = () => ch.classList.toggle('selected'));

  $('#save-camp-btn').onclick = async () => {
    const obj = {
      name: $('#camp-name').value,
      description: $('#camp-desc').value,
      campaign_type: $('#camp-type').value,
      status: $('#camp-status').value,
      start_date: $('#camp-start').value || null,
      end_date: $('#camp-end').value || null,
      budget: parseFloat($('#camp-budget').value) || 0,
      spend: parseFloat($('#camp-spend').value) || 0,
      platforms: $$('#camp-platforms .chip.selected').map(c => c.dataset.value),
      kpi_target: $('#camp-kpi-target').value,
      kpi_actual: $('#camp-kpi-actual').value,
      owner_id: $('#camp-owner').value || null,
      notes: $('#camp-notes').value,
    };
    if (id) {
      obj.updated_at = new Date().toISOString();
      await sb.from('campaigns').update(obj).eq('id', id);
      await logActivity('update_campaign', `Updated campaign: ${obj.name}`);
    } else {
      await sb.from('campaigns').insert(obj);
      await logActivity('create_campaign', `Created campaign: ${obj.name}`);
    }
    closeModal();
    toast(id ? 'Campaign updated' : 'Campaign created', 'success');
    navigate('campaigns');
  };
};

window.deleteCampaign = function(id) {
  openConfirm('Delete Campaign', 'Are you sure?', async () => {
    await sb.from('campaigns').delete().eq('id', id);
    toast('Deleted', 'success');
    navigate('campaigns');
  });
};

// ============================================
// PAGE: Local Media
// ============================================
async function renderMedia(container) {
  await getEmployees();
  const { data: contacts } = await sb.from('media_contacts').select('*').order('created_at', { ascending: false });
  const items = contacts || [];
  const relationships = ['hot', 'warm', 'cold'];
  const relColors = { hot: '#ef4444', warm: '#f59e0b', cold: '#3b82f6' };
  let activeFilter = '';

  function relCounts() {
    return relationships.map(r => ({ rel: r, count: items.filter(i => i.relationship === r).length }));
  }

  function filtered() {
    return activeFilter ? items.filter(i => i.relationship === activeFilter) : items;
  }

  function rowHTML(m) {
    return `<tr>
      <td>${m.name}</td>
      <td>${m.outlet || '—'}</td>
      <td>${badgeHTML(m.outlet_type)}</td>
      <td>${m.role || '—'}</td>
      <td>${m.beat || '—'}</td>
      <td>${m.email || '—'}</td>
      <td>${badgeHTML(m.relationship)}</td>
      <td>${employeeName(m.contact_owner)}</td>
      <td>${formatDate(m.last_contacted)}</td>
      <td class="table-actions">
        <button class="btn-icon btn-ghost" onclick="editMediaContact('${m.id}')"><i data-lucide="edit-2"></i></button>
        <button class="btn-icon btn-ghost" onclick="deleteMediaContact('${m.id}')"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>`;
  }

  function render() {
    const f = filtered();
    container.innerHTML = `
      <h1 class="page-title">Local Media</h1>
      <p class="page-subtitle">Manage media contacts and PR relationships</p>
      <div class="pipeline-grid">
        ${relCounts().map(r => `
          <div class="pipeline-card ${activeFilter === r.rel ? 'active' : ''}" style="border-top-color:${relColors[r.rel]}" data-rel="${r.rel}">
            <div class="pipeline-count" style="color:${relColors[r.rel]}">${r.count}</div>
            <div class="pipeline-label">${r.rel}</div>
          </div>
        `).join('')}
      </div>
      <div class="table-toolbar">
        <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Filter contacts..." id="media-filter"></div>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" id="media-export"><i data-lucide="download"></i> Export</button>
          <button class="btn btn-primary btn-sm" id="new-media-btn"><i data-lucide="plus"></i> Add Contact</button>
        </div>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th data-key="name">Name</th>
            <th data-key="outlet">Outlet</th>
            <th data-key="outlet_type">Type</th>
            <th data-key="role">Role</th>
            <th data-key="beat">Beat</th>
            <th>Email</th>
            <th data-key="relationship">Relationship</th>
            <th>Owner</th>
            <th data-key="last_contacted">Last Contact</th>
            <th>Actions</th>
          </tr></thead>
          <tbody id="media-tbody">${f.map(rowHTML).join('')}</tbody>
        </table>
      </div>
    `;
    lucide.createIcons({ nameAttr: 'data-lucide' });

    $$('.pipeline-card', container).forEach(c => c.onclick = () => {
      activeFilter = activeFilter === c.dataset.rel ? '' : c.dataset.rel;
      render();
    });
    $('#media-filter')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      $$('#media-tbody tr').forEach(tr => tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none');
    });
    $('#media-export').onclick = () => csvExport(f, 'media_contacts');
    $('#new-media-btn').onclick = () => editMediaContact(null);
  }
  render();
}

window.editMediaContact = async function(id) {
  let m = {};
  if (id) {
    const { data } = await sb.from('media_contacts').select('*').eq('id', id).single();
    m = data || {};
  }
  const types = ['tv', 'newspaper', 'online', 'magazine', 'blog', 'podcast', 'radio'];
  const rels = ['hot', 'warm', 'cold'];

  openModal(id ? 'Edit Media Contact' : 'Add Media Contact', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="mc-name" value="${m.name || ''}"></div>
      <div class="form-group"><label class="form-label">Outlet</label><input class="form-input" id="mc-outlet" value="${m.outlet || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Outlet Type</label>
        <select class="form-select" id="mc-type">${types.map(t => `<option value="${t}" ${m.outlet_type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label class="form-label">Relationship</label>
        <select class="form-select" id="mc-rel">${rels.map(r => `<option value="${r}" ${m.relationship === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Role</label><input class="form-input" id="mc-role" value="${m.role || ''}"></div>
      <div class="form-group"><label class="form-label">Beat</label><input class="form-input" id="mc-beat" value="${m.beat || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="mc-email" value="${m.email || ''}"></div>
      <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="mc-phone" value="${m.phone || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Website</label><input class="form-input" id="mc-website" value="${m.website || ''}"></div>
      <div class="form-group"><label class="form-label">Social Handle</label><input class="form-input" id="mc-social" value="${m.social_handle || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Location</label><input class="form-input" id="mc-location" value="${m.location || ''}"></div>
      <div class="form-group"><label class="form-label">Contact Owner</label>
        <select class="form-select" id="mc-owner"><option value="">None</option>${employeeOptions(m.contact_owner)}</select>
      </div>
    </div>
    <div class="form-group"><label class="form-label">Tags (comma-separated)</label><input class="form-input" id="mc-tags" value="${parseJSON(m.tags).join(', ')}"></div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="mc-notes">${m.notes || ''}</textarea></div>
    <div id="mc-dup-warning" style="color:var(--warning);font-size:12px;margin-top:4px"></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-mc-btn">Save</button>`);

  // Duplicate detection
  async function checkDup() {
    const name = $('#mc-name').value.trim();
    const outlet = $('#mc-outlet').value.trim();
    if (!name) return;
    const { data } = await sb.from('media_contacts').select('id,name,outlet').ilike('name', `%${name}%`);
    const dups = (data || []).filter(d => d.id !== id);
    if (dups.length) {
      $('#mc-dup-warning').textContent = `⚠ Possible duplicate: ${dups.map(d => `${d.name} (${d.outlet})`).join(', ')}`;
    } else {
      $('#mc-dup-warning').textContent = '';
    }
  }
  $('#mc-name')?.addEventListener('blur', checkDup);

  $('#save-mc-btn').onclick = async () => {
    const obj = {
      name: $('#mc-name').value,
      outlet: $('#mc-outlet').value,
      outlet_type: $('#mc-type').value,
      relationship: $('#mc-rel').value,
      role: $('#mc-role').value,
      beat: $('#mc-beat').value,
      email: $('#mc-email').value,
      phone: $('#mc-phone').value,
      website: $('#mc-website').value,
      social_handle: $('#mc-social').value,
      location: $('#mc-location').value,
      contact_owner: $('#mc-owner').value || null,
      tags: $('#mc-tags').value.split(',').map(t => t.trim()).filter(Boolean),
      notes: $('#mc-notes').value,
    };
    if (id) {
      obj.updated_at = new Date().toISOString();
      await sb.from('media_contacts').update(obj).eq('id', id);
      await logActivity('update_media_contact', `Updated: ${obj.name}`);
    } else {
      await sb.from('media_contacts').insert(obj);
      await logActivity('create_media_contact', `Added: ${obj.name}`);
    }
    closeModal();
    toast(id ? 'Contact updated' : 'Contact added', 'success');
    navigate('media');
  };
};

window.deleteMediaContact = function(id) {
  openConfirm('Delete Contact', 'Are you sure?', async () => {
    await sb.from('media_contacts').delete().eq('id', id);
    toast('Deleted', 'success');
    navigate('media');
  });
};

// ============================================
// PAGE: Email & SMS
// ============================================
async function renderEmailSms(container) {
  await getEmployees();
  const { data: campaigns } = await sb.from('email_campaigns').select('*').order('created_at', { ascending: false });
  const { data: lists } = await sb.from('contact_lists').select('*');
  const items = campaigns || [];
  const contactLists = lists || [];

  function rowHTML(e) {
    return `<tr>
      <td>${e.name}</td>
      <td>${e.campaign_type || '—'}</td>
      <td>${badgeHTML(e.channel || 'email', e.channel || 'email')}</td>
      <td>${badgeHTML(e.status)}</td>
      <td>${formatDate(e.send_date)}</td>
      <td>${e.recipient_count || '—'}</td>
      <td>${e.sent_count || 0}</td>
      <td>${e.open_count || 0}</td>
      <td>${e.click_count || 0}</td>
      <td class="table-actions">
        <button class="btn-icon btn-ghost" onclick="editEmailCampaign('${e.id}')"><i data-lucide="edit-2"></i></button>
        <button class="btn-icon btn-ghost" onclick="deleteEmailCampaign('${e.id}')"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>`;
  }

  container.innerHTML = `
    <h1 class="page-title">Email & SMS</h1>
    <p class="page-subtitle">Manage email and SMS campaigns</p>
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Filter campaigns..." id="email-filter"></div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" id="email-export"><i data-lucide="download"></i> Export</button>
        <button class="btn btn-primary btn-sm" id="new-email-btn"><i data-lucide="plus"></i> New Campaign</button>
      </div>
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th data-key="name">Name</th>
          <th data-key="campaign_type">Type</th>
          <th data-key="channel">Channel</th>
          <th data-key="status">Status</th>
          <th data-key="send_date">Send Date</th>
          <th data-key="recipient_count">Recipients</th>
          <th data-key="sent_count">Sent</th>
          <th data-key="open_count">Opens</th>
          <th data-key="click_count">Clicks</th>
          <th>Actions</th>
        </tr></thead>
        <tbody id="email-tbody">${items.map(rowHTML).join('')}</tbody>
      </table>
    </div>
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });

  $('#email-filter')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    $$('#email-tbody tr').forEach(tr => tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none');
  });
  $('#email-export').onclick = () => csvExport(items, 'email_sms_campaigns');
  $('#new-email-btn').onclick = () => editEmailCampaign(null);

  // Store contact lists for modal
  window._contactLists = contactLists;
}

window.editEmailCampaign = async function(id) {
  let e = {};
  if (id) {
    const { data } = await sb.from('email_campaigns').select('*').eq('id', id).single();
    e = data || {};
  }
  const contactLists = window._contactLists || [];

  openModal(id ? 'Edit Campaign' : 'New Campaign', `
    <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="ec-name" value="${e.name || ''}"></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Channel</label>
        <select class="form-select" id="ec-channel">
          <option value="email" ${e.channel === 'email' ? 'selected' : ''}>Email</option>
          <option value="sms" ${e.channel === 'sms' ? 'selected' : ''}>SMS</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Campaign Type</label><input class="form-input" id="ec-type" value="${e.campaign_type || ''}"></div>
    </div>
    <div class="form-group"><label class="form-label">Subject</label><input class="form-input" id="ec-subject" value="${e.subject || ''}"></div>
    <div class="form-group"><label class="form-label">Preview Text</label><input class="form-input" id="ec-preview" value="${e.preview_text || ''}"></div>
    <div class="form-group"><label class="form-label">Body</label><textarea class="form-textarea" id="ec-body" rows="5">${e.body_html || ''}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Status</label>
        <select class="form-select" id="ec-status">
          ${['draft','scheduled','sent'].map(s => `<option value="${s}" ${e.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Recipient List</label>
        <select class="form-select" id="ec-list">
          <option value="">Select list...</option>
          ${contactLists.map(l => `<option value="${l.name}" ${e.recipient_list === l.name ? 'selected' : ''}>${l.name} (${l.subscriber_count})</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Send Date</label><input class="form-input" type="date" id="ec-date" value="${e.send_date || ''}"></div>
      <div class="form-group"><label class="form-label">Send Time</label><input class="form-input" type="time" id="ec-time" value="${e.send_time || ''}"></div>
    </div>
    <div class="form-group"><label class="form-label">Template</label><input class="form-input" id="ec-template" value="${e.template || ''}"></div>
    <div class="form-group"><label class="form-label">Tags (comma-separated)</label><input class="form-input" id="ec-tags" value="${parseJSON(e.tags).join(', ')}"></div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="ec-notes">${e.notes || ''}</textarea></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-ec-btn">Save</button>`);

  $('#save-ec-btn').onclick = async () => {
    const list = $('#ec-list').value;
    const listObj = (window._contactLists || []).find(l => l.name === list);
    const obj = {
      name: $('#ec-name').value,
      channel: $('#ec-channel').value,
      campaign_type: $('#ec-type').value,
      subject: $('#ec-subject').value,
      preview_text: $('#ec-preview').value,
      body_html: $('#ec-body').value,
      status: $('#ec-status').value,
      recipient_list: list,
      recipient_count: listObj?.subscriber_count || null,
      send_date: $('#ec-date').value || null,
      send_time: $('#ec-time').value || null,
      template: $('#ec-template').value,
      tags: $('#ec-tags').value.split(',').map(t => t.trim()).filter(Boolean),
      notes: $('#ec-notes').value,
    };
    if (id) {
      obj.updated_at = new Date().toISOString();
      await sb.from('email_campaigns').update(obj).eq('id', id);
      await logActivity('update_email_campaign', `Updated: ${obj.name}`);
    } else {
      obj.created_by = currentUser.id;
      await sb.from('email_campaigns').insert(obj);
      await logActivity('create_email_campaign', `Created: ${obj.name}`);
    }
    closeModal();
    toast(id ? 'Campaign updated' : 'Campaign created', 'success');
    navigate('email-sms');
  };
};

window.deleteEmailCampaign = function(id) {
  openConfirm('Delete Campaign', 'Are you sure?', async () => {
    await sb.from('email_campaigns').delete().eq('id', id);
    toast('Deleted', 'success');
    navigate('email-sms');
  });
};

// ============================================
// PAGE: Reviews
// ============================================
async function renderReviews(container) {
  await getEmployees();
  const { data: reviews } = await sb.from('reviews').select('*').order('created_at', { ascending: false });
  const items = reviews || [];
  let platformFilter = '';
  let ratingFilter = '';
  let respondedFilter = '';
  let selected = new Set();

  function filtered() {
    return items.filter(r => {
      if (platformFilter && r.platform !== platformFilter) return false;
      if (ratingFilter && r.rating !== parseInt(ratingFilter)) return false;
      const isResponded = r.status === 'responded' || r.is_responded;
      if (respondedFilter === 'yes' && !isResponded) return false;
      if (respondedFilter === 'no' && isResponded) return false;
      return true;
    });
  }

  function render() {
    const f = filtered();
    container.innerHTML = `
      <h1 class="page-title">Reviews</h1>
      <p class="page-subtitle">Monitor and respond to customer reviews</p>
      <div class="table-toolbar">
        <select class="form-select" style="width:130px" id="rev-platform-filter">
          <option value="">All Platforms</option>
          ${['google','yelp','facebook','tripadvisor'].map(p => `<option value="${p}" ${platformFilter === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
        <select class="form-select" style="width:110px" id="rev-rating-filter">
          <option value="">All Ratings</option>
          ${[5,4,3,2,1].map(r => `<option value="${r}" ${ratingFilter == r ? 'selected' : ''}>${r} Star${r>1?'s':''}</option>`).join('')}
        </select>
        <select class="form-select" style="width:130px" id="rev-responded-filter">
          <option value="">All Status</option>
          <option value="yes" ${respondedFilter === 'yes' ? 'selected' : ''}>Responded</option>
          <option value="no" ${respondedFilter === 'no' ? 'selected' : ''}>Not Responded</option>
        </select>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" id="rev-export"><i data-lucide="download"></i> Export</button>
          <button class="btn btn-secondary btn-sm" id="rev-bulk-respond" style="display:none"><i data-lucide="check-circle"></i> Bulk Respond</button>
        </div>
      </div>
      <div class="review-grid" id="reviews-grid">
        ${f.map(r => {
          const isResponded = r.status === 'responded' || r.is_responded;
          const responseText = r.response_text || r.response || '';
          return `
          <div class="review-card" data-id="${r.id}">
            <div class="review-card-header">
              <div>
                <span class="review-platform" style="color:var(--accent)">${r.platform}</span>
                <span style="margin-left:8px">${starsHTML(r.rating)}</span>
              </div>
              <input type="checkbox" class="rev-check" value="${r.id}">
            </div>
            <div class="review-author">${r.reviewer_name || r.author || 'Anonymous'}</div>
            <div class="review-content">${r.review_text || r.content || ''}</div>
            <div class="review-restaurant">${r.restaurant_name || r.restaurant || ''}</div>
            ${isResponded && responseText ? `
              <div class="review-response">
                <div class="review-response-label">Response</div>
                ${responseText}
              </div>
            ` : `
              <button class="btn btn-sm btn-primary mt-2" onclick="respondToReview('${r.id}')">Respond</button>
            `}
          </div>`;
        }).join('')}
        ${!f.length ? '<div class="empty-state"><p>No reviews match your filters.</p></div>' : ''}
      </div>
    `;
    lucide.createIcons({ nameAttr: 'data-lucide' });

    $('#rev-platform-filter').onchange = (e) => { platformFilter = e.target.value; render(); };
    $('#rev-rating-filter').onchange = (e) => { ratingFilter = e.target.value; render(); };
    $('#rev-responded-filter').onchange = (e) => { respondedFilter = e.target.value; render(); };
    $('#rev-export').onclick = () => csvExport(f, 'reviews');

    // Bulk
    $$('.rev-check').forEach(cb => {
      cb.onchange = () => {
        if (cb.checked) selected.add(cb.value); else selected.delete(cb.value);
        $('#rev-bulk-respond').style.display = selected.size > 0 ? '' : 'none';
      };
    });
    $('#rev-bulk-respond').onclick = async () => {
      for (const id of selected) {
        await sb.from('reviews').update({ status: 'responded', response_by: currentUser.id, response_date: new Date().toISOString().slice(0, 10) }).eq('id', id);
      }
      toast(`Marked ${selected.size} reviews as responded`, 'success');
      selected.clear();
      navigate('reviews');
    };
  }
  render();
}

window.respondToReview = function(id) {
  openModal('Respond to Review', `
    <div class="form-group"><label class="form-label">Your Response</label>
    <textarea class="form-textarea" id="review-response" rows="4" placeholder="Write your response..."></textarea></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-response-btn">Submit Response</button>`);

  $('#save-response-btn').onclick = async () => {
    const response = $('#review-response').value;
    if (!response.trim()) return toast('Please write a response', 'error');
    await sb.from('reviews').update({
      response_text: response,
      status: 'responded',
      response_by: currentUser.id,
      response_date: new Date().toISOString().slice(0, 10),
    }).eq('id', id);
    await logActivity('respond_review', 'Responded to a review');
    closeModal();
    toast('Response submitted', 'success');
    navigate('reviews');
  };
};

// ============================================
// PAGE: Reports
// ============================================
async function renderReports(container) {
  // Destroy old charts
  Object.values(chartInstances).forEach(c => c.destroy());
  chartInstances = {};

  const [postsRes, socialRes, emailsRes, reviewsRes, campaignsRes, influencersRes, activityRes] = await Promise.all([
    sb.from('content_posts').select('*'),
    sb.from('social_accounts').select('*'),
    sb.from('email_campaigns').select('*'),
    sb.from('reviews').select('*'),
    sb.from('campaigns').select('*'),
    sb.from('influencers').select('*'),
    sb.from('activity_log').select('*'),
  ]);
  await getEmployees();
  const posts = postsRes.data || [];
  const social = socialRes.data || [];
  const emails = emailsRes.data || [];
  const reviews = reviewsRes.data || [];
  const campaigns = campaignsRes.data || [];
  const influencers = influencersRes.data || [];
  const activity = activityRes.data || [];

  const totalFollowers = social.reduce((s, a) => s + (a.followers || 0), 0);
  const publishedPosts = posts.filter(p => p.status === 'published').length;
  const sentEmails = emails.filter(e => e.status === 'sent');
  const openRate = sentEmails.length ? Math.round(sentEmails.reduce((s, e) => s + ((e.open_count || 0) / Math.max(e.sent_count || 1, 1)) * 100, 0) / sentEmails.length) : 0;
  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1) : '—';

  container.innerHTML = `
    <h1 class="page-title">Reports & Analytics</h1>
    <p class="page-subtitle">Marketing performance overview</p>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Total Followers</div><div class="kpi-value">${totalFollowers.toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Posts Published</div><div class="kpi-value">${publishedPosts}</div></div>
      <div class="kpi-card"><div class="kpi-label">Email Open Rate</div><div class="kpi-value">${openRate}%</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg Review Rating</div><div class="kpi-value">${avgRating}</div></div>
    </div>
    <div class="chart-grid">
      <div class="chart-card"><h4>Content by Platform</h4><canvas id="chart-platforms" height="250"></canvas></div>
      <div class="chart-card"><h4>Influencer Pipeline</h4><canvas id="chart-pipeline" height="250"></canvas></div>
    </div>
    <div class="chart-card">
      <h4>Email & SMS Performance</h4>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Campaign</th><th>Channel</th><th>Status</th><th>Sent</th><th>Opens</th><th>Clicks</th><th>Open Rate</th></tr></thead>
          <tbody>${emails.map(e => `<tr>
            <td>${e.name}</td>
            <td>${badgeHTML(e.channel || 'email', e.channel || 'email')}</td>
            <td>${badgeHTML(e.status)}</td>
            <td>${e.sent_count || 0}</td>
            <td>${e.open_count || 0}</td>
            <td>${e.click_count || 0}</td>
            <td>${e.sent_count ? Math.round((e.open_count || 0) / e.sent_count * 100) : 0}%</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>
    <div class="chart-card">
      <h4>Campaign ROI Summary</h4>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Campaign</th><th>Status</th><th>Budget</th><th>Spend</th><th>Utilization</th><th>KPI Target</th><th>KPI Actual</th></tr></thead>
          <tbody>${campaigns.map(c => {
            const pct = c.budget > 0 ? Math.round((c.spend / c.budget) * 100) : 0;
            return `<tr>
              <td>${c.name}</td>
              <td>${badgeHTML(c.status)}</td>
              <td>$${(c.budget || 0).toLocaleString()}</td>
              <td>$${(c.spend || 0).toLocaleString()}</td>
              <td><div class="progress-bar" style="width:80px;display:inline-block"><div class="progress-fill" style="width:${pct}%;background:var(--accent)"></div></div> ${pct}%</td>
              <td>${c.kpi_target || '—'}</td>
              <td>${c.kpi_actual || '—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </div>
    <div class="chart-grid">
      <div class="chart-card">
        <h4>Review Analytics</h4>
        <div style="display:flex;gap:24px;flex-wrap:wrap">
          <div><div class="kpi-label">Avg Rating</div><div style="font-size:28px;font-weight:700">${avgRating} ${starsHTML(parseFloat(avgRating) || 0)}</div></div>
          <div><div class="kpi-label">Response Rate</div><div style="font-size:28px;font-weight:700">${reviews.length ? Math.round(reviews.filter(r => r.is_responded).length / reviews.length * 100) : 0}%</div></div>
          <div><div class="kpi-label">Total Reviews</div><div style="font-size:28px;font-weight:700">${reviews.length}</div></div>
        </div>
      </div>
      <div class="chart-card">
        <h4>Team Activity Summary</h4>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Team Member</th><th>Actions</th></tr></thead>
            <tbody>${Object.values(employeeCache).map(e => {
              const count = activity.filter(a => a.employee_id === e.id).length;
              return `<tr><td>${e.name}</td><td>${count}</td></tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Charts
  const chartOpts = {
    responsive: true,
    plugins: { legend: { labels: { color: '#999' } } },
    scales: {
      x: { ticks: { color: '#999' }, grid: { color: '#222' } },
      y: { ticks: { color: '#999' }, grid: { color: '#222' } },
    }
  };

  // Content by platform
  const platformCounts = {};
  posts.forEach(p => {
    parseJSON(p.platforms).forEach(pl => {
      platformCounts[pl] = (platformCounts[pl] || 0) + 1;
    });
  });
  const platLabels = Object.keys(platformCounts);
  const platData = Object.values(platformCounts);
  const ctx1 = document.getElementById('chart-platforms');
  if (ctx1) {
    chartInstances.platforms = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: platLabels,
        datasets: [{ label: 'Posts', data: platData, backgroundColor: '#4f98a3' }]
      },
      options: chartOpts,
    });
  }

  // Influencer pipeline
  const stageCounts = {};
  ['prospect', 'outreach', 'negotiation', 'contracted', 'completed'].forEach(s => stageCounts[s] = 0);
  influencers.forEach(i => { if (stageCounts[i.pipeline_stage] !== undefined) stageCounts[i.pipeline_stage]++; });
  const ctx2 = document.getElementById('chart-pipeline');
  if (ctx2) {
    chartInstances.pipeline = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: Object.keys(stageCounts),
        datasets: [{ data: Object.values(stageCounts), backgroundColor: ['#666', '#3b82f6', '#f59e0b', '#22c55e', '#8b5cf6'] }]
      },
      options: { responsive: true, plugins: { legend: { labels: { color: '#999' } } } },
    });
  }

  lucide.createIcons({ nameAttr: 'data-lucide' });
}

// ============================================
// PAGE: Social Accounts
// ============================================
async function renderSocialAccounts(container) {
  await getEmployees();
  const { data: accounts } = await sb.from('social_accounts').select('*').order('followers', { ascending: false });
  const items = accounts || [];
  const { data: posts } = await sb.from('content_posts').select('*').eq('status', 'scheduled');
  const scheduled = posts || [];

  const totalFollowers = items.reduce((s, a) => s + (a.followers || 0), 0);
  const connected = items.filter(a => a.status === 'active' || a.status === 'connected').length;
  const totalPosts = items.reduce((s, a) => s + (a.posts_count || 0), 0);
  const avgEng = items.length ? (items.reduce((s, a) => s + (parseFloat(a.engagement_rate) || 0), 0) / items.length).toFixed(1) : '0';
  const topPlatform = items.length ? items.sort((a, b) => (b.followers || 0) - (a.followers || 0))[0].platform : '—';

  const platColors = { Instagram: '#E1306C', Facebook: '#1877F2', Twitter: '#1DA1F2', TikTok: '#010101', LinkedIn: '#0A66C2', YouTube: '#FF0000', Pinterest: '#E60023' };

  container.innerHTML = `
    <h1 class="page-title">Social Accounts</h1>
    <p class="page-subtitle">Manage connected social media accounts</p>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Total Followers</div><div class="kpi-value">${totalFollowers.toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Connected</div><div class="kpi-value">${connected}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Posts</div><div class="kpi-value">${totalPosts.toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg Engagement</div><div class="kpi-value">${avgEng}%</div></div>
      <div class="kpi-card"><div class="kpi-label">Top Platform</div><div class="kpi-value" style="font-size:18px">${topPlatform}</div></div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
      <button class="btn btn-primary btn-sm" id="new-account-btn"><i data-lucide="plus"></i> Add Account</button>
    </div>
    <div class="account-grid">
      ${items.map(a => `
        <div class="account-card">
          <div class="account-card-header">
            <div class="account-platform-icon" style="background:${platColors[a.platform] || '#4f98a3'}20">
              <i data-lucide="${platformIcon(a.platform)}" style="color:${platColors[a.platform] || '#4f98a3'}"></i>
            </div>
            <div style="flex:1">
              <div style="font-weight:600;font-size:14px">${a.platform}</div>
              <div style="font-size:12px;color:var(--text-secondary)">${a.handle || ''}</div>
            </div>
            <div style="display:flex;gap:4px">
              ${badgeHTML(a.status)}
              <button class="btn-icon btn-ghost" onclick="editSocialAccount('${a.id}')"><i data-lucide="edit-2"></i></button>
              <button class="btn-icon btn-ghost" onclick="deleteSocialAccount('${a.id}')"><i data-lucide="trash-2"></i></button>
            </div>
          </div>
          <div class="account-stats">
            <div><div class="account-stat-value">${(a.followers || 0).toLocaleString()}</div><div class="account-stat-label">Followers</div></div>
            <div><div class="account-stat-value">${(a.posts_count || 0).toLocaleString()}</div><div class="account-stat-label">Posts</div></div>
            <div><div class="account-stat-value">${a.engagement_rate || '0%'}</div><div class="account-stat-label">Engagement</div></div>
          </div>
          ${a.bio ? `<div style="font-size:12px;color:var(--text-muted);margin-top:8px">${a.bio}</div>` : ''}
          <div style="font-size:11px;color:var(--text-muted);margin-top:8px">Manager: ${employeeName(a.manager_id)}</div>
        </div>
      `).join('')}
    </div>
    ${scheduled.length ? `
    <h3 class="section-title mt-4">This Week's Posting Schedule</h3>
    <div class="table-wrapper">
      <table>
        <thead><tr><th>Title</th><th>Platforms</th><th>Date</th><th>Time</th></tr></thead>
        <tbody>${scheduled.map(p => `<tr>
          <td>${p.title || ''}</td>
          <td>${parseJSON(p.platforms).join(', ')}</td>
          <td>${formatDate(p.scheduled_date)}</td>
          <td>${p.scheduled_time || '—'}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : ''}
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });
  $('#new-account-btn').onclick = () => editSocialAccount(null);
}

window.editSocialAccount = async function(id) {
  let a = {};
  if (id) {
    const { data } = await sb.from('social_accounts').select('*').eq('id', id).single();
    a = data || {};
  }
  openModal(id ? 'Edit Social Account' : 'Add Social Account', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Platform</label>
        <select class="form-select" id="sa-platform">
          ${['Instagram','Facebook','Twitter','TikTok','LinkedIn','YouTube','Pinterest'].map(p => `<option ${a.platform === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Handle</label><input class="form-input" id="sa-handle" value="${a.handle || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Followers</label><input class="form-input" type="number" id="sa-followers" value="${a.followers || ''}"></div>
      <div class="form-group"><label class="form-label">Following</label><input class="form-input" type="number" id="sa-following" value="${a.following || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Posts Count</label><input class="form-input" type="number" id="sa-posts" value="${a.posts_count || ''}"></div>
      <div class="form-group"><label class="form-label">Engagement Rate (%)</label><input class="form-input" type="number" step="0.1" id="sa-engagement" value="${a.engagement_rate || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Profile URL</label><input class="form-input" id="sa-url" value="${a.profile_url || ''}"></div>
      <div class="form-group"><label class="form-label">Status</label>
        <select class="form-select" id="sa-status">
          <option value="active" ${a.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${a.status === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label class="form-label">Bio</label><textarea class="form-textarea" id="sa-bio">${a.bio || ''}</textarea></div>
    <div class="form-group"><label class="form-label">Manager</label>
      <select class="form-select" id="sa-manager"><option value="">None</option>${employeeOptions(a.manager_id)}</select>
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-sa-btn">Save</button>`);

  $('#save-sa-btn').onclick = async () => {
    const obj = {
      platform: $('#sa-platform').value,
      handle: $('#sa-handle').value,
      followers: parseInt($('#sa-followers').value) || 0,
      following: parseInt($('#sa-following').value) || 0,
      posts_count: parseInt($('#sa-posts').value) || 0,
      engagement_rate: parseFloat($('#sa-engagement').value) || 0,
      profile_url: $('#sa-url').value,
      status: $('#sa-status').value,
      bio: $('#sa-bio').value,
      manager_id: $('#sa-manager').value || null,
    };
    if (id) {
      obj.updated_at = new Date().toISOString();
      await sb.from('social_accounts').update(obj).eq('id', id);
    } else {
      await sb.from('social_accounts').insert(obj);
    }
    closeModal();
    toast(id ? 'Account updated' : 'Account added', 'success');
    navigate('social-accounts');
  };
};

window.deleteSocialAccount = function(id) {
  openConfirm('Delete Account', 'Are you sure?', async () => {
    await sb.from('social_accounts').delete().eq('id', id);
    toast('Deleted', 'success');
    navigate('social-accounts');
  });
};

// ============================================
// PAGE: Team Management
// ============================================
async function renderTeam(container) {
  const { data: employees } = await sb.from('employees').select('*').order('name');
  const items = employees || [];
  const isOwner = hasRole('Owner');

  container.innerHTML = `
    <h1 class="page-title">Team Management</h1>
    <p class="page-subtitle">Manage team members and roles</p>
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
      ${hasRole('Owner', 'Marketing Director') ? `<button class="btn btn-primary btn-sm" id="new-emp-btn"><i data-lucide="plus"></i> Add Team Member</button>` : ''}
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Name</th>
          <th>Role</th>
          <th>Title</th>
          ${isOwner ? '<th>Login Code</th>' : ''}
          <th>Email</th>
          <th>Phone</th>
          <th>Status</th>
          <th>Actions</th>
        </tr></thead>
        <tbody>${items.map(e => `<tr>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div class="user-avatar" style="background:${e.avatar_color || '#4f98a3'};width:28px;height:28px;font-size:11px">${getInitials(e.name)}</div>
              ${e.name}
            </div>
          </td>
          <td>${e.role}</td>
          <td>${e.title || '—'}</td>
          ${isOwner ? `<td><code style="background:var(--bg-hover);padding:2px 8px;border-radius:4px">${e.login_code}</code></td>` : ''}
          <td>${e.email || '—'}</td>
          <td>${e.phone || '—'}</td>
          <td>${e.is_active ? badgeHTML('active') : badgeHTML('inactive', 'paused')}</td>
          <td class="table-actions">
            ${hasRole('Owner', 'Marketing Director') ? `
              <button class="btn-icon btn-ghost" onclick="editEmployee('${e.id}')"><i data-lucide="edit-2"></i></button>
              <button class="btn-icon btn-ghost" onclick="deleteEmployee('${e.id}', '${e.name}')"><i data-lucide="trash-2"></i></button>
            ` : ''}
          </td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });
  const btn = $('#new-emp-btn');
  if (btn) btn.onclick = () => editEmployee(null);
}

window.editEmployee = async function(id) {
  let e = {};
  if (id) {
    const { data } = await sb.from('employees').select('*').eq('id', id).single();
    e = data || {};
  }
  const roles = ['Owner', 'Marketing Director', 'Content Creator', 'Social Media Coordinator'];
  const colors = ['#4f98a3', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#3b82f6', '#ec4899'];
  openModal(id ? 'Edit Team Member' : 'Add Team Member', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="emp-name" value="${e.name || ''}"></div>
      <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="emp-title" value="${e.title || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Role</label>
        <select class="form-select" id="emp-role">${roles.map(r => `<option ${e.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label class="form-label">Login Code</label><input class="form-input" id="emp-code" value="${e.login_code || ''}" maxlength="4"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="emp-email" value="${e.email || ''}"></div>
      <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="emp-phone" value="${e.phone || ''}"></div>
    </div>
    <div class="form-group"><label class="form-label">Avatar Color</label>
      <div class="chip-select" id="emp-colors">${colors.map(c => `<div class="chip ${e.avatar_color === c ? 'selected' : ''}" data-value="${c}" style="background:${c}20;border-color:${c};color:${c}">●</div>`).join('')}</div>
    </div>
    <div class="form-check">
      <input type="checkbox" id="emp-active" ${e.is_active !== false ? 'checked' : ''}>
      <label for="emp-active">Active</label>
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-emp-btn">Save</button>`);

  $$('#emp-colors .chip').forEach(c => c.onclick = () => {
    $$('#emp-colors .chip').forEach(x => x.classList.remove('selected'));
    c.classList.add('selected');
  });

  $('#save-emp-btn').onclick = async () => {
    const obj = {
      name: $('#emp-name').value,
      title: $('#emp-title').value,
      role: $('#emp-role').value,
      login_code: $('#emp-code').value,
      email: $('#emp-email').value,
      phone: $('#emp-phone').value,
      avatar_color: $$('#emp-colors .chip.selected')[0]?.dataset.value || '#4f98a3',
      is_active: $('#emp-active').checked,
    };
    if (id) {
      obj.updated_at = new Date().toISOString();
      await sb.from('employees').update(obj).eq('id', id);
      await logActivity('update_employee', `Updated: ${obj.name}`);
    } else {
      await sb.from('employees').insert(obj);
      await logActivity('create_employee', `Added: ${obj.name}`);
    }
    // Refresh employee cache
    employeeCache = {};
    await getEmployees();
    closeModal();
    toast(id ? 'Member updated' : 'Member added', 'success');
    navigate('team');
  };
};

window.deleteEmployee = function(id, name) {
  openModal('Delete Team Member', `
    <p>To delete <strong>${name}</strong>, enter the manager password:</p>
    <div class="form-group mt-2"><input class="form-input" type="password" id="delete-pw" placeholder="Manager password"></div>
    <div id="delete-pw-error" style="color:var(--danger);font-size:12px"></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-danger" id="confirm-delete-emp">Delete</button>`);

  $('#confirm-delete-emp').onclick = async () => {
    const pw = $('#delete-pw').value;
    // Check manager password from settings
    const { data: settings } = await sb.from('settings').select('value').eq('key', 'manager_password').single();
    const correctPw = settings?.value || 'ivea';
    if (pw !== correctPw) {
      $('#delete-pw-error').textContent = 'Incorrect password';
      return;
    }
    await sb.from('employees').delete().eq('id', id);
    await logActivity('delete_employee', `Deleted: ${name}`);
    employeeCache = {};
    await getEmployees();
    closeModal();
    toast('Team member deleted', 'success');
    navigate('team');
  };
};

// ============================================
// PAGE: Audit Log
// ============================================
async function renderAuditLog(container) {
  await getEmployees();
  const { data: logs } = await sb.from('activity_log').select('*').order('created_at', { ascending: false }).limit(200);
  const items = logs || [];

  container.innerHTML = `
    <h1 class="page-title">Audit Log</h1>
    <p class="page-subtitle">System activity history</p>
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Filter logs..." id="audit-filter"></div>
      <select class="form-select" style="width:150px" id="audit-user-filter">
        <option value="">All Users</option>
        ${Object.values(employeeCache).map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
      </select>
      <div style="margin-left:auto">
        <button class="btn btn-secondary btn-sm" id="audit-export"><i data-lucide="download"></i> Export</button>
      </div>
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th data-key="created_at">Timestamp</th>
          <th data-key="employee_id">User</th>
          <th data-key="action">Action</th>
          <th>Details</th>
        </tr></thead>
        <tbody id="audit-tbody">${items.map(l => `<tr>
          <td>${formatDateTime(l.created_at)}</td>
          <td>${employeeName(l.employee_id)}</td>
          <td><code style="background:var(--bg-hover);padding:1px 6px;border-radius:3px;font-size:12px">${l.action}</code></td>
          <td style="color:var(--text-secondary);max-width:300px" class="truncate">${l.details || ''}</td>
        </tr>`).join('')}
        ${!items.length ? '<tr><td colspan="4" class="empty-state"><p>No activity logged yet.</p></td></tr>' : ''}
        </tbody>
      </table>
    </div>
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });

  function applyFilter() {
    const q = ($('#audit-filter')?.value || '').toLowerCase();
    const userId = $('#audit-user-filter')?.value;
    $$('#audit-tbody tr').forEach(tr => {
      const textMatch = !q || tr.textContent.toLowerCase().includes(q);
      const userMatch = !userId || tr.children[1]?.textContent === employeeName(userId);
      tr.style.display = textMatch && userMatch ? '' : 'none';
    });
  }
  $('#audit-filter')?.addEventListener('input', applyFilter);
  $('#audit-user-filter')?.addEventListener('change', applyFilter);
  $('#audit-export').onclick = () => csvExport(items.map(l => ({
    timestamp: formatDateTime(l.created_at),
    user: employeeName(l.employee_id),
    action: l.action,
    details: l.details,
  })), 'audit_log');
}

// ============================================
// PAGE: Settings (Owner Only, 9 Tabs)
// ============================================
async function renderSettings(container) {
  if (!hasRole('Owner')) {
    container.innerHTML = '<div class="empty-state"><h4>Access Denied</h4><p>Only Owners can access Settings.</p></div>';
    return;
  }
  const { data: settings } = await sb.from('settings').select('*');
  const allSettings = settings || [];

  // Group settings by key prefix
  const groupMap = {
    general: { label: 'General', icon: 'settings', keys: ['timezone', 'date_format', 'business_hours_start', 'business_hours_end', 'default_post_status'] },
    brand: { label: 'Brand Identity', icon: 'palette', keys: ['company_name', 'company_tagline', 'primary_color', 'accent_color', 'logo_text', 'website_url'] },
    social: { label: 'Social Media', icon: 'share-2', keys: ['instagram_handle', 'tiktok_handle', 'facebook_handle', 'twitter_handle', 'linkedin_handle'] },
    email: { label: 'Email', icon: 'mail', keys: ['email_sender_name', 'email_reply_to', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass'] },
    sms: { label: 'SMS', icon: 'smartphone', keys: ['twilio_sid', 'twilio_token', 'twilio_phone'] },
    api: { label: 'API Keys', icon: 'key', keys: ['openai_key'] },
    notifications: { label: 'Notifications', icon: 'bell', keys: ['notification_new_review', 'notification_content_approval', 'notification_campaign_deadline'] },
    security: { label: 'Security', icon: 'shield', keys: ['manager_password'] },
    dropdowns: { label: 'Dropdowns', icon: 'list', keys: ['employee_roles', 'post_platforms', 'influencer_categories', 'campaign_types', 'asset_categories', 'review_platforms', 'media_outlet_types', 'influencer_stages'] },
  };
  const groups = Object.keys(groupMap);
  let activeGroup = 'general';

  function render() {
    const gm = groupMap[activeGroup];
    const groupSettings = allSettings.filter(s => gm.keys.includes(s.key));
    container.innerHTML = `
      <h1 class="page-title">Settings</h1>
      <p class="page-subtitle">Configure application preferences</p>
      <div class="settings-layout">
        <div class="settings-sidebar">
          ${groups.map(g => `<button class="settings-tab ${activeGroup === g ? 'active' : ''}" data-group="${g}"><i data-lucide="${groupMap[g].icon}" style="width:14px;height:14px;margin-right:6px"></i>${groupMap[g].label}</button>`).join('')}
        </div>
        <div class="settings-content">
          <div class="card">
            <h3 style="font-size:16px;font-weight:600;margin-bottom:16px">${gm.label}</h3>
            <div id="settings-fields">
              ${groupSettings.map(s => renderSettingField(s)).join('')}
              ${!groupSettings.length ? '<p style="color:var(--text-muted)">No settings in this group.</p>' : ''}
            </div>
            ${groupSettings.length ? '<button class="btn btn-primary mt-4" id="save-settings-btn">Save Settings</button>' : ''}
          </div>
        </div>
      </div>
    `;
    lucide.createIcons({ nameAttr: 'data-lucide' });

    $$('.settings-tab').forEach(t => t.onclick = () => { activeGroup = t.dataset.group; render(); });

    const saveBtn = $('#save-settings-btn');
    if (saveBtn) saveBtn.onclick = async () => {
      for (const s of groupSettings) {
        const input = $(`[data-setting-key="${s.key}"]`);
        if (!input) continue;
        let value;
        if (s.key.startsWith('notification_')) {
          value = input.classList.contains('active') ? 'true' : 'false';
        } else {
          value = input.value;
        }
        await sb.from('settings').update({ value, updated_at: new Date().toISOString() }).eq('key', s.key);
      }
      toast('Settings saved', 'success');
      await logActivity('update_settings', `Updated ${activeGroup} settings`);
    };

    // Toggle handlers
    $$('.toggle[data-setting-key]').forEach(t => {
      t.onclick = () => t.classList.toggle('active');
    });
  }

  function renderSettingField(s) {
    const label = s.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    // Determine type based on key
    if (s.key.startsWith('notification_')) {
      return `<div class="form-group"><label class="form-label">${label}</label>
        <div class="toggle-wrapper"><div class="toggle ${s.value === 'true' ? 'active' : ''}" data-setting-key="${s.key}"></div></div></div>`;
    }
    if (s.key.includes('password') || s.key.includes('pass') || s.key.includes('token') || s.key.includes('key') || s.key.includes('sid')) {
      return `<div class="form-group"><label class="form-label">${label}</label>
        <input class="form-input" type="password" data-setting-key="${s.key}" value="${s.value || ''}"></div>`;
    }
    if (s.key.includes('color')) {
      return `<div class="form-group"><label class="form-label">${label}</label>
        <div style="display:flex;gap:8px;align-items:center"><input class="form-input" style="width:200px" data-setting-key="${s.key}" value="${s.value || ''}"><div style="width:32px;height:32px;border-radius:4px;background:${s.value};"></div></div></div>`;
    }
    if (s.key === 'employee_roles' || s.key === 'post_platforms' || s.key === 'influencer_categories' || s.key === 'campaign_types' || s.key === 'asset_categories' || s.key === 'review_platforms' || s.key === 'media_outlet_types' || s.key === 'influencer_stages') {
      return `<div class="form-group"><label class="form-label">${label}</label>
        <textarea class="form-textarea" data-setting-key="${s.key}" rows="3">${s.value || ''}</textarea>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">JSON array of values</div></div>`;
    }
    return `<div class="form-group"><label class="form-label">${label}</label>
      <input class="form-input" data-setting-key="${s.key}" value="${s.value || ''}"></div>`;
  }
  render();
}

// ============================================
// GLOBAL: Search
// ============================================
function initGlobalSearch() {
  const input = $('#search-input');
  const results = $('#search-results');
  let debounce;

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => performSearch(input.value), 300);
  });

  input.addEventListener('focus', () => { if (input.value.length > 1) results.classList.add('open'); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#global-search')) results.classList.remove('open'); });

  // "/" shortcut
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      input.focus();
    }
  });
}

async function performSearch(q) {
  const results = $('#search-results');
  if (q.length < 2) { results.classList.remove('open'); return; }
  results.classList.add('open');
  results.innerHTML = '<div style="padding:12px;color:var(--text-muted)">Searching...</div>';

  const term = `%${q}%`;
  const [postsRes, infRes, campRes, emailRes, mediaRes, empRes] = await Promise.all([
    sb.from('content_posts').select('id,title').ilike('title', term).limit(5),
    sb.from('influencers').select('id,name,handle').or(`name.ilike.${term},handle.ilike.${term}`).limit(5),
    sb.from('campaigns').select('id,name').ilike('name', term).limit(5),
    sb.from('email_campaigns').select('id,name').ilike('name', term).limit(5),
    sb.from('media_contacts').select('id,name,outlet').ilike('name', term).limit(5),
    sb.from('employees').select('id,name').ilike('name', term).limit(5),
  ]);

  let html = '';
  const groups = [
    { label: 'Posts', data: postsRes.data, page: 'content', nameKey: 'title' },
    { label: 'Influencers', data: infRes.data, page: 'influencers', nameKey: 'name' },
    { label: 'Campaigns', data: campRes.data, page: 'campaigns', nameKey: 'name' },
    { label: 'Email/SMS', data: emailRes.data, page: 'email-sms', nameKey: 'name' },
    { label: 'Media Contacts', data: mediaRes.data, page: 'media', nameKey: 'name' },
    { label: 'Team', data: empRes.data, page: 'team', nameKey: 'name' },
  ];

  let found = false;
  groups.forEach(g => {
    if (g.data?.length) {
      found = true;
      html += `<div class="search-group-title">${g.label}</div>`;
      g.data.forEach(item => {
        html += `<div class="search-result-item" onclick="navigate('${g.page}');document.getElementById('search-results').classList.remove('open')">${item[g.nameKey] || 'Untitled'}</div>`;
      });
    }
  });
  if (!found) html = '<div style="padding:12px;color:var(--text-muted)">No results found</div>';
  results.innerHTML = html;
}

// ============================================
// GLOBAL: Notifications
// ============================================
function initNotifications() {
  const btn = $('#notification-btn');
  const panel = $('#notification-panel');
  btn.onclick = () => panel.classList.toggle('open');
  document.addEventListener('click', (e) => { if (!e.target.closest('#notification-panel') && !e.target.closest('#notification-btn')) panel.classList.remove('open'); });
  $('#mark-all-read').onclick = () => {
    notifications.forEach(n => n.read = true);
    renderNotifications();
  };
  loadNotifications();
}

async function loadNotifications() {
  const { data } = await sb.from('activity_log').select('*').order('created_at', { ascending: false }).limit(20);
  notifications = (data || []).map(a => ({ ...a, read: false }));
  renderNotifications();
}

function renderNotifications() {
  const list = $('#notification-list');
  const badge = $('#notification-badge');
  const unread = notifications.filter(n => !n.read).length;
  badge.textContent = unread || '';
  badge.style.display = unread > 0 ? 'flex' : 'none';
  list.innerHTML = notifications.length ? notifications.map(n => `
    <div class="notification-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
      <div class="notification-icon"><i data-lucide="activity" style="width:14px;height:14px;color:var(--text-muted)"></i></div>
      <div class="notification-text">
        <p><strong>${employeeName(n.employee_id)}</strong>: ${n.action} — ${n.details || ''}</p>
        <div class="notification-time">${timeAgo(n.created_at)}</div>
      </div>
    </div>
  `).join('') : '<div style="padding:20px;text-align:center;color:var(--text-muted)">No notifications</div>';
  lucide.createIcons({ nameAttr: 'data-lucide' });

  $$('.notification-item').forEach(item => {
    item.onclick = () => {
      const n = notifications.find(x => x.id == item.dataset.id);
      if (n) n.read = true;
      renderNotifications();
    };
  });
}

// ============================================
// GLOBAL: AI Assistant
// ============================================
function initAI() {
  const panel = $('#ai-panel');
  const overlay = $('#ai-overlay');
  $('#ai-btn').onclick = () => { panel.classList.add('open'); overlay.classList.add('open'); $('#ai-input').focus(); };
  $('#ai-close-btn').onclick = () => { panel.classList.remove('open'); overlay.classList.remove('open'); };
  overlay.onclick = () => { panel.classList.remove('open'); overlay.classList.remove('open'); };
  $('#ai-send-btn').onclick = sendAIMessage;
  $('#ai-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendAIMessage(); });

  if (!aiMessages.length) {
    aiMessages.push({ role: 'assistant', content: "Hi! I'm your IVEA marketing assistant. Ask me about campaigns, content strategy, reviews, or anything marketing-related." });
    renderAIMessages();
  }
}

function renderAIMessages() {
  const container = $('#ai-messages');
  container.innerHTML = aiMessages.map(m => `<div class="ai-msg ${m.role}">${m.content}</div>`).join('');
  container.scrollTop = container.scrollHeight;
}

async function sendAIMessage() {
  const input = $('#ai-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  aiMessages.push({ role: 'user', content: msg });
  renderAIMessages();

  const systemPrompt = `You are an AI marketing assistant for IVEA Marketing Hub, a restaurant group with 35 brands and 90+ locations in the DMV area. Current user: ${currentUser.name} (${currentUser.role}). Current page: ${currentPage}. Help with marketing strategy, content ideas, campaign planning, review responses, and data insights. Be concise and actionable.`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...aiMessages.filter(m => m.role !== 'assistant' || aiMessages.indexOf(m) > 0).slice(-10).map(m => ({ role: m.role, content: m.content })),
        ],
        max_tokens: 500,
      }),
    });
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
    aiMessages.push({ role: 'assistant', content: reply });
  } catch (err) {
    aiMessages.push({ role: 'assistant', content: 'Sorry, there was an error connecting to the AI service.' });
  }
  renderAIMessages();
}

// ============================================
// Init
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});

// Make navigate global for onclick handlers
window.navigate = navigate;
window.closeModal = closeModal;
