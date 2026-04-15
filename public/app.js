/* ============================================
   Hermes iMedia — Main Application
   ============================================ */

// --- Supabase Init ---
const SUPABASE_URL = 'https://zmdubmumgdyuyjajjxjs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptZHVibXVtZ2R5dXlqYWpqeGpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTIxMjQsImV4cCI6MjA4ODY4ODEyNH0.91FozXtednnxnKMTPJVNeOr1is4-du9dofPu4NuR2QE';
let OPENAI_KEY = ''; // Loaded from Supabase settings at runtime
const MANUS_API_KEY = 'sk-95B0KGqdc-JXTgn-QC4kMbY4lo0CRru78PMnbyoLyoOQlfcfZEXWJU68JRgmGuHW4oTdN1fPtOtbTDyQ9IwPE5aKO-Vj';
const AI_BASE_URL = 'https://api.aimlapi.com';
const AI_MODEL = 'gpt-4o-mini';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Install API middleware proxy — all sb.from() calls now route through /api/data
// except login which uses the original Supabase client directly
installDbProxy();

// --- State ---
let currentUser = null;
let currentPage = 'dashboard';
let aiMessages = [];
let notifications = [];
let chartInstances = {};
let selectedRestaurantId = null;
let restaurantLocationsCache = {};

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

function socialProfileUrl(platform, handle) {
  const h = (handle || '').replace(/^@/, '');
  switch ((platform || '').toLowerCase()) {
    case 'instagram': return `https://instagram.com/${h}`;
    case 'tiktok': return `https://tiktok.com/@${h}`;
    case 'youtube': return `https://youtube.com/@${h}`;
    case 'twitter': case 'x': return `https://x.com/${h}`;
    case 'facebook': return `https://facebook.com/${h}`;
    case 'linkedin': return `https://linkedin.com/in/${h}`;
    default: return `https://instagram.com/${h}`;
  }
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
  await db.insert('activity_log', { employee_id: currentUser.id, action, details });
}

function showLoading(container) {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
}

// --- Missing helpers ---
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const showToast = toast;

function canEdit() {
  return !hasRole('Viewer');
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
  const saved = storage.get('hermes_user');
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
  // Login uses original Supabase client directly (user not authenticated yet)
  const { data, error } = await sb._originalFrom('employees').select('*').eq('login_code', code).eq('is_active', true);
  if (error || !data?.length) {
    $('#login-error').textContent = 'Invalid code. Please try again.';
    $$('.code-input').forEach(i => i.value = '');
    $$('.code-input')[0].focus();
    return;
  }
  currentUser = data[0];
  storage.set('hermes_user', JSON.stringify(currentUser));
  await logActivity('login', `${currentUser.name} signed in`);
  showApp();
}

function logout() {
  logActivity('logout', `${currentUser.name} signed out`);
  currentUser = null;
  storage.remove('hermes_user');
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
    const val = await db.getSetting('openai_api_key');
    if (val) OPENAI_KEY = val;
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
  { section: null, items: [
    { id: 'dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
    { id: 'restaurants', icon: 'store', label: 'Restaurants' },
  ] },
  { section: 'Content', items: [
    { id: 'content', icon: 'file-text', label: 'Content Hub' },
    { id: 'calendar', icon: 'calendar', label: 'Unified Calendar' },
  ]},
  { section: 'Outreach', items: [
    { id: 'influencers', icon: 'users', label: 'Influencers' },
    { id: 'events', icon: 'calendar-check', label: 'Events & Tastings' },
    { id: 'campaigns', icon: 'megaphone', label: 'Campaigns' },
    { id: 'media', icon: 'newspaper', label: 'Local Media' },
    { id: 'email-sms', icon: 'mail', label: 'Email & SMS' },
  ]},
  { section: 'Communications', items: [
    { id: 'inbox', icon: 'inbox', label: 'Inbox' },
    { id: 'text-messages', icon: 'smartphone', label: 'Text Messages' },
    { id: 'reviews', icon: 'message-square', label: 'Reviews' },
  ]},
  { section: 'Marketing', items: [
    { id: 'seo', icon: 'search', label: 'SEO' },
    { id: 'ads', icon: 'target', label: 'Ads Manager' },
    { id: 'competitors', icon: 'eye', label: 'Competitors' },
    { id: 'loyalty', icon: 'crown', label: 'Loyalty & Promos' },
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
  if (page !== 'restaurants') { selectedRestaurantId = null; }
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
    'restaurants': renderRestaurants,
    'content': renderContent,
    'calendar': renderCalendar,
    'influencers': renderInfluencers,
    'campaigns': renderCampaigns,
    'media': renderMedia,
    'email-sms': renderEmailSms,
    'inbox': renderInbox,
    'text-messages': renderTextMessages,
    'reviews': renderReviews,
    'seo': renderSEO,
    'ads': renderAds,
    'competitors': renderCompetitors,
    'loyalty': renderLoyalty,
    'reports': renderReports,
    'social-accounts': renderSocialAccounts,
    'events': renderEvents,
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
  const { data } = await db.select('employees', { order: { column: 'name', ascending: true } });
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
function makeSortable(tableEl, data, renderRow, tbody, { onAfterSort } = {}) {
  const headers = $$('th[data-key]', tableEl);
  let sortKey = null, sortDir = 'asc';
  headers.forEach(th => {
    th.style.cursor = 'pointer';
    th.onclick = () => {
      const key = th.dataset.key;
      if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortKey = key; sortDir = 'asc'; }
      headers.forEach(h => { const si = h.querySelector('.sort-icon'); if (si) si.textContent = ''; });
      let icon = th.querySelector('.sort-icon');
      if (!icon) { icon = el('span', { className: 'sort-icon' }); th.appendChild(icon); }
      icon.textContent = sortDir === 'asc' ? ' ▲' : ' ▼';
      data.sort((a, b) => {
        let va = a[key], vb = b[key];
        if (va == null) va = '';
        if (vb == null) vb = '';
        if (typeof va === 'number' || typeof vb === 'number') return sortDir === 'asc' ? (Number(va) || 0) - (Number(vb) || 0) : (Number(vb) || 0) - (Number(va) || 0);
        return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      });
      tbody.innerHTML = data.map(renderRow).join('');
      lucide.createIcons({ nameAttr: 'data-lucide' });
      if (onAfterSort) onAfterSort();
    };
  });
}

// ============================================
// PAGE: Dashboard
// ============================================
async function renderDashboard(container) {
  await getEmployees();
  const [postsRes, campaignsRes, influencersRes, reviewsRes, restaurantsRes, socialRes, activityRes] = await Promise.all([
    db.select('content_posts'),
    db.select('campaigns'),
    db.select('influencers'),
    db.select('reviews'),
    db.select('restaurants'),
    db.select('social_accounts'),
    db.select('activity_log', { order: { column: 'created_at', ascending: false }, limit: 20 }),
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
// PAGE: Restaurants
// ============================================
// --- Restaurant Locations helpers ---
async function getRestaurantLocations(restaurantId) {
  try {
    const val = await db.getSetting(`locations_${restaurantId}`);
    const locations = val ? JSON.parse(val) : [];
    restaurantLocationsCache[restaurantId] = locations;
    return locations;
  } catch { return []; }
}

async function saveRestaurantLocations(restaurantId, locations) {
  restaurantLocationsCache[restaurantId] = locations;
  await db.setSetting(`locations_${restaurantId}`, JSON.stringify(locations));
}

async function renderRestaurants(container) {
  if (selectedRestaurantId) {
    return renderRestaurantDetail(container, selectedRestaurantId);
  }

  const { data: restaurants } = await db.select('restaurants', { order: { column: 'name', ascending: true } });
  const items = restaurants || [];
  const totalLocations = items.reduce((s, r) => s + (r.location_count || 0), 0);
  const activeCount = items.filter(r => r.status === 'active').length;
  const inactiveCount = items.filter(r => r.status !== 'active').length;

  function brandCardHTML(r) {
    const initials = (r.name || '').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    return `<div class="brand-card" data-id="${r.id}" onclick="openBrandDetail('${r.id}')">
      <div class="brand-card-logo">${r.brand_logo_url ? `<img src="${r.brand_logo_url}" alt="">` : `<span>${initials}</span>`}</div>
      <div class="brand-card-info">
        <div class="brand-card-name">${r.name}</div>
        <div class="brand-card-meta">
          <span class="badge badge-accent">${r.location_count || 0} location${(r.location_count || 0) !== 1 ? 's' : ''}</span>
          ${badgeHTML(r.status || 'active')}
        </div>
      </div>
      <i data-lucide="chevron-right" style="color:var(--text-muted)"></i>
    </div>`;
  }

  container.innerHTML = `
    <h1 class="page-title">Restaurants</h1>
    <p class="page-subtitle">Manage all restaurant brands and locations</p>
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:24px">
      <div class="kpi-card"><div class="kpi-label">Total Brands</div><div class="kpi-value">${items.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Locations</div><div class="kpi-value" style="color:var(--accent)">${totalLocations}</div></div>
      <div class="kpi-card"><div class="kpi-label">Active</div><div class="kpi-value" style="color:var(--success)">${activeCount}</div></div>
      <div class="kpi-card"><div class="kpi-label">Inactive</div><div class="kpi-value" style="color:var(--text-muted)">${inactiveCount}</div></div>
    </div>
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Search brands..." id="rest-filter"></div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" id="rest-export"><i data-lucide="download"></i> Export</button>
        ${canEdit() ? `<button class="btn btn-primary btn-sm" id="new-rest-btn"><i data-lucide="plus"></i> Add Restaurant</button>` : ''}
      </div>
    </div>
    <div class="brand-grid" id="brand-grid">
      ${items.map(brandCardHTML).join('')}
    </div>
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });

  // Search
  $('#rest-filter')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    $$('.brand-card').forEach(card => {
      card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });

  // Export
  $('#rest-export').onclick = () => csvExport(items, 'restaurants');
  // New
  const newBtn = $('#new-rest-btn');
  if (newBtn) newBtn.onclick = () => editRestaurant(null);
}

async function renderRestaurantDetail(container, id) {
  const { data: restaurant } = await db.getById('restaurants', id);
  if (!restaurant) { selectedRestaurantId = null; renderRestaurants(container); return; }
  const locations = await getRestaurantLocations(id);
  const initials = (restaurant.name || '').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

  container.innerHTML = `
    <div class="breadcrumb">
      <span class="breadcrumb-link" onclick="selectedRestaurantId=null;navigate('restaurants')">Restaurants</span>
      <i data-lucide="chevron-right" style="width:14px;height:14px"></i>
      <span>${restaurant.name}</span>
    </div>
    <div class="rest-detail-header">
      <div style="display:flex;align-items:center;gap:16px">
        <div class="rest-avatar" style="width:56px;height:56px;font-size:22px">${restaurant.brand_logo_url ? `<img src="${restaurant.brand_logo_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initials}</div>
        <div>
          <h1 class="page-title" style="margin:0">${restaurant.name}</h1>
          <div style="display:flex;gap:8px;margin-top:4px;align-items:center">${badgeHTML(restaurant.status || 'active')} <span style="color:var(--text-muted);font-size:13px">${locations.length} location${locations.length !== 1 ? 's' : ''}</span></div>
        </div>
      </div>
      ${canEdit() ? `<div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="editRestaurant('${id}')"><i data-lucide="edit-2"></i> Edit Brand</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRestaurant('${id}')"><i data-lucide="trash-2"></i> Delete Brand</button>
        <button class="btn btn-primary btn-sm" id="add-location-btn"><i data-lucide="plus"></i> Add Location</button>
      </div>` : ''}
    </div>
    <div class="locations-grid" id="locations-grid">
      ${locations.length === 0 ? `<div class="empty-state" style="padding:40px;text-align:center;grid-column:1/-1">
        <i data-lucide="map-pin" style="width:40px;height:40px;color:var(--text-muted)"></i>
        <p style="margin-top:8px;color:var(--text-muted)">No locations added yet</p>
        ${canEdit() ? '<button class="btn btn-primary btn-sm" style="margin-top:12px" id="add-location-empty"><i data-lucide="plus"></i> Add First Location</button>' : ''}
      </div>` : locations.map((loc, i) => `
        <div class="location-card" onclick="viewLocation('${id}', ${i})" style="cursor:pointer">
          <div class="location-card-header">
            <div class="location-card-name">${loc.name || 'Location ' + (i + 1)}</div>
            <div style="display:flex;gap:6px;align-items:center">
              ${badgeHTML(loc.status || 'active')}
              <button class="btn-icon btn-ghost" onclick="event.stopPropagation();editLocation('${id}', ${i})" title="Edit location info"><i data-lucide="edit-2" style="width:14px;height:14px"></i></button>
            </div>
          </div>
          <div class="location-card-detail"><i data-lucide="map-pin" style="width:14px;height:14px"></i> ${loc.address || '—'}${loc.city ? ', ' + loc.city : ''}${loc.state ? ', ' + loc.state : ''}</div>
          ${loc.manager ? `<div class="location-card-detail"><i data-lucide="user" style="width:14px;height:14px"></i> ${loc.manager}</div>` : ''}
          ${loc.phone ? `<div class="location-card-detail"><i data-lucide="phone" style="width:14px;height:14px"></i> ${loc.phone}</div>` : ''}
          <div style="margin-top:8px;font-size:11px;color:var(--accent);display:flex;align-items:center;gap:4px"><i data-lucide="arrow-right" style="width:12px;height:12px"></i> Open Marketing</div>
        </div>`).join('')}
    </div>
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });

  const addBtn = $('#add-location-btn') || $('#add-location-empty');
  if (addBtn) addBtn.onclick = () => editLocation(id, null);
}

window.editRestaurant = async function(id) {
  let r = {};
  if (id) {
    const res = await db.getById('restaurants', id);
    r = res.data || {};
  }
  openModal(id ? 'Edit Restaurant' : 'Add Restaurant', `
    <div class="form-group"><label class="form-label">Brand Name</label><input class="form-input" id="rest-name" value="${r.name || ''}"></div>
    <div class="form-group"><label class="form-label">Status</label>
      <select class="form-select" id="rest-status">
        <option value="active" ${r.status === 'active' || !r.status ? 'selected' : ''}>Active</option>
        <option value="inactive" ${r.status === 'inactive' ? 'selected' : ''}>Inactive</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Brand Logo URL (optional)</label><input class="form-input" id="rest-logo" value="${r.brand_logo_url || ''}" placeholder="https://..."></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-rest-btn">Save</button>`);

  $('#save-rest-btn').onclick = async () => {
    const name = $('#rest-name').value.trim();
    if (!name) return toast('Brand name is required', 'error');
    const obj = {
      name,
      status: $('#rest-status').value,
      brand_logo_url: $('#rest-logo').value.trim(),
    };
    if (id) {
      await db.update('restaurants', id, obj);
      await logActivity('update_restaurant', `Updated: ${name}`);
    } else {
      await db.insert('restaurants', obj);
      await logActivity('create_restaurant', `Added: ${name}`);
    }
    closeModal();
    toast(id ? 'Restaurant updated' : 'Restaurant added', 'success');
    navigate('restaurants');
  };
};

window.deleteRestaurant = function(id) {
  openConfirm('Delete Restaurant', 'Are you sure you want to delete this restaurant?', async () => {
    await db.delete('restaurants', id);
    // Clean up locations data
    await db.delete('settings', null, { filters: { key: `locations_${id}` } });
    delete restaurantLocationsCache[id];
    await logActivity('delete_restaurant', 'Deleted a restaurant');
    toast('Restaurant deleted', 'success');
    selectedRestaurantId = null;
    navigate('restaurants');
  });
};

window.openBrandDetail = function(id) {
  selectedRestaurantId = id;
  navigate('restaurants');
};

window.viewLocation = function(restaurantId, index) {
  // Open location in a new browser tab
  window.open(`location.html?restaurant_id=${restaurantId}&location_index=${index}`, '_blank');
};

window.editLocation = async function(restaurantId, index) {
  const locations = await getRestaurantLocations(restaurantId);
  const loc = index !== null && index !== undefined ? locations[index] : {};
  const isEdit = index !== null && index !== undefined;

  openModal(isEdit ? 'Edit Location' : 'Add Location', `
    <div class="form-group"><label class="form-label">Location Name</label><input class="form-input" id="loc-name" value="${loc.name || ''}" placeholder="e.g. Pentagon City, Tysons Corner"></div>
    <div class="form-group"><label class="form-label">Address</label><input class="form-input" id="loc-address" value="${loc.address || ''}"></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">City</label><input class="form-input" id="loc-city" value="${loc.city || ''}"></div>
      <div class="form-group"><label class="form-label">State</label><input class="form-input" id="loc-state" value="${loc.state || ''}"></div>
      <div class="form-group"><label class="form-label">ZIP</label><input class="form-input" id="loc-zip" value="${loc.zip || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="loc-phone" value="${loc.phone || ''}"></div>
      <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="loc-email" value="${loc.email || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Manager</label><input class="form-input" id="loc-manager" value="${loc.manager || ''}"></div>
      <div class="form-group"><label class="form-label">Status</label>
        <select class="form-select" id="loc-status">
          <option value="active" ${loc.status === 'active' || !loc.status ? 'selected' : ''}>Active</option>
          <option value="inactive" ${loc.status === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label class="form-label">Google Business ID</label><input class="form-input" id="loc-gbp" value="${loc.google_business_id || ''}" placeholder="For review syncing"></div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="loc-notes" rows="2">${loc.notes || ''}</textarea></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>${isEdit ? '<button class="btn btn-danger" id="delete-loc-btn" style="margin-right:auto">Delete</button>' : ''}<button class="btn btn-primary" id="save-loc-btn">Save</button>`);

  $('#save-loc-btn').onclick = async () => {
    const obj = {
      name: $('#loc-name').value.trim(),
      address: $('#loc-address').value.trim(),
      city: $('#loc-city').value.trim(),
      state: $('#loc-state').value.trim(),
      zip: $('#loc-zip').value.trim(),
      phone: $('#loc-phone').value.trim(),
      email: $('#loc-email').value.trim(),
      manager: $('#loc-manager').value.trim(),
      status: $('#loc-status').value,
      google_business_id: $('#loc-gbp').value.trim(),
      notes: $('#loc-notes').value.trim(),
    };
    if (!obj.name) return toast('Location name is required', 'error');
    if (isEdit) {
      locations[index] = obj;
    } else {
      locations.push(obj);
    }
    await saveRestaurantLocations(restaurantId, locations);
    await db.update('restaurants', restaurantId, { location_count: locations.length });
    closeModal();
    toast(isEdit ? 'Location updated' : 'Location added', 'success');
    await logActivity(isEdit ? 'update_location' : 'create_location', `${isEdit ? 'Updated' : 'Added'}: ${obj.name}`);
    navigate('restaurants');
  };

  const delBtn = $('#delete-loc-btn');
  if (delBtn) delBtn.onclick = async () => {
    openConfirm('Delete Location', `Delete "${loc.name || 'this location'}"?`, async () => {
      locations.splice(index, 1);
      await saveRestaurantLocations(restaurantId, locations);
      await db.update('restaurants', restaurantId, { location_count: locations.length });
      closeModal();
      toast('Location deleted', 'success');
      await logActivity('delete_location', `Deleted: ${loc.name}`);
      navigate('restaurants');
    });
  };
};



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
        ${canEdit() ? '<button class="btn btn-primary btn-sm" id="new-post-btn"><i data-lucide="plus"></i> New Post</button>' : ''}
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
          <th>Publish</th>
          <th>Actions</th>
        </tr></thead>
        <tbody id="posts-tbody">${filtered.map(postRow).join('')}</tbody>
      </table>
    </div>`;
  }

  function postRow(p) {
    const platforms = parseJSON(p.platforms).map(pl => `<span class="badge badge-platform">${pl}</span>`).join(' ');
    const hasMedia = parseJSON(p.media_urls).length > 0;
    return `<tr data-id="${p.id}">
      <td><input type="checkbox" class="post-check" value="${p.id}"></td>
      <td>${p.title || 'Untitled'}${hasMedia ? ' <span class="media-indicator"><i data-lucide="image" style="width:14px;height:14px"></i></span>' : ''}</td>
      <td>${platforms}</td>
      <td>${badgeHTML(p.status)}</td>
      <td>${formatDate(p.scheduled_date)}</td>
      <td>${employeeName(p.assigned_to)}</td>
      <td>${(p.status === 'approved' || p.status === 'scheduled') ? `<button class="btn btn-sm publish-btn" onclick="publishPost('${p.id}')"><i data-lucide="send"></i> Publish</button>` : '<span style="color:var(--text-muted)">—</span>'}</td>
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
    <div class="form-group"><label class="form-label">Body</label><textarea class="form-textarea" id="post-body" rows="4">${post.body || ''}</textarea>
      <button class="btn btn-sm ai-gen-btn" id="ai-gen-post" type="button"><i data-lucide="sparkles"></i> Generate with AI</button>
      <div class="ai-gen-inline" id="ai-gen-post-inline" style="display:none">
        <input type="text" class="form-input" id="ai-gen-post-prompt" placeholder="What should this post be about? (e.g. 'New spring menu launch at Sushi Bar')">
        <button class="btn btn-sm btn-primary" id="ai-gen-post-go">Generate</button>
      </div>
    </div>
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
    <div class="form-group"><label class="form-label">Media URLs</label>
      <textarea class="form-textarea" id="post-media-urls" rows="2" placeholder="Paste image or video URLs, one per line (e.g. https://example.com/photo.jpg)">${parseJSON(post.media_urls).join('\n')}</textarea>
      <small style="color:var(--text-muted)">These URLs are sent directly to social platforms when publishing. Supports images and videos.</small>
    </div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="post-notes" rows="2">${post.notes || ''}</textarea></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-post-btn">Save</button>`);

  // Chip select
  $$('#post-platforms .chip').forEach(c => c.onclick = () => c.classList.toggle('selected'));

  // AI Generate for posts
  $('#ai-gen-post').onclick = () => {
    const inline = $('#ai-gen-post-inline');
    inline.style.display = inline.style.display === 'none' ? 'flex' : 'none';
    if (inline.style.display === 'flex') $('#ai-gen-post-prompt').focus();
  };
  $('#ai-gen-post-go').onclick = async () => {
    const prompt = $('#ai-gen-post-prompt').value.trim();
    if (!prompt) return toast('Please describe what the post should be about', 'error');
    const btn = $('#ai-gen-post-go');
    btn.textContent = 'Generating...';
    btn.disabled = true;
    const selectedPl = $$('#post-platforms .chip.selected').map(c => c.dataset.value);
    const result = await generateAIContent(
      `Create a social media post for a restaurant. Topic: ${prompt}. Target platforms: ${selectedPl.join(', ') || 'Instagram, Facebook'}.

Respond in this exact JSON format:
{"title": "short catchy title", "body": "the full caption/post text with emojis and hashtags", "tags": ["tag1", "tag2", "tag3"]}

Only output the JSON, nothing else.`, 400
    );
    btn.textContent = 'Generate';
    btn.disabled = false;
    if (!result) return toast('Failed to generate content', 'error');
    try {
      const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
      if (parsed.title) $('#post-title').value = parsed.title;
      if (parsed.body) $('#post-body').value = parsed.body;
      if (parsed.tags?.length) $('#post-tags').value = parsed.tags.join(', ');
      toast('Content generated — review and edit as needed', 'success');
      $('#ai-gen-post-inline').style.display = 'none';
    } catch {
      // If not valid JSON, just put it in the body
      $('#post-body').value = result;
      toast('Content generated', 'success');
      $('#ai-gen-post-inline').style.display = 'none';
    }
  };
  $('#ai-gen-post-prompt').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#ai-gen-post-go').click(); });

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
      media_urls: $('#post-media-urls').value.split('\n').map(u => u.trim()).filter(Boolean),
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
// PAGE: Influencers (Full CRM)
// ============================================

// Helpers
function infTier(followers) {
  if (!followers) return 'Unknown';
  if (followers >= 1000000) return 'Mega';
  if (followers >= 500000) return 'Macro';
  if (followers >= 50000) return 'Mid-Tier';
  if (followers >= 10000) return 'Micro';
  return 'Nano';
}
function tierColor(tier) {
  return { 'Mega': '#8b5cf6', 'Macro': '#3b82f6', 'Mid-Tier': '#22c55e', 'Micro': '#f59e0b', 'Nano': '#94a3b8', 'Unknown': '#666' }[tier] || '#666';
}
function ambassadorBadge(tier) {
  if (!tier) return '';
  const colors = { Bronze: '#cd7f32', Silver: '#c0c0c0', Gold: '#ffd700', Platinum: '#e5e4e2' };
  return `<span class="badge" style="background:${colors[tier] || '#666'}20;color:${colors[tier] || '#666'};border:1px solid ${colors[tier] || '#666'}40">${tier}</span>`;
}
function cpv(totalPaid, totalViews) {
  if (!totalViews || !totalPaid) return '—';
  return '$' + (totalPaid / totalViews * 1000).toFixed(2);
}

let infActiveTab = 'pipeline';

async function renderInfluencers(container) {
  await getEmployees();
  const tabs = [
    { id: 'pipeline', icon: 'git-branch', label: 'Pipeline' },
    { id: 'outreach', icon: 'send', label: 'Outreach' },
    { id: 'posts', icon: 'play-circle', label: 'Posts & Performance' },
    { id: 'payments', icon: 'credit-card', label: 'Payments' },
    { id: 'interactions', icon: 'message-circle', label: 'Interactions' },
  ];

  container.innerHTML = `
    <h1 class="page-title">Influencers</h1>
    <p class="page-subtitle">Manage influencer pipeline, performance tracking, and relationships</p>
    <div class="sub-tabs" style="display:flex;gap:4px;margin-bottom:24px;border-bottom:1px solid var(--border);padding-bottom:0">
      ${tabs.map(t => `<button class="btn btn-ghost sub-tab ${infActiveTab === t.id ? 'active' : ''}" data-tab="${t.id}" style="border-bottom:2px solid ${infActiveTab === t.id ? 'var(--accent)' : 'transparent'};border-radius:0;padding:8px 16px;font-size:13px;display:flex;align-items:center;gap:6px">
        <i data-lucide="${t.icon}" style="width:14px;height:14px"></i>${t.label}
      </button>`).join('')}
    </div>
    <div id="inf-tab-content"></div>
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });

  $$('.sub-tab', container).forEach(btn => btn.onclick = () => {
    infActiveTab = btn.dataset.tab;
    renderInfluencers(container);
  });

  const tc = $('#inf-tab-content');
  if (infActiveTab === 'pipeline') await renderInfPipeline(tc);
  else if (infActiveTab === 'outreach') await renderInfOutreach(tc);
  else if (infActiveTab === 'posts') await renderInfPosts(tc);
  else if (infActiveTab === 'payments') await renderInfPayments(tc);
  else if (infActiveTab === 'interactions') await renderInfInteractions(tc);
}

// ---- TAB: Pipeline ----
async function renderInfPipeline(container) {
  const [influencersRes, postsRes, tiersRes, paymentsRes] = await Promise.all([
    sb.from('influencers').select('*').order('followers', { ascending: false }),
    sb.from('influencer_posts').select('influencer_id,views,likes,comments,saves,reach'),
    sb.from('influencer_ambassador_tiers').select('*').order('sort_order'),
    sb.from('influencer_payments').select('amount,status'),
  ]);
  const items = influencersRes.data || [];
  const posts = postsRes.data || [];
  const tiers = tiersRes.data || [];
  const totalPaid = (paymentsRes.data || []).filter(p => p.status === 'paid').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

  // Build collab count map, real engagement rate, and ambassador tier per influencer
  const collabCounts = {};
  const engagementTotals = {};
  posts.forEach(p => {
    collabCounts[p.influencer_id] = (collabCounts[p.influencer_id] || 0) + 1;
    if (p.reach) {
      const eng = ((p.likes || 0) + (p.comments || 0) + (p.saves || 0)) / p.reach * 100;
      if (!engagementTotals[p.influencer_id]) engagementTotals[p.influencer_id] = { total: 0, count: 0 };
      engagementTotals[p.influencer_id].total += eng;
      engagementTotals[p.influencer_id].count += 1;
    }
  });
  items.forEach(inf => {
    const count = collabCounts[inf.id] || 0;
    inf._ambassadorTier = [...tiers].reverse().find(t => count >= t.min_collabs) || null;
    const e = engagementTotals[inf.id];
    inf._realEngagement = e ? (e.total / e.count) : null;
  });

  // Average real engagement across influencers who have post data
  const engItems = items.filter(i => i._realEngagement !== null);
  const avgRealEngagement = engItems.length
    ? (engItems.reduce((s, i) => s + i._realEngagement, 0) / engItems.length).toFixed(1)
    : null;

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
    const tier = infTier(i.followers);
    return `<tr data-id="${i.id}">
      <td><input type="checkbox" class="inf-check" value="${i.id}"></td>
      <td><strong>${i.name}</strong><div style="font-size:11px">${i.handle ? `<a href="${socialProfileUrl(i.platform, i.handle)}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none">@${i.handle.replace(/^@/,'')}</a>` : ''}</div></td>
      <td>${i.platform || '—'}</td>
      <td><span style="color:${tierColor(tier)};font-weight:600">${tier}</span><div style="font-size:11px;color:var(--text-muted)">${i.followers?.toLocaleString() || '0'}</div></td>
      <td>${i.engagement_rate ? i.engagement_rate + '%' : '—'}</td>
      <td>${i.location || '—'}</td>
      <td>${parseJSON(i.tags).map(t => `<span class="badge badge-accent" style="font-size:10px;margin:1px">${t}</span>`).join('') || badgeHTML(i.category || '—')}${i._ambassadorTier ? ' ' + ambassadorBadge(i._ambassadorTier.name) : ''}</td>
      <td>${i.email ? `<a href="mailto:${i.email}" style="color:var(--accent);text-decoration:none;font-size:12px">${i.email}</a>` : '—'}</td>
      <td>${i.rate ? '$' + Number(i.rate).toLocaleString() : '—'}</td>
      <td>${badgeHTML(i.pipeline_stage)}</td>
      <td>${formatDate(i.last_contacted)}</td>
      <td class="table-actions" style="white-space:nowrap">
        <button class="btn-icon btn-ghost" onclick="quickEmail('${i.id}')" title="${i.email ? 'Send Email' : 'Add email to send'}"><i data-lucide="mail" style="${i.email ? '' : 'opacity:0.3'}"></i></button>
        <button class="btn-icon btn-ghost" onclick="quickSMS('${i.id}')" title="${i.phone ? 'Send SMS' : 'Add phone to text'}"><i data-lucide="smartphone" style="${i.phone ? '' : 'opacity:0.3'}"></i></button>
        <button class="btn-icon btn-ghost" onclick="quickDM('${i.id}')" title="DM on ${i.platform || 'Instagram'}"><i data-lucide="message-circle" style="color:#e1306c"></i></button>
        <button class="btn-icon btn-ghost" onclick="viewInfluencerProfile('${i.id}')" title="View Profile"><i data-lucide="user"></i></button>
        <button class="btn-icon btn-ghost" onclick="editInfluencer('${i.id}')"><i data-lucide="edit-2"></i></button>
        <button class="btn-icon btn-ghost" onclick="deleteInfluencer('${i.id}')"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>`;
  }

  function render() {
    const f = filtered();
    container.innerHTML = `
      <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:16px">
        <div class="kpi-card"><div class="kpi-label">Total Influencers</div><div class="kpi-value">${items.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">Total Paid</div><div class="kpi-value" style="color:var(--success)">$${totalPaid.toLocaleString()}</div></div>
        <div class="kpi-card" title="Calculated from actual post performance (likes + comments + saves) / reach across all influencer posts"><div class="kpi-label">Avg Engagement</div><div class="kpi-value">${avgRealEngagement !== null ? avgRealEngagement + '%' : '—'}</div><div style="font-size:10px;color:var(--text-muted);margin-top:2px">from post data</div></div>
        <div class="kpi-card"><div class="kpi-label">Total Reach</div><div class="kpi-value">${items.reduce((s,i) => s + (i.followers || 0), 0).toLocaleString()}</div></div>
      </div>
      ${(() => {
        const ranked = [...items]
          .filter(i => i._ambassadorTier)
          .map(i => {
            const infPosts = posts.filter(p => p.influencer_id === i.id);
            const totalViews = infPosts.reduce((s, p) => s + (p.views || 0), 0);
            return { ...i, totalViews, postCount: infPosts.length };
          })
          .sort((a, b) => b.totalViews - a.totalViews)
          .slice(0, 5);
        if (!ranked.length) return '';
        const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
        return `<div class="chart-card" style="margin-bottom:16px">
          <h4 style="margin-bottom:12px;font-size:14px;font-weight:600">Ambassador Leaderboard</h4>
          <div style="display:grid;grid-template-columns:repeat(${ranked.length},1fr);gap:12px">
            ${ranked.map((inf, idx) => `
              <div style="text-align:center;padding:12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
                <div style="font-size:22px;margin-bottom:4px">${medals[idx]}</div>
                <div style="font-weight:600;font-size:13px">${inf.name}</div>
                <div style="margin:6px 0">${ambassadorBadge(inf._ambassadorTier.name)}</div>
                <div style="font-size:11px;color:var(--text-muted)">${inf.postCount} post${inf.postCount !== 1 ? 's' : ''}</div>
                <div style="font-size:12px;font-weight:600;margin-top:4px">${inf.totalViews.toLocaleString()} views</div>
              </div>
            `).join('')}
          </div>
        </div>`;
      })()}
      <div class="pipeline-grid">
        ${stageCounts().map(s => `
          <div class="pipeline-card ${activeFilter === s.stage ? 'active' : ''}" style="border-top-color:${stageColors[s.stage]}" data-stage="${s.stage}">
            <div class="pipeline-count" style="color:${stageColors[s.stage]}">${s.count}</div>
            <div class="pipeline-label">${s.stage}</div>
          </div>
        `).join('')}
      </div>
      <div class="table-toolbar">
        <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Filter by name, handle, location, tag..." id="inf-filter"></div>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" id="inf-export"><i data-lucide="download"></i> Export</button>
          ${canEdit() ? '<button class="btn btn-primary btn-sm" id="new-inf-btn"><i data-lucide="plus"></i> Add Influencer</button>' : ''}
        </div>
      </div>
      <div id="inf-bulk-bar"></div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th style="width:36px"><input type="checkbox" id="inf-select-all"></th>
            <th data-key="name">Name</th>
            <th data-key="platform">Platform</th>
            <th data-key="followers">Tier / Followers</th>
            <th data-key="engagement_rate">Engage %</th>
            <th data-key="location">Location</th>
            <th>Tags</th>
            <th data-key="email">Email</th>
            <th data-key="rate">Rate</th>
            <th data-key="pipeline_stage">Stage</th>
            <th data-key="last_contacted">Last Contact</th>
            <th>Actions</th>
          </tr></thead>
          <tbody id="inf-tbody">${f.map(rowHTML).join('')}</tbody>
        </table>
      </div>
    `;
    lucide.createIcons({ nameAttr: 'data-lucide' });

    $$('.pipeline-card', container).forEach(c => c.onclick = () => {
      activeFilter = activeFilter === c.dataset.stage ? '' : c.dataset.stage;
      render();
    });

    $('#inf-filter')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      $$('#inf-tbody tr').forEach(tr => {
        tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    $('#inf-export').onclick = () => csvExport(f, 'influencers');
    if ($('#new-inf-btn')) $('#new-inf-btn').onclick = () => editInfluencer(null);

    selected = new Set();
    function bindCheck() {
      $$('.inf-check').forEach(cb => {
        cb.onchange = () => { if (cb.checked) selected.add(cb.value); else selected.delete(cb.value); updateBulk(); };
      });
    }
    function updateBulk() {
      const bar = $('#inf-bulk-bar');
      if (!selected.size) { bar.innerHTML = ''; return; }
      const selItems = items.filter(i => selected.has(String(i.id)));
      const withEmail = selItems.filter(i => i.email);
      const withPhone = selItems.filter(i => i.phone);
      const withHandle = selItems.filter(i => i.handle);
      bar.innerHTML = `<div class="bulk-bar" style="display:flex;align-items:center;flex-wrap:wrap;gap:8px">
        <strong>${selected.size} selected</strong>
        <button class="btn btn-accent btn-sm" id="bulk-email-inf" ${!withEmail.length ? 'disabled title="No selected influencers have email"' : ''}><i data-lucide="mail" style="width:14px;height:14px"></i> Email (${withEmail.length})</button>
        <button class="btn btn-sm" id="bulk-sms-inf" style="background:#22c55e;color:#fff" ${!withPhone.length ? 'disabled title="No selected influencers have phone"' : ''}><i data-lucide="smartphone" style="width:14px;height:14px"></i> SMS (${withPhone.length})</button>
        <button class="btn btn-sm" id="bulk-dm-inf" style="background:#e1306c;color:#fff" ${!withHandle.length ? 'disabled title="No selected influencers have handle"' : ''}><i data-lucide="message-circle" style="width:14px;height:14px"></i> DM Scripts (${withHandle.length})</button>
        <select class="form-select" style="width:150px" id="bulk-stage-sel">
          <option value="">Change Stage...</option>
          ${stages.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
        <button class="btn btn-danger btn-sm" id="bulk-delete-inf">Delete</button>
      </div>`;
      lucide.createIcons({ nameAttr: 'data-lucide' });

      // Bulk Email
      $('#bulk-email-inf').onclick = () => {
        if (!withEmail.length) return;
        openBulkInfluencerEmail(withEmail);
      };
      // Bulk SMS
      $('#bulk-sms-inf').onclick = () => {
        if (!withPhone.length) return;
        openBulkInfluencerSMS(withPhone);
      };
      // Bulk DM
      $('#bulk-dm-inf').onclick = () => {
        if (!withHandle.length) return;
        openBulkInfluencerDM(withHandle);
      };

      $('#bulk-stage-sel').onchange = async function() {
        if (!this.value) return;
        for (const id of selected) await sb.from('influencers').update({ pipeline_stage: this.value }).eq('id', id);
        toast('Stage updated', 'success');
        navigate('influencers');
      };
      $('#bulk-delete-inf').onclick = () => openConfirm('Delete Influencers', `Delete ${selected.size} influencer(s)?`, async () => {
        for (const id of selected) await sb.from('influencers').delete().eq('id', id);
        toast('Deleted', 'success');
        navigate('influencers');
      });
    }
    bindCheck();
    const selectAll = $('#inf-select-all');
    if (selectAll) selectAll.onchange = () => {
      $$('.inf-check').forEach(cb => { cb.checked = selectAll.checked; if (cb.checked) selected.add(cb.value); else selected.delete(cb.value); });
      updateBulk();
    };
    const table = $('table', container);
    if (table) makeSortable(table, f, rowHTML, $('#inf-tbody'), { onAfterSort: bindCheck });
  }
  render();
}

// ---- TAB: Posts & Performance ----
async function renderInfPosts(container) {
  const [postsRes, influencersRes] = await Promise.all([
    sb.from('influencer_posts').select('*').order('posted_at', { ascending: false }),
    sb.from('influencers').select('id,name,handle,platform'),
  ]);
  const posts = postsRes.data || [];
  const influencers = influencersRes.data || [];
  const infMap = {};
  influencers.forEach(i => infMap[i.id] = i);

  // KPIs
  const totalViews = posts.reduce((s, p) => s + (p.views || 0), 0);
  const totalEng = posts.reduce((s, p) => s + (p.likes || 0) + (p.comments || 0) + (p.shares || 0) + (p.reposts || 0) + (p.forwards || 0) + (p.saves || 0), 0);
  const avgEng = posts.length ? (totalEng / posts.length).toFixed(0) : 0;

  container.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-label">Total Posts Tracked</div><div class="kpi-value">${posts.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Views</div><div class="kpi-value">${totalViews.toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Engagement</div><div class="kpi-value">${totalEng.toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg Engagement/Post</div><div class="kpi-value">${Number(avgEng).toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Promo Uses</div><div class="kpi-value">${posts.reduce((s,p) => s + (p.promo_code_uses || 0), 0).toLocaleString()}</div></div>
    </div>
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Filter posts..." id="post-filter"></div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" id="post-export"><i data-lucide="download"></i> Export</button>
        ${canEdit() ? '<button class="btn btn-primary btn-sm" id="new-post-btn"><i data-lucide="plus"></i> Log Post</button>' : ''}
      </div>
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th data-key="influencer_id">Influencer</th>
          <th data-key="platform">Platform</th>
          <th data-key="post_type">Type</th>
          <th data-key="posted_at">Date</th>
          <th data-key="views">Views</th>
          <th data-key="likes">Likes</th>
          <th data-key="comments">Comments</th>
          <th data-key="shares">Shares</th>
          <th data-key="reposts">Reposts</th>
          <th data-key="forwards">Forwards</th>
          <th data-key="saves">Saves</th>
          <th data-key="promo_code_uses">Promo Uses</th>
          <th>Actions</th>
        </tr></thead>
        <tbody id="posts-tbody">${posts.map(p => {
          const inf = infMap[p.influencer_id];
          return `<tr>
            <td><strong>${inf?.name || 'Unknown'}</strong><div style="font-size:11px">${inf?.handle ? `<a href="${socialProfileUrl(inf.platform, inf.handle)}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none">@${inf.handle.replace(/^@/,'')}</a>` : ''}</div></td>
            <td>${badgeHTML(p.platform || '—')}</td>
            <td>${badgeHTML(p.post_type || 'post')}</td>
            <td>${formatDate(p.posted_at)}</td>
            <td><strong>${(p.views || 0).toLocaleString()}</strong></td>
            <td>${(p.likes || 0).toLocaleString()}</td>
            <td>${(p.comments || 0).toLocaleString()}</td>
            <td>${(p.shares || 0).toLocaleString()}</td>
            <td>${(p.reposts || 0).toLocaleString()}</td>
            <td>${(p.forwards || 0).toLocaleString()}</td>
            <td>${(p.saves || 0).toLocaleString()}</td>
            <td>${(p.promo_code_uses || 0).toLocaleString()}</td>
            <td class="table-actions">
              <button class="btn-icon btn-ghost" onclick="editInfPost('${p.id}')"><i data-lucide="edit-2"></i></button>
              <button class="btn-icon btn-ghost" onclick="updatePostMetrics('${p.id}')"><i data-lucide="refresh-cw"></i></button>
              <button class="btn-icon btn-ghost" onclick="deleteInfPost('${p.id}')"><i data-lucide="trash-2"></i></button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
    ${!posts.length ? '<div class="empty-state" style="padding:48px;text-align:center"><i data-lucide="play-circle" style="width:48px;height:48px;color:var(--text-muted)"></i><h4>No posts tracked yet</h4><p style="color:var(--text-muted)">Log an influencer\'s post to start tracking performance metrics.</p></div>' : ''}
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });

  $('#post-filter')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    $$('#posts-tbody tr').forEach(tr => { tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none'; });
  });
  $('#post-export')?.addEventListener('click', () => csvExport(posts, 'influencer_posts'));

  if ($('#new-post-btn')) $('#new-post-btn').onclick = () => editInfPost(null);

  const table = $('table', container);
  if (table) makeSortable(table, posts, () => '', $('#posts-tbody'));
}

// Log/Edit Post Modal
window.editInfPost = async function(id) {
  let post = {};
  if (id) {
    const { data } = await sb.from('influencer_posts').select('*').eq('id', id).single();
    post = data || {};
  }
  const { data: infList } = await sb.from('influencers').select('id,name,handle').order('name');
  const influencers = infList || [];

  openModal(id ? 'Update Post Metrics' : 'Log Influencer Post', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Influencer</label>
        <select class="form-select" id="ip-influencer">
          <option value="">Select influencer...</option>
          ${influencers.map(i => `<option value="${i.id}" ${post.influencer_id == i.id ? 'selected' : ''}>${i.name} ${i.handle ? '(@' + i.handle.replace(/^@/,'') + ')' : ''}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Platform</label>
        <select class="form-select" id="ip-platform">
          ${['Instagram','TikTok','YouTube','Twitter','Facebook','LinkedIn'].map(p => `<option ${post.platform === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Post Type</label>
        <select class="form-select" id="ip-type">
          ${['post','reel','story','video','live','tweet'].map(t => `<option value="${t}" ${post.post_type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Date Posted</label>
        <input class="form-input" type="date" id="ip-date" value="${post.posted_at ? post.posted_at.split('T')[0] : new Date().toISOString().split('T')[0]}">
      </div>
    </div>
    <div class="form-group"><label class="form-label">Post URL</label><input class="form-input" id="ip-url" value="${post.post_url || ''}" placeholder="https://..."></div>
    <div class="form-group"><label class="form-label">Caption</label><textarea class="form-textarea" id="ip-caption" rows="2">${post.caption || ''}</textarea></div>
    <h4 style="margin:16px 0 8px;color:var(--text-muted);font-size:13px">PERFORMANCE METRICS</h4>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Views</label><input class="form-input" type="number" id="ip-views" value="${post.views || 0}"></div>
      <div class="form-group"><label class="form-label">Likes</label><input class="form-input" type="number" id="ip-likes" value="${post.likes || 0}"></div>
      <div class="form-group"><label class="form-label">Comments</label><input class="form-input" type="number" id="ip-comments" value="${post.comments || 0}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Shares</label><input class="form-input" type="number" id="ip-shares" value="${post.shares || 0}"></div>
      <div class="form-group"><label class="form-label">Reposts</label><input class="form-input" type="number" id="ip-reposts" value="${post.reposts || 0}"></div>
      <div class="form-group"><label class="form-label">Forwards</label><input class="form-input" type="number" id="ip-forwards" value="${post.forwards || 0}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Saves</label><input class="form-input" type="number" id="ip-saves" value="${post.saves || 0}"></div>
      <div class="form-group"><label class="form-label">Link Clicks</label><input class="form-input" type="number" id="ip-clicks" value="${post.link_clicks || 0}"></div>
      <div class="form-group"><label class="form-label">Promo Code Uses</label><input class="form-input" type="number" id="ip-promo" value="${post.promo_code_uses || 0}"></div>
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-ip-btn">${id ? 'Update Metrics' : 'Log Post'}</button>`);

  $('#save-ip-btn').onclick = async () => {
    const obj = {
      influencer_id: parseInt($('#ip-influencer').value) || null,
      platform: $('#ip-platform').value,
      post_type: $('#ip-type').value,
      posted_at: $('#ip-date').value ? new Date($('#ip-date').value).toISOString() : null,
      post_url: $('#ip-url').value,
      caption: $('#ip-caption').value,
      views: parseInt($('#ip-views').value) || 0,
      likes: parseInt($('#ip-likes').value) || 0,
      comments: parseInt($('#ip-comments').value) || 0,
      shares: parseInt($('#ip-shares').value) || 0,
      reposts: parseInt($('#ip-reposts').value) || 0,
      forwards: parseInt($('#ip-forwards').value) || 0,
      saves: parseInt($('#ip-saves').value) || 0,
      link_clicks: parseInt($('#ip-clicks').value) || 0,
      promo_code_uses: parseInt($('#ip-promo').value) || 0,
      updated_at: new Date().toISOString(),
    };
    if (!obj.influencer_id) return toast('Select an influencer', 'error');
    if (id) {
      await sb.from('influencer_posts').update(obj).eq('id', id);
      // Save snapshot
      await sb.from('influencer_post_metrics').insert({
        post_id: id, influencer_id: obj.influencer_id, snapshot_label: 'manual',
        views: obj.views, likes: obj.likes, comments: obj.comments, shares: obj.shares,
        reposts: obj.reposts, forwards: obj.forwards, saves: obj.saves,
        link_clicks: obj.link_clicks, promo_code_uses: obj.promo_code_uses,
      });
      toast('Post metrics updated', 'success');
    } else {
      await sb.from('influencer_posts').insert(obj);
      toast('Post logged', 'success');
    }
    closeModal();
    await logActivity('influencer_post', `${id ? 'Updated' : 'Logged'} influencer post`);
    infActiveTab = 'posts';
    navigate('influencers');
  };
};

window.updatePostMetrics = function(id) { editInfPost(id); };

window.deleteInfPost = function(id) {
  openConfirm('Delete Post', 'Delete this tracked post?', async () => {
    await sb.from('influencer_posts').delete().eq('id', id);
    toast('Post deleted', 'success');
    infActiveTab = 'posts';
    navigate('influencers');
  });
};

// ---- TAB: Payments ----
async function renderInfPayments(container) {
  const [paymentsRes, influencersRes, postsRes] = await Promise.all([
    sb.from('influencer_payments').select('*').order('created_at', { ascending: false }),
    sb.from('influencers').select('id,name,handle,rate'),
    sb.from('influencer_posts').select('*'),
  ]);
  const payments = paymentsRes.data || [];
  const influencers = influencersRes.data || [];
  const posts = postsRes.data || [];
  const infMap = {};
  influencers.forEach(i => infMap[i.id] = i);

  const totalPaid = payments.filter(p => p.status === 'paid').reduce((s,p) => s + (parseFloat(p.total_amount) || 0), 0);
  const totalPending = payments.filter(p => p.status === 'pending').reduce((s,p) => s + (parseFloat(p.total_amount) || 0), 0);

  container.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-label">Total Paid</div><div class="kpi-value" style="color:var(--success)">$${totalPaid.toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Pending Payments</div><div class="kpi-value" style="color:var(--warning)">$${totalPending.toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Payment Records</div><div class="kpi-value">${payments.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg Cost/Post</div><div class="kpi-value">${posts.length ? '$' + (totalPaid / (posts.length || 1)).toFixed(0) : '—'}</div></div>
    </div>
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Filter payments..." id="pay-filter"></div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" id="pay-export"><i data-lucide="download"></i> Export</button>
        ${canEdit() ? '<button class="btn btn-primary btn-sm" id="new-pay-btn"><i data-lucide="plus"></i> Create Payment</button>' : ''}
        ${canEdit() ? '<button class="btn btn-accent btn-sm" id="calc-pay-btn" style="background:var(--accent)"><i data-lucide="calculator"></i> Calculate from Posts</button>' : ''}
      </div>
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th data-key="influencer_id">Influencer</th>
          <th data-key="type">Type</th>
          <th data-key="base_amount">Base</th>
          <th data-key="performance_bonus">Performance Bonus</th>
          <th data-key="total_amount">Total</th>
          <th>Metrics Used</th>
          <th data-key="status">Status</th>
          <th data-key="created_at">Date</th>
          <th>Actions</th>
        </tr></thead>
        <tbody id="pay-tbody">${payments.map(p => {
          const inf = infMap[p.influencer_id];
          return `<tr>
            <td><strong>${inf?.name || 'Unknown'}</strong></td>
            <td>${badgeHTML(p.type || 'campaign')}</td>
            <td>$${(parseFloat(p.base_amount) || 0).toLocaleString()}</td>
            <td style="color:var(--success)">+$${(parseFloat(p.performance_bonus) || 0).toLocaleString()}</td>
            <td><strong>$${(parseFloat(p.total_amount) || 0).toLocaleString()}</strong></td>
            <td style="font-size:11px;color:var(--text-muted)">${p.total_views ? p.total_views.toLocaleString() + ' views' : ''} ${p.total_reposts ? '/ ' + p.total_reposts.toLocaleString() + ' reposts' : ''} ${p.total_forwards ? '/ ' + p.total_forwards.toLocaleString() + ' fwds' : ''}</td>
            <td>${badgeHTML(p.status || 'pending')}</td>
            <td>${formatDate(p.created_at)}</td>
            <td class="table-actions">
              ${p.status === 'pending' ? `<button class="btn-icon btn-ghost" onclick="markPaymentPaid('${p.id}')" title="Mark Paid"><i data-lucide="check-circle"></i></button>` : ''}
              <button class="btn-icon btn-ghost" onclick="deletePayment('${p.id}')"><i data-lucide="trash-2"></i></button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
    ${!payments.length ? '<div class="empty-state" style="padding:48px;text-align:center"><i data-lucide="credit-card" style="width:48px;height:48px;color:var(--text-muted)"></i><h4>No payments yet</h4><p style="color:var(--text-muted)">Create a payment or calculate from tracked post performance.</p></div>' : ''}
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });

  $('#pay-filter')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    $$('#pay-tbody tr').forEach(tr => { tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none'; });
  });
  $('#pay-export')?.addEventListener('click', () => csvExport(payments, 'influencer_payments'));

  if ($('#new-pay-btn')) $('#new-pay-btn').onclick = () => createPayment(influencers);
  if ($('#calc-pay-btn')) $('#calc-pay-btn').onclick = () => calculatePaymentFromPosts(influencers, posts);
}

window.createPayment = function(influencers) {
  openModal('Create Payment', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Influencer</label>
        <select class="form-select" id="pay-inf">
          <option value="">Select...</option>
          ${influencers.map(i => `<option value="${i.id}">${i.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Type</label>
        <select class="form-select" id="pay-type">
          <option value="campaign">Campaign</option>
          <option value="bonus">Bonus</option>
          <option value="ambassador_reward">Ambassador Reward</option>
          <option value="referral">Referral</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Base Amount ($)</label><input class="form-input" type="number" id="pay-base" value="0"></div>
      <div class="form-group"><label class="form-label">Performance Bonus ($)</label><input class="form-input" type="number" id="pay-bonus" value="0"></div>
    </div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="pay-notes" rows="2"></textarea></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-pay-btn">Create</button>`);

  $('#save-pay-btn').onclick = async () => {
    const base = parseFloat($('#pay-base').value) || 0;
    const bonus = parseFloat($('#pay-bonus').value) || 0;
    await sb.from('influencer_payments').insert({
      influencer_id: parseInt($('#pay-inf').value) || null,
      type: $('#pay-type').value,
      base_amount: base,
      performance_bonus: bonus,
      total_amount: base + bonus,
      status: 'pending',
      notes: $('#pay-notes').value,
    });
    closeModal();
    toast('Payment created', 'success');
    infActiveTab = 'payments';
    navigate('influencers');
  };
};

window.calculatePaymentFromPosts = function(influencers, posts) {
  openModal('Calculate Performance Payment', `
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">Select an influencer to calculate their payment based on post performance metrics.</p>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Influencer</label>
        <select class="form-select" id="calc-inf">
          <option value="">Select...</option>
          ${influencers.map(i => `<option value="${i.id}" data-rate="${i.rate || 0}">${i.name} (base rate: $${i.rate || 0})</option>`).join('')}
        </select>
      </div>
    </div>
    <h4 style="margin:12px 0 8px;font-size:13px;color:var(--text-muted)">BONUS RATES</h4>
    <div class="form-row">
      <div class="form-group"><label class="form-label">$ per 10K views</label><input class="form-input" type="number" step="0.01" id="calc-view-rate" value="50"></div>
      <div class="form-group"><label class="form-label">$ per 1K reposts</label><input class="form-input" type="number" step="0.01" id="calc-repost-rate" value="25"></div>
      <div class="form-group"><label class="form-label">$ per 1K forwards</label><input class="form-input" type="number" step="0.01" id="calc-fwd-rate" value="25"></div>
    </div>
    <div id="calc-result" style="margin-top:16px;padding:16px;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;display:none">
      <div style="font-size:13px;color:var(--text-muted)" id="calc-breakdown"></div>
      <div style="font-size:20px;font-weight:700;margin-top:8px" id="calc-total"></div>
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-accent" id="calc-btn" style="background:var(--accent)">Calculate</button><button class="btn btn-primary" id="gen-pay-btn" style="display:none">Generate Payment</button>`);

  let calcResult = null;
  $('#calc-btn').onclick = () => {
    const infId = parseInt($('#calc-inf').value);
    if (!infId) return toast('Select an influencer', 'error');
    const inf = influencers.find(i => i.id === infId);
    const infPosts = posts.filter(p => p.influencer_id === infId);
    if (!infPosts.length) return toast('No tracked posts for this influencer', 'error');

    const totalViews = infPosts.reduce((s,p) => s + (p.views || 0), 0);
    const totalReposts = infPosts.reduce((s,p) => s + (p.reposts || 0), 0);
    const totalForwards = infPosts.reduce((s,p) => s + (p.forwards || 0), 0);
    const baseRate = parseFloat(inf?.rate) || 0;
    const viewRate = parseFloat($('#calc-view-rate').value) || 0;
    const repostRate = parseFloat($('#calc-repost-rate').value) || 0;
    const fwdRate = parseFloat($('#calc-fwd-rate').value) || 0;

    const viewBonus = (totalViews / 10000) * viewRate;
    const repostBonus = (totalReposts / 1000) * repostRate;
    const fwdBonus = (totalForwards / 1000) * fwdRate;
    const perfBonus = viewBonus + repostBonus + fwdBonus;
    const total = baseRate + perfBonus;

    calcResult = { infId, baseRate, perfBonus, total, totalViews, totalReposts, totalForwards, viewRate, repostRate, fwdRate };

    $('#calc-result').style.display = 'block';
    $('#calc-breakdown').innerHTML = `
      <div>${infPosts.length} posts tracked</div>
      <div>Base rate: <strong>$${baseRate.toLocaleString()}</strong></div>
      <div>View bonus: ${totalViews.toLocaleString()} views x $${viewRate}/10K = <strong>$${viewBonus.toFixed(2)}</strong></div>
      <div>Repost bonus: ${totalReposts.toLocaleString()} reposts x $${repostRate}/1K = <strong>$${repostBonus.toFixed(2)}</strong></div>
      <div>Forward bonus: ${totalForwards.toLocaleString()} forwards x $${fwdRate}/1K = <strong>$${fwdBonus.toFixed(2)}</strong></div>
    `;
    $('#calc-total').innerHTML = `Total: <span style="color:var(--success)">$${total.toFixed(2)}</span>`;
    $('#gen-pay-btn').style.display = '';
  };

  $('#gen-pay-btn').onclick = async () => {
    if (!calcResult) return;
    await sb.from('influencer_payments').insert({
      influencer_id: calcResult.infId,
      type: 'campaign',
      base_amount: calcResult.baseRate,
      performance_bonus: calcResult.perfBonus,
      total_amount: calcResult.total,
      total_views: calcResult.totalViews,
      total_reposts: calcResult.totalReposts,
      total_forwards: calcResult.totalForwards,
      rate_per_10k_views: calcResult.viewRate,
      rate_per_1k_reposts: calcResult.repostRate,
      rate_per_1k_forwards: calcResult.fwdRate,
      status: 'pending',
    });
    closeModal();
    toast('Performance payment generated', 'success');
    await logActivity('influencer_payment', 'Generated performance-based payment');
    infActiveTab = 'payments';
    navigate('influencers');
  };
};

window.markPaymentPaid = async function(id) {
  await sb.from('influencer_payments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
  toast('Marked as paid', 'success');
  infActiveTab = 'payments';
  navigate('influencers');
};

window.deletePayment = function(id) {
  openConfirm('Delete Payment', 'Delete this payment record?', async () => {
    await sb.from('influencer_payments').delete().eq('id', id);
    toast('Deleted', 'success');
    infActiveTab = 'payments';
    navigate('influencers');
  });
};

// ---- TAB: Interactions (CRM Timeline) ----
async function renderInfInteractions(container) {
  const [interactionsRes, influencersRes] = await Promise.all([
    sb.from('influencer_interactions').select('*').order('created_at', { ascending: false }),
    sb.from('influencers').select('id,name,handle'),
  ]);
  const interactions = interactionsRes.data || [];
  const influencers = influencersRes.data || [];
  const infMap = {};
  influencers.forEach(i => infMap[i.id] = i);

  const typeIcons = { dm: 'message-circle', email: 'mail', call: 'phone', meeting: 'calendar', gift: 'gift', sample: 'package', note: 'file-text' };
  const typeColors = { dm: '#3b82f6', email: '#8b5cf6', call: '#22c55e', meeting: '#f59e0b', gift: '#ec4899', sample: '#f97316', note: '#94a3b8' };

  container.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-label">Total Interactions</div><div class="kpi-value">${interactions.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">This Week</div><div class="kpi-value">${interactions.filter(i => new Date(i.created_at) > new Date(Date.now() - 7 * 86400000)).length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Gifts/Samples Sent</div><div class="kpi-value">${interactions.filter(i => i.type === 'gift' || i.type === 'sample').length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Meetings</div><div class="kpi-value">${interactions.filter(i => i.type === 'meeting').length}</div></div>
    </div>
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Filter interactions..." id="int-filter"></div>
      <select class="form-select" style="width:140px" id="int-type-filter">
        <option value="">All Types</option>
        ${Object.keys(typeIcons).map(t => `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
      </select>
      <div style="margin-left:auto">
        ${canEdit() ? '<button class="btn btn-primary btn-sm" id="new-int-btn"><i data-lucide="plus"></i> Log Interaction</button>' : ''}
      </div>
    </div>
    <div id="interactions-list" style="display:flex;flex-direction:column;gap:8px;margin-top:16px">
      ${interactions.map(int => {
        const inf = infMap[int.influencer_id];
        return `<div class="interaction-card" style="display:flex;gap:16px;padding:16px;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;align-items:flex-start">
          <div style="width:36px;height:36px;border-radius:50%;background:${typeColors[int.type] || '#666'}20;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i data-lucide="${typeIcons[int.type] || 'file-text'}" style="width:16px;height:16px;color:${typeColors[int.type] || '#666'}"></i>
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div><strong>${inf?.name || 'Unknown'}</strong> ${inf?.handle ? `<a href="${socialProfileUrl(inf.platform, inf.handle)}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none;font-size:12px">@${inf.handle.replace(/^@/,'')}</a>` : ''}</div>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:12px;color:var(--text-muted)">${formatDateTime(int.created_at)}</span>
                ${badgeHTML(int.type)}
              </div>
            </div>
            ${int.subject ? `<div style="font-weight:500;margin-top:4px">${escapeHtml(int.subject)}</div>` : ''}
            ${int.notes ? `<div style="color:var(--text-muted);font-size:13px;margin-top:4px">${escapeHtml(int.notes)}</div>` : ''}
          </div>
          <button class="btn-icon btn-ghost" onclick="deleteInteraction('${int.id}')" style="flex-shrink:0"><i data-lucide="trash-2"></i></button>
        </div>`;
      }).join('')}
      ${!interactions.length ? '<div class="empty-state" style="padding:48px;text-align:center"><i data-lucide="message-circle" style="width:48px;height:48px;color:var(--text-muted)"></i><h4>No interactions logged</h4><p style="color:var(--text-muted)">Log DMs, calls, meetings, gifts, and more to build your relationship history.</p></div>' : ''}
    </div>
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });

  const allCards = $$('.interaction-card', container);
  $('#int-filter')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    allCards.forEach(c => { c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none'; });
  });
  $('#int-type-filter')?.addEventListener('change', (e) => {
    const cards = $$('.interaction-card', container);
    const t = e.target.value;
    // Re-filter based on type badge text
    interactions.forEach((int, idx) => {
      if (cards[idx]) cards[idx].style.display = (!t || int.type === t) ? '' : 'none';
    });
  });

  if ($('#new-int-btn')) $('#new-int-btn').onclick = () => logInteraction(influencers);
};

window.logInteraction = function(influencers) {
  openModal('Log Interaction', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Influencer</label>
        <select class="form-select" id="li-inf">
          <option value="">Select...</option>
          ${influencers.map(i => `<option value="${i.id}">${i.name} ${i.handle ? '(@' + i.handle.replace(/^@/,'') + ')' : ''}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Type</label>
        <select class="form-select" id="li-type">
          <option value="dm">DM</option>
          <option value="email">Email</option>
          <option value="call">Call</option>
          <option value="meeting">Meeting</option>
          <option value="gift">Gift Sent</option>
          <option value="sample">Sample Sent</option>
          <option value="note">Note</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label class="form-label">Subject</label><input class="form-input" id="li-subject" placeholder="Brief subject line"></div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="li-notes" rows="3" placeholder="Details about this interaction..."></textarea></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-li-btn">Log</button>`);

  $('#save-li-btn').onclick = async () => {
    const infId = parseInt($('#li-inf').value);
    if (!infId) return toast('Select an influencer', 'error');
    await sb.from('influencer_interactions').insert({
      influencer_id: infId,
      type: $('#li-type').value,
      subject: $('#li-subject').value,
      notes: $('#li-notes').value,
      employee_id: currentUser?.id,
    });
    // Update last_contacted on the influencer
    await sb.from('influencers').update({ last_contacted: new Date().toISOString() }).eq('id', infId);
    closeModal();
    toast('Interaction logged', 'success');
    await logActivity('influencer_interaction', `Logged ${$('#li-type').value} interaction`);
    infActiveTab = 'interactions';
    navigate('influencers');
  };
};

window.deleteInteraction = function(id) {
  openConfirm('Delete Interaction', 'Remove this interaction?', async () => {
    await sb.from('influencer_interactions').delete().eq('id', id);
    toast('Deleted', 'success');
    infActiveTab = 'interactions';
    navigate('influencers');
  });
};

// ---- TAB: Outreach ----
async function renderInfOutreach(container) {
  const [templatesRes, logRes, influencersRes] = await Promise.all([
    sb.from('outreach_templates').select('*').order('created_at'),
    sb.from('outreach_log').select('*').order('sent_at', { ascending: false }).limit(100),
    sb.from('influencers').select('id,name,handle,email,phone,platform,pipeline_stage'),
  ]);
  const templates = templatesRes.data || [];
  const logs = logRes.data || [];
  const influencers = influencersRes.data || [];
  const infMap = {};
  influencers.forEach(i => infMap[i.id] = i);

  const sent7d = logs.filter(l => new Date(l.sent_at) > new Date(Date.now() - 7 * 86400000)).length;
  const replied = logs.filter(l => l.status === 'replied').length;
  const replyRate = logs.length ? ((replied / logs.length) * 100).toFixed(1) : '0';

  let outreachView = 'compose'; // compose, templates, history, bulk

  function renderOutreach() {
    container.innerHTML = `
      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
        <div class="kpi-card"><div class="kpi-label">Total Sent</div><div class="kpi-value">${logs.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">Sent This Week</div><div class="kpi-value">${sent7d}</div></div>
        <div class="kpi-card"><div class="kpi-label">Replies</div><div class="kpi-value" style="color:var(--success)">${replied}</div></div>
        <div class="kpi-card"><div class="kpi-label">Reply Rate</div><div class="kpi-value">${replyRate}%</div></div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:20px">
        ${['compose','templates','history','bulk'].map(v => `<button class="btn ${outreachView === v ? 'btn-primary' : 'btn-secondary'} btn-sm" data-ov="${v}">${v === 'compose' ? '✉️ Compose' : v === 'templates' ? '📋 Templates' : v === 'history' ? '📊 History' : '📨 Bulk Outreach'}</button>`).join('')}
      </div>
      <div id="outreach-content"></div>
    `;
    lucide.createIcons({ nameAttr: 'data-lucide' });
    $$('[data-ov]', container).forEach(btn => btn.onclick = () => { outreachView = btn.dataset.ov; renderOutreach(); });

    const oc = $('#outreach-content');
    if (outreachView === 'compose') renderCompose(oc);
    else if (outreachView === 'templates') renderTemplates(oc);
    else if (outreachView === 'history') renderHistory(oc);
    else if (outreachView === 'bulk') renderBulk(oc);
  }

  function mergeVars(text, inf) {
    return (text || '')
      .replace(/\{\{name\}\}/g, inf?.name || '')
      .replace(/\{\{handle\}\}/g, inf?.handle ? '@' + inf.handle.replace(/^@/, '') : '')
      .replace(/\{\{brand\}\}/g, '{{brand}}') // will be replaced by settings
      .replace(/\{\{sender_name\}\}/g, currentUser?.name || '')
      .replace(/\{\{rate\}\}/g, inf?.rate ? '$' + Number(inf.rate).toLocaleString() : 'TBD');
  }

  // --- Compose ---
  function renderCompose(oc) {
    const emailTemplates = templates.filter(t => t.channel === 'email');
    const smsTemplates = templates.filter(t => t.channel === 'sms');
    const dmTemplates = templates.filter(t => t.channel === 'dm');

    oc.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px">
        <div class="card" style="padding:20px">
          <h3 style="display:flex;align-items:center;gap:8px;margin-bottom:16px"><i data-lucide="mail" style="width:18px;height:18px;color:var(--accent)"></i> Send Email</h3>
          <div class="form-group"><label class="form-label">To (Influencer)</label>
            <select class="form-select" id="oc-email-inf">
              <option value="">Select influencer...</option>
              ${influencers.filter(i => i.email).map(i => `<option value="${i.id}">${i.name} — ${i.email}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Template</label>
            <select class="form-select" id="oc-email-tpl">
              <option value="">Custom message...</option>
              ${emailTemplates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Subject</label><input class="form-input" id="oc-email-subject"></div>
          <div class="form-group"><label class="form-label">Message</label><textarea class="form-textarea" id="oc-email-body" rows="6"></textarea></div>
          <button class="btn btn-primary btn-sm" id="oc-send-email"><i data-lucide="send" style="width:14px;height:14px"></i> Send Email</button>
        </div>

        <div class="card" style="padding:20px">
          <h3 style="display:flex;align-items:center;gap:8px;margin-bottom:16px"><i data-lucide="smartphone" style="width:18px;height:18px;color:var(--success)"></i> Send SMS</h3>
          <div class="form-group"><label class="form-label">To (Influencer)</label>
            <select class="form-select" id="oc-sms-inf">
              <option value="">Select influencer...</option>
              ${influencers.filter(i => i.phone).map(i => `<option value="${i.id}">${i.name} — ${i.phone}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Template</label>
            <select class="form-select" id="oc-sms-tpl">
              <option value="">Custom message...</option>
              ${smsTemplates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Message</label><textarea class="form-textarea" id="oc-sms-body" rows="4"></textarea></div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px"><span id="oc-sms-chars">0</span>/160 characters</div>
          <button class="btn btn-primary btn-sm" id="oc-send-sms" style="background:var(--success)"><i data-lucide="send" style="width:14px;height:14px"></i> Send SMS</button>
        </div>

        <div class="card" style="padding:20px">
          <h3 style="display:flex;align-items:center;gap:8px;margin-bottom:16px"><i data-lucide="message-circle" style="width:18px;height:18px;color:#e1306c"></i> DM Script</h3>
          <div class="form-group"><label class="form-label">Influencer</label>
            <select class="form-select" id="oc-dm-inf">
              <option value="">Select influencer...</option>
              ${influencers.filter(i => i.handle).map(i => `<option value="${i.id}">${i.name} — @${(i.handle||'').replace(/^@/,'')}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Template</label>
            <select class="form-select" id="oc-dm-tpl">
              <option value="">Custom message...</option>
              ${dmTemplates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Message</label><textarea class="form-textarea" id="oc-dm-body" rows="4"></textarea></div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary btn-sm" id="oc-copy-dm" style="background:#e1306c"><i data-lucide="copy" style="width:14px;height:14px"></i> Copy Message</button>
            <button class="btn btn-secondary btn-sm" id="oc-open-profile"><i data-lucide="external-link" style="width:14px;height:14px"></i> Open Profile</button>
          </div>
        </div>
      </div>
    `;
    lucide.createIcons({ nameAttr: 'data-lucide' });

    // Template auto-fill for email
    $('#oc-email-tpl').onchange = () => {
      const tpl = templates.find(t => t.id == $('#oc-email-tpl').value);
      const inf = infMap[parseInt($('#oc-email-inf').value)];
      if (tpl) {
        $('#oc-email-subject').value = mergeVars(tpl.subject, inf);
        $('#oc-email-body').value = mergeVars(tpl.body, inf).replace(/<[^>]*>/g, '');
      }
    };
    $('#oc-email-inf').onchange = () => { if ($('#oc-email-tpl').value) $('#oc-email-tpl').dispatchEvent(new Event('change')); };

    // Template auto-fill for SMS
    $('#oc-sms-tpl').onchange = () => {
      const tpl = templates.find(t => t.id == $('#oc-sms-tpl').value);
      const inf = infMap[parseInt($('#oc-sms-inf').value)];
      if (tpl) $('#oc-sms-body').value = mergeVars(tpl.body, inf);
    };
    $('#oc-sms-inf').onchange = () => { if ($('#oc-sms-tpl').value) $('#oc-sms-tpl').dispatchEvent(new Event('change')); };
    $('#oc-sms-body').oninput = () => { $('#oc-sms-chars').textContent = $('#oc-sms-body').value.length; };

    // Template auto-fill for DM
    $('#oc-dm-tpl').onchange = () => {
      const tpl = templates.find(t => t.id == $('#oc-dm-tpl').value);
      const inf = infMap[parseInt($('#oc-dm-inf').value)];
      if (tpl) $('#oc-dm-body').value = mergeVars(tpl.body, inf);
    };
    $('#oc-dm-inf').onchange = () => { if ($('#oc-dm-tpl').value) $('#oc-dm-tpl').dispatchEvent(new Event('change')); };

    // Send Email
    $('#oc-send-email').onclick = async () => {
      const infId = parseInt($('#oc-email-inf').value);
      const inf = infMap[infId];
      if (!inf?.email) return toast('Select an influencer with email', 'error');
      const subject = $('#oc-email-subject').value;
      const body = $('#oc-email-body').value;
      if (!subject || !body) return toast('Subject and message required', 'error');

      $('#oc-send-email').disabled = true;
      $('#oc-send-email').textContent = 'Sending...';
      try {
        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: inf.email, subject, body: body.replace(/\n/g, '<br>') }),
        });
        const result = await res.json();
        if (result.error) throw new Error(result.error);

        await sb.from('outreach_log').insert({
          influencer_id: infId, channel: 'email', recipient: inf.email,
          subject, body, status: 'sent', sent_by: currentUser?.id,
          template_id: parseInt($('#oc-email-tpl').value) || null,
        });
        await sb.from('influencers').update({ last_contacted: new Date().toISOString() }).eq('id', infId);
        await sb.from('influencer_interactions').insert({
          influencer_id: infId, type: 'email', subject,
          notes: `Sent outreach email: ${subject}`, employee_id: currentUser?.id,
        });
        toast('Email sent!', 'success');
        await logActivity('influencer_outreach', `Sent email to ${inf.name}`);
      } catch (err) {
        toast('Failed: ' + err.message, 'error');
        await sb.from('outreach_log').insert({
          influencer_id: infId, channel: 'email', recipient: inf.email,
          subject, body, status: 'failed', sent_by: currentUser?.id, error_message: err.message,
        });
      }
      $('#oc-send-email').disabled = false;
      $('#oc-send-email').innerHTML = '<i data-lucide="send" style="width:14px;height:14px"></i> Send Email';
      lucide.createIcons({ nameAttr: 'data-lucide' });
    };

    // Send SMS
    $('#oc-send-sms').onclick = async () => {
      const infId = parseInt($('#oc-sms-inf').value);
      const inf = infMap[infId];
      if (!inf?.phone) return toast('Select an influencer with phone', 'error');
      const body = $('#oc-sms-body').value;
      if (!body) return toast('Message required', 'error');

      $('#oc-send-sms').disabled = true;
      $('#oc-send-sms').textContent = 'Sending...';
      try {
        const res = await fetch('/api/sms?action=send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: inf.phone, body }),
        });
        const result = await res.json();
        if (result.error) throw new Error(result.error);

        await sb.from('outreach_log').insert({
          influencer_id: infId, channel: 'sms', recipient: inf.phone,
          body, status: 'sent', sent_by: currentUser?.id,
          template_id: parseInt($('#oc-sms-tpl').value) || null,
        });
        await sb.from('influencers').update({ last_contacted: new Date().toISOString() }).eq('id', infId);
        await sb.from('influencer_interactions').insert({
          influencer_id: infId, type: 'dm', subject: 'SMS Outreach',
          notes: `Sent SMS: ${body.substring(0, 100)}...`, employee_id: currentUser?.id,
        });
        toast('SMS sent!', 'success');
        await logActivity('influencer_outreach', `Sent SMS to ${inf.name}`);
      } catch (err) {
        toast('Failed: ' + err.message, 'error');
      }
      $('#oc-send-sms').disabled = false;
      $('#oc-send-sms').innerHTML = '<i data-lucide="send" style="width:14px;height:14px"></i> Send SMS';
      lucide.createIcons({ nameAttr: 'data-lucide' });
    };

    // Copy DM
    $('#oc-copy-dm').onclick = async () => {
      const infId = parseInt($('#oc-dm-inf').value);
      const inf = infMap[infId];
      const body = $('#oc-dm-body').value;
      if (!body) return toast('Write a message first', 'error');

      try { await navigator.clipboard.writeText(body); } catch { /* fallback */ }
      toast('DM copied to clipboard!', 'success');

      if (infId) {
        await sb.from('outreach_log').insert({
          influencer_id: infId, channel: 'dm_copy', body, status: 'sent',
          sent_by: currentUser?.id, template_id: parseInt($('#oc-dm-tpl').value) || null,
        });
        await sb.from('influencer_interactions').insert({
          influencer_id: infId, type: 'dm', subject: 'DM Outreach',
          notes: `Copied DM script: ${body.substring(0, 100)}...`, employee_id: currentUser?.id,
        });
      }
    };

    // Open profile
    $('#oc-open-profile').onclick = () => {
      const inf = infMap[parseInt($('#oc-dm-inf').value)];
      if (!inf?.handle) return toast('Select an influencer', 'error');
      window.open(socialProfileUrl(inf.platform, inf.handle), '_blank');
    };
  }

  // --- Templates ---
  function renderTemplates(oc) {
    const channelFilter = { email: '📧 Email', sms: '💬 SMS', dm: '📱 DM' };
    oc.innerHTML = `
      <div class="table-toolbar">
        <div style="font-weight:600">Outreach Templates</div>
        <div style="margin-left:auto">
          ${canEdit() ? '<button class="btn btn-primary btn-sm" id="new-tpl-btn"><i data-lucide="plus"></i> New Template</button>' : ''}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(350px,1fr));gap:12px;margin-top:16px">
        ${templates.map(t => `
          <div class="card" style="padding:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <div><strong>${escapeHtml(t.name)}</strong></div>
              <div style="display:flex;gap:4px">${badgeHTML(t.channel)} ${badgeHTML(t.category)}</div>
            </div>
            ${t.subject ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Subject: ${escapeHtml(t.subject)}</div>` : ''}
            <div style="font-size:13px;color:var(--text-muted);max-height:80px;overflow:hidden">${escapeHtml(t.body?.replace(/<[^>]*>/g, '').substring(0, 200))}...</div>
            <div style="display:flex;gap:8px;margin-top:12px">
              <button class="btn btn-secondary btn-sm" onclick="editOutreachTemplate('${t.id}')">Edit</button>
              <button class="btn btn-ghost btn-sm" onclick="deleteOutreachTemplate('${t.id}')"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
            </div>
          </div>
        `).join('')}
        ${!templates.length ? '<div class="empty-state"><p>No templates yet. Create one to speed up outreach.</p></div>' : ''}
      </div>
    `;
    lucide.createIcons({ nameAttr: 'data-lucide' });
    if ($('#new-tpl-btn')) $('#new-tpl-btn').onclick = () => editOutreachTemplate(null);
  }

  // --- History ---
  function renderHistory(oc) {
    oc.innerHTML = `
      <div class="table-wrapper"><table>
        <thead><tr>
          <th>Influencer</th><th>Channel</th><th>Recipient</th><th>Subject/Preview</th><th>Status</th><th>Sent By</th><th>Date</th>
        </tr></thead>
        <tbody>${logs.map(l => {
          const inf = infMap[l.influencer_id];
          return `<tr>
            <td><strong>${inf?.name || 'Unknown'}</strong></td>
            <td>${badgeHTML(l.channel)}</td>
            <td style="font-size:12px">${l.recipient || '—'}</td>
            <td style="font-size:12px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.subject || l.body?.substring(0, 60) || '—'}</td>
            <td>${badgeHTML(l.status)}</td>
            <td>${employeeName(l.sent_by)}</td>
            <td>${formatDateTime(l.sent_at)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      ${!logs.length ? '<div class="empty-state" style="padding:48px;text-align:center"><p>No outreach messages sent yet.</p></div>' : ''}
    `;
  }

  // --- Bulk Outreach ---
  function renderBulk(oc) {
    const emailTemplates = templates.filter(t => t.channel === 'email');
    const withEmail = influencers.filter(i => i.email);
    const stages = ['prospect', 'outreach', 'negotiation', 'contracted', 'completed'];
    let bulkSelected = new Set();

    oc.innerHTML = `
      <div class="card" style="padding:20px;margin-bottom:16px">
        <h3 style="margin-bottom:12px">Bulk Email Outreach</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">Select influencers by stage filter or individually, pick a template, and send personalized emails to all of them at once.</p>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Filter by Stage</label>
            <select class="form-select" id="bulk-stage-filter">
              <option value="">All stages</option>
              ${stages.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Email Template</label>
            <select class="form-select" id="bulk-tpl">
              <option value="">Select template...</option>
              ${emailTemplates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="bulk-preview" style="display:none;padding:12px;background:var(--bg);border-radius:8px;margin-bottom:16px;font-size:13px"></div>
      </div>
      <div class="table-wrapper"><table>
        <thead><tr>
          <th style="width:36px"><input type="checkbox" id="bulk-select-all"></th>
          <th>Name</th><th>Email</th><th>Stage</th><th>Platform</th>
        </tr></thead>
        <tbody id="bulk-tbody">${withEmail.map(i => `<tr data-stage="${i.pipeline_stage}">
          <td><input type="checkbox" class="bulk-cb" value="${i.id}"></td>
          <td><strong>${i.name}</strong></td>
          <td style="font-size:12px">${i.email}</td>
          <td>${badgeHTML(i.pipeline_stage)}</td>
          <td>${i.platform || '—'}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center">
        <span id="bulk-count" style="color:var(--text-muted)">0 selected</span>
        <button class="btn btn-primary" id="bulk-send-btn" disabled><i data-lucide="send"></i> Send to Selected</button>
      </div>
    `;
    lucide.createIcons({ nameAttr: 'data-lucide' });

    // Stage filter
    $('#bulk-stage-filter').onchange = () => {
      const stage = $('#bulk-stage-filter').value;
      $$('#bulk-tbody tr').forEach(tr => {
        tr.style.display = (!stage || tr.dataset.stage === stage) ? '' : 'none';
      });
    };

    // Template preview
    $('#bulk-tpl').onchange = () => {
      const tpl = templates.find(t => t.id == $('#bulk-tpl').value);
      if (tpl) {
        $('#bulk-preview').style.display = '';
        $('#bulk-preview').innerHTML = `<strong>Subject:</strong> ${escapeHtml(tpl.subject || '(none)')}<br><strong>Preview:</strong> ${escapeHtml(tpl.body?.replace(/<[^>]*>/g, '').substring(0, 200))}...<br><div style="margin-top:4px;font-size:11px;color:var(--accent)">Merge tags ({{name}}, {{handle}}, etc.) will be personalized per influencer.</div>`;
      } else {
        $('#bulk-preview').style.display = 'none';
      }
    };

    // Checkboxes
    function updateBulkCount() {
      $('#bulk-count').textContent = `${bulkSelected.size} selected`;
      $('#bulk-send-btn').disabled = !bulkSelected.size || !$('#bulk-tpl').value;
    }
    $$('.bulk-cb').forEach(cb => {
      cb.onchange = () => { if (cb.checked) bulkSelected.add(cb.value); else bulkSelected.delete(cb.value); updateBulkCount(); };
    });
    $('#bulk-select-all').onchange = () => {
      const checked = $('#bulk-select-all').checked;
      $$('.bulk-cb').forEach(cb => {
        if (cb.closest('tr').style.display !== 'none') {
          cb.checked = checked;
          if (checked) bulkSelected.add(cb.value); else bulkSelected.delete(cb.value);
        }
      });
      updateBulkCount();
    };

    // Send bulk
    $('#bulk-send-btn').onclick = async () => {
      const tpl = templates.find(t => t.id == $('#bulk-tpl').value);
      if (!tpl) return toast('Select a template', 'error');
      if (!bulkSelected.size) return toast('Select influencers', 'error');

      const count = bulkSelected.size;
      openConfirm('Send Bulk Emails', `Send personalized emails to ${count} influencer(s) using the "${tpl.name}" template?`, async () => {
        let sent = 0, failed = 0;
        for (const id of bulkSelected) {
          const inf = infMap[parseInt(id)];
          if (!inf?.email) { failed++; continue; }
          const subject = mergeVars(tpl.subject, inf);
          const body = mergeVars(tpl.body, inf);
          try {
            const res = await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to: inf.email, subject, body }),
            });
            const result = await res.json();
            if (result.error) throw new Error(result.error);
            await sb.from('outreach_log').insert({
              influencer_id: inf.id, channel: 'email', recipient: inf.email,
              subject, body, status: 'sent', sent_by: currentUser?.id, template_id: tpl.id,
            });
            await sb.from('influencers').update({ last_contacted: new Date().toISOString() }).eq('id', inf.id);
            sent++;
          } catch (err) {
            failed++;
            await sb.from('outreach_log').insert({
              influencer_id: inf.id, channel: 'email', recipient: inf.email,
              subject, body, status: 'failed', sent_by: currentUser?.id, error_message: err.message,
            });
          }
        }
        toast(`Sent: ${sent}, Failed: ${failed}`, sent > 0 ? 'success' : 'error');
        await logActivity('bulk_outreach', `Bulk email sent to ${sent} influencers`);
        infActiveTab = 'outreach';
        navigate('influencers');
      });
    };
  }

  renderOutreach();
}

// Template CRUD
window.editOutreachTemplate = async function(id) {
  let tpl = {};
  if (id) {
    const { data } = await sb.from('outreach_templates').select('*').eq('id', id).single();
    tpl = data || {};
  }
  openModal(id ? 'Edit Template' : 'New Outreach Template', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Template Name</label><input class="form-input" id="tpl-name" value="${tpl.name || ''}"></div>
      <div class="form-group"><label class="form-label">Channel</label>
        <select class="form-select" id="tpl-channel">
          ${['email', 'sms', 'dm'].map(c => `<option value="${c}" ${tpl.channel === c ? 'selected' : ''}>${c.toUpperCase()}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Category</label>
        <select class="form-select" id="tpl-category">
          ${['initial_outreach', 'follow_up', 'collaboration', 'gifting', 'thank_you', 're_engage', 'general'].map(c => `<option value="${c}" ${tpl.category === c ? 'selected' : ''}>${c.replace(/_/g, ' ')}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group" id="tpl-subject-wrap"><label class="form-label">Subject (email only)</label><input class="form-input" id="tpl-subject" value="${tpl.subject || ''}"></div>
    <div class="form-group"><label class="form-label">Message Body</label><textarea class="form-textarea" id="tpl-body" rows="6">${tpl.body || ''}</textarea></div>
    <div style="font-size:11px;color:var(--text-muted)">Merge tags: <code>{{name}}</code> <code>{{handle}}</code> <code>{{brand}}</code> <code>{{sender_name}}</code> <code>{{rate}}</code></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-tpl-btn">Save</button>`);

  $('#tpl-channel').onchange = () => {
    $('#tpl-subject-wrap').style.display = $('#tpl-channel').value === 'email' ? '' : 'none';
  };
  $('#tpl-channel').dispatchEvent(new Event('change'));

  $('#save-tpl-btn').onclick = async () => {
    const obj = {
      name: $('#tpl-name').value,
      channel: $('#tpl-channel').value,
      category: $('#tpl-category').value,
      subject: $('#tpl-subject').value || null,
      body: $('#tpl-body').value,
      created_by: currentUser?.id,
      updated_at: new Date().toISOString(),
    };
    if (!obj.name || !obj.body) return toast('Name and body required', 'error');
    if (id) {
      await sb.from('outreach_templates').update(obj).eq('id', id);
    } else {
      await sb.from('outreach_templates').insert(obj);
    }
    closeModal();
    toast(id ? 'Template updated' : 'Template created', 'success');
    infActiveTab = 'outreach';
    navigate('influencers');
  };
};

window.deleteOutreachTemplate = function(id) {
  openConfirm('Delete Template', 'Are you sure?', async () => {
    await sb.from('outreach_templates').delete().eq('id', id);
    toast('Deleted', 'success');
    infActiveTab = 'outreach';
    navigate('influencers');
  });
};

// Quick-contact modals (from pipeline row)
window.quickEmail = async function(id) {
  const { data: inf } = await sb.from('influencers').select('*').eq('id', id).single();
  if (!inf?.email) {
    openModal(`Add Email for ${inf?.name || 'Influencer'}`, `
      <p style="color:var(--text-muted);margin-bottom:16px">This influencer doesn't have an email on file. Add one to send them a message.</p>
      <div class="form-group"><label class="form-label">Email Address</label><input class="form-input" id="add-email-input" type="email" placeholder="name@example.com"></div>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="add-email-save">Save & Compose</button>`);
    $('#add-email-save').onclick = async () => {
      const email = $('#add-email-input').value.trim();
      if (!email) return toast('Enter an email', 'error');
      await sb.from('influencers').update({ email }).eq('id', id);
      closeModal();
      toast('Email saved', 'success');
      quickEmail(id);
    };
    return;
  }
  const { data: templates } = await sb.from('outreach_templates').select('*').eq('channel', 'email').order('created_at');
  const tpls = templates || [];

  openModal(`Email ${inf.name}`, `
    <div class="form-group"><label class="form-label">To</label><input class="form-input" value="${inf.email}" readonly></div>
    <div class="form-group"><label class="form-label">Template</label>
      <select class="form-select" id="qe-tpl">
        <option value="">Custom...</option>
        ${tpls.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label class="form-label">Subject</label><input class="form-input" id="qe-subject"></div>
    <div class="form-group"><label class="form-label">Message</label><textarea class="form-textarea" id="qe-body" rows="5"></textarea></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="qe-send"><i data-lucide="send"></i> Send</button>`);
  lucide.createIcons({ nameAttr: 'data-lucide' });

  const mergeVarsLocal = (text) => (text || '').replace(/\{\{name\}\}/g, inf.name || '').replace(/\{\{handle\}\}/g, inf.handle ? '@' + inf.handle.replace(/^@/,'') : '').replace(/\{\{sender_name\}\}/g, currentUser?.name || '').replace(/\{\{brand\}\}/g, '').replace(/\{\{rate\}\}/g, inf.rate ? '$' + Number(inf.rate).toLocaleString() : 'TBD');
  $('#qe-tpl').onchange = () => {
    const tpl = tpls.find(t => t.id == $('#qe-tpl').value);
    if (tpl) { $('#qe-subject').value = mergeVarsLocal(tpl.subject); $('#qe-body').value = mergeVarsLocal(tpl.body?.replace(/<[^>]*>/g, '')); }
  };

  $('#qe-send').onclick = async () => {
    const subject = $('#qe-subject').value;
    const body = $('#qe-body').value;
    if (!subject || !body) return toast('Subject and message required', 'error');
    $('#qe-send').disabled = true;
    try {
      const res = await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: inf.email, subject, body: body.replace(/\n/g, '<br>') }) });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      await sb.from('outreach_log').insert({ influencer_id: inf.id, channel: 'email', recipient: inf.email, subject, body, status: 'sent', sent_by: currentUser?.id });
      await sb.from('influencers').update({ last_contacted: new Date().toISOString() }).eq('id', inf.id);
      await sb.from('influencer_interactions').insert({ influencer_id: inf.id, type: 'email', subject, notes: `Sent: ${subject}`, employee_id: currentUser?.id });
      closeModal(); toast('Email sent!', 'success');
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    $('#qe-send').disabled = false;
  };
};

window.quickSMS = async function(id) {
  const { data: inf } = await sb.from('influencers').select('*').eq('id', id).single();
  if (!inf?.phone) {
    openModal(`Add Phone for ${inf?.name || 'Influencer'}`, `
      <p style="color:var(--text-muted);margin-bottom:16px">This influencer doesn't have a phone number on file. Add one to send them a text.</p>
      <div class="form-group"><label class="form-label">Phone Number</label><input class="form-input" id="add-phone-input" type="tel" placeholder="+1 (555) 123-4567"></div>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="add-phone-save">Save & Compose</button>`);
    $('#add-phone-save').onclick = async () => {
      const phone = $('#add-phone-input').value.trim();
      if (!phone) return toast('Enter a phone number', 'error');
      await sb.from('influencers').update({ phone }).eq('id', id);
      closeModal();
      toast('Phone saved', 'success');
      quickSMS(id);
    };
    return;
  }

  openModal(`Text ${inf.name}`, `
    <div class="form-group"><label class="form-label">To</label><input class="form-input" value="${inf.phone}" readonly></div>
    <div class="form-group"><label class="form-label">Message</label><textarea class="form-textarea" id="qs-body" rows="4"></textarea></div>
    <div style="font-size:11px;color:var(--text-muted)"><span id="qs-chars">0</span>/160 characters</div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="qs-send" style="background:var(--success)"><i data-lucide="send"></i> Send SMS</button>`);
  lucide.createIcons({ nameAttr: 'data-lucide' });
  $('#qs-body').oninput = () => { $('#qs-chars').textContent = $('#qs-body').value.length; };

  $('#qs-send').onclick = async () => {
    const body = $('#qs-body').value;
    if (!body) return toast('Message required', 'error');
    $('#qs-send').disabled = true;
    try {
      const res = await fetch('/api/sms?action=send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: inf.phone, body }) });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      await sb.from('outreach_log').insert({ influencer_id: inf.id, channel: 'sms', recipient: inf.phone, body, status: 'sent', sent_by: currentUser?.id });
      await sb.from('influencers').update({ last_contacted: new Date().toISOString() }).eq('id', inf.id);
      await sb.from('influencer_interactions').insert({ influencer_id: inf.id, type: 'dm', subject: 'SMS', notes: `Sent SMS: ${body.substring(0, 100)}`, employee_id: currentUser?.id });
      closeModal(); toast('SMS sent!', 'success');
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    $('#qs-send').disabled = false;
  };
};

window.quickDM = async function(id) {
  const { data: inf } = await sb.from('influencers').select('*').eq('id', id).single();
  if (!inf?.handle) return toast('No handle for this influencer', 'error');
  const { data: tpls } = await sb.from('outreach_templates').select('*').eq('channel', 'dm');
  const templates = tpls || [];
  const mergeVarsLocal = (text) => (text || '').replace(/\{\{name\}\}/g, inf.name || '').replace(/\{\{handle\}\}/g, '@' + (inf.handle || '').replace(/^@/,'')).replace(/\{\{sender_name\}\}/g, currentUser?.name || '').replace(/\{\{brand\}\}/g, '');

  openModal(`DM Script for ${inf.name}`, `
    <div style="margin-bottom:12px;color:var(--text-muted);font-size:13px">Profile: <a href="${socialProfileUrl(inf.platform, inf.handle)}" target="_blank" style="color:var(--accent)">@${(inf.handle||'').replace(/^@/,'')}</a> on ${inf.platform}</div>
    <div class="form-group"><label class="form-label">Template</label>
      <select class="form-select" id="qd-tpl">
        <option value="">Custom...</option>
        ${templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label class="form-label">Message</label><textarea class="form-textarea" id="qd-body" rows="5"></textarea></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="qd-copy" style="background:#e1306c"><i data-lucide="copy"></i> Copy & Open Profile</button>`);
  lucide.createIcons({ nameAttr: 'data-lucide' });

  $('#qd-tpl').onchange = () => {
    const tpl = templates.find(t => t.id == $('#qd-tpl').value);
    if (tpl) $('#qd-body').value = mergeVarsLocal(tpl.body);
  };

  $('#qd-copy').onclick = async () => {
    const body = $('#qd-body').value;
    if (!body) return toast('Write a message first', 'error');
    try { await navigator.clipboard.writeText(body); } catch {}
    window.open(socialProfileUrl(inf.platform, inf.handle), '_blank');
    await sb.from('outreach_log').insert({ influencer_id: inf.id, channel: 'dm_copy', body, status: 'sent', sent_by: currentUser?.id });
    await sb.from('influencer_interactions').insert({ influencer_id: inf.id, type: 'dm', subject: 'DM Outreach', notes: `Copied DM: ${body.substring(0, 100)}`, employee_id: currentUser?.id });
    closeModal(); toast('Copied! Profile opened in new tab.', 'success');
  };
};

// ---- Bulk Messaging from Pipeline ----
async function openBulkInfluencerEmail(influencers) {
  const { data: tpls } = await sb.from('outreach_templates').select('*').eq('channel', 'email').order('created_at');
  const templates = tpls || [];
  const mergeVars = (text, inf) => (text || '').replace(/\{\{name\}\}/g, inf.name || '').replace(/\{\{handle\}\}/g, inf.handle ? '@' + inf.handle.replace(/^@/,'') : '').replace(/\{\{sender_name\}\}/g, currentUser?.name || '').replace(/\{\{brand\}\}/g, '').replace(/\{\{rate\}\}/g, inf.rate ? '$' + Number(inf.rate).toLocaleString() : 'TBD');

  openModal(`Email ${influencers.length} Influencers`, `
    <div class="form-group">
      <label class="form-label">To (${influencers.length} influencer${influencers.length > 1 ? 's' : ''})</label>
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:13px;max-height:100px;overflow-y:auto;line-height:1.8">
        ${influencers.map(i => `<span class="badge" style="margin:2px 4px 2px 0;font-size:11px">${i.name} &lt;${i.email}&gt;</span>`).join(' ')}
      </div>
    </div>
    <div class="form-group"><label class="form-label">Template</label>
      <select class="form-select" id="be-tpl">
        <option value="">Custom...</option>
        ${templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label class="form-label">Subject</label><input class="form-input" id="be-subject" placeholder="Subject line (merge tags: {{name}}, {{handle}})"></div>
    <div class="form-group"><label class="form-label">Message</label><textarea class="form-textarea" id="be-body" rows="8" placeholder="Write your message... Merge tags will be personalized per recipient."></textarea></div>
    <div style="font-size:12px;color:var(--text-muted)">Each email is personalized with merge tags and sent individually via SMTP.</div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="be-send"><i data-lucide="send"></i> Send All</button>`);
  lucide.createIcons({ nameAttr: 'data-lucide' });

  $('#be-tpl').onchange = () => {
    const tpl = templates.find(t => t.id == $('#be-tpl').value);
    if (tpl) {
      $('#be-subject').value = tpl.subject || '';
      $('#be-body').value = (tpl.body || '').replace(/<[^>]*>/g, '');
    }
  };

  $('#be-send').onclick = async () => {
    const subject = $('#be-subject').value.trim();
    const body = $('#be-body').value.trim();
    if (!subject || !body) return toast('Subject and message required', 'error');
    const btn = $('#be-send');
    btn.disabled = true; btn.textContent = 'Sending...';
    let sent = 0, failed = 0;
    for (const inf of influencers) {
      try {
        const personalSubject = mergeVars(subject, inf);
        const personalBody = mergeVars(body, inf).replace(/\n/g, '<br>');
        const res = await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: inf.email, subject: personalSubject, body: personalBody }) });
        const result = await res.json();
        if (result.error) throw new Error(result.error);
        await sb.from('outreach_log').insert({ influencer_id: inf.id, channel: 'email', recipient: inf.email, subject: personalSubject, body: personalBody, status: 'sent', sent_by: currentUser?.id });
        await sb.from('influencers').update({ last_contacted: new Date().toISOString() }).eq('id', inf.id);
        sent++;
      } catch { failed++; }
    }
    closeModal();
    toast(`Sent: ${sent}, Failed: ${failed}`, sent > 0 ? 'success' : 'error');
    await logActivity('bulk_email', `Bulk email to ${sent} influencers: ${subject}`);
  };
}

async function openBulkInfluencerSMS(influencers) {
  const { data: tpls } = await sb.from('outreach_templates').select('*').eq('channel', 'sms').order('created_at');
  const templates = tpls || [];
  const mergeVars = (text, inf) => (text || '').replace(/\{\{name\}\}/g, inf.name || '').replace(/\{\{handle\}\}/g, inf.handle ? '@' + inf.handle.replace(/^@/,'') : '').replace(/\{\{sender_name\}\}/g, currentUser?.name || '').replace(/\{\{brand\}\}/g, '').replace(/\{\{rate\}\}/g, inf.rate ? '$' + Number(inf.rate).toLocaleString() : 'TBD');

  openModal(`SMS ${influencers.length} Influencers`, `
    <div class="form-group">
      <label class="form-label">To (${influencers.length} influencer${influencers.length > 1 ? 's' : ''})</label>
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:13px;max-height:100px;overflow-y:auto;line-height:1.8">
        ${influencers.map(i => `<span class="badge" style="margin:2px 4px 2px 0;font-size:11px">${i.name} — ${i.phone}</span>`).join(' ')}
      </div>
    </div>
    <div class="form-group"><label class="form-label">Template</label>
      <select class="form-select" id="bs-tpl">
        <option value="">Custom...</option>
        ${templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label class="form-label">Message</label><textarea class="form-textarea" id="bs-body" rows="4" placeholder="Write your message... Merge tags will be personalized per recipient."></textarea></div>
    <div style="font-size:12px;color:var(--text-muted)"><span id="bs-chars">0</span>/160 chars — Each SMS is personalized and sent individually via Twilio.</div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="bs-send" style="background:var(--success)"><i data-lucide="send"></i> Send All</button>`);
  lucide.createIcons({ nameAttr: 'data-lucide' });

  $('#bs-body').oninput = () => { $('#bs-chars').textContent = $('#bs-body').value.length; };
  $('#bs-tpl').onchange = () => {
    const tpl = templates.find(t => t.id == $('#bs-tpl').value);
    if (tpl) $('#bs-body').value = tpl.body || '';
  };

  $('#bs-send').onclick = async () => {
    const body = $('#bs-body').value.trim();
    if (!body) return toast('Message required', 'error');
    const btn = $('#bs-send');
    btn.disabled = true; btn.textContent = 'Sending...';
    let sent = 0, failed = 0;
    for (const inf of influencers) {
      try {
        const personalBody = mergeVars(body, inf);
        const res = await fetch('/api/sms?action=send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: inf.phone, body: personalBody }) });
        const result = await res.json();
        if (result.error) throw new Error(result.error);
        await sb.from('outreach_log').insert({ influencer_id: inf.id, channel: 'sms', recipient: inf.phone, body: personalBody, status: 'sent', sent_by: currentUser?.id });
        await sb.from('influencers').update({ last_contacted: new Date().toISOString() }).eq('id', inf.id);
        sent++;
      } catch { failed++; }
    }
    closeModal();
    toast(`Sent: ${sent}, Failed: ${failed}`, sent > 0 ? 'success' : 'error');
    await logActivity('bulk_sms', `Bulk SMS to ${sent} influencers`);
  };
}

async function openBulkInfluencerDM(influencers) {
  const { data: tpls } = await sb.from('outreach_templates').select('*').eq('channel', 'dm').order('created_at');
  const templates = tpls || [];
  const mergeVars = (text, inf) => (text || '').replace(/\{\{name\}\}/g, inf.name || '').replace(/\{\{handle\}\}/g, inf.handle ? '@' + inf.handle.replace(/^@/,'') : '').replace(/\{\{sender_name\}\}/g, currentUser?.name || '').replace(/\{\{brand\}\}/g, '');

  openModal(`DM Scripts for ${influencers.length} Influencers`, `
    <div class="form-group">
      <label class="form-label">Influencers (${influencers.length})</label>
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:13px;max-height:100px;overflow-y:auto;line-height:1.8">
        ${influencers.map(i => `<span class="badge" style="margin:2px 4px 2px 0;font-size:11px">${i.name} — @${(i.handle||'').replace(/^@/,'')}</span>`).join(' ')}
      </div>
    </div>
    <div class="form-group"><label class="form-label">Template</label>
      <select class="form-select" id="bd-tpl">
        <option value="">Custom...</option>
        ${templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label class="form-label">Message Template</label><textarea class="form-textarea" id="bd-body" rows="4" placeholder="Write DM message... Merge tags personalize per influencer."></textarea></div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Click "Generate Scripts" to get personalized DM scripts for each influencer + links to their profiles.</div>
    <div id="bd-scripts"></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="bd-gen" style="background:#e1306c"><i data-lucide="copy"></i> Generate Scripts</button>`);
  lucide.createIcons({ nameAttr: 'data-lucide' });

  $('#bd-tpl').onchange = () => {
    const tpl = templates.find(t => t.id == $('#bd-tpl').value);
    if (tpl) $('#bd-body').value = tpl.body || '';
  };

  $('#bd-gen').onclick = async () => {
    const body = $('#bd-body').value.trim();
    if (!body) return toast('Write a message template first', 'error');
    const scripts = $('#bd-scripts');
    scripts.innerHTML = influencers.map(inf => {
      const msg = mergeVars(body, inf);
      return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <strong>${inf.name}</strong>
          <a href="${socialProfileUrl(inf.platform, inf.handle)}" target="_blank" class="btn btn-sm" style="background:#e1306c;color:#fff;font-size:11px">Open @${(inf.handle||'').replace(/^@/,'')} Profile</a>
        </div>
        <div style="background:var(--bg);padding:8px;border-radius:6px;font-size:13px;margin-bottom:6px">${msg}</div>
        <button class="btn btn-secondary btn-sm bd-copy" data-msg="${msg.replace(/"/g, '&quot;')}" data-id="${inf.id}" style="font-size:11px"><i data-lucide="copy" style="width:12px;height:12px"></i> Copy</button>
      </div>`;
    }).join('');
    lucide.createIcons({ nameAttr: 'data-lucide' });
    $$('.bd-copy').forEach(btn => {
      btn.onclick = async () => {
        try { await navigator.clipboard.writeText(btn.dataset.msg); } catch {}
        await sb.from('outreach_log').insert({ influencer_id: parseInt(btn.dataset.id), channel: 'dm_copy', body: btn.dataset.msg, status: 'sent', sent_by: currentUser?.id });
        btn.textContent = 'Copied!'; btn.style.color = 'var(--success)';
        setTimeout(() => { btn.innerHTML = '<i data-lucide="copy" style="width:12px;height:12px"></i> Copy'; lucide.createIcons({ nameAttr: 'data-lucide' }); }, 2000);
      };
    });
    await logActivity('bulk_dm_scripts', `Generated DM scripts for ${influencers.length} influencers`);
  };
}

// ---- Influencer Profile View ----
window.viewInfluencerProfile = async function(id) {
  const [infRes, postsRes, paymentsRes, interactionsRes, milestonesRes] = await Promise.all([
    sb.from('influencers').select('*').eq('id', id).single(),
    sb.from('influencer_posts').select('*').eq('influencer_id', id).order('posted_at', { ascending: false }),
    sb.from('influencer_payments').select('*').eq('influencer_id', id).order('created_at', { ascending: false }),
    sb.from('influencer_interactions').select('*').eq('influencer_id', id).order('created_at', { ascending: false }),
    sb.from('influencer_milestones').select('*').eq('influencer_id', id),
  ]);
  const inf = infRes.data;
  if (!inf) return toast('Influencer not found', 'error');
  const posts = postsRes.data || [];
  const payments = paymentsRes.data || [];
  const interactions = interactionsRes.data || [];
  const miles = milestonesRes.data || [];

  const totalViews = posts.reduce((s,p) => s + (p.views || 0), 0);
  const totalEng = posts.reduce((s,p) => s + (p.likes||0) + (p.comments||0) + (p.shares||0) + (p.reposts||0) + (p.forwards||0) + (p.saves||0), 0);
  const totalPaid = payments.filter(p => p.status === 'paid').reduce((s,p) => s + (parseFloat(p.total_amount) || 0), 0);
  const tier = infTier(inf.followers);
  const tags = parseJSON(inf.tags);

  openModal(`${inf.name} — Profile`, `
    <div style="display:flex;gap:20px;align-items:flex-start;margin-bottom:20px">
      <div style="width:64px;height:64px;border-radius:50%;background:${tierColor(tier)}20;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <span style="font-size:24px;font-weight:700;color:${tierColor(tier)}">${getInitials(inf.name)}</span>
      </div>
      <div style="flex:1">
        <h3 style="margin:0">${inf.name}</h3>
        <div style="color:var(--text-muted)">${inf.handle ? `<a href="${socialProfileUrl(inf.platform, inf.handle)}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none">@${inf.handle.replace(/^@/,'')}</a>` : ''} • ${inf.platform || ''} • ${inf.location || ''}</div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <span class="badge" style="background:${tierColor(tier)}20;color:${tierColor(tier)}">${tier} (${(inf.followers || 0).toLocaleString()})</span>
          ${badgeHTML(inf.pipeline_stage)}
          ${inf.engagement_rate ? `<span class="badge badge-accent">${inf.engagement_rate}% engagement</span>` : ''}
          ${tags.map(t => `<span class="badge badge-accent">${t}</span>`).join('')}
        </div>
      </div>
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-label">Posts</div><div class="kpi-value">${posts.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Views</div><div class="kpi-value">${totalViews.toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Engagement</div><div class="kpi-value">${totalEng.toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Paid</div><div class="kpi-value">$${totalPaid.toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">CPV (per 1K)</div><div class="kpi-value">${cpv(totalPaid, totalViews)}</div></div>
    </div>
    ${inf.email || inf.phone ? `<div style="margin-bottom:16px;font-size:13px;color:var(--text-muted)">${inf.email ? `<a href="mailto:${inf.email}" style="color:var(--accent)">${inf.email}</a>` : ''} ${inf.phone ? `• ${inf.phone}` : ''} ${inf.rate ? `• Rate: $${Number(inf.rate).toLocaleString()}` : ''}</div>` : ''}
    ${inf.notes ? `<div style="margin-bottom:16px;padding:12px;background:var(--bg);border-radius:8px;font-size:13px">${escapeHtml(inf.notes)}</div>` : ''}
    ${miles.length ? `<div style="margin-bottom:16px"><strong style="font-size:13px">Milestones:</strong> ${miles.map(m => `<span class="badge badge-accent" style="margin:2px">${m.label}</span>`).join('')}</div>` : ''}
    ${posts.length ? `<h4 style="margin:16px 0 8px">Recent Posts</h4>
    <div class="table-wrapper"><table style="font-size:12px">
      <thead><tr><th>Date</th><th>Type</th><th>Views</th><th>Likes</th><th>Reposts</th><th>Forwards</th></tr></thead>
      <tbody>${posts.slice(0, 10).map(p => `<tr>
        <td>${formatDate(p.posted_at)}</td>
        <td>${badgeHTML(p.post_type || 'post')}</td>
        <td>${(p.views || 0).toLocaleString()}</td>
        <td>${(p.likes || 0).toLocaleString()}</td>
        <td>${(p.reposts || 0).toLocaleString()}</td>
        <td>${(p.forwards || 0).toLocaleString()}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : ''}
    ${interactions.length ? `<h4 style="margin:16px 0 8px">Recent Interactions</h4>
    <div style="max-height:200px;overflow-y:auto">${interactions.slice(0, 10).map(int => `
      <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
        ${badgeHTML(int.type)} <strong>${int.subject || ''}</strong> <span style="color:var(--text-muted)">${formatDateTime(int.created_at)}</span>
        ${int.notes ? `<div style="color:var(--text-muted);font-size:12px;margin-top:2px">${escapeHtml(int.notes)}</div>` : ''}
      </div>
    `).join('')}</div>` : ''}
  `, `<button class="btn btn-secondary" onclick="closeModal()">Close</button>${inf.email ? `<button class="btn btn-accent btn-sm" onclick="closeModal();quickEmail('${id}')" style="background:var(--accent)"><i data-lucide="mail" style="width:14px;height:14px"></i> Email</button>` : ''}${inf.phone ? `<button class="btn btn-sm" onclick="closeModal();quickSMS('${id}')" style="background:var(--success);color:#fff"><i data-lucide="smartphone" style="width:14px;height:14px"></i> SMS</button>` : ''}${inf.handle ? `<button class="btn btn-sm" onclick="closeModal();quickDM('${id}')" style="background:#e1306c;color:#fff"><i data-lucide="message-circle" style="width:14px;height:14px"></i> DM</button>` : ''}<button class="btn btn-primary" onclick="editInfluencer('${id}')">Edit</button>`);
  lucide.createIcons({ nameAttr: 'data-lucide' });
};

// ---- Edit/Add Influencer Modal ----
window.editInfluencer = async function(id) {
  let inf = {};
  if (id) {
    const { data } = await sb.from('influencers').select('*').eq('id', id).single();
    inf = data || {};
  }
  const stages = ['prospect', 'outreach', 'negotiation', 'contracted', 'completed'];
  const categories = ['food','lifestyle','beauty','fitness','fashion','travel','tech','parenting','health','music','art','other'];
  const contentStyles = ['reels-heavy','story-heavy','photo-focused','long-form-video','live-streams','carousel','mixed'];

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
      <div class="form-group"><label class="form-label">Stage</label>
        <select class="form-select" id="inf-stage">
          ${stages.map(s => `<option value="${s}" ${inf.pipeline_stage === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Followers</label><input class="form-input" type="number" id="inf-followers" value="${inf.followers || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Base Rate ($)</label><input class="form-input" type="number" id="inf-rate" value="${inf.rate || ''}"></div>
      <div class="form-group"><label class="form-label">Category</label>
        <select class="form-select" id="inf-category">
          ${categories.map(c => `<option value="${c}" ${inf.category === c ? 'selected' : ''}>${c.charAt(0).toUpperCase() + c.slice(1)}</option>`).join('')}
        </select>
      </div>
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
    <div class="form-row">
      <div class="form-group"><label class="form-label">Content Style</label>
        <select class="form-select" id="inf-content-style">
          <option value="">Not specified</option>
          ${contentStyles.map(s => `<option value="${s}" ${inf.content_style === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Audience Quality (1-10)</label>
        <input class="form-input" type="number" min="1" max="10" id="inf-audience-quality" value="${inf.audience_quality || ''}">
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
      rate: parseFloat($('#inf-rate').value) || null,
      category: $('#inf-category').value,
      email: $('#inf-email').value,
      phone: $('#inf-phone').value,
      location: $('#inf-location').value,
      contact_owner: $('#inf-owner').value || null,
      content_style: $('#inf-content-style').value || null,
      audience_quality: parseInt($('#inf-audience-quality').value) || null,
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
  openConfirm('Delete Influencer', 'Are you sure? This will also remove related posts, payments, and interactions.', async () => {
    await Promise.all([
      sb.from('influencer_posts').delete().eq('influencer_id', id),
      sb.from('influencer_payments').delete().eq('influencer_id', id),
      sb.from('influencer_interactions').delete().eq('influencer_id', id),
      sb.from('influencer_milestones').delete().eq('influencer_id', id),
    ]);
    await sb.from('influencers').delete().eq('id', id);
    await logActivity('delete_influencer', 'Deleted an influencer and related data');
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
        ${canEdit() ? '<button class="btn btn-primary btn-sm" id="new-camp-btn"><i data-lucide="plus"></i> New Campaign</button>' : ''}
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

  let selectedMediaIds = new Set();

  function rowHTML(m) {
    const hasEmail = m.email && m.email.trim();
    return `<tr data-media-id="${m.id}">
      <td><input type="checkbox" class="media-cb" data-id="${m.id}" ${!hasEmail ? 'disabled title="No email"' : ''} ${selectedMediaIds.has(String(m.id)) ? 'checked' : ''}></td>
      <td>${m.name}</td>
      <td>${m.outlet || '—'}</td>
      <td>${badgeHTML(m.outlet_type)}</td>
      <td>${m.role || '—'}</td>
      <td>${m.beat || '—'}</td>
      <td>${hasEmail ? `<a href="mailto:${m.email}" style="color:var(--accent)">${m.email}</a>` : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>${badgeHTML(m.relationship)}</td>
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
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
          <span id="media-selected-count" style="font-size:12px;color:var(--text-muted);display:none">0 selected</span>
          <button class="btn btn-accent btn-sm" id="media-email-btn" style="display:none"><i data-lucide="send"></i> Email Selected</button>
          <button class="btn btn-secondary btn-sm" id="media-export"><i data-lucide="download"></i> Export</button>
          ${canEdit() ? '<button class="btn btn-primary btn-sm" id="new-media-btn"><i data-lucide="plus"></i> Add Contact</button>' : ''}
        </div>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th style="width:36px"><input type="checkbox" id="media-select-all" title="Select all with email"></th>
            <th data-key="name">Name</th>
            <th data-key="outlet">Outlet</th>
            <th data-key="outlet_type">Type</th>
            <th data-key="role">Role</th>
            <th data-key="beat">Beat</th>
            <th>Email</th>
            <th data-key="relationship">Relationship</th>
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
    function updateSelectionUI() {
      const count = selectedMediaIds.size;
      const countEl = $('#media-selected-count');
      const emailBtn = $('#media-email-btn');
      if (countEl) { countEl.style.display = count > 0 ? '' : 'none'; countEl.textContent = `${count} selected`; }
      if (emailBtn) emailBtn.style.display = count > 0 ? '' : 'none';
    }

    // Checkboxes
    $$('.media-cb', container).forEach(cb => cb.addEventListener('change', (e) => {
      if (e.target.checked) selectedMediaIds.add(e.target.dataset.id);
      else selectedMediaIds.delete(e.target.dataset.id);
      updateSelectionUI();
      // Update select-all state
      const allCbs = $$('.media-cb:not(:disabled)', container);
      const allChecked = allCbs.length > 0 && allCbs.every(c => c.checked);
      const selectAll = $('#media-select-all');
      if (selectAll) selectAll.checked = allChecked;
    }));

    // Select all
    $('#media-select-all')?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      $$('.media-cb:not(:disabled)', container).forEach(cb => {
        cb.checked = checked;
        if (checked) selectedMediaIds.add(cb.dataset.id);
        else selectedMediaIds.delete(cb.dataset.id);
      });
      updateSelectionUI();
    });

    // Email selected
    $('#media-email-btn')?.addEventListener('click', () => {
      const selected = items.filter(m => selectedMediaIds.has(String(m.id)) && m.email);
      if (selected.length === 0) return toast('No contacts with email selected', 'error');
      openMediaEmailCompose(selected);
    });

    updateSelectionUI();

    $('#media-filter')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      $$('#media-tbody tr').forEach(tr => tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none');
    });
    $('#media-export').onclick = () => csvExport(f, 'media_contacts');
    $('#new-media-btn')?.addEventListener('click', () => editMediaContact(null));
  }
  render();
}

window.editMediaContact = async function(id) {
  let m = {};
  if (id) {
    const { data } = await sb.from('media_contacts').select('*').eq('id', id).single();
    m = data || {};
  }
  const types = ['tv', 'newspaper', 'online', 'magazine', 'blog', 'podcast', 'radio', 'influencer'];
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

// --- Media Email Compose ---
function openMediaEmailCompose(selectedContacts) {
  const toList = selectedContacts.map(c => `${c.name} &lt;${c.email}&gt;`).join(', ');
  const toEmails = selectedContacts.map(c => c.email).join(', ');

  openModal('Compose Email to Media', `
    <div class="form-group">
      <label class="form-label">To (${selectedContacts.length} contact${selectedContacts.length > 1 ? 's' : ''})</label>
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:13px;max-height:80px;overflow-y:auto;line-height:1.6">
        ${selectedContacts.map(c => `<span class="badge" style="margin:2px 4px 2px 0;font-size:11px">${c.name} &lt;${c.email}&gt;</span>`).join(' ')}
      </div>
    </div>
    <div class="form-group"><label class="form-label">Subject</label><input class="form-input" id="media-email-subject" placeholder="e.g. New Restaurant Opening — Media Invitation"></div>
    <div class="form-group"><label class="form-label">Message</label><textarea class="form-textarea" id="media-email-body" rows="10" placeholder="Write your message here..."></textarea></div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn btn-secondary btn-sm" id="media-email-ai" style="font-size:12px"><i data-lucide="sparkles" style="width:14px;height:14px"></i> AI Draft</button>
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="media-email-send"><i data-lucide="send" style="width:14px;height:14px"></i> Send</button>`);

  lucide.createIcons({ nameAttr: 'data-lucide' });

  // AI Draft helper
  $('#media-email-ai')?.addEventListener('click', async () => {
    const subject = $('#media-email-subject').value || 'Media outreach';
    const btn = $('#media-email-ai');
    btn.disabled = true; btn.textContent = 'Drafting...';
    try {
      const prompt = `Write a professional media outreach email for Hermes Media Restaurant Group. Subject: ${subject}. This is going to ${selectedContacts.length} media contacts in the DMV area (DC, Maryland, Virginia). Keep it concise, professional, and compelling. Include a clear call-to-action. Only return the email body, no subject line.`;
      const resp = await fetch(`${MANUS_API_KEY ? AI_BASE_URL : 'https://api.openai.com'}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MANUS_API_KEY || OPENAI_KEY}` },
        body: JSON.stringify({ model: AI_MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 600 })
      });
      const data = await resp.json();
      $('#media-email-body').value = data.choices?.[0]?.message?.content || '';
    } catch(e) { toast('AI draft failed — write manually', 'error'); }
    btn.disabled = false; btn.innerHTML = '<i data-lucide="sparkles" style="width:14px;height:14px"></i> AI Draft';
    lucide.createIcons({ nameAttr: 'data-lucide' });
  });

  // Send
  $('#media-email-send')?.addEventListener('click', async () => {
    const subject = $('#media-email-subject').value.trim();
    const body = $('#media-email-body').value.trim();
    if (!subject) return toast('Subject is required', 'error');
    if (!body) return toast('Message is required', 'error');

    // Log the outreach and update last_contacted
    const now = new Date().toISOString();
    for (const c of selectedContacts) {
      await sb.from('media_contacts').update({ last_contacted: now, relationship: c.relationship === 'cold' ? 'warm' : c.relationship }).eq('id', c.id);
    }
    await logActivity('media_email_sent', `Emailed ${selectedContacts.length} media contacts: ${subject}`);

    // Open mailto with all recipients
    const mailto = `mailto:${toEmails}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, '_blank');

    closeModal();
    toast(`Email prepared for ${selectedContacts.length} contact${selectedContacts.length > 1 ? 's' : ''} — check your email client`, 'success');
    navigate('media');
  });
}

// ============================================
// PAGE: Email & SMS
// ============================================
let emailSmsTab = 'campaigns'; // 'campaigns' | 'audiences'

async function renderEmailSms(container) {
  await getEmployees();
  const [campaignRes, listRes, mediaRes, brandRes] = await Promise.all([
    sb.from('email_campaigns').select('*').order('created_at', { ascending: false }),
    sb.from('contact_lists').select('*'),
    sb.from('media_contacts').select('*').order('outlet'),
    sb.from('restaurants').select('*').order('name'),
  ]);
  const items = campaignRes.data || [];
  const contactLists = listRes.data || [];
  const mediaContacts = mediaRes.data || [];
  const brands = brandRes.data || [];
  window._contactLists = contactLists;
  window._mediaContacts = mediaContacts;
  window._brands = brands;

  const mediaWithEmail = mediaContacts.filter(m => m.email);

  function campaignRowHTML(e) {
    let targetLabel = e.recipient_list || '—';
    if (e.recipient_list === '__media__') targetLabel = 'Media Contacts';
    else if (e.recipient_list?.startsWith('__brand__')) {
      const brandName = e.recipient_list.replace('__brand__:', '').replace('__brand__', '');
      targetLabel = brandName ? brandName + ' Subscribers' : 'All Brands';
    }
    return `<tr>
      <td>${e.name}</td>
      <td>${e.campaign_type || '—'}</td>
      <td>${badgeHTML(e.channel || 'email', e.channel || 'email')}</td>
      <td>${badgeHTML(e.status)}</td>
      <td>${formatDate(e.send_date)}</td>
      <td>${targetLabel}</td>
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

  function listRowHTML(l) {
    return `<tr>
      <td>${l.name}</td>
      <td>${badgeHTML(l.list_type || 'general', l.list_type || 'general')}</td>
      <td>${l.description || '—'}</td>
      <td><strong>${(l.subscriber_count || 0).toLocaleString()}</strong></td>
      <td>${formatDate(l.created_at)}</td>
      <td class="table-actions">
        <button class="btn-icon btn-ghost" onclick="editContactList('${l.id}')"><i data-lucide="edit-2"></i></button>
        <button class="btn-icon btn-ghost" onclick="deleteContactList('${l.id}')"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>`;
  }

  const campaignsContent = `
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Filter campaigns..." id="email-filter"></div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" id="email-export"><i data-lucide="download"></i> Export</button>
        ${canEdit() ? '<button class="btn btn-primary btn-sm" id="new-email-btn"><i data-lucide="plus"></i> New Campaign</button>' : ''}
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
          <th>Target</th>
          <th data-key="recipient_count">Recipients</th>
          <th data-key="sent_count">Sent</th>
          <th data-key="open_count">Opens</th>
          <th data-key="click_count">Clicks</th>
          <th>Actions</th>
        </tr></thead>
        <tbody id="email-tbody">${items.map(campaignRowHTML).join('')}</tbody>
      </table>
    </div>`;

  const audiencesContent = `
    <div class="audience-overview" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px">
      <div class="stat-card">
        <div class="stat-value">${contactLists.reduce((s,l) => s + (l.subscriber_count || 0), 0).toLocaleString()}</div>
        <div class="stat-label">Total Subscribers</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${contactLists.length}</div>
        <div class="stat-label">Contact Lists</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${mediaWithEmail.length}</div>
        <div class="stat-label">Media Contacts (with email)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${brands.length}</div>
        <div class="stat-label">Brands</div>
      </div>
    </div>
    <div style="display:flex;gap:24px;flex-wrap:wrap">
      <div style="flex:1;min-width:320px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h3 style="margin:0">Contact Lists</h3>
          ${canEdit() ? '<button class="btn btn-primary btn-sm" id="new-list-btn"><i data-lucide="plus"></i> New List</button>' : ''}
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>Description</th><th>Subscribers</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody id="list-tbody">${contactLists.map(listRowHTML).join('')}</tbody>
          </table>
        </div>
      </div>
      <div style="flex:0 0 340px">
        <h3 style="margin-bottom:12px">Media Contacts</h3>
        <div style="background:var(--bg-secondary);border-radius:12px;padding:16px;max-height:380px;overflow-y:auto">
          <p style="font-size:13px;color:var(--text-secondary);margin:0 0 12px">These ${mediaWithEmail.length} media contacts with email are available as a send target when creating campaigns.</p>
          ${mediaWithEmail.map(m => `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-color)">
              <i data-lucide="newspaper" style="width:14px;height:14px;color:var(--text-secondary)"></i>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.name}</div>
                <div style="font-size:11px;color:var(--text-secondary)">${m.outlet} · ${m.beat || 'general'}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>`;

  container.innerHTML = `
    <h1 class="page-title">Email & SMS</h1>
    <p class="page-subtitle">Create campaigns and manage your audience lists</p>
    <div class="tab-bar" style="margin-bottom:20px">
      <button class="tab-btn ${emailSmsTab === 'campaigns' ? 'active' : ''}" data-tab="campaigns"><i data-lucide="send" style="width:14px;height:14px"></i> Campaigns</button>
      <button class="tab-btn ${emailSmsTab === 'audiences' ? 'active' : ''}" data-tab="audiences"><i data-lucide="users" style="width:14px;height:14px"></i> Audience Lists</button>
    </div>
    <div id="email-tab-content">
      ${emailSmsTab === 'campaigns' ? campaignsContent : audiencesContent}
    </div>
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });

  // Tab switching
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      emailSmsTab = btn.dataset.tab;
      renderEmailSms(container);
    });
  });

  if (emailSmsTab === 'campaigns') {
    $('#email-filter')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      $$('#email-tbody tr').forEach(tr => tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none');
    });
    $('#email-export')?.addEventListener('click', () => csvExport(items, 'email_sms_campaigns'));
    if ($('#new-email-btn')) $('#new-email-btn').onclick = () => editEmailCampaign(null);
  } else {
    if ($('#new-list-btn')) $('#new-list-btn').onclick = () => editContactList(null);
  }
}

// --- Edit / New Campaign with Audience Targeting ---
window.editEmailCampaign = async function(id) {
  let e = {};
  if (id) {
    const { data } = await sb.from('email_campaigns').select('*').eq('id', id).single();
    e = data || {};
  }
  const contactLists = window._contactLists || [];
  const mediaContacts = (window._mediaContacts || []).filter(m => m.email);
  const brands = window._brands || [];
  const savedTarget = e.recipient_list || '';
  // Parse saved media picks from tags or notes if media target
  let savedMediaIds = [];
  try { if (e.target_media_ids) savedMediaIds = JSON.parse(e.target_media_ids); } catch {}

  // Outlet types for media filter
  const outletTypes = [...new Set(mediaContacts.map(m => m.outlet_type).filter(Boolean))].sort();
  const beats = [...new Set(mediaContacts.map(m => m.beat).filter(Boolean))].sort();

  openModal(id ? 'Edit Campaign' : 'New Campaign', `
    <div class="form-group"><label class="form-label">Campaign Name</label><input class="form-input" id="ec-name" value="${e.name || ''}"></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Channel</label>
        <select class="form-select" id="ec-channel">
          <option value="email" ${e.channel === 'email' ? 'selected' : ''}>Email</option>
          <option value="sms" ${e.channel === 'sms' ? 'selected' : ''}>SMS</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Campaign Type</label>
        <select class="form-select" id="ec-type">
          ${['newsletter','promotion','announcement','event','re-engagement','welcome','seasonal'].map(t => `<option value="${t}" ${e.campaign_type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="targeting-section" style="background:var(--bg-secondary);border-radius:12px;padding:16px;margin:16px 0">
      <label class="form-label" style="font-size:14px;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:6px">
        <i data-lucide="target" style="width:16px;height:16px"></i> Audience Targeting
      </label>
      <div class="form-group" style="margin-bottom:12px">
        <label class="form-label" style="font-size:12px">Send To</label>
        <select class="form-select" id="ec-target-type">
          <option value="list" ${savedTarget !== '__media__' && !savedTarget.startsWith('__brand__') ? 'selected' : ''}>Contact List</option>
          <option value="media" ${savedTarget === '__media__' ? 'selected' : ''}>Media Contacts (Press Outreach)</option>
          <option value="brand" ${savedTarget.startsWith('__brand__') ? 'selected' : ''}>Brand / Location Subscribers</option>
        </select>
      </div>

      <!-- Contact List target -->
      <div id="target-list-panel" style="display:none">
        <select class="form-select" id="ec-list">
          <option value="">Select a contact list...</option>
          ${contactLists.map(l => `<option value="${l.name}" ${savedTarget === l.name ? 'selected' : ''}>${l.name} (${(l.subscriber_count || 0).toLocaleString()} subscribers)</option>`).join('')}
        </select>
      </div>

      <!-- Media Contacts target -->
      <div id="target-media-panel" style="display:none">
        <div class="form-row" style="margin-bottom:8px">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" style="font-size:11px">Filter by Type</label>
            <select class="form-select" id="ec-media-type" style="font-size:12px">
              <option value="">All Types</option>
              ${outletTypes.map(t => `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" style="font-size:11px">Filter by Beat</label>
            <select class="form-select" id="ec-media-beat" style="font-size:12px">
              <option value="">All Beats</option>
              ${beats.map(b => `<option value="${b}">${b.charAt(0).toUpperCase() + b.slice(1)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer">
            <input type="checkbox" id="ec-media-select-all"> Select All
          </label>
          <span id="ec-media-count" style="font-size:12px;color:var(--text-secondary);margin-left:auto"></span>
        </div>
        <div id="ec-media-list" style="max-height:200px;overflow-y:auto;border:1px solid var(--border-color);border-radius:8px;padding:4px">
        </div>
      </div>

      <!-- Brand target -->
      <div id="target-brand-panel" style="display:none">
        <select class="form-select" id="ec-brand">
          <option value="">All Brands</option>
          ${brands.filter(b => b.status === 'active').map(b => `<option value="${b.name}">${b.name}</option>`).join('')}
        </select>
        <p style="font-size:11px;color:var(--text-secondary);margin:6px 0 0">Sends to all subscribers associated with the selected brand. Leave blank for all brands.</p>
      </div>

      <div id="ec-audience-summary" style="margin-top:10px;padding:8px 12px;background:var(--bg-primary);border-radius:8px;font-size:13px;display:flex;align-items:center;gap:6px">
        <i data-lucide="users" style="width:14px;height:14px;color:var(--accent)"></i>
        <span id="ec-audience-count">Select a target audience above</span>
      </div>
    </div>

    <div class="form-group"><label class="form-label">Subject</label><input class="form-input" id="ec-subject" value="${e.subject || ''}"></div>
    <div class="form-group"><label class="form-label">Preview Text</label><input class="form-input" id="ec-preview" value="${e.preview_text || ''}"></div>
    <div class="form-group"><label class="form-label">Body</label><textarea class="form-textarea" id="ec-body" rows="5">${e.body_html || ''}</textarea>
      <button class="btn btn-sm ai-gen-btn" id="ai-gen-email" type="button"><i data-lucide="sparkles"></i> Generate with AI</button>
      <div class="ai-gen-inline" id="ai-gen-email-inline" style="display:none">
        <input type="text" class="form-input" id="ai-gen-email-prompt" placeholder="Describe this campaign (e.g. 'Valentine's Day dinner promo')">
        <button class="btn btn-sm btn-primary" id="ai-gen-email-go">Generate</button>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Status</label>
        <select class="form-select" id="ec-status">
          ${['draft','scheduled','sent'].map(s => `<option value="${s}" ${e.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Template</label>
        <select class="form-select" id="ec-template">
          ${['','newsletter','promo','announcement','press-release','welcome','re-engagement'].map(t => `<option value="${t}" ${e.template === t ? 'selected' : ''}>${t ? t.charAt(0).toUpperCase() + t.slice(1).replace('-',' ') : 'None'}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Send Date</label><input class="form-input" type="date" id="ec-date" value="${e.send_date || ''}"></div>
      <div class="form-group"><label class="form-label">Send Time</label><input class="form-input" type="time" id="ec-time" value="${e.send_time || ''}"></div>
    </div>
    <div class="form-group"><label class="form-label">Tags (comma-separated)</label><input class="form-input" id="ec-tags" value="${parseJSON(e.tags).join(', ')}"></div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="ec-notes" rows="2">${e.notes || ''}</textarea></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-ec-btn">Save</button>`);

  // --- Targeting panel logic ---
  const targetType = $('#ec-target-type');
  const listPanel = $('#target-list-panel');
  const mediaPanel = $('#target-media-panel');
  const brandPanel = $('#target-brand-panel');

  function showTargetPanel() {
    const v = targetType.value;
    listPanel.style.display = v === 'list' ? '' : 'none';
    mediaPanel.style.display = v === 'media' ? '' : 'none';
    brandPanel.style.display = v === 'brand' ? '' : 'none';
    updateAudienceSummary();
    if (v === 'media') renderMediaCheckboxes();
  }

  function renderMediaCheckboxes() {
    const typeFilter = $('#ec-media-type').value;
    const beatFilter = $('#ec-media-beat').value;
    let filtered = mediaContacts;
    if (typeFilter) filtered = filtered.filter(m => m.outlet_type === typeFilter);
    if (beatFilter) filtered = filtered.filter(m => m.beat === beatFilter);
    const container = $('#ec-media-list');
    container.innerHTML = filtered.map(m => `
      <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:6px;font-size:12px" class="media-check-row">
        <input type="checkbox" class="media-cb" value="${m.id}" ${savedMediaIds.includes(m.id) ? 'checked' : ''}>
        <div style="flex:1;min-width:0">
          <span style="font-weight:500">${m.name}</span>
          <span style="color:var(--text-secondary)"> · ${m.outlet}</span>
        </div>
        <span style="color:var(--text-secondary);font-size:11px">${m.beat || ''}</span>
      </label>
    `).join('');
    // hover effect
    $$('.media-check-row').forEach(row => {
      row.addEventListener('mouseenter', () => row.style.background = 'var(--bg-primary)');
      row.addEventListener('mouseleave', () => row.style.background = '');
    });
    // checkbox change → update summary
    $$('.media-cb').forEach(cb => cb.addEventListener('change', updateAudienceSummary));
    updateMediaCount(filtered.length);
    updateAudienceSummary();
  }

  function updateMediaCount(total) {
    const checked = $$('.media-cb:checked').length;
    $('#ec-media-count').textContent = `${checked} of ${total} selected`;
  }

  function updateAudienceSummary() {
    const v = targetType.value;
    const el = $('#ec-audience-count');
    if (v === 'list') {
      const sel = $('#ec-list');
      const opt = sel?.options[sel.selectedIndex];
      if (sel.value) {
        const listObj = (window._contactLists || []).find(l => l.name === sel.value);
        el.textContent = `${(listObj?.subscriber_count || 0).toLocaleString()} recipients from "${sel.value}"`;
      } else {
        el.textContent = 'Select a contact list above';
      }
    } else if (v === 'media') {
      const checked = $$('.media-cb:checked').length;
      el.textContent = checked > 0 ? `${checked} media contact${checked > 1 ? 's' : ''} selected for outreach` : 'Select media contacts above';
      const total = $$('.media-cb').length;
      updateMediaCount(total);
    } else if (v === 'brand') {
      const brand = $('#ec-brand').value;
      el.textContent = brand ? `All subscribers for ${brand}` : 'All subscribers across all brands';
    }
  }

  targetType.addEventListener('change', showTargetPanel);
  $('#ec-list')?.addEventListener('change', updateAudienceSummary);
  $('#ec-brand')?.addEventListener('change', updateAudienceSummary);
  $('#ec-media-type')?.addEventListener('change', renderMediaCheckboxes);
  $('#ec-media-beat')?.addEventListener('change', renderMediaCheckboxes);
  $('#ec-media-select-all')?.addEventListener('change', (ev) => {
    $$('.media-cb').forEach(cb => { cb.checked = ev.target.checked; });
    updateAudienceSummary();
  });

  showTargetPanel();

  // AI Generate for email/SMS campaigns
  $('#ai-gen-email').onclick = () => {
    const inline = $('#ai-gen-email-inline');
    inline.style.display = inline.style.display === 'none' ? 'flex' : 'none';
    if (inline.style.display === 'flex') $('#ai-gen-email-prompt').focus();
  };
  $('#ai-gen-email-go').onclick = async () => {
    const prompt = $('#ai-gen-email-prompt').value.trim();
    if (!prompt) return toast('Please describe the campaign', 'error');
    const btn = $('#ai-gen-email-go');
    btn.textContent = 'Generating...';
    btn.disabled = true;
    const channel = $('#ec-channel').value;
    const result = await generateAIContent(
      `Create ${channel === 'sms' ? 'an SMS' : 'an email'} marketing campaign for a restaurant. Topic: ${prompt}.

Respond in this exact JSON format:
{"subject": "email subject line", "preview": "preview text (1 sentence)", "body": "the full ${channel === 'sms' ? 'SMS message (under 160 chars)' : 'email body copy'}"}

Only output the JSON, nothing else.`, 400
    );
    btn.textContent = 'Generate';
    btn.disabled = false;
    if (!result) return toast('Failed to generate content', 'error');
    try {
      const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
      if (parsed.subject) $('#ec-subject').value = parsed.subject;
      if (parsed.preview) $('#ec-preview').value = parsed.preview;
      if (parsed.body) $('#ec-body').value = parsed.body;
      toast('Content generated — review and edit as needed', 'success');
      $('#ai-gen-email-inline').style.display = 'none';
    } catch {
      $('#ec-body').value = result;
      toast('Content generated', 'success');
      $('#ai-gen-email-inline').style.display = 'none';
    }
  };
  $('#ai-gen-email-prompt').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('#ai-gen-email-go').click(); });

  // Save campaign
  $('#save-ec-btn').onclick = async () => {
    const tType = targetType.value;
    let recipientList = '';
    let recipientCount = null;
    let targetMediaIds = null;

    if (tType === 'list') {
      recipientList = $('#ec-list').value;
      const listObj = (window._contactLists || []).find(l => l.name === recipientList);
      recipientCount = listObj?.subscriber_count || null;
    } else if (tType === 'media') {
      recipientList = '__media__';
      const ids = [...$$('.media-cb:checked')].map(cb => parseInt(cb.value));
      targetMediaIds = JSON.stringify(ids);
      recipientCount = ids.length;
    } else if (tType === 'brand') {
      recipientList = '__brand__';
      const brand = $('#ec-brand').value;
      if (brand) recipientList = '__brand__:' + brand;
    }

    const obj = {
      name: $('#ec-name').value,
      channel: $('#ec-channel').value,
      campaign_type: $('#ec-type').value,
      subject: $('#ec-subject').value,
      preview_text: $('#ec-preview').value,
      body_html: $('#ec-body').value,
      status: $('#ec-status').value,
      recipient_list: recipientList,
      recipient_count: recipientCount,
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

// --- Contact List CRUD ---
window.editContactList = async function(id) {
  let l = {};
  if (id) {
    const { data } = await sb.from('contact_lists').select('*').eq('id', id).single();
    l = data || {};
  }
  openModal(id ? 'Edit Contact List' : 'New Contact List', `
    <div class="form-group"><label class="form-label">List Name</label><input class="form-input" id="cl-name" value="${l.name || ''}"></div>
    <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="cl-desc" value="${l.description || ''}"></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Type</label>
        <select class="form-select" id="cl-type">
          ${['master','segment','brand','sms','dynamic','custom'].map(t => `<option value="${t}" ${l.list_type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Subscriber Count</label><input class="form-input" type="number" id="cl-count" value="${l.subscriber_count || 0}"></div>
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-cl-btn">Save</button>`);

  $('#save-cl-btn').onclick = async () => {
    const obj = {
      name: $('#cl-name').value,
      description: $('#cl-desc').value,
      list_type: $('#cl-type').value,
      subscriber_count: parseInt($('#cl-count').value) || 0,
    };
    if (!obj.name) return toast('Name is required', 'error');
    if (id) {
      await sb.from('contact_lists').update(obj).eq('id', id);
      toast('List updated', 'success');
    } else {
      await sb.from('contact_lists').insert(obj);
      toast('List created', 'success');
    }
    closeModal();
    navigate('email-sms');
  };
};

window.deleteContactList = function(id) {
  openConfirm('Delete Contact List', 'Are you sure? This cannot be undone.', async () => {
    await sb.from('contact_lists').delete().eq('id', id);
    toast('List deleted', 'success');
    emailSmsTab = 'audiences';
    navigate('email-sms');
  });
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
          <button class="btn btn-secondary btn-sm sync-btn" id="rev-sync-google" onclick="syncGoogleReviews()"><i data-lucide="refresh-cw"></i> Sync Google Reviews</button>
          <button class="btn btn-secondary btn-sm" id="rev-export"><i data-lucide="download"></i> Export</button>
          <button class="btn btn-secondary btn-sm" id="rev-bulk-ai-draft" style="display:none"><i data-lucide="sparkles"></i> Bulk AI Draft</button>
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
              <div style="display:flex;gap:6px;margin-top:8px">
                <button class="btn btn-sm btn-primary" onclick="respondToReview('${r.id}')">Respond</button>
                <button class="btn btn-sm btn-secondary" onclick="aiDraftReviewResponse('${r.id}')"><i data-lucide="sparkles" style="width:14px;height:14px"></i> AI Draft</button>
              </div>
              ${r.ai_draft_response ? `<div style="margin-top:6px;padding:8px;background:var(--bg-tertiary);border-radius:6px;font-size:12px;color:var(--text-secondary)"><strong>Saved draft:</strong> ${r.ai_draft_response.substring(0,80)}...</div>` : ''}
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
        const show = selected.size > 0 ? '' : 'none';
        $('#rev-bulk-respond').style.display = show;
        $('#rev-bulk-ai-draft').style.display = show;
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
    $('#rev-bulk-ai-draft').onclick = async () => {
      const btn = $('#rev-bulk-ai-draft');
      btn.disabled = true; btn.innerHTML = '<i data-lucide="loader"></i> Generating...';
      let count = 0;
      for (const id of selected) {
        const rev = items.find(r => String(r.id) === String(id));
        if (!rev || rev.status === 'responded' || rev.is_responded) continue;
        const rating = rev.rating || 3;
        const restaurantName = rev.restaurant_name || rev.restaurant || 'our restaurant';
        const reviewText = rev.review_text || rev.content || '';
        const draft = await generateAIContent(`You are a restaurant manager responding to a ${rating}-star review for ${restaurantName}. The review says: "${reviewText}". Write a professional, warm response under 100 words.`, 200);
        if (draft) {
          await sb.from('reviews').update({ ai_draft_response: draft, response_tone: 'professional' }).eq('id', id);
          count++;
        }
      }
      toast(`Generated ${count} AI drafts`, 'success');
      selected.clear();
      navigate('reviews');
    };
  }
  render();
}

window.respondToReview = async function(id) {
  // Fetch the review data for AI context
  const { data: reviewData } = await sb.from('reviews').select('*').eq('id', id).single();
  const review = reviewData || {};

  openModal('Respond to Review', `
    ${review.review_text ? `<div class="review-preview-card">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-weight:600">${review.reviewer_name || 'Customer'}</span>
        <span>${starsHTML(review.rating || 3)}</span>
        <span class="badge badge-platform">${review.platform || ''}</span>
      </div>
      <p style="color:var(--text-secondary);font-size:13px">${review.review_text || review.content || ''}</p>
    </div>` : ''}
    <div class="form-group"><label class="form-label">Your Response</label>
    <textarea class="form-textarea" id="review-response" rows="4" placeholder="Write your response...">${review.ai_draft_response || ''}</textarea>
    <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
      <select class="form-select" id="review-tone" style="width:160px">
        <option value="professional" ${(review.response_tone || 'professional') === 'professional' ? 'selected' : ''}>Professional</option>
        <option value="friendly" ${review.response_tone === 'friendly' ? 'selected' : ''}>Friendly</option>
        <option value="apologetic" ${review.response_tone === 'apologetic' ? 'selected' : ''}>Apologetic</option>
        <option value="enthusiastic" ${review.response_tone === 'enthusiastic' ? 'selected' : ''}>Enthusiastic</option>
      </select>
      <button class="btn btn-sm ai-gen-btn" id="ai-gen-review" type="button"><i data-lucide="sparkles"></i> AI Generate</button>
    </div>
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-response-btn">Submit Response</button>`);
  lucide.createIcons({ nameAttr: 'data-lucide' });

  // AI Generate handler with tone
  $('#ai-gen-review').onclick = async () => {
    const btn = $('#ai-gen-review');
    btn.innerHTML = '<i data-lucide="loader"></i> Generating...';
    btn.disabled = true;
    const tone = $('#review-tone').value;
    const rating = review.rating || 3;
    const restaurantName = review.restaurant_name || 'our restaurant';
    const reviewText = review.review_text || review.content || 'the customer experience';
    const toneInstructions = {
      professional: 'Use a professional, polished tone.',
      friendly: 'Use a warm, casual, friendly tone like talking to a neighbor.',
      apologetic: 'Lead with a sincere apology and express genuine concern.',
      enthusiastic: 'Be upbeat and enthusiastic, showing excitement about their feedback.',
    };
    const result = await generateAIContent(
      `You are a restaurant manager responding to a ${rating}-star review for ${restaurantName}.
The review says: "${reviewText}"
${toneInstructions[tone] || toneInstructions.professional}
${rating >= 4 ? 'Thank the customer genuinely and encourage them to return. Mention something specific from their review.' : 'Acknowledge the specific issue they raised, and offer to make it right. Invite them to contact us directly.'}
Keep it under 100 words. Sound human, not corporate.`, 200
    );
    btn.innerHTML = '<i data-lucide="sparkles"></i> AI Generate';
    btn.disabled = false;
    lucide.createIcons({ nameAttr: 'data-lucide' });
    if (result) {
      $('#review-response').value = result;
      await sb.from('reviews').update({ ai_draft_response: result, response_tone: tone }).eq('id', id);
      toast('Response generated — review and edit before submitting', 'success');
    } else {
      toast('Failed to generate response', 'error');
    }
  };

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

window.aiDraftReviewResponse = async function(id) {
  const { data: review } = await sb.from('reviews').select('*').eq('id', id).single();
  if (!review) return toast('Review not found', 'error');
  openModal('AI Draft Response', `
    <div class="review-preview-card">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-weight:600">${review.reviewer_name || 'Customer'}</span>
        <span>${starsHTML(review.rating || 3)}</span>
        <span class="badge badge-platform">${review.platform || ''}</span>
      </div>
      <p style="color:var(--text-secondary);font-size:13px">${review.review_text || review.content || ''}</p>
    </div>
    <div class="form-group"><label class="form-label">Tone</label>
      <select class="form-select" id="ai-draft-tone">
        <option value="professional">Professional</option>
        <option value="friendly">Friendly</option>
        <option value="apologetic">Apologetic</option>
        <option value="enthusiastic">Enthusiastic</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Generated Draft</label>
      <textarea class="form-textarea" id="ai-draft-text" rows="4" placeholder="Click Generate to create an AI draft...">${review.ai_draft_response || ''}</textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-accent" id="ai-draft-generate"><i data-lucide="sparkles"></i> Generate</button>
    <button class="btn btn-primary" id="ai-draft-save">Save & Use as Response</button>
  `);
  lucide.createIcons({ nameAttr: 'data-lucide' });

  $('#ai-draft-generate').onclick = async () => {
    const btn = $('#ai-draft-generate');
    btn.disabled = true; btn.innerHTML = '<i data-lucide="loader"></i> Generating...';
    const tone = $('#ai-draft-tone').value;
    const rating = review.rating || 3;
    const restaurantName = review.restaurant_name || review.restaurant || 'our restaurant';
    const reviewText = review.review_text || review.content || '';
    const toneMap = { professional: 'Use a professional, polished tone.', friendly: 'Use a warm, casual, friendly tone.', apologetic: 'Lead with a sincere apology.', enthusiastic: 'Be upbeat and enthusiastic.' };
    const draft = await generateAIContent(`You are a restaurant manager responding to a ${rating}-star review for ${restaurantName}. Review: "${reviewText}". ${toneMap[tone]} ${rating >= 4 ? 'Thank the customer and encourage return.' : 'Acknowledge the issue and offer to make it right.'} Under 100 words. Sound human.`, 200);
    btn.innerHTML = '<i data-lucide="sparkles"></i> Generate'; btn.disabled = false;
    lucide.createIcons({ nameAttr: 'data-lucide' });
    if (draft) { $('#ai-draft-text').value = draft; toast('Draft generated', 'success'); }
    else toast('Failed to generate', 'error');
  };

  $('#ai-draft-save').onclick = async () => {
    const draft = $('#ai-draft-text').value;
    const tone = $('#ai-draft-tone').value;
    if (!draft.trim()) return toast('Generate a draft first', 'error');
    await sb.from('reviews').update({ ai_draft_response: draft, response_tone: tone, response_text: draft, status: 'responded', response_by: currentUser.id, response_date: new Date().toISOString().slice(0, 10) }).eq('id', id);
    await logActivity('ai_draft_review', `AI drafted & saved response for review #${id}`);
    closeModal();
    toast('AI draft saved & marked as responded', 'success');
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
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const chartTextColor = isLight ? '#555' : '#999';
  const chartGridColor = isLight ? '#e2e4e9' : '#222';
  const chartOpts = {
    responsive: true,
    plugins: { legend: { labels: { color: chartTextColor } } },
    scales: {
      x: { ticks: { color: chartTextColor }, grid: { color: chartGridColor } },
      y: { ticks: { color: chartTextColor }, grid: { color: chartGridColor } },
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
      options: { responsive: true, plugins: { legend: { labels: { color: chartTextColor } } } },
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
  const roles = ['Owner', 'Marketing Director', 'Marketing Manager', 'Marketing Coordinator', 'Marketing Analyst', 'Content Manager', 'Content Creator', 'Content Strategist', 'Social Media Manager', 'Social Media Coordinator', 'Social Media Specialist', 'Brand Manager', 'Brand Strategist', 'Community Manager', 'Influencer Relations Manager', 'PR Manager', 'PR Coordinator', 'SEO Specialist', 'Paid Media Specialist', 'Email Marketing Specialist', 'Graphic Designer', 'Video Producer', 'Copywriter', 'Campaign Manager', 'Growth Manager', 'Digital Marketing Manager', 'Account Manager', 'Intern', 'Viewer'];
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
    const correctPw = settings?.value || 'hermes';
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
  let allSettings = settings || [];

  // Group settings by key prefix
  const groupMap = {
    general: { label: 'General', icon: 'settings', keys: ['timezone', 'date_format', 'business_hours_start', 'business_hours_end', 'default_post_status'] },
    brand: { label: 'Brand Identity', icon: 'palette', keys: ['company_name', 'company_tagline', 'primary_color', 'accent_color', 'logo_text', 'website_url'] },
    social: { label: 'Social Media', icon: 'share-2', keys: ['instagram_handle', 'tiktok_handle', 'facebook_handle', 'twitter_handle', 'linkedin_handle'] },
    email: { label: 'Email', icon: 'mail', keys: ['email_sender_name', 'email_reply_to', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass'] },
    sms: { label: 'SMS', icon: 'smartphone', keys: ['twilio_sid', 'twilio_token', 'twilio_phone'] },
    google: { label: 'Google Business', icon: 'map-pin', keys: ['google_business_account_id', 'google_business_access_token'] },
    ayrshare: { label: 'Social Publishing', icon: 'share', keys: ['ayrshare_api_key'] },
    api: { label: 'API Keys', icon: 'key', keys: ['openai_key'] },
    notifications: { label: 'Notifications', icon: 'bell', keys: ['notification_new_review', 'notification_content_approval', 'notification_campaign_deadline'] },
    security: { label: 'Security', icon: 'shield', keys: ['manager_password'] },
    dropdowns: { label: 'Dropdowns', icon: 'list', keys: ['employee_roles', 'post_platforms', 'influencer_categories', 'campaign_types', 'asset_categories', 'review_platforms', 'media_outlet_types', 'influencer_stages'] },
  };
  const groups = Object.keys(groupMap);
  let activeGroup = 'general';

  // Auto-create missing settings keys for new integrations
  const allKeys = Object.values(groupMap).flatMap(g => g.keys);
  const existingKeys = new Set(allSettings.map(s => s.key));
  const missingKeys = allKeys.filter(k => !existingKeys.has(k));
  if (missingKeys.length) {
    const inserts = missingKeys.map(key => ({ key, value: '', updated_at: new Date().toISOString() }));
    await sb.from('settings').insert(inserts);
    const { data: refreshed } = await sb.from('settings').select('*');
    allSettings = refreshed || allSettings;
  }

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
// GLOBAL: AI Content Generation Helper
// ============================================
async function generateAIContent(prompt, maxTokens = 500) {
  const apiKey = MANUS_API_KEY || OPENAI_KEY;
  const baseUrl = MANUS_API_KEY ? AI_BASE_URL : 'https://api.openai.com';
  if (!apiKey) { toast('AI key not configured.', 'error'); return null; }
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: 'You are a marketing expert for Hermes Media, a restaurant group managing 35 brands and 90+ locations in the DMV (DC, Maryland, Virginia) area. Generate professional, engaging marketing content. Be concise and creative.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens,
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch(err) {
    console.error('AI generation error:', err);
    return null;
  }
}

// Publish post to social media via Ayrshare
window.publishPost = async function(id) {
  const { data: post } = await sb.from('content_posts').select('*').eq('id', id).single();
  if (!post) return toast('Post not found', 'error');

  const platforms = parseJSON(post.platforms).map(p => p.toLowerCase());
  if (!platforms.length) return toast('No platforms selected for this post', 'error');

  // Map our platform names to Ayrshare platform names
  const platformMap = { instagram: 'instagram', facebook: 'facebook', twitter: 'twitter', tiktok: 'tiktok', linkedin: 'linkedin', youtube: 'youtube', pinterest: 'pinterest' };
  const ayrPlatforms = platforms.map(p => platformMap[p]).filter(Boolean);

  if (!ayrPlatforms.length) return toast('No supported platforms for publishing', 'error');

  const caption = `${post.title || ''}\n\n${post.body || ''}`.trim();
  if (!caption) return toast('Post has no content to publish', 'error');
  const mediaUrls = parseJSON(post.media_urls);

  openConfirm('Publish to Social Media',
    `Publish "${post.title}" to ${ayrPlatforms.join(', ')}?`,
    async () => {
      toast('Publishing...', 'info');
      try {
        const isScheduled = post.scheduled_date && post.scheduled_time && new Date(`${post.scheduled_date}T${post.scheduled_time}`) > new Date();
        const endpoint = isScheduled ? 'schedule' : 'post';
        const body = { post: caption, platforms: ayrPlatforms };
        if (mediaUrls.length) body.mediaUrls = mediaUrls;
        if (isScheduled) body.scheduleDate = new Date(`${post.scheduled_date}T${post.scheduled_time}`).toISOString();

        const res = await fetch(`/api/social?action=${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();

        if (data.needsSetup) return toast('Ayrshare not configured. Add API key in Settings → Social Publishing.', 'error');
        if (data.status === 'error') return toast(`Error: ${data.message || 'Failed to publish'}`, 'error');

        // Update post status in Supabase
        await sb.from('content_posts').update({ status: isScheduled ? 'scheduled' : 'published', updated_at: new Date().toISOString() }).eq('id', id);
        await logActivity('publish_post', `${isScheduled ? 'Scheduled' : 'Published'} "${post.title}" to ${ayrPlatforms.join(', ')}`);
        toast(`${isScheduled ? 'Scheduled' : 'Published'} successfully to ${ayrPlatforms.join(', ')}`, 'success');
        navigate('content');
      } catch(err) {
        toast('Failed to publish: ' + err.message, 'error');
      }
    }
  );
};

// Sync Google Reviews to Supabase
window.syncGoogleReviews = async function() {
  toast('Syncing Google Reviews...', 'info');
  try {
    const res = await fetch('/api/google-reviews?action=fetch-all');
    const data = await res.json();

    if (data.needsSetup) {
      toast('Google Business not configured. Add credentials in Settings → Google Business.', 'error');
      return;
    }

    if (!data.reviews?.length) {
      toast('No reviews found from Google', 'info');
      return;
    }

    // Upsert reviews into Supabase
    let newCount = 0;
    for (const review of data.reviews) {
      // Check if review already exists
      const { data: existing } = await sb.from('reviews').select('id').eq('reviewer_name', review.reviewer_name).eq('review_text', review.review_text).eq('platform', 'google').limit(1);
      if (!existing?.length) {
        await sb.from('reviews').insert(review);
        newCount++;
      }
    }
    await logActivity('sync_reviews', `Synced ${newCount} new Google review(s)`);
    toast(`Synced ${newCount} new review(s) from Google`, 'success');
    navigate('reviews');
  } catch(err) {
    toast('Failed to sync: ' + err.message, 'error');
  }
};

// ============================================
// GLOBAL: AI Assistant — Page-Aware Suggestions
// ============================================
let aiLastSuggestPage = null;

const PAGE_CONTEXTS = {
  'restaurants': { label: 'Restaurants', prompt: 'The user is on the Restaurants page viewing all 35+ restaurant brands and their location counts. Suggest brand marketing strategies, multi-location coordination tips, brand consistency ideas, and ways to leverage the restaurant portfolio for cross-promotion.' },
  'dashboard': { label: 'Dashboard', prompt: 'The user is on the main Dashboard which shows KPIs (team members, brands, locations, posts this month, active campaigns, avg engagement), quick actions, action insights, and recent activity. Provide 3-4 actionable suggestions to improve their marketing performance based on typical restaurant group KPIs.' },
  'content': { label: 'Content Hub', prompt: 'The user is on the Content Hub page managing social media posts across platforms (Instagram, Facebook, TikTok, Twitter, LinkedIn). Posts can be published directly to social media via Ayrshare integration. AI content generation is available. Suggest content ideas, posting strategies, trending formats, and engagement tips for a multi-brand restaurant group.' },
  'content-calendar': { label: 'Unified Calendar', prompt: 'The user is on the Content Calendar page which shows a monthly view of scheduled posts and campaigns. Suggest optimal posting schedules, content themes for this month, and ways to maintain consistent posting across 35+ restaurant brands.' },
  'influencers': { label: 'Influencers', prompt: 'The user is on the Influencer Management page tracking food influencer outreach, deals, and ROI. Suggest influencer collaboration strategies, outreach templates, negotiation tips, and ways to measure influencer campaign ROI for restaurants.' },
  'campaigns': { label: 'Campaigns', prompt: 'The user is on the Campaigns page managing marketing campaigns with budgets and performance tracking. Suggest campaign ideas, budget optimization tips, A/B testing strategies, and seasonal campaign themes for a restaurant group.' },
  'local-media': { label: 'Local Media', prompt: 'The user is on the Local Media page managing media contacts and PR outreach. Suggest PR strategies, press release ideas, media pitch angles, and local event partnerships for a DMV-area restaurant group.' },
  'email-sms': { label: 'Email & SMS', prompt: 'The user is on the Email & SMS Campaigns page. Suggest email marketing best practices, SMS campaign ideas, subject line tips, segmentation strategies, and optimal send times for restaurant marketing.' },
  'inbox': { label: 'Inbox', prompt: 'The user is on the Gmail Inbox page. Suggest email management tips, response templates for common restaurant business inquiries, and ways to prioritize important communications.' },
  'text-messages': { label: 'Text Messages', prompt: 'The user is on the SMS Text Messages page using Twilio. Suggest SMS marketing best practices, customer engagement via text, reservation/order confirmation templates, and promotional text ideas.' },
  'reviews': { label: 'Reviews', prompt: 'The user is on the Reviews page managing customer reviews. Google Business Profile sync is available to pull in reviews from all 90+ locations. AI-powered response generation helps craft replies. Suggest response strategies for positive and negative reviews, ways to encourage more reviews, and reputation management best practices for restaurants.' },
  'reports': { label: 'Reports', prompt: 'The user is on the Analytics Reports page. Suggest key metrics to track, report formats, competitive benchmarking ideas, and data-driven insights for restaurant marketing optimization.' },
  'social-accounts': { label: 'Social Accounts', prompt: 'The user is on the Social Accounts page managing connected social media profiles. Suggest platform-specific strategies, growth tactics, and content format recommendations for each social channel.' },
  'team': { label: 'Team', prompt: 'The user is on the Team Management page. Suggest team workflow improvements, role assignments for marketing tasks, collaboration tools, and productivity tips for a marketing team.' },
  'audit-log': { label: 'Audit Log', prompt: 'The user is on the Audit Log page viewing system activity. Suggest compliance best practices, activity monitoring tips, and team accountability strategies.' },
  'settings': { label: 'Settings', prompt: 'The user is on the Settings page. Suggest ways to optimize their marketing hub configuration, integration tips, and workflow automation ideas.' },
};

function initAI() {
  const panel = $('#ai-panel');
  const overlay = $('#ai-overlay');
  $('#ai-btn').onclick = () => {
    panel.classList.add('open');
    overlay.classList.add('open');
    generatePageSuggestions();
  };
  $('#ai-close-btn').onclick = () => { panel.classList.remove('open'); overlay.classList.remove('open'); };
  overlay.onclick = () => { panel.classList.remove('open'); overlay.classList.remove('open'); };
  $('#ai-send-btn').onclick = sendAIMessage;
  $('#ai-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendAIMessage(); });
}

async function generatePageSuggestions() {
  // Reset conversation for fresh page-specific suggestions
  aiMessages = [];
  const pageCtx = PAGE_CONTEXTS[currentPage] || { label: currentPage, prompt: `The user is on the "${currentPage}" page. Provide helpful marketing suggestions relevant to this section.` };
  aiLastSuggestPage = currentPage;

  // Show loading state
  const container = $('#ai-messages');
  container.innerHTML = `
    <div class="ai-suggest-header">
      <i data-lucide="sparkles" style="width:18px;height:18px;color:var(--accent)"></i>
      <span>Suggestions for <strong>${pageCtx.label}</strong></span>
    </div>
    <div class="ai-msg assistant"><div class="ai-typing"><span></span><span></span><span></span></div></div>
  `;
  if (window.lucide) lucide.createIcons();

  if (!MANUS_API_KEY && !OPENAI_KEY) {
    aiMessages = [{ role: 'assistant', content: '⚠️ AI API key not configured. Go to **Settings → Integrations** and add your API key to enable AI suggestions.' }];
    renderAIMessages();
    return;
  }

  // Gather page data for context
  let pageData = '';
  try {
    pageData = await gatherPageData();
  } catch(e) { /* no extra data */ }

  const systemPrompt = `You are an AI marketing assistant for Hermes iMedia, a restaurant group managing 35 brands and 90+ locations in the DMV (DC, Maryland, Virginia) area. Current user: ${currentUser.name} (${currentUser.role}).

${pageCtx.prompt}

${pageData ? 'Here is current data from this page:\n' + pageData + '\n\n' : ''}Respond with 3-5 specific, actionable suggestions. Format each as a short bold title followed by 1-2 sentences. Use markdown formatting. Be concise — no fluff. Tailor every suggestion to the restaurant/food industry.`;

  try {
    const res = await fetch(`${MANUS_API_KEY ? AI_BASE_URL : 'https://api.openai.com'}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MANUS_API_KEY || OPENAI_KEY}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `Give me smart suggestions for the ${pageCtx.label} page right now.` }],
        max_tokens: 600,
      }),
    });
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || 'Could not generate suggestions. Please try again.';
    aiMessages = [
      { role: 'assistant', content: reply }
    ];
  } catch (err) {
    aiMessages = [{ role: 'assistant', content: 'Could not connect to AI service.' }];
  }
  renderAIMessages();
}

async function gatherPageData() {
  let info = '';
  try {
    if (currentPage === 'dashboard') {
      const [posts, campaigns, reviews] = await Promise.all([
        sb.from('content_posts').select('status', { count: 'exact' }),
        sb.from('campaigns').select('name,status,budget,spend'),
        sb.from('reviews').select('rating,status'),
      ]);
      const activeCamps = (campaigns.data || []).filter(c => c.status === 'active');
      const pendingReviews = (reviews.data || []).filter(r => r.status === 'pending');
      const avgRating = (reviews.data || []).length ? ((reviews.data || []).reduce((s,r) => s + r.rating, 0) / reviews.data.length).toFixed(1) : 'N/A';
      info = `Active campaigns: ${activeCamps.length} (${activeCamps.map(c => c.name).join(', ')}). Total posts: ${posts.count || 0}. Pending reviews: ${pendingReviews.length}. Avg review rating: ${avgRating}.`;
    } else if (currentPage === 'content') {
      const { data } = await sb.from('content_posts').select('status,platform');
      const byStatus = {}; const byPlatform = {};
      (data || []).forEach(p => { byStatus[p.status] = (byStatus[p.status]||0)+1; byPlatform[p.platform] = (byPlatform[p.platform]||0)+1; });
      info = `Posts by status: ${JSON.stringify(byStatus)}. Posts by platform: ${JSON.stringify(byPlatform)}.`;
    } else if (currentPage === 'campaigns') {
      const { data } = await sb.from('campaigns').select('*');
      info = (data || []).map(c => `${c.name}: ${c.status}, budget $${c.budget}, spent $${c.spend}`).join('. ');
    } else if (currentPage === 'reviews') {
      const { data } = await sb.from('reviews').select('*').order('created_at', { ascending: false }).limit(5);
      info = (data || []).map(r => `${r.restaurant_name || 'Restaurant'}: ${r.rating}★ - "${(r.text || '').substring(0, 80)}" (${r.status})`).join('. ');
    } else if (currentPage === 'influencers') {
      const { data } = await sb.from('influencers').select('name,platform,followers,status');
      info = (data || []).map(i => `${i.name} (${i.platform}, ${i.followers} followers, ${i.status})`).join('. ');
    } else if (currentPage === 'email-sms') {
      const { data } = await sb.from('email_campaigns').select('name,status,channel,open_rate,click_rate');
      info = (data || []).map(e => `${e.name}: ${e.channel}, ${e.status}, open ${e.open_rate}%, click ${e.click_rate}%`).join('. ');
    }
  } catch(e) { /* silent */ }
  return info;
}

function renderAIMessages() {
  const container = $('#ai-messages');
  const pageCtx = PAGE_CONTEXTS[currentPage] || { label: currentPage };
  container.innerHTML = `
    <div class="ai-suggest-header">
      <i data-lucide="sparkles" style="width:18px;height:18px;color:var(--accent)"></i>
      <span>Suggestions for <strong>${pageCtx.label}</strong></span>
    </div>
    ${aiMessages.map(m => `<div class="ai-msg ${m.role}">${formatAIMarkdown(m.content)}</div>`).join('')}
  `;
  container.scrollTop = container.scrollHeight;
  if (window.lucide) lucide.createIcons();
}

function formatAIMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h4 style="margin:8px 0 4px;color:var(--accent)">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:10px 0 4px;color:var(--accent)">$1</h3>')
    .replace(/^- (.+)$/gm, '<div style="padding-left:12px">• $1</div>')
    .replace(/^\d+\.\s(.+)$/gm, '<div style="padding-left:12px">$&</div>')
    .replace(/\n/g, '<br>');
}

async function sendAIMessage() {
  const input = $('#ai-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  aiMessages.push({ role: 'user', content: msg });
  renderAIMessages();

  const pageCtx = PAGE_CONTEXTS[currentPage] || { label: currentPage, prompt: '' };
  const systemPrompt = `You are an AI marketing assistant for Hermes iMedia, a restaurant group with 35 brands and 90+ locations in the DMV area. Current user: ${currentUser.name} (${currentUser.role}). Current page: ${pageCtx.label}. ${pageCtx.prompt} Be concise and actionable. Use markdown formatting.`;

  try {
    const res = await fetch(`${MANUS_API_KEY ? AI_BASE_URL : 'https://api.openai.com'}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MANUS_API_KEY || OPENAI_KEY}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...aiMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
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
// Gmail Inbox Page
// ============================================
let inboxEmails = [];
let inboxSelected = null;
let inboxLabel = 'INBOX';
let inboxConnected = false;

async function renderInbox(container) {
  container.innerHTML = `
    <div class="page-header"><h2>Inbox</h2><p class="page-subtitle">Read and reply to emails directly from the hub</p></div>
    <div id="inbox-root"><div class="loading"><div class="spinner"></div></div></div>
  `;
  lucide.createIcons();
  
  // Check connection
  try {
    const res = await fetch('/api/gmail?action=profile');
    const data = await res.json();
    if (data.needsAuth || res.status === 401) {
      renderInboxConnect(container);
      return;
    }
    inboxConnected = true;
    await loadInboxMessages();
    renderInboxUI();
  } catch {
    renderInboxConnect(container);
  }
}

function renderInboxConnect(container) {
  $('#inbox-root').innerHTML = `
    <div class="empty-state" style="padding:60px 20px;text-align:center">
      <div style="font-size:48px;margin-bottom:16px"><i data-lucide="mail" style="width:48px;height:48px;color:#4f98a3"></i></div>
      <h3 style="margin-bottom:8px">Connect Gmail</h3>
      <p style="color:#999;margin-bottom:24px">Link your Gmail account to read and send emails from the Marketing Hub.</p>
      <a href="/api/gmail-auth" class="btn btn-primary" style="text-decoration:none">Connect Gmail Account</a>
    </div>
  `;
  lucide.createIcons();
}

async function loadInboxMessages(q = '') {
  try {
    const url = `/api/gmail?action=list&label=${inboxLabel}&max=30${q ? '&q=' + encodeURIComponent(q) : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.needsAuth) { renderInboxConnect($('#page-content')); return; }
    inboxEmails = data.messages || [];
  } catch { inboxEmails = []; }
}

function renderInboxUI() {
  const root = $('#inbox-root');
  root.innerHTML = `
    <div class="inbox-layout">
      <div class="inbox-sidebar">
        <div class="inbox-toolbar">
          <div class="inbox-search">
            <i data-lucide="search"></i>
            <input type="text" id="inbox-search-input" placeholder="Search emails...">
          </div>
          <button class="btn btn-primary btn-sm" id="inbox-compose-btn"><i data-lucide="plus"></i> Compose</button>
        </div>
        <div class="inbox-labels">
          ${['INBOX','SENT','STARRED','DRAFT','SPAM'].map(l => `<button class="inbox-label-btn${inboxLabel === l ? ' active' : ''}" data-label="${l}">${l.charAt(0) + l.slice(1).toLowerCase()}</button>`).join('')}
        </div>
        <div class="inbox-list" id="inbox-list">
          ${inboxEmails.length === 0 ? '<div class="empty-state" style="padding:40px 16px"><p>No emails found</p></div>' :
            inboxEmails.map(e => `
              <div class="inbox-item${e.isUnread ? ' unread' : ''}${inboxSelected === e.id ? ' selected' : ''}" data-id="${e.id}">
                <div class="inbox-item-from">${escapeHtml((e.from || '').replace(/<.*>/, '').trim() || e.from)}</div>
                <div class="inbox-item-subject">${escapeHtml(e.subject || '(no subject)')}</div>
                <div class="inbox-item-snippet">${escapeHtml(e.snippet || '')}</div>
                <div class="inbox-item-date">${formatEmailDate(e.date)}</div>
              </div>
            `).join('')}
        </div>
      </div>
      <div class="inbox-reader" id="inbox-reader">
        <div class="inbox-reader-empty"><i data-lucide="mail-open" style="width:48px;height:48px;color:var(--text-muted)"></i><p style="color:var(--text-secondary);margin-top:12px">Select an email to read</p></div>
      </div>
    </div>
  `;
  lucide.createIcons();
  
  // Event: click email
  $$('.inbox-item').forEach(el => {
    el.onclick = () => openEmail(el.dataset.id);
  });
  // Event: label switch
  $$('.inbox-label-btn').forEach(btn => {
    btn.onclick = async () => {
      inboxLabel = btn.dataset.label;
      inboxSelected = null;
      await loadInboxMessages();
      renderInboxUI();
    };
  });
  // Event: search
  const si = $('#inbox-search-input');
  let searchTimeout;
  si.oninput = () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      await loadInboxMessages(si.value);
      renderInboxUI();
      $('#inbox-search-input').value = si.value;
      $('#inbox-search-input').focus();
    }, 500);
  };
  // Event: compose
  $('#inbox-compose-btn').onclick = () => openComposeModal();
}

async function openEmail(id) {
  inboxSelected = id;
  // Highlight in list
  $$('.inbox-item').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
  
  const reader = $('#inbox-reader');
  reader.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  
  try {
    const res = await fetch(`/api/gmail?action=get&id=${id}`);
    const email = await res.json();
    if (email.error) { reader.innerHTML = `<div class="empty-state"><p>${email.error}</p></div>`; return; }
    
    reader.innerHTML = `
      <div class="email-header">
        <h3 class="email-subject">${escapeHtml(email.subject || '(no subject)')}</h3>
        <div class="email-meta">
          <div><strong>From:</strong> ${escapeHtml(email.from)}</div>
          <div><strong>To:</strong> ${escapeHtml(email.to)}</div>
          <div><strong>Date:</strong> ${formatEmailDate(email.date)}</div>
        </div>
        <div class="email-actions">
          <button class="btn btn-sm btn-primary" id="reply-btn"><i data-lucide="reply"></i> Reply</button>
          <button class="btn btn-sm" id="forward-btn"><i data-lucide="forward"></i> Forward</button>
        </div>
      </div>
      <div class="email-body">${email.body || '<p style="color:#666">No content</p>'}</div>
    `;
    lucide.createIcons();
    
    // Mark as read in the list
    const listItem = $(`.inbox-item[data-id="${id}"]`);
    if (listItem) listItem.classList.remove('unread');
    
    // Reply button
    $('#reply-btn').onclick = () => openComposeModal(email.from, `Re: ${email.subject}`, '', email.id, email.threadId);
    $('#forward-btn').onclick = () => openComposeModal('', `Fwd: ${email.subject}`, email.body);
  } catch (err) {
    reader.innerHTML = `<div class="empty-state"><p>Error loading email</p></div>`;
  }
}

function openComposeModal(to = '', subject = '', body = '', inReplyTo = '', threadId = '') {
  openModal('Compose Email', `
    <div class="form-group"><label>To</label><input type="email" id="compose-to" class="form-input" value="${escapeHtml(to.replace(/<.*>/, '').includes('@') ? to.match(/[\w.-]+@[\w.-]+/)?.[0] || to : to)}" placeholder="recipient@example.com"></div>
    <div class="form-group"><label>Subject</label><input type="text" id="compose-subject" class="form-input" value="${escapeHtml(subject)}"></div>
    <div class="form-group"><label>Message</label><textarea id="compose-body" class="form-input" rows="10" placeholder="Write your email...">${body ? '\n\n--- Original Message ---\n' : ''}</textarea></div>
  `, `
    <button class="btn" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" id="send-email-btn">Send Email</button>
  `);
  
  setTimeout(() => {
    $('#send-email-btn').onclick = async () => {
      const btn = $('#send-email-btn');
      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        const res = await fetch('/api/gmail?action=send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: $('#compose-to').value,
            subject: $('#compose-subject').value,
            body: $('#compose-body').value.replace(/\n/g, '<br>'),
            inReplyTo,
            threadId,
          }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('Email sent successfully', 'success');
          closeModal();
          await loadInboxMessages();
          renderInboxUI();
        } else {
          showToast(data.error || 'Failed to send', 'error');
          btn.disabled = false;
          btn.textContent = 'Send Email';
        }
      } catch {
        showToast('Failed to send email', 'error');
        btn.disabled = false;
        btn.textContent = 'Send Email';
      }
    };
  }, 100);
}

function formatEmailDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 604800000) {
    return d.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

// ============================================
// Text Messages (Twilio SMS) Page
// ============================================
let smsConversations = [];
let smsSelectedPhone = null;
let smsMessages = [];
let smsTwilioNumber = '';

async function renderTextMessages(container) {
  container.innerHTML = `
    <div class="page-header"><h2>Text Messages</h2><p class="page-subtitle">Send and receive SMS via Twilio</p></div>
    <div id="sms-root"><div class="loading"><div class="spinner"></div></div></div>
  `;
  lucide.createIcons();
  
  try {
    const res = await fetch('/api/sms?action=status');
    const data = await res.json();
    if (data.needsSetup || data.error) {
      renderSmsSetup();
      return;
    }
    smsTwilioNumber = data.twilioNumber;
    await loadSmsConversations();
    renderSmsUI();
  } catch {
    renderSmsSetup();
  }
}

function renderSmsSetup() {
  $('#sms-root').innerHTML = `
    <div class="empty-state" style="padding:60px 20px;text-align:center">
      <div style="font-size:48px;margin-bottom:16px"><i data-lucide="smartphone" style="width:48px;height:48px;color:#4f98a3"></i></div>
      <h3 style="margin-bottom:8px">Connect Twilio</h3>
      <p style="color:#999;margin-bottom:24px">Add your Twilio credentials in Vercel environment variables to enable SMS messaging.</p>
      <p style="color:#666;font-size:13px">Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER</p>
    </div>
  `;
  lucide.createIcons();
}

async function loadSmsConversations() {
  try {
    const res = await fetch('/api/sms?action=conversations');
    const data = await res.json();
    smsConversations = data.conversations || [];
    smsTwilioNumber = data.twilioNumber || smsTwilioNumber;
  } catch { smsConversations = []; }
}

function renderSmsUI() {
  const root = $('#sms-root');
  root.innerHTML = `
    <div class="sms-layout">
      <div class="sms-sidebar">
        <div class="sms-toolbar">
          <div class="inbox-search">
            <i data-lucide="search"></i>
            <input type="text" id="sms-search-input" placeholder="Search contacts...">
          </div>
          <button class="btn btn-primary btn-sm" id="sms-new-btn"><i data-lucide="plus"></i> New</button>
        </div>
        <div class="sms-list" id="sms-list">
          ${smsConversations.length === 0 ? '<div class="empty-state" style="padding:40px 16px"><p>No conversations yet</p></div>' :
            smsConversations.map(c => `
              <div class="sms-contact${smsSelectedPhone === c.phone ? ' selected' : ''}${c.unread ? ' unread' : ''}" data-phone="${c.phone}">
                <div class="sms-contact-avatar"><i data-lucide="user"></i></div>
                <div class="sms-contact-info">
                  <div class="sms-contact-name">${formatPhone(c.phone)}</div>
                  <div class="sms-contact-preview">${escapeHtml(c.lastMessage || '').substring(0, 50)}</div>
                </div>
                <div class="sms-contact-meta">
                  <div class="sms-contact-time">${formatSmsDate(c.lastDate)}</div>
                  ${c.direction === 'inbound' ? '<div class="sms-badge">New</div>' : ''}
                </div>
              </div>
            `).join('')}
        </div>
      </div>
      <div class="sms-chat" id="sms-chat">
        <div class="sms-chat-empty"><i data-lucide="message-circle" style="width:48px;height:48px;color:var(--text-muted)"></i><p style="color:var(--text-secondary);margin-top:12px">Select a conversation or start a new one</p></div>
      </div>
    </div>
  `;
  lucide.createIcons();
  
  // Click contact
  $$('.sms-contact').forEach(el => {
    el.onclick = () => openSmsThread(el.dataset.phone);
  });
  // Search filter
  $('#sms-search-input').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    $$('.sms-contact').forEach(el => {
      el.style.display = el.dataset.phone.includes(q) || el.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  };
  // New conversation
  $('#sms-new-btn').onclick = () => openNewSmsModal();
}

async function openSmsThread(phone) {
  smsSelectedPhone = phone;
  $$('.sms-contact').forEach(el => el.classList.toggle('selected', el.dataset.phone === phone));
  
  const chat = $('#sms-chat');
  chat.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  
  try {
    const res = await fetch(`/api/sms?action=thread&phone=${encodeURIComponent(phone)}`);
    const data = await res.json();
    smsMessages = data.messages || [];
    renderSmsChat(phone);
  } catch {
    chat.innerHTML = '<div class="empty-state"><p>Error loading messages</p></div>';
  }
}

function renderSmsChat(phone) {
  const chat = $('#sms-chat');
  chat.innerHTML = `
    <div class="sms-chat-header">
      <div class="sms-chat-contact">
        <div class="sms-contact-avatar"><i data-lucide="user"></i></div>
        <div>
          <div class="sms-chat-name">${formatPhone(phone)}</div>
          <div class="sms-chat-number">${phone}</div>
        </div>
      </div>
    </div>
    <div class="sms-messages" id="sms-messages">
      ${smsMessages.length === 0 ? '<div class="sms-empty-thread"><p>No messages yet. Send the first one.</p></div>' :
        smsMessages.map(m => `
          <div class="sms-bubble ${m.direction}">
            <div class="sms-bubble-text">${escapeHtml(m.body)}</div>
            <div class="sms-bubble-time">${new Date(m.date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${m.direction === 'outbound' ? ' · ' + m.status : ''}</div>
          </div>
        `).join('')}
    </div>
    <div class="sms-input-area">
      <input type="text" id="sms-input" placeholder="Type a message..." autocomplete="off">
      <button class="btn btn-primary" id="sms-send-btn"><i data-lucide="send"></i></button>
    </div>
  `;
  lucide.createIcons();
  
  // Scroll to bottom
  const msgs = $('#sms-messages');
  msgs.scrollTop = msgs.scrollHeight;
  
  // Send message
  const sendMsg = async () => {
    const input = $('#sms-input');
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    
    // Optimistic add
    const bubble = document.createElement('div');
    bubble.className = 'sms-bubble outbound';
    bubble.innerHTML = `<div class="sms-bubble-text">${escapeHtml(body)}</div><div class="sms-bubble-time">Sending...</div>`;
    msgs.appendChild(bubble);
    msgs.scrollTop = msgs.scrollHeight;
    
    try {
      const res = await fetch('/api/sms?action=send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, body }),
      });
      const data = await res.json();
      if (data.success) {
        bubble.querySelector('.sms-bubble-time').textContent = 'Just now · ' + data.status;
        showToast('Message sent', 'success');
      } else {
        bubble.querySelector('.sms-bubble-time').textContent = 'Failed';
        bubble.classList.add('failed');
        showToast(data.error || 'Failed to send', 'error');
      }
    } catch {
      bubble.querySelector('.sms-bubble-time').textContent = 'Failed';
      bubble.classList.add('failed');
      showToast('Failed to send message', 'error');
    }
  };
  
  $('#sms-send-btn').onclick = sendMsg;
  $('#sms-input').onkeydown = (e) => { if (e.key === 'Enter') sendMsg(); };
  $('#sms-input').focus();
}

function openNewSmsModal() {
  openModal('New Message', `
    <div class="form-group"><label>Phone Number</label><input type="tel" id="new-sms-phone" class="form-input" placeholder="+1 (555) 123-4567"></div>
    <div class="form-group"><label>Message</label><textarea id="new-sms-body" class="form-input" rows="4" placeholder="Type your message..."></textarea></div>
  `, `
    <button class="btn" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" id="new-sms-send">Send Message</button>
  `);
  
  setTimeout(() => {
    $('#new-sms-send').onclick = async () => {
      const phone = $('#new-sms-phone').value.trim();
      const body = $('#new-sms-body').value.trim();
      if (!phone || !body) { showToast('Phone and message required', 'error'); return; }
      
      const btn = $('#new-sms-send');
      btn.disabled = true;
      btn.textContent = 'Sending...';
      
      try {
        const res = await fetch('/api/sms?action=send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: phone, body }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('Message sent', 'success');
          closeModal();
          smsSelectedPhone = phone;
          await loadSmsConversations();
          renderSmsUI();
          openSmsThread(phone);
        } else {
          showToast(data.error || 'Failed to send', 'error');
          btn.disabled = false;
          btn.textContent = 'Send Message';
        }
      } catch {
        showToast('Failed to send', 'error');
        btn.disabled = false;
        btn.textContent = 'Send Message';
      }
    };
  }, 100);
}

function formatPhone(phone) {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 11 && clean[0] === '1') {
    return `(${clean.slice(1,4)}) ${clean.slice(4,7)}-${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    return `(${clean.slice(0,3)}) ${clean.slice(3,6)}-${clean.slice(6)}`;
  }
  return phone;
}

function formatSmsDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000 && d.getDate() === now.getDate()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800000) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ============================================
// Theme Toggle (Light / Dark)
// ============================================
function initTheme() {
  const saved = localStorage.getItem('hermes-theme') || localStorage.getItem('ivea-theme') || 'dark';
  applyTheme(saved);
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('hermes-theme', next);
  });
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  const darkIcon = document.getElementById('theme-icon-dark');
  const lightIcon = document.getElementById('theme-icon-light');
  const label = document.getElementById('theme-label');
  if (darkIcon) darkIcon.style.display = theme === 'dark' ? '' : 'none';
  if (lightIcon) lightIcon.style.display = theme === 'light' ? '' : 'none';
  if (label) label.textContent = theme === 'dark' ? 'Dark' : 'Light';
  // Re-render chart colors if any charts exist
  updateChartTheme(theme);
}

function getThemeColor(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function updateChartTheme(theme) {
  // Update any active Chart.js instances
  if (typeof Chart !== 'undefined' && Chart.instances) {
    const gridColor = theme === 'light' ? '#e2e4e9' : '#222';
    const textColor = theme === 'light' ? '#555' : '#999';
    Object.values(Chart.instances).forEach(chart => {
      if (chart.options.scales) {
        if (chart.options.scales.x) {
          chart.options.scales.x.ticks = { ...chart.options.scales.x.ticks, color: textColor };
          chart.options.scales.x.grid = { ...chart.options.scales.x.grid, color: gridColor };
        }
        if (chart.options.scales.y) {
          chart.options.scales.y.ticks = { ...chart.options.scales.y.ticks, color: textColor };
          chart.options.scales.y.grid = { ...chart.options.scales.y.grid, color: gridColor };
        }
      }
      if (chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels) {
        chart.options.plugins.legend.labels.color = textColor;
      }
      chart.update('none');
    });
  }
}

// ============================================
// PAGE: SEO
// ============================================
async function renderSEO(container) {
  await getEmployees();
  const { data: restaurants } = await db.select('restaurants', { order: { column: 'name', ascending: true } });
  const rests = restaurants || [];

  container.innerHTML = `
    <h1 class="page-title">SEO</h1>
    <p class="page-subtitle">Local SEO management for all locations</p>
    <div class="tabs">
      <button class="tab active" data-tab="seo-gbp">Google Business</button>
      <button class="tab" data-tab="seo-keywords">Keywords</button>
      <button class="tab" data-tab="seo-citations">Citations</button>
      <button class="tab" data-tab="seo-schema">Schema Markup</button>
      <button class="tab" data-tab="seo-audit">SEO Audit</button>
      <button class="tab" data-tab="seo-maps">Maps</button>
    </div>
    <div class="tab-content" id="seo-tab-content"></div>
  `;
  const tabs = $$('.tab', container);
  const c = $('#seo-tab-content');

  async function showTab(tab) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    showLoading(c);
    if (tab === 'seo-gbp') await renderSEO_GBP(c, rests);
    else if (tab === 'seo-keywords') await renderSEO_Keywords(c, rests);
    else if (tab === 'seo-citations') await renderSEO_Citations(c, rests);
    else if (tab === 'seo-schema') await renderSEO_Schema(c, rests);
    else if (tab === 'seo-audit') await renderSEO_Audit(c, rests);
    else if (tab === 'seo-maps') await renderSEO_Maps(c, rests);
    lucide.createIcons({ nameAttr: 'data-lucide' });
  }

  tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
  await showTab('seo-gbp');
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

async function renderSEO_GBP(container, restaurants) {
  const { data: listings } = await db.select('gbp_listings');
  const items = listings || [];
  const connected = items.filter(l => l.sync_status === 'active').length;

  container.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-label">GBP Listings</div><div class="kpi-value">${items.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Connected</div><div class="kpi-value" style="color:var(--success)">${connected}</div></div>
      <div class="kpi-card"><div class="kpi-label">Needs Update</div><div class="kpi-value" style="color:var(--warning)">${items.filter(l => l.sync_status === 'stale').length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Not Connected</div><div class="kpi-value" style="color:var(--text-muted)">${restaurants.length - items.length}</div></div>
    </div>
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Search listings..." id="gbp-filter"></div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" id="gbp-sync-btn"><i data-lucide="refresh-cw"></i> Sync All</button>
        <button class="btn btn-primary btn-sm" id="gbp-connect-btn"><i data-lucide="plus"></i> Connect GBP</button>
      </div>
    </div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="map-pin" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Google Business Profiles Connected</h4>
      <p style="color:var(--text-muted)">Connect your Google Business Profile to manage listings, posts, photos, and Q&A.</p>
      <button class="btn btn-primary" id="gbp-connect-empty"><i data-lucide="plus"></i> Connect Google Business Profile</button>
    </div>` : `<div class="table-wrapper"><table>
      <thead><tr><th>Location</th><th>Place ID</th><th>Status</th><th>Last Sync</th><th>Actions</th></tr></thead>
      <tbody>${items.map(l => `<tr>
        <td><strong>${l.name || '—'}</strong></td>
        <td style="font-size:11px;color:var(--text-muted)">${l.place_id || '—'}</td>
        <td>${badgeHTML(l.sync_status || 'unknown')}</td>
        <td>${formatDate(l.last_synced_at)}</td>
        <td><button class="btn btn-secondary btn-sm">Manage</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;

  const connectBtn = $('#gbp-connect-btn') || $('#gbp-connect-empty');
  if (connectBtn) connectBtn.onclick = () => {
    toast('Google Business Profile OAuth will be configured after deployment', 'info');
  };
  const syncBtn = $('#gbp-sync-btn');
  if (syncBtn) syncBtn.onclick = () => toast('GBP sync initiated', 'info');
}

async function renderSEO_Keywords(container, restaurants) {
  const { data: keywords } = await db.select('seo_keywords', { order: { column: 'created_at', ascending: false } });
  const items = keywords || [];

  container.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-label">Tracked Keywords</div><div class="kpi-value">${items.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">In Top 3</div><div class="kpi-value" style="color:var(--success)">${items.filter(k => k.current_rank && k.current_rank <= 3).length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Local Pack</div><div class="kpi-value" style="color:var(--accent)">${items.filter(k => k.in_local_pack).length}</div></div>
    </div>
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Filter keywords..." id="kw-filter"></div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" id="kw-suggest-btn"><i data-lucide="sparkles"></i> Auto-Suggest</button>
        <button class="btn btn-primary btn-sm" id="kw-add-btn"><i data-lucide="plus"></i> Add Keyword</button>
      </div>
    </div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="search" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Keywords Tracked</h4>
      <p style="color:var(--text-muted)">Add keywords to track your local search rankings.</p>
    </div>` : `<div class="table-wrapper"><table>
      <thead><tr><th data-key="keyword">Keyword</th><th>Type</th><th data-key="current_rank">Rank</th><th>Change</th><th>Local Pack</th><th>Volume</th><th>Location</th></tr></thead>
      <tbody>${items.map(k => `<tr>
        <td><strong>${k.keyword || '—'}</strong></td>
        <td>${badgeHTML(k.keyword_type || 'custom')}</td>
        <td style="font-weight:600">${k.current_rank || '—'}</td>
        <td>${k.rank_change > 0 ? `<span style="color:var(--success)">▲${k.rank_change}</span>` : k.rank_change < 0 ? `<span style="color:var(--danger)">▼${Math.abs(k.rank_change)}</span>` : '—'}</td>
        <td>${k.in_local_pack ? '<span style="color:var(--success)">✓</span>' : '—'}</td>
        <td>${k.search_volume || '—'}</td>
        <td style="font-size:12px;color:var(--text-muted)">${k.location_name || 'All'}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;

  $('#kw-add-btn')?.addEventListener('click', () => {
    openModal('Add Keyword', `
      <div class="form-group"><label class="form-label">Keyword</label><input class="form-input" id="kw-text" placeholder="e.g., best tacos austin"></div>
      <div class="form-group"><label class="form-label">Type</label>
        <select class="form-select" id="kw-type">
          <option value="primary_cuisine">Primary Cuisine</option>
          <option value="dish_specific">Dish-Specific</option>
          <option value="intent_modifier">Intent Modifier</option>
          <option value="branded">Branded</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Restaurant</label>
        <select class="form-select" id="kw-restaurant">
          <option value="">All Locations</option>
          ${restaurants.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
        </select>
      </div>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="kw-save">Save</button>`);
    $('#kw-save').onclick = async () => {
      const keyword = $('#kw-text').value.trim();
      if (!keyword) return toast('Keyword is required', 'error');
      await db.insert('seo_keywords', {
        keyword,
        keyword_type: $('#kw-type').value,
        restaurant_id: $('#kw-restaurant').value || null,
      });
      closeModal();
      toast('Keyword added', 'success');
      await logActivity('add_keyword', `Added SEO keyword: ${keyword}`);
      navigate('seo');
    };
  });
}

async function renderSEO_Citations(container) {
  const { data: citations } = await db.select('citations');
  const items = citations || [];
  const healthy = items.filter(c => c.match_status === 'match').length;
  const mismatched = items.filter(c => c.match_status === 'mismatch').length;

  container.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-label">Total Citations</div><div class="kpi-value">${items.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">NAP Match</div><div class="kpi-value" style="color:var(--success)">${healthy}</div></div>
      <div class="kpi-card"><div class="kpi-label">Mismatch</div><div class="kpi-value" style="color:var(--danger)">${mismatched}</div></div>
    </div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="globe" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Citations Tracked</h4>
      <p style="color:var(--text-muted)">Set up your canonical NAP and start tracking directory listings.</p>
      <button class="btn btn-primary" id="setup-nap-btn"><i data-lucide="plus"></i> Set Up Canonical NAP</button>
    </div>` : `<div class="table-wrapper"><table>
      <thead><tr><th>Directory</th><th>Location</th><th>Status</th><th>Last Checked</th></tr></thead>
      <tbody>${items.map(c => `<tr>
        <td><strong>${c.directory_name || '—'}</strong></td>
        <td>${c.location_name || '—'}</td>
        <td>${c.match_status === 'match' ? '<span style="color:var(--success)">✓ Match</span>' : c.match_status === 'mismatch' ? '<span style="color:var(--danger)">✗ Mismatch</span>' : badgeHTML(c.match_status || 'unknown')}</td>
        <td>${formatDate(c.last_checked_at)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

async function renderSEO_Schema(container) {
  const { data: schemas } = await db.select('schema_markup');
  const items = schemas || [];

  container.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-label">Schema Markups</div><div class="kpi-value">${items.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Valid</div><div class="kpi-value" style="color:var(--success)">${items.filter(s => s.validation_status === 'valid').length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Needs Update</div><div class="kpi-value" style="color:var(--warning)">${items.filter(s => s.validation_status === 'outdated').length}</div></div>
    </div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="code" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Schema Markup Generated</h4>
      <p style="color:var(--text-muted)">Generate Restaurant, Menu, and FAQ schema for your locations.</p>
      <button class="btn btn-primary" id="gen-schema-btn"><i data-lucide="sparkles"></i> Auto-Generate Schema</button>
    </div>` : `<div class="table-wrapper"><table>
      <thead><tr><th>Location</th><th>Schema Type</th><th>Status</th><th>Last Updated</th><th>Actions</th></tr></thead>
      <tbody>${items.map(s => `<tr>
        <td><strong>${s.location_name || '—'}</strong></td>
        <td>${s.schema_type || '—'}</td>
        <td>${badgeHTML(s.validation_status || 'unknown')}</td>
        <td>${formatDate(s.updated_at)}</td>
        <td><button class="btn btn-secondary btn-sm">View Code</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

async function renderSEO_Audit(container) {
  const { data: audits } = await db.select('seo_audits', { order: { column: 'created_at', ascending: false } });
  const items = audits || [];

  container.innerHTML = `
    <div class="table-toolbar">
      <h3 style="margin:0">SEO Audits</h3>
      <div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="run-audit-btn"><i data-lucide="play"></i> Run New Audit</button></div>
    </div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="clipboard-check" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Audits Run Yet</h4>
      <p style="color:var(--text-muted)">Run an SEO audit to check your restaurant pages for common issues.</p>
    </div>` : `<div class="table-wrapper"><table>
      <thead><tr><th>Location</th><th>URL</th><th>Score</th><th>Issues</th><th>Date</th></tr></thead>
      <tbody>${items.map(a => `<tr>
        <td><strong>${a.location_name || '—'}</strong></td>
        <td style="font-size:12px;color:var(--text-muted)">${a.url || '—'}</td>
        <td><strong style="color:${(a.score || 0) >= 80 ? 'var(--success)' : (a.score || 0) >= 50 ? 'var(--warning)' : 'var(--danger)'}">${a.score || 0}/100</strong></td>
        <td>${a.issue_count || 0}</td>
        <td>${formatDate(a.created_at)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;

  $('#run-audit-btn')?.addEventListener('click', () => {
    openModal('Run SEO Audit', `
      <div class="form-group"><label class="form-label">Website URL</label><input class="form-input" id="audit-url" placeholder="https://www.yourrestaurant.com"></div>
      <div class="form-group"><label class="form-label">Location Name</label><input class="form-input" id="audit-loc" placeholder="e.g., Downtown Austin"></div>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="audit-run">Run Audit</button>`);
    $('#audit-run').onclick = async () => {
      const url = $('#audit-url').value.trim();
      if (!url) return toast('URL is required', 'error');
      toast('Running SEO audit...', 'info');
      closeModal();
      try {
        const resp = await fetch('/api/seo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'audit', page_url: url, restaurant_id: $('#audit-loc').value.trim() }),
        });
        if (resp.ok) { toast('Audit complete', 'success'); navigate('seo'); }
        else toast('Audit failed — check API configuration', 'error');
      } catch { toast('Audit failed — API not configured yet', 'error'); }
    };
  });
}

async function renderSEO_Maps(container) {
  const { data: rankings } = await db.select('local_search_rankings');
  const items = rankings || [];

  container.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-label">Maps Rankings Tracked</div><div class="kpi-value">${items.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">In Top 3</div><div class="kpi-value" style="color:var(--success)">${items.filter(r => r.rank && r.rank <= 3).length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Not Ranking</div><div class="kpi-value" style="color:var(--text-muted)">${items.filter(r => !r.rank || r.rank > 20).length}</div></div>
    </div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="map" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Maps Rankings Tracked</h4>
      <p style="color:var(--text-muted)">Track your Google Maps visibility for key search terms.</p>
    </div>` : `<div class="table-wrapper"><table>
      <thead><tr><th>Keyword</th><th>Location</th><th>Rank</th><th>Change</th><th>Last Check</th></tr></thead>
      <tbody>${items.map(r => `<tr>
        <td><strong>${r.keyword || '—'}</strong></td>
        <td>${r.location_name || '—'}</td>
        <td style="font-weight:600">${r.rank || '—'}</td>
        <td>${r.rank_change > 0 ? `<span style="color:var(--success)">▲${r.rank_change}</span>` : r.rank_change < 0 ? `<span style="color:var(--danger)">▼${Math.abs(r.rank_change)}</span>` : '—'}</td>
        <td>${formatDate(r.checked_at)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

// ============================================
// PAGE: Ads Manager
// ============================================
async function renderAds(container) {
  await getEmployees();
  const [connectionsRes, campaignsRes, performanceRes] = await Promise.all([
    db.select('ad_platform_connections'),
    db.select('ad_campaigns', { order: { column: 'created_at', ascending: false } }),
    db.select('ad_performance_daily', { order: { column: 'date', ascending: false }, limit: 30 }),
  ]);
  const connections = connectionsRes.data || [];
  const campaigns = campaignsRes.data || [];
  const performance = performanceRes.data || [];

  const totalSpend = performance.reduce((s, p) => s + (p.spend || 0), 0);
  const totalImpressions = performance.reduce((s, p) => s + (p.impressions || 0), 0);
  const totalClicks = performance.reduce((s, p) => s + (p.clicks || 0), 0);
  const totalConversions = performance.reduce((s, p) => s + (p.conversions || 0), 0);

  container.innerHTML = `
    <h1 class="page-title">Ads Manager</h1>
    <p class="page-subtitle">Manage Google Ads & Meta campaigns across all locations</p>
    <div class="tabs">
      <button class="tab active" data-tab="ads-overview">Overview</button>
      <button class="tab" data-tab="ads-campaigns">Campaigns</button>
      <button class="tab" data-tab="ads-creatives">Creatives</button>
      <button class="tab" data-tab="ads-audiences">Audiences</button>
      <button class="tab" data-tab="ads-experiments">A/B Tests</button>
      <button class="tab" data-tab="ads-connections">Connections</button>
    </div>
    <div class="tab-content" id="ads-tab-content"></div>
  `;
  const tabs = $$('.tab', container);
  const c = $('#ads-tab-content');

  async function showTab(tab) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    showLoading(c);
    if (tab === 'ads-overview') renderAds_Overview(c, { campaigns, performance, totalSpend, totalImpressions, totalClicks, totalConversions });
    else if (tab === 'ads-campaigns') await renderAds_Campaigns(c);
    else if (tab === 'ads-creatives') await renderAds_Creatives(c);
    else if (tab === 'ads-audiences') await renderAds_Audiences(c);
    else if (tab === 'ads-experiments') await renderAds_Experiments(c);
    else if (tab === 'ads-connections') renderAds_Connections(c, connections);
    lucide.createIcons({ nameAttr: 'data-lucide' });
  }

  tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
  showTab('ads-overview');
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

function renderAds_Overview(container, { campaigns, performance, totalSpend, totalImpressions, totalClicks, totalConversions }) {
  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0';
  const cpa = totalConversions > 0 ? (totalSpend / totalConversions).toFixed(2) : '—';

  container.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-label">Total Spend (30d)</div><div class="kpi-value">$${totalSpend.toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Impressions</div><div class="kpi-value">${totalImpressions.toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">CTR</div><div class="kpi-value" style="color:var(--accent)">${ctr}%</div></div>
      <div class="kpi-card"><div class="kpi-label">Cost / Conversion</div><div class="kpi-value" style="color:var(--success)">${cpa === '—' ? '—' : '$' + cpa}</div></div>
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-label">Active Campaigns</div><div class="kpi-value">${campaigns.filter(c => c.status === 'active').length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Conversions</div><div class="kpi-value" style="color:var(--success)">${totalConversions}</div></div>
    </div>
    ${campaigns.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="target" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Ad Campaigns Yet</h4>
      <p style="color:var(--text-muted)">Connect Google Ads or Meta to start managing campaigns.</p>
    </div>` : `<h3 style="margin:20px 0 12px">Recent Campaigns</h3>
    <div class="table-wrapper"><table>
      <thead><tr><th>Campaign</th><th>Platform</th><th>Status</th><th>Budget</th><th>Spend</th><th>Clicks</th></tr></thead>
      <tbody>${campaigns.slice(0, 10).map(c => `<tr>
        <td><strong>${c.name || '—'}</strong></td>
        <td>${badgeHTML(c.platform || '—')}</td>
        <td>${badgeHTML(c.status || 'draft')}</td>
        <td>$${(c.daily_budget || 0).toLocaleString()}/day</td>
        <td>$${(c.total_spend || 0).toLocaleString()}</td>
        <td>${(c.total_clicks || 0).toLocaleString()}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

async function renderAds_Campaigns(container) {
  const { data: campaigns } = await db.select('ad_campaigns', { order: { column: 'created_at', ascending: false } });
  const items = campaigns || [];
  const { data: restaurants } = await db.select('restaurants', { order: { column: 'name', ascending: true } });

  container.innerHTML = `
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Filter campaigns..." id="ad-camp-filter"></div>
      <div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="new-ad-camp-btn"><i data-lucide="plus"></i> Create Campaign</button></div>
    </div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="target" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Campaigns</h4>
      <p style="color:var(--text-muted)">Create your first ad campaign.</p>
    </div>` : `<div class="table-wrapper"><table>
      <thead><tr><th>Name</th><th>Platform</th><th>Objective</th><th>Status</th><th>Budget</th><th>Spend</th><th>Actions</th></tr></thead>
      <tbody>${items.map(c => `<tr>
        <td><strong>${c.name || '—'}</strong></td>
        <td>${badgeHTML(c.platform || '—')}</td>
        <td>${c.objective || '—'}</td>
        <td>${badgeHTML(c.status || 'draft')}</td>
        <td>$${(c.daily_budget || 0).toLocaleString()}/day</td>
        <td>$${(c.total_spend || 0).toLocaleString()}</td>
        <td><button class="btn btn-secondary btn-sm">Edit</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;

  $('#new-ad-camp-btn')?.addEventListener('click', () => {
    openModal('Create Ad Campaign', `
      <div class="form-group"><label class="form-label">Campaign Name</label><input class="form-input" id="ad-name" placeholder="e.g., Summer Lunch Special"></div>
      <div class="form-group"><label class="form-label">Platform</label>
        <select class="form-select" id="ad-platform"><option value="google_ads">Google Ads</option><option value="meta">Meta (Facebook/Instagram)</option></select>
      </div>
      <div class="form-group"><label class="form-label">Objective</label>
        <select class="form-select" id="ad-objective">
          <option value="store_visits">Drive Store Visits</option>
          <option value="online_orders">Online Orders</option>
          <option value="brand_awareness">Brand Awareness</option>
          <option value="reservations">Reservations</option>
          <option value="app_installs">App Installs</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Daily Budget ($)</label><input class="form-input" id="ad-budget" type="number" placeholder="50"></div>
      <div class="form-group"><label class="form-label">Restaurant</label>
        <select class="form-select" id="ad-restaurant">
          <option value="">All Locations</option>
          ${(restaurants || []).map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
        </select>
      </div>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="ad-save">Create Campaign</button>`);
    $('#ad-save').onclick = async () => {
      const name = $('#ad-name').value.trim();
      if (!name) return toast('Campaign name is required', 'error');
      await db.insert('ad_campaigns', {
        name,
        platform: $('#ad-platform').value,
        objective: $('#ad-objective').value,
        daily_budget: parseFloat($('#ad-budget').value) || 0,
        restaurant_id: $('#ad-restaurant').value || null,
        status: 'draft',
      });
      closeModal();
      toast('Campaign created', 'success');
      await logActivity('create_ad_campaign', `Created ad campaign: ${name}`);
      navigate('ads');
    };
  });
}

async function renderAds_Creatives(container) {
  const { data: creatives } = await db.select('ad_creatives', { order: { column: 'created_at', ascending: false } });
  const items = creatives || [];
  container.innerHTML = `
    <div class="table-toolbar">
      <h3 style="margin:0">Ad Creatives</h3>
      <div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="new-creative-btn"><i data-lucide="plus"></i> Upload Creative</button></div>
    </div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="image" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Creatives</h4>
      <p style="color:var(--text-muted)">Upload ad images and videos for your campaigns.</p>
    </div>` : `<div class="table-wrapper"><table>
      <thead><tr><th>Name</th><th>Type</th><th>Format</th><th>Campaign</th><th>Status</th></tr></thead>
      <tbody>${items.map(c => `<tr>
        <td><strong>${c.name || '—'}</strong></td>
        <td>${c.creative_type || '—'}</td>
        <td>${c.format || '—'}</td>
        <td>${c.campaign_name || '—'}</td>
        <td>${badgeHTML(c.status || 'draft')}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

async function renderAds_Audiences(container) {
  const { data: audiences } = await db.select('ad_audiences', { order: { column: 'created_at', ascending: false } });
  const items = audiences || [];
  container.innerHTML = `
    <div class="table-toolbar">
      <h3 style="margin:0">Audiences</h3>
      <div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="new-audience-btn"><i data-lucide="plus"></i> Create Audience</button></div>
    </div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="users" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Audiences</h4>
      <p style="color:var(--text-muted)">Create targeting audiences for your ad campaigns.</p>
    </div>` : `<div class="table-wrapper"><table>
      <thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Platform</th></tr></thead>
      <tbody>${items.map(a => `<tr>
        <td><strong>${a.name || '—'}</strong></td>
        <td>${a.audience_type || '—'}</td>
        <td>${(a.estimated_size || 0).toLocaleString()}</td>
        <td>${badgeHTML(a.platform || '—')}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

async function renderAds_Experiments(container) {
  const { data: experiments } = await db.select('ad_experiments', { order: { column: 'created_at', ascending: false } });
  const items = experiments || [];
  container.innerHTML = `
    <div class="table-toolbar">
      <h3 style="margin:0">A/B Tests</h3>
      <div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="new-experiment-btn"><i data-lucide="plus"></i> New Test</button></div>
    </div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="flask-conical" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No A/B Tests</h4>
      <p style="color:var(--text-muted)">Run A/B tests to optimize your ad performance.</p>
    </div>` : `<div class="table-wrapper"><table>
      <thead><tr><th>Test Name</th><th>Campaign</th><th>Status</th><th>Winner</th><th>Confidence</th></tr></thead>
      <tbody>${items.map(e => `<tr>
        <td><strong>${e.name || '—'}</strong></td>
        <td>${e.campaign_name || '—'}</td>
        <td>${badgeHTML(e.status || 'draft')}</td>
        <td>${e.winner || '—'}</td>
        <td>${e.confidence ? e.confidence + '%' : '—'}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

function renderAds_Connections(container, connections) {
  container.innerHTML = `
    <h3 style="margin:0 0 16px">Platform Connections</h3>
    <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);gap:16px">
      <div class="kpi-card" style="padding:24px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="width:40px;height:40px;background:#4285f4;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">G</div>
          <div><strong>Google Ads</strong><div style="font-size:12px;color:var(--text-muted)">${connections.find(c => c.platform === 'google_ads') ? 'Connected' : 'Not connected'}</div></div>
        </div>
        <button class="btn ${connections.find(c => c.platform === 'google_ads') ? 'btn-secondary' : 'btn-primary'} btn-sm" id="connect-google-ads">
          ${connections.find(c => c.platform === 'google_ads') ? 'Manage' : 'Connect'}
        </button>
      </div>
      <div class="kpi-card" style="padding:24px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="width:40px;height:40px;background:#1877f2;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">M</div>
          <div><strong>Meta Ads</strong><div style="font-size:12px;color:var(--text-muted)">${connections.find(c => c.platform === 'meta') ? 'Connected' : 'Not connected'}</div></div>
        </div>
        <button class="btn ${connections.find(c => c.platform === 'meta') ? 'btn-secondary' : 'btn-primary'} btn-sm" id="connect-meta-ads">
          ${connections.find(c => c.platform === 'meta') ? 'Manage' : 'Connect'}
        </button>
      </div>
    </div>
  `;
  $('#connect-google-ads')?.addEventListener('click', () => toast('Google Ads OAuth will be configured after deployment', 'info'));
  $('#connect-meta-ads')?.addEventListener('click', () => toast('Meta Ads OAuth will be configured after deployment', 'info'));
}

// ============================================
// PAGE: Competitors
// ============================================
async function renderCompetitors(container) {
  await getEmployees();
  const [competitorsRes, snapshotsRes, alertsRes] = await Promise.all([
    db.select('competitors', { order: { column: 'name', ascending: true } }),
    db.select('competitor_review_snapshots', { order: { column: 'snapshot_date', ascending: false }, limit: 50 }),
    db.select('competitor_alerts', { order: { column: 'created_at', ascending: false }, limit: 20 }),
  ]);
  const competitors = competitorsRes.data || [];
  const snapshots = snapshotsRes.data || [];
  const alerts = alertsRes.data || [];

  container.innerHTML = `
    <h1 class="page-title">Competitors</h1>
    <p class="page-subtitle">Monitor competitor activity, reviews, and market position</p>
    <div class="tabs">
      <button class="tab active" data-tab="comp-profiles">Profiles</button>
      <button class="tab" data-tab="comp-reviews">Reviews</button>
      <button class="tab" data-tab="comp-social">Social</button>
      <button class="tab" data-tab="comp-menu">Menu & Pricing</button>
      <button class="tab" data-tab="comp-promos">Promotions</button>
      <button class="tab" data-tab="comp-rankings">Rankings</button>
      <button class="tab" data-tab="comp-alerts">Alerts</button>
      <button class="tab" data-tab="comp-benchmark">Benchmarks</button>
    </div>
    <div class="tab-content" id="comp-tab-content"></div>
  `;
  const tabs = $$('.tab', container);
  const c = $('#comp-tab-content');

  async function showTab(tab) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    showLoading(c);
    if (tab === 'comp-profiles') renderComp_Profiles(c, competitors);
    else if (tab === 'comp-reviews') await renderComp_Reviews(c);
    else if (tab === 'comp-social') await renderComp_Social(c);
    else if (tab === 'comp-menu') await renderComp_Menu(c);
    else if (tab === 'comp-promos') await renderComp_Promos(c);
    else if (tab === 'comp-rankings') await renderComp_Rankings(c);
    else if (tab === 'comp-alerts') renderComp_Alerts(c, alerts);
    else if (tab === 'comp-benchmark') await renderComp_Benchmarks(c);
    lucide.createIcons({ nameAttr: 'data-lucide' });
  }

  tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
  showTab('comp-profiles');
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

function renderComp_Profiles(container, competitors) {
  container.innerHTML = `
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Search competitors..." id="comp-filter"></div>
      <div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="add-competitor-btn"><i data-lucide="plus"></i> Add Competitor</button></div>
    </div>
    ${competitors.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="eye" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Competitors Tracked</h4>
      <p style="color:var(--text-muted)">Add competitors to monitor their reviews, social media, and promotions.</p>
    </div>` : `<div class="brand-grid">${competitors.map(c => `
      <div class="brand-card" style="cursor:pointer">
        <div class="brand-card-logo"><span>${(c.name || '').substring(0, 2).toUpperCase()}</span></div>
        <div class="brand-card-info">
          <div class="brand-card-name">${c.name}</div>
          <div class="brand-card-meta">
            ${c.google_rating ? `<span style="color:var(--warning)">★ ${c.google_rating}</span>` : ''}
            ${c.cuisine_type ? `<span class="badge badge-accent">${c.cuisine_type}</span>` : ''}
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${c.address || '—'}</div>
        </div>
      </div>`).join('')}</div>`}
  `;

  $('#add-competitor-btn')?.addEventListener('click', () => {
    openModal('Add Competitor', `
      <div class="form-group"><label class="form-label">Competitor Name</label><input class="form-input" id="comp-name" placeholder="e.g., Taco Bell"></div>
      <div class="form-group"><label class="form-label">Google Place ID (optional)</label><input class="form-input" id="comp-place-id" placeholder="ChIJ..."></div>
      <div class="form-group"><label class="form-label">Address</label><input class="form-input" id="comp-address"></div>
      <div class="form-group"><label class="form-label">Cuisine Type</label><input class="form-input" id="comp-cuisine" placeholder="e.g., Mexican"></div>
      <div class="form-group"><label class="form-label">Website</label><input class="form-input" id="comp-website" placeholder="https://..."></div>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="comp-save">Add</button>`);
    $('#comp-save').onclick = async () => {
      const name = $('#comp-name').value.trim();
      if (!name) return toast('Name is required', 'error');
      await db.insert('competitors', {
        name,
        google_place_id: $('#comp-place-id').value.trim() || null,
        address: $('#comp-address').value.trim(),
        cuisine_type: $('#comp-cuisine').value.trim(),
        website: $('#comp-website').value.trim(),
      });
      closeModal();
      toast('Competitor added', 'success');
      await logActivity('add_competitor', `Added competitor: ${name}`);
      navigate('competitors');
    };
  });
}

async function renderComp_Reviews(container) {
  const { data: snapshots } = await db.select('competitor_review_snapshots', { order: { column: 'snapshot_date', ascending: false }, limit: 50 });
  const items = snapshots || [];
  container.innerHTML = `
    <h3 style="margin:0 0 16px">Review Monitoring</h3>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No review snapshots yet. Add competitors and enable daily sync.</p></div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Competitor</th><th>Platform</th><th>Rating</th><th>Reviews</th><th>Date</th></tr></thead>
      <tbody>${items.map(s => `<tr>
        <td><strong>${s.competitor_name || '—'}</strong></td>
        <td>${s.platform || '—'}</td>
        <td style="color:var(--warning)">★ ${s.avg_rating || '—'}</td>
        <td>${s.total_reviews || 0}</td>
        <td>${formatDate(s.snapshot_date)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

async function renderComp_Social(container) {
  const { data: snapshots } = await db.select('competitor_social_snapshots', { order: { column: 'snapshot_date', ascending: false }, limit: 50 });
  const items = snapshots || [];
  container.innerHTML = `
    <h3 style="margin:0 0 16px">Social Media Monitoring</h3>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">Track competitor social media presence. Data entered manually or via optional third-party tools.</p>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No social snapshots yet.</p></div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Competitor</th><th>Platform</th><th>Followers</th><th>Posts (30d)</th><th>Engagement</th><th>Date</th></tr></thead>
      <tbody>${items.map(s => `<tr>
        <td><strong>${s.competitor_name || '—'}</strong></td>
        <td>${s.platform || '—'}</td>
        <td>${(s.followers || 0).toLocaleString()}</td>
        <td>${s.post_count_30d || 0}</td>
        <td>${s.avg_engagement_rate ? s.avg_engagement_rate.toFixed(2) + '%' : '—'}</td>
        <td>${formatDate(s.snapshot_date)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

async function renderComp_Menu(container) {
  const { data: items } = await db.select('competitor_menu_items', { order: { column: 'competitor_name', ascending: true } });
  const menuItems = items || [];
  container.innerHTML = `
    <h3 style="margin:0 0 16px">Menu & Pricing</h3>
    ${menuItems.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No menu data tracked yet.</p></div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Competitor</th><th>Item</th><th>Category</th><th>Price</th><th>Last Updated</th></tr></thead>
      <tbody>${menuItems.map(m => `<tr>
        <td><strong>${m.competitor_name || '—'}</strong></td>
        <td>${m.item_name || '—'}</td>
        <td>${m.category || '—'}</td>
        <td>$${(m.price || 0).toFixed(2)}</td>
        <td>${formatDate(m.updated_at)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

async function renderComp_Promos(container) {
  const { data: promos } = await db.select('competitor_promotions', { order: { column: 'discovered_at', ascending: false } });
  const items = promos || [];
  container.innerHTML = `
    <h3 style="margin:0 0 16px">Competitor Promotions</h3>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No competitor promotions tracked yet.</p></div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Competitor</th><th>Promotion</th><th>Type</th><th>Platform</th><th>Discovered</th></tr></thead>
      <tbody>${items.map(p => `<tr>
        <td><strong>${p.competitor_name || '—'}</strong></td>
        <td>${p.description || '—'}</td>
        <td>${badgeHTML(p.promo_type || '—')}</td>
        <td>${p.source_platform || '—'}</td>
        <td>${formatDate(p.discovered_at)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

async function renderComp_Rankings(container) {
  const { data: rankings } = await db.select('local_search_rankings', { order: { column: 'checked_at', ascending: false }, limit: 50 });
  const items = rankings || [];
  container.innerHTML = `
    <h3 style="margin:0 0 16px">Local Search Rankings</h3>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No ranking data yet. Connect SEO tracking first.</p></div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Keyword</th><th>Your Rank</th><th>Competitor</th><th>Their Rank</th><th>Date</th></tr></thead>
      <tbody>${items.map(r => `<tr>
        <td><strong>${r.keyword || '—'}</strong></td>
        <td style="font-weight:600;color:${(r.your_rank || 99) <= 3 ? 'var(--success)' : 'var(--text)'}">${r.your_rank || '—'}</td>
        <td>${r.competitor_name || '—'}</td>
        <td>${r.competitor_rank || '—'}</td>
        <td>${formatDate(r.checked_at)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

function renderComp_Alerts(container, alerts) {
  container.innerHTML = `
    <h3 style="margin:0 0 16px">Competitor Alerts</h3>
    ${alerts.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No alerts yet. Alerts trigger when competitors get rating changes, new promotions, or significant review activity.</p></div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Alert</th><th>Competitor</th><th>Type</th><th>Date</th></tr></thead>
      <tbody>${alerts.map(a => `<tr>
        <td><strong>${a.message || '—'}</strong></td>
        <td>${a.competitor_name || '—'}</td>
        <td>${badgeHTML(a.alert_type || '—')}</td>
        <td>${formatDate(a.created_at)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

async function renderComp_Benchmarks(container) {
  const { data: benchmarks } = await db.select('competitor_benchmarks');
  const items = benchmarks || [];
  container.innerHTML = `
    <h3 style="margin:0 0 16px">Benchmarking Dashboard</h3>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="bar-chart-3" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Benchmark Data</h4>
      <p style="color:var(--text-muted)">Add competitors and enable syncing to see benchmark comparisons.</p>
    </div>` : `<div class="table-wrapper"><table>
      <thead><tr><th>Metric</th><th>You</th><th>Avg Competitor</th><th>Best Competitor</th><th>Gap</th></tr></thead>
      <tbody>${items.map(b => `<tr>
        <td><strong>${b.metric_name || '—'}</strong></td>
        <td>${b.your_value || '—'}</td>
        <td>${b.avg_competitor_value || '—'}</td>
        <td>${b.best_competitor_value || '—'} <span style="font-size:11px;color:var(--text-muted)">(${b.best_competitor_name || ''})</span></td>
        <td style="color:${(b.gap || 0) >= 0 ? 'var(--success)' : 'var(--danger)'}">${b.gap > 0 ? '+' : ''}${b.gap || '0'}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

// ============================================
// PAGE: Loyalty & Promos
// ============================================
async function renderLoyalty(container) {
  await getEmployees();
  const [promosRes, membersRes, programsRes, redemptionsRes] = await Promise.all([
    db.select('promotions', { order: { column: 'created_at', ascending: false } }),
    db.select('loyalty_members', { order: { column: 'created_at', ascending: false } }),
    db.select('loyalty_programs'),
    db.select('promotion_redemptions', { order: { column: 'redeemed_at', ascending: false }, limit: 50 }),
  ]);
  const promos = promosRes.data || [];
  const members = membersRes.data || [];
  const programs = programsRes.data || [];
  const redemptions = redemptionsRes.data || [];

  container.innerHTML = `
    <h1 class="page-title">Loyalty & Promos</h1>
    <p class="page-subtitle">Manage promotions, loyalty programs, and customer rewards</p>
    <div class="tabs">
      <button class="tab active" data-tab="loy-promos">Promotions</button>
      <button class="tab" data-tab="loy-redemptions">Redemptions</button>
      <button class="tab" data-tab="loy-program">Program</button>
      <button class="tab" data-tab="loy-members">Members</button>
      <button class="tab" data-tab="loy-rewards">Rewards</button>
      <button class="tab" data-tab="loy-tiers">Tiers</button>
      <button class="tab" data-tab="loy-triggers">Triggers</button>
      <button class="tab" data-tab="loy-analytics">Analytics</button>
    </div>
    <div class="tab-content" id="loy-tab-content"></div>
  `;
  const tabs = $$('.tab', container);
  const c = $('#loy-tab-content');

  async function showTab(tab) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    showLoading(c);
    if (tab === 'loy-promos') renderLoy_Promos(c, promos);
    else if (tab === 'loy-redemptions') renderLoy_Redemptions(c, redemptions);
    else if (tab === 'loy-program') renderLoy_Program(c, programs);
    else if (tab === 'loy-members') renderLoy_Members(c, members);
    else if (tab === 'loy-rewards') await renderLoy_Rewards(c);
    else if (tab === 'loy-tiers') await renderLoy_Tiers(c);
    else if (tab === 'loy-triggers') await renderLoy_Triggers(c);
    else if (tab === 'loy-analytics') renderLoy_Analytics(c, { promos, members, redemptions });
    lucide.createIcons({ nameAttr: 'data-lucide' });
  }

  tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
  showTab('loy-promos');
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

function renderLoy_Promos(container, promos) {
  const active = promos.filter(p => p.status === 'active');
  const expired = promos.filter(p => p.status === 'expired');

  container.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-label">Total Promos</div><div class="kpi-value">${promos.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Active</div><div class="kpi-value" style="color:var(--success)">${active.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Expired</div><div class="kpi-value" style="color:var(--text-muted)">${expired.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Redemptions</div><div class="kpi-value" style="color:var(--accent)">${promos.reduce((s, p) => s + (p.redemption_count || 0), 0)}</div></div>
    </div>
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Filter promos..." id="promo-filter"></div>
      <div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="new-promo-btn"><i data-lucide="plus"></i> Create Promotion</button></div>
    </div>
    ${promos.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="tag" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Promotions</h4>
      <p style="color:var(--text-muted)">Create your first promotion to drive customer engagement.</p>
    </div>` : `<div class="table-wrapper"><table>
      <thead><tr><th>Promotion</th><th>Type</th><th>Value</th><th>Status</th><th>Redemptions</th><th>Expires</th><th>Actions</th></tr></thead>
      <tbody>${promos.map(p => `<tr>
        <td><strong>${p.name || '—'}</strong></td>
        <td>${badgeHTML(p.promo_type || '—')}</td>
        <td>${p.discount_value ? (p.promo_type === 'percentage_off' ? p.discount_value + '%' : '$' + p.discount_value) : '—'}</td>
        <td>${badgeHTML(p.status || 'draft')}</td>
        <td>${p.redemption_count || 0}${p.max_redemptions ? '/' + p.max_redemptions : ''}</td>
        <td>${formatDate(p.expires_at)}</td>
        <td><button class="btn btn-secondary btn-sm">Edit</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;

  $('#new-promo-btn')?.addEventListener('click', () => {
    openModal('Create Promotion', `
      <div class="form-group"><label class="form-label">Promotion Name</label><input class="form-input" id="promo-name" placeholder="e.g., Happy Hour 20% Off"></div>
      <div class="form-group"><label class="form-label">Type</label>
        <select class="form-select" id="promo-type">
          <option value="percentage_off">Percentage Off</option>
          <option value="dollar_off">Dollar Off</option>
          <option value="bogo">Buy One Get One</option>
          <option value="free_item">Free Item</option>
          <option value="happy_hour">Happy Hour</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Discount Value</label><input class="form-input" id="promo-value" type="number" placeholder="e.g., 20"></div>
      <div class="form-group"><label class="form-label">Promo Code (optional)</label><input class="form-input" id="promo-code" placeholder="e.g., HAPPY20"></div>
      <div class="form-group"><label class="form-label">Max Redemptions (0 = unlimited)</label><input class="form-input" id="promo-max" type="number" value="0"></div>
      <div class="form-group"><label class="form-label">Expires</label><input class="form-input" id="promo-expires" type="date"></div>
      <div class="form-group"><label class="form-label">Description</label><textarea class="form-input" id="promo-desc" rows="3"></textarea></div>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="promo-save">Create</button>`);
    $('#promo-save').onclick = async () => {
      const name = $('#promo-name').value.trim();
      if (!name) return toast('Name is required', 'error');
      const code = $('#promo-code').value.trim().toUpperCase();
      await db.insert('promotions', {
        name,
        promo_type: $('#promo-type').value,
        discount_value: parseFloat($('#promo-value').value) || 0,
        code: code || null,
        max_redemptions: parseInt($('#promo-max').value) || null,
        expires_at: $('#promo-expires').value || null,
        description: $('#promo-desc').value.trim(),
        status: 'active',
      });
      // Also create promo code entry if code was provided
      if (code) {
        await db.insert('promotion_codes', { code, promotion_name: name, status: 'active' });
      }
      closeModal();
      toast('Promotion created', 'success');
      await logActivity('create_promotion', `Created promotion: ${name}`);
      navigate('loyalty');
    };
  });
}

function renderLoy_Redemptions(container, redemptions) {
  container.innerHTML = `
    <h3 style="margin:0 0 16px">Recent Redemptions</h3>
    ${redemptions.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No redemptions yet.</p></div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Code</th><th>Promotion</th><th>Customer</th><th>Location</th><th>Date</th></tr></thead>
      <tbody>${redemptions.map(r => `<tr>
        <td><code>${r.code || '—'}</code></td>
        <td>${r.promotion_name || '—'}</td>
        <td>${r.customer_name || r.customer_email || '—'}</td>
        <td>${r.location_name || '—'}</td>
        <td>${formatDateTime(r.redeemed_at)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

function renderLoy_Program(container, programs) {
  container.innerHTML = `
    <h3 style="margin:0 0 16px">Loyalty Programs</h3>
    <div class="table-toolbar"><div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="new-program-btn"><i data-lucide="plus"></i> Create Program</button></div></div>
    ${programs.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="crown" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Loyalty Program</h4>
      <p style="color:var(--text-muted)">Create a loyalty program to reward repeat customers.</p>
    </div>` : `<div class="brand-grid">${programs.map(p => `
      <div class="kpi-card" style="padding:20px">
        <h4 style="margin:0 0 8px">${p.name || 'Loyalty Program'}</h4>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">${p.program_type || 'points_based'} program</div>
        <div style="display:flex;gap:16px;font-size:13px">
          <div><strong>${p.member_count || 0}</strong> members</div>
          <div><strong>${p.points_per_dollar || 1}</strong> pts/$</div>
          <div>${badgeHTML(p.status || 'active')}</div>
        </div>
      </div>`).join('')}</div>`}
  `;

  $('#new-program-btn')?.addEventListener('click', () => {
    openModal('Create Loyalty Program', `
      <div class="form-group"><label class="form-label">Program Name</label><input class="form-input" id="prog-name" placeholder="e.g., Rewards Club"></div>
      <div class="form-group"><label class="form-label">Type</label>
        <select class="form-select" id="prog-type">
          <option value="points_based">Points Based</option>
          <option value="visit_based">Visit Based</option>
          <option value="spend_based">Spend Based</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Points per Dollar</label><input class="form-input" id="prog-ppp" type="number" value="1"></div>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="prog-save">Create</button>`);
    $('#prog-save').onclick = async () => {
      const name = $('#prog-name').value.trim();
      if (!name) return toast('Name is required', 'error');
      await db.insert('loyalty_programs', {
        name,
        program_type: $('#prog-type').value,
        points_per_dollar: parseInt($('#prog-ppp').value) || 1,
        status: 'active',
      });
      closeModal();
      toast('Loyalty program created', 'success');
      await logActivity('create_loyalty_program', `Created: ${name}`);
      navigate('loyalty');
    };
  });
}

function renderLoy_Members(container, members) {
  container.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-label">Total Members</div><div class="kpi-value">${members.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Active</div><div class="kpi-value" style="color:var(--success)">${members.filter(m => m.status === 'active').length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Points Issued</div><div class="kpi-value" style="color:var(--accent)">${members.reduce((s, m) => s + (m.total_points_earned || 0), 0).toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg Visits</div><div class="kpi-value">${members.length ? (members.reduce((s, m) => s + (m.visit_count || 0), 0) / members.length).toFixed(1) : 0}</div></div>
    </div>
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Search members..." id="member-filter"></div>
      <div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="add-member-btn"><i data-lucide="plus"></i> Enroll Member</button></div>
    </div>
    ${members.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No loyalty members yet.</p></div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Name</th><th>Email</th><th>Tier</th><th>Points</th><th>Visits</th><th>Joined</th></tr></thead>
      <tbody>${members.map(m => `<tr>
        <td><strong>${m.name || '—'}</strong></td>
        <td>${m.email || '—'}</td>
        <td>${badgeHTML(m.tier || 'member')}</td>
        <td>${(m.current_points || 0).toLocaleString()}</td>
        <td>${m.visit_count || 0}</td>
        <td>${formatDate(m.created_at)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;

  $('#add-member-btn')?.addEventListener('click', () => {
    openModal('Enroll Member', `
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="mem-name"></div>
      <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="mem-email" type="email"></div>
      <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="mem-phone"></div>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="mem-save">Enroll</button>`);
    $('#mem-save').onclick = async () => {
      const name = $('#mem-name').value.trim();
      const email = $('#mem-email').value.trim();
      if (!name || !email) return toast('Name and email required', 'error');
      await db.insert('loyalty_members', {
        name, email,
        phone: $('#mem-phone').value.trim(),
        tier: 'member',
        status: 'active',
        current_points: 0,
        total_points_earned: 0,
        visit_count: 0,
      });
      closeModal();
      toast('Member enrolled', 'success');
      await logActivity('enroll_member', `Enrolled: ${name}`);
      navigate('loyalty');
    };
  });
}

async function renderLoy_Rewards(container) {
  const { data: rewards } = await db.select('loyalty_rewards', { order: { column: 'points_required', ascending: true } });
  const items = rewards || [];
  container.innerHTML = `
    <div class="table-toolbar">
      <h3 style="margin:0">Rewards Catalog</h3>
      <div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="add-reward-btn"><i data-lucide="plus"></i> Add Reward</button></div>
    </div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No rewards configured yet.</p></div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Reward</th><th>Points Required</th><th>Type</th><th>Status</th></tr></thead>
      <tbody>${items.map(r => `<tr>
        <td><strong>${r.name || '—'}</strong></td>
        <td>${(r.points_required || 0).toLocaleString()} pts</td>
        <td>${r.reward_type || '—'}</td>
        <td>${badgeHTML(r.status || 'active')}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

async function renderLoy_Tiers(container) {
  const { data: tiers } = await db.select('loyalty_tiers', { order: { column: 'min_points', ascending: true } });
  const items = tiers || [];
  container.innerHTML = `
    <div class="table-toolbar">
      <h3 style="margin:0">Tier System</h3>
      <div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="add-tier-btn"><i data-lucide="plus"></i> Add Tier</button></div>
    </div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <p style="color:var(--text-muted)">No tiers configured. Default 4-tier system: Member → Silver → Gold → Platinum.</p>
      <button class="btn btn-primary" id="setup-tiers-btn"><i data-lucide="sparkles"></i> Set Up Default Tiers</button>
    </div>` : `
    <div class="brand-grid">${items.map(t => `
      <div class="kpi-card" style="padding:20px;border-left:4px solid ${t.color || 'var(--accent)'}">
        <h4 style="margin:0 0 8px">${t.name || '—'}</h4>
        <div style="font-size:13px;color:var(--text-muted)">Min: ${(t.min_points || 0).toLocaleString()} pts</div>
        <div style="font-size:13px;color:var(--text-muted)">Maintain: ${(t.maintain_points || 0).toLocaleString()} pts/year</div>
        <div style="font-size:13px;margin-top:8px">${t.benefits || '—'}</div>
      </div>`).join('')}</div>`}
  `;

  $('#setup-tiers-btn')?.addEventListener('click', async () => {
    const defaultTiers = [
      { name: 'Member', min_points: 0, maintain_points: 0, color: '#6b7280', benefits: 'Earn points on every visit', sort_order: 1 },
      { name: 'Silver', min_points: 500, maintain_points: 300, color: '#94a3b8', benefits: '5% bonus points, birthday reward', sort_order: 2 },
      { name: 'Gold', min_points: 1500, maintain_points: 1000, color: '#f59e0b', benefits: '10% bonus, priority seating, exclusive events', sort_order: 3 },
      { name: 'Platinum', min_points: 5000, maintain_points: 3000, color: '#8b5cf6', benefits: '15% bonus, free delivery, VIP events, complimentary appetizer', sort_order: 4 },
    ];
    for (const tier of defaultTiers) {
      await db.insert('loyalty_tiers', tier);
    }
    toast('Default tiers created', 'success');
    navigate('loyalty');
  });
}

async function renderLoy_Triggers(container) {
  const { data: triggers } = await db.select('automated_triggers', { order: { column: 'created_at', ascending: false } });
  const items = triggers || [];
  container.innerHTML = `
    <div class="table-toolbar">
      <h3 style="margin:0">Automated Triggers</h3>
      <div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="add-trigger-btn"><i data-lucide="plus"></i> Add Trigger</button></div>
    </div>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">Automatically send rewards or messages based on customer events.</p>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <p style="color:var(--text-muted)">No triggers configured. Set up automated birthday rewards, win-back campaigns, and more.</p>
    </div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Trigger</th><th>Event</th><th>Action</th><th>Status</th><th>Times Fired</th></tr></thead>
      <tbody>${items.map(t => `<tr>
        <td><strong>${t.name || '—'}</strong></td>
        <td>${t.trigger_event || '—'}</td>
        <td>${t.action_type || '—'}</td>
        <td>${badgeHTML(t.status || 'active')}</td>
        <td>${t.fire_count || 0}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;

  $('#add-trigger-btn')?.addEventListener('click', () => {
    openModal('Add Automated Trigger', `
      <div class="form-group"><label class="form-label">Trigger Name</label><input class="form-input" id="trig-name" placeholder="e.g., Birthday Reward"></div>
      <div class="form-group"><label class="form-label">Event</label>
        <select class="form-select" id="trig-event">
          <option value="birthday">Birthday</option>
          <option value="anniversary">Membership Anniversary</option>
          <option value="inactivity_30d">Inactive 30 Days</option>
          <option value="inactivity_60d">Inactive 60 Days</option>
          <option value="tier_upgrade">Tier Upgrade</option>
          <option value="milestone_visits">Visit Milestone</option>
          <option value="milestone_points">Points Milestone</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Action</label>
        <select class="form-select" id="trig-action">
          <option value="send_promo_code">Send Promo Code</option>
          <option value="add_bonus_points">Add Bonus Points</option>
          <option value="send_sms">Send SMS</option>
          <option value="send_email">Send Email</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Details</label><textarea class="form-input" id="trig-details" rows="2" placeholder="e.g., 20% off code, 500 bonus points..."></textarea></div>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="trig-save">Create</button>`);
    $('#trig-save').onclick = async () => {
      const name = $('#trig-name').value.trim();
      if (!name) return toast('Name is required', 'error');
      await db.insert('automated_triggers', {
        name,
        trigger_event: $('#trig-event').value,
        action_type: $('#trig-action').value,
        action_details: $('#trig-details').value.trim(),
        status: 'active',
        fire_count: 0,
      });
      closeModal();
      toast('Trigger created', 'success');
      await logActivity('create_trigger', `Created trigger: ${name}`);
      navigate('loyalty');
    };
  });
}

function renderLoy_Analytics(container, { promos, members, redemptions }) {
  const totalRedemptions = redemptions.length;
  const totalRevenue = redemptions.reduce((s, r) => s + (r.order_value || 0), 0);
  const avgOrder = totalRedemptions > 0 ? (totalRevenue / totalRedemptions).toFixed(2) : '0';

  container.innerHTML = `
    <h3 style="margin:0 0 16px">Loyalty & Promo Analytics</h3>
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-label">Total Members</div><div class="kpi-value">${members.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Active Promos</div><div class="kpi-value" style="color:var(--success)">${promos.filter(p => p.status === 'active').length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Redemptions (30d)</div><div class="kpi-value" style="color:var(--accent)">${totalRedemptions}</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg Order w/ Promo</div><div class="kpi-value">$${avgOrder}</div></div>
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr)">
      <div class="kpi-card" style="padding:20px">
        <h4 style="margin:0 0 12px">Member Tier Distribution</h4>
        ${members.length === 0 ? '<p style="color:var(--text-muted)">No members yet</p>' : `
        <div>${['member', 'silver', 'gold', 'platinum'].map(tier => {
          const count = members.filter(m => (m.tier || 'member') === tier).length;
          const pct = members.length > 0 ? ((count / members.length) * 100).toFixed(0) : 0;
          return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="width:70px;font-size:13px;text-transform:capitalize">${tier}</span>
            <div style="flex:1;background:var(--bg-tertiary);border-radius:4px;height:20px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:4px"></div>
            </div>
            <span style="font-size:13px;width:50px;text-align:right">${count} (${pct}%)</span>
          </div>`;
        }).join('')}</div>`}
      </div>
      <div class="kpi-card" style="padding:20px">
        <h4 style="margin:0 0 12px">Top Promotions</h4>
        ${promos.length === 0 ? '<p style="color:var(--text-muted)">No promotions yet</p>' : `
        <div>${promos.sort((a, b) => (b.redemption_count || 0) - (a.redemption_count || 0)).slice(0, 5).map(p => `
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:13px">${p.name}</span>
            <span style="font-size:13px;font-weight:600">${p.redemption_count || 0} uses</span>
          </div>`).join('')}</div>`}
      </div>
    </div>
  `;
}

// ============================================
// ============================================
// PAGE: Events & Tastings
// ============================================
async function renderEvents(container) {
  await getEmployees();
  const [eventsRes, invitesRes, inflRes, restRes] = await Promise.all([
    sb.from('events').select('*').order('date', { ascending: false }),
    sb.from('event_invites').select('*'),
    sb.from('influencers').select('id, name, handle, email'),
    sb.from('restaurants').select('id, name'),
  ]);
  const events = eventsRes.data || [];
  const invites = invitesRes.data || [];
  const influencers = inflRes.data || [];
  const restaurants = restRes.data || [];
  const infMap = {}; influencers.forEach(i => infMap[i.id] = i);

  let activeTab = 'upcoming';

  function getInvites(eventId) { return invites.filter(inv => inv.event_id === eventId); }

  function render() {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = events.filter(e => e.date >= today && e.status !== 'cancelled');
    const past = events.filter(e => e.date < today || e.status === 'completed' || e.status === 'cancelled');
    const totalInvites = invites.length;
    const confirmedInvites = invites.filter(i => i.status === 'confirmed' || i.status === 'attended').length;
    const confirmRate = totalInvites ? Math.round((confirmedInvites / totalInvites) * 100) : 0;
    const thisMonth = upcoming.filter(e => e.date.substring(0,7) === today.substring(0,7)).length;

    container.innerHTML = `
      <h1 class="page-title">Events & Tastings</h1>
      <p class="page-subtitle">Manage events, tastings, and influencer invitations</p>
      <div class="kpi-grid">
        <div class="kpi-card"><div class="kpi-label">Upcoming Events</div><div class="kpi-value" style="color:var(--accent)">${upcoming.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">Total Invites</div><div class="kpi-value">${totalInvites}</div></div>
        <div class="kpi-card"><div class="kpi-label">Confirmed Rate</div><div class="kpi-value" style="color:var(--success)">${confirmRate}%</div></div>
        <div class="kpi-card"><div class="kpi-label">Events This Month</div><div class="kpi-value">${thisMonth}</div></div>
      </div>
      <div class="tab-bar">
        <button class="tab-btn ${activeTab==='upcoming'?'active':''}" data-tab="upcoming">Upcoming</button>
        <button class="tab-btn ${activeTab==='past'?'active':''}" data-tab="past">Past Events</button>
        <button class="tab-btn ${activeTab==='invites'?'active':''}" data-tab="invites">All Invites</button>
        <div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="add-event-btn"><i data-lucide="plus"></i> Add Event</button></div>
      </div>
      <div id="events-tab-content"></div>
    `;
    lucide.createIcons({ nameAttr: 'data-lucide' });
    $$('.tab-btn').forEach(b => b.onclick = () => { activeTab = b.dataset.tab; render(); });

    const tc = $('#events-tab-content');
    if (activeTab === 'upcoming') {
      tc.innerHTML = upcoming.length ? `<div class="review-grid">${upcoming.map(ev => {
        const evInv = getInvites(ev.id);
        const confirmed = evInv.filter(i => i.status === 'confirmed' || i.status === 'attended').length;
        const evRest = restaurants.find(r => r.id === ev.restaurant_id);
        return `<div class="review-card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h4 style="margin:0">${ev.name}</h4>
            <span class="badge badge-${ev.type === 'tasting' ? 'info' : ev.type === 'launch' ? 'success' : 'warning'}">${ev.type}</span>
          </div>
          ${evRest ? `<div style="font-size:12px;color:var(--accent);margin-top:4px"><i data-lucide="store" style="width:12px;height:12px"></i> ${evRest.name}</div>` : ''}
          <div style="display:flex;gap:16px;margin:10px 0;font-size:13px;color:var(--text-secondary)">
            <span><i data-lucide="calendar" style="width:14px;height:14px"></i> ${ev.date}${ev.time ? ' at ' + ev.time : ''}</span>
            ${ev.location ? `<span><i data-lucide="map-pin" style="width:14px;height:14px"></i> ${ev.location}</span>` : ''}
          </div>
          ${ev.description ? `<p style="font-size:13px;color:var(--text-secondary);margin:6px 0">${ev.description}</p>` : ''}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
            <span style="font-size:13px"><strong>${confirmed}</strong>/${evInv.length} confirmed ${ev.capacity ? `(cap: ${ev.capacity})` : ''}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-xs btn-secondary" onclick="manageEventInvites(${ev.id})"><i data-lucide="users" style="width:14px;height:14px"></i> Invites</button>
              <button class="btn btn-xs btn-secondary" onclick="editEvent(${ev.id})"><i data-lucide="edit" style="width:14px;height:14px"></i></button>
              <button class="btn btn-xs btn-danger" onclick="deleteEvent(${ev.id})"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
            </div>
          </div>
        </div>`;
      }).join('')}</div>` : '<div class="empty-state"><p>No upcoming events</p></div>';
    } else if (activeTab === 'past') {
      tc.innerHTML = `<div class="table-container"><table class="data-table"><thead><tr>
        <th>Event</th><th>Type</th><th>Date</th><th>Location</th><th>Invited</th><th>Confirmed</th><th>Attended</th><th>Rate</th>
      </tr></thead><tbody>
        ${past.map(ev => {
          const evInv = getInvites(ev.id);
          const confirmed = evInv.filter(i => i.status === 'confirmed' || i.status === 'attended').length;
          const attended = evInv.filter(i => i.status === 'attended').length;
          const rate = evInv.length ? Math.round((attended / evInv.length) * 100) : 0;
          return `<tr><td>${ev.name}</td><td><span class="badge">${ev.type}</span></td><td>${ev.date}</td><td>${ev.location||'—'}</td>
            <td>${evInv.length}</td><td>${confirmed}</td><td>${attended}</td><td>${rate}%</td></tr>`;
        }).join('')}
        ${!past.length ? '<tr><td colspan="8" class="text-center">No past events</td></tr>' : ''}
      </tbody></table></div>`;
    } else if (activeTab === 'invites') {
      tc.innerHTML = `<div class="table-container"><table class="data-table"><thead><tr>
        <th>Event</th><th>Influencer</th><th>Status</th><th>Email Sent</th><th>RSVP Date</th><th>Actions</th>
      </tr></thead><tbody>
        ${invites.map(inv => {
          const ev = events.find(e => e.id === inv.event_id);
          const inf = infMap[inv.influencer_id];
          const emailBadge = inv.email_sent
            ? `<span class="badge badge-success" title="Sent ${inv.email_sent_at ? new Date(inv.email_sent_at).toLocaleString() : ''}">Sent</span>`
            : '<span class="badge badge-secondary">Not sent</span>';
          const canResend = inv.email_sent && (inv.status === 'pending' || inv.status === 'invited');
          const resendBtn = canResend
            ? `<button class="btn btn-xs btn-secondary" onclick="resendInviteEmail(${inv.id})" title="Resend invite email"><i data-lucide="mail" style="width:14px;height:14px"></i></button>`
            : '';
          return `<tr><td>${ev ? ev.name : '#' + inv.event_id}</td><td>${inf ? inf.name : (inv.name || '#' + inv.influencer_id)}</td>
            <td><select class="form-select form-select-sm" onchange="updateInviteStatus(${inv.id}, this.value)" style="width:120px">
              ${['invited','confirmed','declined','attended','no_show'].map(s => `<option value="${s}" ${inv.status===s?'selected':''}>${s.replace('_',' ')}</option>`).join('')}
            </select></td>
            <td>${emailBadge}</td>
            <td>${inv.rsvp_date ? new Date(inv.rsvp_date).toLocaleDateString() : '—'}</td>
            <td style="display:flex;gap:4px">${resendBtn}<button class="btn btn-xs btn-danger" onclick="deleteInvite(${inv.id})"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button></td></tr>`;
        }).join('')}
        ${!invites.length ? '<tr><td colspan="6" class="text-center">No invites yet</td></tr>' : ''}
      </tbody></table></div>`;
    }
    lucide.createIcons({ nameAttr: 'data-lucide' });

    // Add Event modal
    $('#add-event-btn').onclick = () => {
      openModal('Add Event', `
        <div class="form-group"><label class="form-label">Event Name</label><input class="form-input" id="ev-name" placeholder="e.g. Spring Tasting Night"></div>
        <div class="form-row"><div class="form-group"><label class="form-label">Type</label>
          <select class="form-select" id="ev-type"><option value="tasting">Tasting</option><option value="launch">Launch</option><option value="event">Event</option><option value="meetup">Meetup</option></select></div>
        <div class="form-group"><label class="form-label">Date</label><input class="form-input" id="ev-date" type="date"></div></div>
        <div class="form-row"><div class="form-group"><label class="form-label">Time</label><input class="form-input" id="ev-time" type="time"></div>
        <div class="form-group"><label class="form-label">Capacity</label><input class="form-input" id="ev-capacity" type="number" placeholder="0"></div></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Brand</label>
            <select class="form-select" id="ev-brand"><option value="">— Select Brand —</option>${restaurants.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">Location</label>
            <select class="form-select" id="ev-loc-select" disabled><option value="">— Select Brand first —</option></select></div>
        </div>
        <div class="form-group"><label class="form-label">Address / Venue</label><input class="form-input" id="ev-location" placeholder="Address or venue name"></div>
        <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="ev-desc" rows="2"></textarea></div>
      `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-event-btn">Create Event</button>`);

      // Cascade: brand → location, auto-fill address
      $('#ev-brand').onchange = async () => {
        const brandId = $('#ev-brand').value;
        const locSel = $('#ev-loc-select');
        if (!brandId) { locSel.innerHTML = '<option value="">— Select Brand first —</option>'; locSel.disabled = true; return; }
        const locs = await getRestaurantLocations(brandId);
        locSel.innerHTML = '<option value="">— All Locations —</option>' + locs.map((l, i) => `<option value="${i}">${l.name || l.address || 'Location ' + (i+1)}</option>`).join('');
        locSel.disabled = false;
      };
      $('#ev-loc-select').onchange = async () => {
        const brandId = $('#ev-brand').value;
        const locIdx = $('#ev-loc-select').value;
        if (brandId && locIdx !== '') {
          const locs = await getRestaurantLocations(brandId);
          const loc = locs[parseInt(locIdx)];
          if (loc && loc.address) $('#ev-location').value = loc.address + (loc.city ? ', ' + loc.city : '') + (loc.state ? ', ' + loc.state : '');
        }
      };

      $('#save-event-btn').onclick = async () => {
        const name = $('#ev-name').value.trim();
        const date = $('#ev-date').value;
        if (!name || !date) return toast('Name and date are required', 'error');
        const row = {
          name, type: $('#ev-type').value, date, location: $('#ev-location').value.trim(),
          description: $('#ev-desc').value.trim(), capacity: parseInt($('#ev-capacity').value) || 0,
          status: 'published',
        };
        if ($('#ev-time').value) row.time = $('#ev-time').value;
        if ($('#ev-brand').value) row.restaurant_id = $('#ev-brand').value;
        const { error } = await sb.from('events').insert(row);
        if (error) { console.error('Event insert error:', error); return toast('Failed: ' + error.message, 'error'); }
        closeModal(); toast('Event created', 'success');
        await logActivity('create_event', `Created event: ${name}`);
        navigate('events');
      };
    };
  }
  render();
}

window.editEvent = async function(id) {
  const { data: ev } = await sb.from('events').select('*').eq('id', id).single();
  if (!ev) return toast('Event not found', 'error');
  openModal('Edit Event', `
    <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="ee-name" value="${ev.name}"></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Type</label>
      <select class="form-select" id="ee-type">${['tasting','launch','event','meetup'].map(t => `<option value="${t}" ${ev.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Status</label>
      <select class="form-select" id="ee-status">${['draft','published','cancelled','completed'].map(s => `<option value="${s}" ${ev.status===s?'selected':''}>${s}</option>`).join('')}</select></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Date</label><input class="form-input" id="ee-date" type="date" value="${ev.date||''}"></div>
    <div class="form-group"><label class="form-label">Time</label><input class="form-input" id="ee-time" type="time" value="${ev.time||''}"></div></div>
    <div class="form-group"><label class="form-label">Location</label><input class="form-input" id="ee-location" value="${ev.location||''}"></div>
    <div class="form-group"><label class="form-label">Capacity</label><input class="form-input" id="ee-capacity" type="number" value="${ev.capacity||0}"></div>
    <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="ee-desc" rows="2">${ev.description||''}</textarea></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-ee-btn">Update</button>`);
  $('#save-ee-btn').onclick = async () => {
    await sb.from('events').update({
      name: $('#ee-name').value.trim(), type: $('#ee-type').value, status: $('#ee-status').value,
      date: $('#ee-date').value, time: $('#ee-time').value || null, location: $('#ee-location').value.trim(),
      capacity: parseInt($('#ee-capacity').value) || 0, description: $('#ee-desc').value.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    closeModal(); toast('Event updated', 'success'); navigate('events');
  };
};

window.deleteEvent = async function(id) {
  if (!confirm('Delete this event and all its invites?')) return;
  await sb.from('event_invites').delete().eq('event_id', id);
  await sb.from('events').delete().eq('id', id);
  toast('Event deleted', 'success'); navigate('events');
};

// Generate a random token for RSVP links
function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  return token;
}

// Build the HTML email body for an event invite
function buildInviteEmail(event, influencerName, rsvpToken) {
  const baseUrl = window.location.origin;
  const confirmUrl = `${baseUrl}/api/rsvp?token=${rsvpToken}&action=confirm`;
  const declineUrl = `${baseUrl}/api/rsvp?token=${rsvpToken}&action=decline`;
  const eventDate = event.date || '';
  const eventTime = event.time ? ` at ${event.time}` : '';
  const eventLocation = event.location || '';

  return `
    <div style="font-family:'Inter',Arial,sans-serif;max-width:560px;margin:0 auto;padding:0;color:#333">
      <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px 24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700">You're Invited!</h1>
        <p style="color:#a0aec0;margin:8px 0 0;font-size:14px">Ivea Restaurant Group</p>
      </div>
      <div style="background:#fff;padding:32px 24px;border:1px solid #e2e8f0;border-top:none">
        <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Hi ${influencerName},</p>
        <p style="font-size:15px;line-height:1.6;margin:0 0 20px">We'd love to have you at an upcoming event:</p>
        <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:0 0 24px;border-left:4px solid #4f98a3">
          <h2 style="margin:0 0 8px;font-size:18px;color:#1a1a2e">${event.name || 'Event'}</h2>
          ${eventDate ? `<p style="margin:4px 0;font-size:14px;color:#555">📅 ${eventDate}${eventTime}</p>` : ''}
          ${eventLocation ? `<p style="margin:4px 0;font-size:14px;color:#555">📍 ${eventLocation}</p>` : ''}
          ${event.description ? `<p style="margin:12px 0 0;font-size:13px;color:#666;line-height:1.5">${event.description}</p>` : ''}
        </div>
        <p style="font-size:14px;color:#555;margin:0 0 24px;text-align:center">Can you make it? Let us know:</p>
        <div style="text-align:center;margin:0 0 24px">
          <a href="${confirmUrl}" style="display:inline-block;background:#22c55e;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;margin:0 8px">✓ I'll Be There</a>
          <a href="${declineUrl}" style="display:inline-block;background:#ef4444;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;margin:0 8px">✗ Can't Make It</a>
        </div>
        <p style="font-size:12px;color:#999;text-align:center;margin:0">Just click a button above — no login required.</p>
      </div>
      <div style="text-align:center;padding:16px;font-size:11px;color:#999">
        Ivea Restaurant Group • Los Angeles, CA
      </div>
    </div>
  `;
}

// Send a single invite email
async function sendInviteEmail(event, influencer, rsvpToken) {
  const emailBody = buildInviteEmail(event, influencer.name, rsvpToken);
  try {
    const resp = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: influencer.email,
        subject: `You're Invited: ${event.name || 'Event'} — Ivea Restaurant Group`,
        body: emailBody,
      }),
    });
    const result = await resp.json();
    return { success: resp.ok, ...result };
  } catch (err) {
    console.error('Send invite email error:', err);
    return { success: false, error: err.message };
  }
}

// Resend an invite email
window.resendInviteEmail = async function(inviteId) {
  const { data: inv } = await sb.from('event_invites').select('*').eq('id', inviteId).single();
  if (!inv) return toast('Invite not found', 'error');
  const { data: ev } = await sb.from('events').select('*').eq('id', inv.event_id).single();
  const { data: inf } = await sb.from('influencers').select('id,name,handle,email').eq('id', inv.influencer_id).single();
  if (!inf?.email) return toast(`${inf?.name || 'Influencer'} has no email address`, 'error');

  let token = inv.rsvp_token;
  if (!token) {
    token = generateToken();
    await sb.from('event_invites').update({ rsvp_token: token }).eq('id', inviteId);
  }

  toast('Sending invite email...', 'info');
  const result = await sendInviteEmail(ev, inf, token);
  if (result.success) {
    await sb.from('event_invites').update({ email_sent: true, email_sent_at: new Date().toISOString() }).eq('id', inviteId);
    toast(`Invite resent to ${inf.name}`, 'success');
  } else {
    toast(`Failed to send: ${result.error || 'Unknown error'}. Check Settings → Email for SMTP config.`, 'error');
  }
};

window.manageEventInvites = async function(eventId) {
  const { data: ev } = await sb.from('events').select('*').eq('id', eventId).single();
  const { data: existingInvites } = await sb.from('event_invites').select('*').eq('event_id', eventId);
  const { data: allInf } = await sb.from('influencers').select('id, name, handle, email');
  const existing = new Set((existingInvites || []).map(i => i.influencer_id));

  openModal(`Invite Influencers — ${ev?.name || ''}`, `
    <div style="max-height:400px;overflow-y:auto">
      ${(allInf || []).map(inf => {
        const hasEmail = !!inf.email;
        return `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);${!hasEmail && !existing.has(inf.id) ? 'opacity:0.5' : ''}">
          <input type="checkbox" class="inv-check" value="${inf.id}" ${existing.has(inf.id) ? 'checked disabled' : ''} ${!hasEmail && !existing.has(inf.id) ? 'disabled' : ''}>
          <span>${inf.name}</span><span style="color:var(--text-muted);font-size:12px">@${inf.handle || ''}</span>
          ${existing.has(inf.id) ? '<span class="badge badge-info" style="margin-left:auto">Already invited</span>' : ''}
          ${!hasEmail && !existing.has(inf.id) ? '<span class="badge" style="margin-left:auto;background:#fef2f2;color:#ef4444;font-size:10px">No email</span>' : ''}
        </label>`;
      }).join('')}
    </div>
    <p style="font-size:11px;color:var(--text-muted);margin-top:8px">An invitation email with RSVP buttons will be sent to each selected influencer.</p>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="send-invites-btn"><i data-lucide="send" style="width:14px;height:14px"></i> Send Invites</button>`);
  lucide.createIcons({ nameAttr: 'data-lucide' });

  $('#send-invites-btn').onclick = async () => {
    const newIds = [...document.querySelectorAll('.inv-check:checked:not(:disabled)')].map(cb => parseInt(cb.value));
    if (!newIds.length) return toast('Select influencers to invite', 'error');

    const btn = $('#send-invites-btn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    let sent = 0;
    let failed = 0;

    for (const infId of newIds) {
      const inf = (allInf || []).find(i => i.id === infId);
      if (!inf) continue;

      const token = generateToken();
      // Create the invite record with RSVP token
      await sb.from('event_invites').insert({
        event_id: eventId,
        influencer_id: infId,
        status: 'invited',
        rsvp_token: token,
        email_sent: false,
      });

      // Send the actual email if they have an email address
      if (inf.email) {
        const result = await sendInviteEmail(ev, inf, token);
        if (result.success) {
          await sb.from('event_invites').update({ email_sent: true, email_sent_at: new Date().toISOString() }).eq('rsvp_token', token);
          sent++;
        } else {
          console.error(`Failed to email ${inf.name}:`, result.error);
          failed++;
        }
      }
    }

    closeModal();
    if (sent > 0) toast(`Invited ${sent} influencer(s) — emails sent!`, 'success');
    if (failed > 0) toast(`${failed} email(s) failed to send. Check Settings → Email.`, 'error');
    await logActivity('invite_event', `Invited ${newIds.length} to ${ev?.name} (${sent} emails sent)`);
    navigate('events');
  };
};

window.updateInviteStatus = async function(id, status) {
  await sb.from('event_invites').update({ status, rsvp_date: new Date().toISOString() }).eq('id', id);
  toast('Status updated', 'success');
};

window.deleteInvite = async function(id) {
  if (!confirm('Remove this invite?')) return;
  await sb.from('event_invites').delete().eq('id', id);
  toast('Invite removed', 'success'); navigate('events');
};

// ============================================
// Init
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  // Check for Gmail callback redirect
  const params = new URLSearchParams(window.location.search);
  if (params.get('page') === 'inbox' && params.get('connected') === 'true') {
    window.history.replaceState({}, '', '/');
    currentPage = 'inbox';
  }
  initAuth();
});

// Make navigate global for onclick handlers
window.navigate = navigate;
window.closeModal = closeModal;

