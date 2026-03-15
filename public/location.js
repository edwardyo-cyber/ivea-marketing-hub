/* ============================================
   Hermes iMedia — Location App
   All 20 features, scoped to a single restaurant_id
   Uses db.js wrapper (routes through /api/data)
   ============================================ */

// --- Supabase Init (needed for db.js proxy) ---
const SUPABASE_URL = 'https://zmdubmumgdyuyjajjxjs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptZHVibXVtZ2R5dXlqYWpqeGpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTIxMjQsImV4cCI6MjA4ODY4ODEyNH0.91FozXtednnxnKMTPJVNeOr1is4-du9dofPu4NuR2QE';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
installDbProxy();

// --- State ---
let currentUser = null;
let currentPage = 'dashboard';
let aiMessages = [];
let notifications = [];
let chartInstances = {};
let restaurantId = null;
let restaurantData = null;
let locationData = null;

// --- URL Params ---
const urlParams = new URLSearchParams(window.location.search);
restaurantId = urlParams.get('restaurant_id');

// Set restaurant_id on db so all queries are auto-scoped
if (restaurantId) db.setRestaurantId(restaurantId);

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

function getInitials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

function badgeHTML(status) {
  const colors = { active: 'success', published: 'success', draft: 'muted', review: 'warning', approved: 'accent', scheduled: 'accent', expired: 'muted', paused: 'warning', completed: 'success', pending: 'warning', match: 'success', mismatch: 'danger' };
  const c = colors[status] || 'accent';
  return `<span class="badge badge-${c}">${status}</span>`;
}

function canEdit() { return currentUser && ['Owner', 'Admin', 'Manager'].includes(currentUser.role); }

function showLoading(container) {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function logActivity(action, details) {
  if (!currentUser) return;
  await db.insert('activity_log', { employee_id: currentUser.id, action, details });
}

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

function hasRole(...roles) {
  return roles.includes(currentUser?.role);
}

function timeAgo(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
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

function statusColor(s) {
  const m = { draft: '#666', review: '#f59e0b', approved: '#3b82f6', scheduled: '#8b5cf6', published: '#22c55e', active: '#22c55e', planning: '#f59e0b', paused: '#ef4444', completed: '#3b82f6', sent: '#22c55e' };
  return m[s] || '#666';
}

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
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevMonth.getDate() - i;
      cells += `<div class="calendar-day other-month"><div class="calendar-day-num">${d}</div></div>`;
    }
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

// --- Auth (shared from localStorage) ---
function initAuth() {
  const saved = localStorage.getItem('hermes_user');
  if (!saved) {
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Inter,sans-serif;color:#888"><div style="text-align:center"><h2>Not Logged In</h2><p>Please log in from the main hub first.</p><a href="/" style="color:var(--accent)">Go to Main Hub</a></div></div>';
    return;
  }
  currentUser = JSON.parse(saved);
  if (!restaurantId) {
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Inter,sans-serif;color:#888"><div style="text-align:center"><h2>No Restaurant Selected</h2><p>Open a location from the main hub.</p><a href="/" style="color:var(--accent)">Go to Main Hub</a></div></div>';
    return;
  }
  loadRestaurantAndShow();
}

async function loadRestaurantAndShow() {
  const { data: rest } = await db.getById('restaurants', restaurantId);
  if (!rest) {
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Inter,sans-serif;color:#888"><div style="text-align:center"><h2>Restaurant Not Found</h2><a href="/" style="color:var(--accent)">Go to Main Hub</a></div></div>';
    return;
  }
  restaurantData = rest;

  // Load location info if location_index provided
  const locIndex = urlParams.get('location_index');
  if (locIndex !== null) {
    const locVal = await db.getSetting(`locations_${restaurantId}`);
    const locations = locVal ? JSON.parse(locVal) : [];
    locationData = locations[parseInt(locIndex)] || null;
  }

  // Update page title
  const locName = locationData?.name || restaurantData.name;
  document.title = `${locName} — Hermes iMedia`;
  $('#sidebar-title').textContent = locName;

  showApp();
}

// --- Sidebar Nav (location-level: subset of main hub) ---
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
    { id: 'campaigns', icon: 'megaphone', label: 'Campaigns' },
  ]},
  { section: 'Communications', items: [
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
      if (item.id === 'settings' && !['Owner'].includes(currentUser?.role)) return;
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
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

function renderHeader() {
  const hu = $('#header-user');
  hu.innerHTML = `
    <div class="user-avatar" style="background:${currentUser.avatar_color || '#4f98a3'};width:28px;height:28px;font-size:11px">${getInitials(currentUser.name)}</div>
    <span class="header-user-name">${currentUser.name.split(' ')[0]}</span>
  `;
  $('#hamburger-btn').onclick = () => {
    $('#sidebar').classList.toggle('open');
    let ov = document.querySelector('.sidebar-overlay');
    if (!ov) {
      ov = el('div', { className: 'sidebar-overlay' });
      ov.onclick = () => { $('#sidebar').classList.remove('open'); ov.classList.remove('open'); };
      document.body.appendChild(ov);
    }
    ov.classList.toggle('open');
  };
}

// --- App Show ---
function showApp() {
  renderSidebar();
  renderHeader();
  initAI();
  initNotifications();
  navigate(currentPage);
  lucide.createIcons();
}

// --- Routing ---
function navigate(page) {
  currentPage = page;
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  $$('.nav-item').forEach(n => {
    const label = n.querySelector('span')?.textContent;
    const match = NAV_ITEMS.flatMap(g => g.items).find(i => i.id === page);
    if (match && label === match.label) n.classList.add('active');
  });
  $('#sidebar').classList.remove('open');
  const ov = document.querySelector('.sidebar-overlay');
  if (ov) ov.classList.remove('open');

  const pc = $('#page-content');
  showLoading(pc);
  const locName = locationData?.name || restaurantData?.name || 'Location';

  // All pages use db.* which auto-injects restaurant_id
  const pages = {
    'dashboard': () => renderLocDashboard(pc, locName),
    'restaurants': () => renderLocInfo(pc, locName),
    'content': () => renderLocContent(pc, locName),
    'calendar': () => renderLocCalendar(pc, locName),
    'influencers': () => renderLocInfluencers(pc, locName),
    'campaigns': () => renderLocCampaigns(pc, locName),
    'media': () => renderLocMedia(pc, locName),
    'email-sms': () => renderLocEmailSms(pc, locName),
    'inbox': () => renderLocInbox(pc, locName),
    'text-messages': () => renderLocTextMessages(pc, locName),
    'reviews': () => renderLocReviews(pc, locName),
    'seo': () => renderLocSEO(pc, locName),
    'ads': () => renderLocAds(pc, locName),
    'competitors': () => renderLocCompetitors(pc, locName),
    'loyalty': () => renderLocLoyalty(pc, locName),
    'reports': () => renderLocReports(pc, locName),
    'social-accounts': () => renderLocSocialAccounts(pc, locName),
    'team': () => renderLocTeam(pc, locName),
    'audit-log': () => renderLocAuditLog(pc, locName),
    'settings': () => renderLocSettings(pc, locName),
  };
  if (pages[page]) pages[page]();
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
function closeModal() { $('#modal-overlay').classList.remove('open'); }
window.closeModal = closeModal;
window.navigate = navigate;

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

// ============================================
// SCOPED PAGES — All queries auto-inject restaurant_id via db
// ============================================

async function renderLocDashboard(container, locName) {
  await getEmployees();
  const [postsRes, campaignsRes, reviewsRes, socialRes, activityRes] = await Promise.all([
    db.select('content_posts'),
    db.select('campaigns'),
    db.select('reviews'),
    db.select('social_accounts'),
    db.select('activity_log', { order: { column: 'created_at', ascending: false }, limit: 20 }),
  ]);
  const posts = postsRes.data || [];
  const campaigns = campaignsRes.data || [];
  const reviews = reviewsRes.data || [];
  const social = socialRes.data || [];
  const activity = activityRes.data || [];

  const now = new Date();
  const weekAgo = new Date(now - 7 * 86400000);
  const postsThisWeek = posts.filter(p => new Date(p.created_at) >= weekAgo).length;
  const pendingApprovals = posts.filter(p => p.status === 'review').length;
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
  const avgEngagement = social.length ? (social.reduce((s, a) => s + (parseFloat(a.engagement_rate) || 0), 0) / social.length).toFixed(1) : '0';
  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1) : '—';

  // Insights
  const urgentReviews = reviews.filter(r => r.rating <= 2 && r.status !== 'responded' && !r.is_responded);
  const underSpending = campaigns.filter(c => c.status === 'active' && c.budget > 0 && (c.spend / c.budget) < 0.3);

  container.innerHTML = `
    <h1 class="page-title">${locName} — Dashboard</h1>
    <p class="page-subtitle">Welcome back, ${currentUser.name.split(' ')[0]}. Here's your location overview.</p>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Posts This Week</div><div class="kpi-value">${postsThisWeek}</div></div>
      <div class="kpi-card"><div class="kpi-label">Pending Approvals</div><div class="kpi-value" style="color:${pendingApprovals > 0 ? 'var(--warning)' : ''}">${pendingApprovals}</div></div>
      <div class="kpi-card"><div class="kpi-label">Active Campaigns</div><div class="kpi-value" style="color:var(--success)">${activeCampaigns}</div></div>
      <div class="kpi-card"><div class="kpi-label">Reviews</div><div class="kpi-value">${reviews.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg Rating</div><div class="kpi-value" style="color:var(--warning)">${avgRating}</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg Engagement</div><div class="kpi-value">${avgEngagement}%</div></div>
    </div>
    <div class="quick-actions">
      <button class="quick-action" onclick="navigate('content')"><i data-lucide="plus"></i> New Post</button>
      <button class="quick-action" onclick="navigate('campaigns')"><i data-lucide="megaphone"></i> Plan Campaign</button>
      <button class="quick-action" onclick="navigate('calendar')"><i data-lucide="calendar"></i> View Calendar</button>
      <button class="quick-action" onclick="navigate('reviews')"><i data-lucide="message-square"></i> Reviews</button>
    </div>
    ${(urgentReviews.length || underSpending.length || pendingApprovals > 0) ? `
    <h3 class="section-title">Action Insights</h3>
    <div class="insight-grid">
      ${urgentReviews.length ? `<div class="insight-card danger"><div class="insight-title">Urgent Reviews</div><div class="insight-desc">${urgentReviews.length} negative review(s) need responses</div></div>` : ''}
      ${underSpending.length ? `<div class="insight-card"><div class="insight-title">Under-Spending Campaigns</div><div class="insight-desc">${underSpending.length} campaign(s) below 30% budget utilization</div></div>` : ''}
      ${pendingApprovals > 0 ? `<div class="insight-card"><div class="insight-title">Pending Review Backlog</div><div class="insight-desc">${pendingApprovals} post(s) awaiting approval</div></div>` : ''}
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

async function renderLocInfo(container, locName) {
  container.innerHTML = `
    <h1 class="page-title">${locName} — Location Info</h1>
    <div class="kpi-card" style="padding:24px;max-width:600px">
      <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;font-size:14px">
        <strong>Brand:</strong> <span>${restaurantData?.name || '—'}</span>
        <strong>Location:</strong> <span>${locationData?.name || '—'}</span>
        <strong>Address:</strong> <span>${locationData?.address || '—'}</span>
        <strong>City:</strong> <span>${locationData?.city || '—'}</span>
        <strong>State:</strong> <span>${locationData?.state || '—'}</span>
        <strong>Phone:</strong> <span>${locationData?.phone || '—'}</span>
        <strong>Manager:</strong> <span>${locationData?.manager || '—'}</span>
        <strong>Status:</strong> <span>${badgeHTML(locationData?.status || restaurantData?.status || 'active')}</span>
      </div>
    </div>
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

// --- Generic scoped list page factory ---
async function renderScopedTable(container, locName, { title, table, columns, orderCol, emptyIcon, emptyText, addLabel, addFields, onSave }) {
  const { data: items } = await db.select(table, { order: orderCol ? { column: orderCol, ascending: false } : undefined });
  const rows = items || [];

  container.innerHTML = `
    <h1 class="page-title">${locName} — ${title}</h1>
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Filter..." id="scoped-filter"></div>
      <div style="margin-left:auto">
        ${addLabel && canEdit() ? `<button class="btn btn-primary btn-sm" id="scoped-add-btn"><i data-lucide="plus"></i> ${addLabel}</button>` : ''}
      </div>
    </div>
    ${rows.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="${emptyIcon || 'inbox'}" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">${emptyText || 'No data yet'}</h4>
    </div>` : `<div class="table-wrapper"><table>
      <thead><tr>${columns.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${columns.map(c => `<td>${c.render ? c.render(r) : (r[c.key] || '—')}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`}
  `;

  if (addLabel && addFields) {
    $('#scoped-add-btn')?.addEventListener('click', () => {
      const fieldsHTML = addFields.map(f => `<div class="form-group"><label class="form-label">${f.label}</label>${f.type === 'select' ? `<select class="form-select" id="add-${f.key}">${f.options.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}</select>` : f.type === 'textarea' ? `<textarea class="form-input" id="add-${f.key}" rows="3">${f.default || ''}</textarea>` : `<input class="form-input" id="add-${f.key}" type="${f.type || 'text'}" value="${f.default || ''}" placeholder="${f.placeholder || ''}">`}</div>`).join('');
      openModal(`Add ${addLabel}`, fieldsHTML, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="scoped-save">Save</button>`);
      $('#scoped-save').onclick = async () => {
        const obj = {};
        addFields.forEach(f => { obj[f.key] = $(`#add-${f.key}`).value; });
        if (onSave) await onSave(obj);
        else await db.insert(table, obj);
        closeModal();
        toast(`${title} item added`, 'success');
        navigate(currentPage);
      };
    });
  }

  lucide.createIcons({ nameAttr: 'data-lucide' });
}

// --- 20 Page Renderers (Scoped) ---

async function renderLocContent(c, ln) {
  await getEmployees();
  c.innerHTML = `
    <h1 class="page-title">${ln} — Content Hub</h1>
    <p class="page-subtitle">Manage posts, calendar, and brand assets</p>
    <div class="tabs">
      <button class="tab active" data-tab="posts">Posts</button>
      <button class="tab" data-tab="content-cal">Calendar</button>
      <button class="tab" data-tab="assets">Asset Library</button>
    </div>
    <div id="content-tab-content"></div>
  `;
  const tabs = $$('.tab', c);
  tabs.forEach(t => t.onclick = () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    loadLocContentTab(t.dataset.tab);
  });
  loadLocContentTab('posts');
}

async function loadLocContentTab(tab) {
  const c = $('#content-tab-content');
  showLoading(c);
  if (tab === 'posts') await renderLocPostsTab(c);
  else if (tab === 'content-cal') await renderLocContentCalTab(c);
  else if (tab === 'assets') await renderLocAssetsTab(c);
}

async function renderLocPostsTab(container) {
  const { data: posts } = await db.select('content_posts', { order: { column: 'created_at', ascending: false } });
  const items = posts || [];
  let selected = new Set();
  const statusOpts = ['draft', 'review', 'approved', 'scheduled', 'published'];

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
      <td class="table-actions">
        <button class="btn-icon btn-ghost" onclick="editPost('${p.id}')"><i data-lucide="edit-2"></i></button>
        <button class="btn-icon btn-ghost" onclick="deletePost('${p.id}')"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>`;
  }

  container.innerHTML = `
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Filter posts..." id="posts-filter"></div>
      <select class="form-select" style="width:150px" id="posts-status-filter">
        <option value="">All Statuses</option>
        ${statusOpts.map(s => `<option value="${s}">${s}</option>`).join('')}
      </select>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="csvExport(${JSON.stringify(items).replace(/"/g, '&quot;')}, 'posts')"><i data-lucide="download"></i> Export</button>
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
          <th>Actions</th>
        </tr></thead>
        <tbody id="posts-tbody">${items.map(postRow).join('')}</tbody>
      </table>
    </div>
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });

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
      for (const id of selected) await db.update('content_posts', id, { status: this.value });
      toast('Status updated', 'success');
      loadLocContentTab('posts');
    };
    $('#bulk-delete-posts').onclick = () => openConfirm('Delete Posts', `Delete ${selected.size} post(s)?`, async () => {
      for (const id of selected) await db.delete('content_posts', id);
      toast('Posts deleted', 'success');
      loadLocContentTab('posts');
    });
  }
  bindCheckboxes();
  const selectAll = $('#posts-select-all');
  if (selectAll) selectAll.onchange = () => {
    $$('.post-check').forEach(cb => { cb.checked = selectAll.checked; if (cb.checked) selected.add(cb.value); else selected.delete(cb.value); });
    updateBulk();
  };

  $('#new-post-btn')?.addEventListener('click', () => editPost(null));

  const table = $('table', container);
  if (table) makeSortable(table, items, postRow, $('#posts-tbody'));
}

window.editPost = async function(id) {
  let post = {};
  if (id) {
    const { data } = await db.getById('content_posts', id);
    post = data || {};
  }
  const allPlatforms = ['Instagram', 'Facebook', 'Twitter', 'TikTok', 'LinkedIn', 'YouTube', 'Pinterest'];
  const selectedPlatforms = parseJSON(post.platforms).map(p => p.toLowerCase());
  openModal(id ? 'Edit Post' : 'New Post', `
    <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="post-title" value="${post.title || ''}"></div>
    <div class="form-group"><label class="form-label">Body</label><textarea class="form-textarea" id="post-body" rows="4">${post.body || ''}</textarea>
      <button class="btn btn-sm ai-gen-btn" id="ai-gen-post" type="button"><i data-lucide="sparkles"></i> Generate with AI</button>
      <div class="ai-gen-inline" id="ai-gen-post-inline" style="display:none">
        <input type="text" class="form-input" id="ai-gen-post-prompt" placeholder="What should this post be about?">
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
      <textarea class="form-textarea" id="post-media-urls" rows="2" placeholder="Paste image or video URLs, one per line">${parseJSON(post.media_urls).join('\n')}</textarea>
    </div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="post-notes" rows="2">${post.notes || ''}</textarea></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-post-btn">Save</button>`);

  $$('#post-platforms .chip').forEach(c => c.onclick = () => c.classList.toggle('selected'));

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
      $('#post-body').value = result;
      toast('Content generated', 'success');
      $('#ai-gen-post-inline').style.display = 'none';
    }
  };
  $('#ai-gen-post-prompt')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#ai-gen-post-go').click(); });

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
      await db.update('content_posts', id, obj);
      await logActivity('update_post', `Updated post: ${obj.title}`);
    } else {
      obj.created_by = currentUser.id;
      await db.insert('content_posts', obj);
      await logActivity('create_post', `Created post: ${obj.title}`);
    }
    closeModal();
    toast(id ? 'Post updated' : 'Post created', 'success');
    loadLocContentTab('posts');
  };
};

window.deletePost = function(id) {
  openConfirm('Delete Post', 'Are you sure you want to delete this post?', async () => {
    await db.delete('content_posts', id);
    await logActivity('delete_post', 'Deleted a post');
    toast('Post deleted', 'success');
    loadLocContentTab('posts');
  });
};

async function renderLocContentCalTab(container) {
  const { data: posts } = await db.select('content_posts');
  renderMonthCalendar(container, posts || [], 'scheduled_date', (p) => {
    return `<div class="calendar-event" style="background:${statusColor(p.status)};color:#fff;font-size:10px;padding:1px 4px;border-radius:3px;margin-bottom:2px" title="${p.title}">${p.title?.slice(0, 20) || 'Post'}</div>`;
  });
}

async function renderLocAssetsTab(container) {
  const { data: assets } = await db.select('assets', { order: { column: 'created_at', ascending: false } });
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
      await db.insert('assets', {
        name: $('#asset-name').value,
        file_type: $('#asset-type').value,
        category: $('#asset-category').value,
        file_url: $('#asset-url').value,
        tags: $('#asset-tags').value.split(',').map(t => t.trim()).filter(Boolean),
        uploaded_by: currentUser.id,
      });
      closeModal();
      toast('Asset added', 'success');
      loadLocContentTab('assets');
    };
  };
}

window.deleteAsset = function(id) {
  openConfirm('Delete Asset', 'Are you sure you want to delete this asset?', async () => {
    await db.delete('assets', id);
    toast('Asset deleted', 'success');
    loadLocContentTab('assets');
  });
};

async function renderLocCalendar(c, ln) {
  const [postsRes, campaignsRes] = await Promise.all([
    db.select('content_posts'),
    db.select('campaigns'),
  ]);
  const posts = postsRes.data || [];
  const campaigns = campaignsRes.data || [];

  const sources = { posts: true, campaigns: true };
  const colors = { posts: '#8b5cf6', campaigns: '#22c55e' };

  c.innerHTML = `
    <h1 class="page-title">${ln} — Unified Calendar</h1>
    <p class="page-subtitle">All marketing events for this location</p>
    <div class="filter-toggles" id="cal-filters">
      <div class="filter-toggle active" data-source="posts"><span class="filter-dot" style="background:#8b5cf6"></span> Posts</div>
      <div class="filter-toggle active" data-source="campaigns"><span class="filter-dot" style="background:#22c55e"></span> Campaigns</div>
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
      if (sources.campaigns) campaigns.filter(cm => cm.start_date?.startsWith(dateStr)).forEach(cm => {
        events += `<div class="calendar-event" style="background:${colors.campaigns};color:#fff" title="Campaign: ${cm.name}">${cm.name?.slice(0, 15)}</div>`;
      });
      return events;
    });
  }
  renderCal();
}

async function renderLocInfluencers(c, ln) {
  await renderScopedTable(c, ln, {
    title: 'Influencers', table: 'influencers',
    columns: [
      { label: 'Name', key: 'name', render: r => `<strong>${r.name || '—'}</strong>` },
      { label: 'Handle', key: 'handle' },
      { label: 'Platform', key: 'platform', render: r => badgeHTML(r.platform || '—') },
      { label: 'Followers', key: 'followers', render: r => (r.followers || 0).toLocaleString() },
      { label: 'Status', key: 'pipeline_stage', render: r => badgeHTML(r.pipeline_stage || 'lead') },
    ],
    orderCol: 'created_at', emptyIcon: 'users', emptyText: 'No influencers for this location',
    addLabel: 'Add Influencer',
    addFields: [
      { key: 'name', label: 'Name', placeholder: 'Influencer name' },
      { key: 'handle', label: 'Handle', placeholder: '@handle' },
      { key: 'platform', label: 'Platform', type: 'select', options: [{ value: 'instagram', label: 'Instagram' }, { value: 'tiktok', label: 'TikTok' }, { value: 'youtube', label: 'YouTube' }, { value: 'twitter', label: 'Twitter' }] },
      { key: 'followers', label: 'Followers', type: 'number' },
    ],
  });
}

async function renderLocCampaigns(c, ln) {
  await getEmployees();
  const { data: campaigns } = await db.select('campaigns', { order: { column: 'created_at', ascending: false } });
  const items = campaigns || [];

  function rowHTML(camp) {
    const pct = camp.budget > 0 ? Math.round((camp.spend / camp.budget) * 100) : 0;
    const pctColor = pct < 30 ? 'var(--warning)' : pct > 90 ? 'var(--danger)' : 'var(--success)';
    return `<tr>
      <td>${camp.name}</td>
      <td>${badgeHTML(camp.campaign_type)}</td>
      <td>${badgeHTML(camp.status)}</td>
      <td>${formatDate(camp.start_date)} — ${formatDate(camp.end_date)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="progress-bar" style="width:80px"><div class="progress-fill" style="width:${pct}%;background:${pctColor}"></div></div>
          <span style="font-size:11px">$${(camp.spend || 0).toLocaleString()} / $${(camp.budget || 0).toLocaleString()}</span>
        </div>
      </td>
      <td>${parseJSON(camp.platforms).map(p => `<span class="badge badge-platform">${p}</span>`).join(' ')}</td>
      <td>${camp.kpi_actual || '—'} / ${camp.kpi_target || '—'}</td>
      <td class="table-actions">
        <button class="btn-icon btn-ghost" onclick="editCampaign('${camp.id}')"><i data-lucide="edit-2"></i></button>
        <button class="btn-icon btn-ghost" onclick="deleteCampaign('${camp.id}')"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>`;
  }

  c.innerHTML = `
    <h1 class="page-title">${ln} — Campaigns</h1>
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
  $('#camp-export')?.addEventListener('click', () => csvExport(items, 'campaigns'));
  $('#new-camp-btn')?.addEventListener('click', () => editCampaign(null));
}

window.editCampaign = async function(id) {
  let camp = {};
  if (id) {
    const { data } = await db.getById('campaigns', id);
    camp = data || {};
  }
  const types = ['seasonal', 'promotion', 'brand', 'influencer'];
  const statuses = ['planning', 'active', 'paused', 'completed'];
  const allPlatforms = ['Instagram', 'Facebook', 'Twitter', 'TikTok', 'LinkedIn', 'YouTube'];
  const selPlatforms = parseJSON(camp.platforms).map(p => p.toLowerCase());

  openModal(id ? 'Edit Campaign' : 'New Campaign', `
    <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="camp-name" value="${camp.name || ''}"></div>
    <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="camp-desc">${camp.description || ''}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Type</label>
        <select class="form-select" id="camp-type">${types.map(t => `<option value="${t}" ${camp.campaign_type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label class="form-label">Status</label>
        <select class="form-select" id="camp-status">${statuses.map(s => `<option value="${s}" ${camp.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Start Date</label><input class="form-input" type="date" id="camp-start" value="${camp.start_date || ''}"></div>
      <div class="form-group"><label class="form-label">End Date</label><input class="form-input" type="date" id="camp-end" value="${camp.end_date || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Budget ($)</label><input class="form-input" type="number" id="camp-budget" value="${camp.budget || ''}"></div>
      <div class="form-group"><label class="form-label">Spend ($)</label><input class="form-input" type="number" id="camp-spend" value="${camp.spend || ''}"></div>
    </div>
    <div class="form-group"><label class="form-label">Platforms</label>
      <div class="chip-select" id="camp-platforms">${allPlatforms.map(p => `<div class="chip ${selPlatforms.includes(p.toLowerCase()) ? 'selected' : ''}" data-value="${p}">${p}</div>`).join('')}</div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">KPI Target</label><input class="form-input" id="camp-kpi-target" value="${camp.kpi_target || ''}"></div>
      <div class="form-group"><label class="form-label">KPI Actual</label><input class="form-input" id="camp-kpi-actual" value="${camp.kpi_actual || ''}"></div>
    </div>
    <div class="form-group"><label class="form-label">Owner</label>
      <select class="form-select" id="camp-owner"><option value="">None</option>${employeeOptions(camp.owner_id)}</select>
    </div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="camp-notes">${camp.notes || ''}</textarea></div>
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
      await db.update('campaigns', id, obj);
      await logActivity('update_campaign', `Updated campaign: ${obj.name}`);
    } else {
      await db.insert('campaigns', obj);
      await logActivity('create_campaign', `Created campaign: ${obj.name}`);
    }
    closeModal();
    toast(id ? 'Campaign updated' : 'Campaign created', 'success');
    navigate('campaigns');
  };
};

window.deleteCampaign = function(id) {
  openConfirm('Delete Campaign', 'Are you sure?', async () => {
    await db.delete('campaigns', id);
    toast('Deleted', 'success');
    navigate('campaigns');
  });
};

async function renderLocMedia(c, ln) {
  await renderScopedTable(c, ln, {
    title: 'Local Media', table: 'media_contacts',
    columns: [
      { label: 'Name', key: 'name', render: r => `<strong>${r.name || '—'}</strong>` },
      { label: 'Outlet', key: 'outlet' },
      { label: 'Type', key: 'type', render: r => badgeHTML(r.type || '—') },
      { label: 'Relationship', key: 'relationship', render: r => badgeHTML(r.relationship || 'cold') },
    ],
    orderCol: 'created_at', emptyIcon: 'newspaper', emptyText: 'No media contacts',
    addLabel: 'Add Contact',
    addFields: [
      { key: 'name', label: 'Name', placeholder: 'Contact name' },
      { key: 'outlet', label: 'Outlet', placeholder: 'Outlet name' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'type', label: 'Type', type: 'select', options: [{ value: 'journalist', label: 'Journalist' }, { value: 'blogger', label: 'Blogger' }, { value: 'tv', label: 'TV' }, { value: 'radio', label: 'Radio' }] },
    ],
  });
}

async function renderLocEmailSms(c, ln) {
  await renderScopedTable(c, ln, {
    title: 'Email & SMS', table: 'email_campaigns',
    columns: [
      { label: 'Name', key: 'name', render: r => `<strong>${r.name || '—'}</strong>` },
      { label: 'Channel', key: 'channel', render: r => badgeHTML(r.channel || 'email') },
      { label: 'Status', key: 'status', render: r => badgeHTML(r.status || 'draft') },
      { label: 'Open Rate', key: 'open_rate', render: r => r.open_rate ? r.open_rate + '%' : '—' },
    ],
    orderCol: 'created_at', emptyIcon: 'mail', emptyText: 'No email/SMS campaigns',
  });
}

async function renderLocInbox(c, ln) {
  c.innerHTML = `
    <h1 class="page-title">${ln} — Inbox</h1>
    <div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="inbox" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4>Gmail Inbox</h4>
      <p style="color:var(--text-muted)">Gmail integration scoped to this location. Configure in Settings.</p>
    </div>
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

async function renderLocTextMessages(c, ln) {
  c.innerHTML = `
    <h1 class="page-title">${ln} — Text Messages</h1>
    <div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="smartphone" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4>Text Messages</h4>
      <p style="color:var(--text-muted)">SMS messaging scoped to this location. Configure Twilio in Settings.</p>
    </div>
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

async function renderLocReviews(c, ln) {
  await getEmployees();
  const { data: reviews } = await db.select('reviews', { order: { column: 'created_at', ascending: false } });
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
    c.innerHTML = `
      <h1 class="page-title">${ln} — Reviews</h1>
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

    $$('.rev-check').forEach(cb => {
      cb.onchange = () => {
        if (cb.checked) selected.add(cb.value); else selected.delete(cb.value);
        $('#rev-bulk-respond').style.display = selected.size > 0 ? '' : 'none';
      };
    });
    $('#rev-bulk-respond').onclick = async () => {
      for (const rid of selected) {
        await db.update('reviews', rid, { status: 'responded', response_by: currentUser.id, response_date: new Date().toISOString().slice(0, 10) });
      }
      toast(`Marked ${selected.size} reviews as responded`, 'success');
      selected.clear();
      navigate('reviews');
    };
  }
  render();
}

window.respondToReview = async function(id) {
  const { data: reviewData } = await db.getById('reviews', id);
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
    <textarea class="form-textarea" id="review-response" rows="4" placeholder="Write your response..."></textarea>
    <button class="btn btn-sm ai-gen-btn" id="ai-gen-review" type="button"><i data-lucide="sparkles"></i> AI Suggest Response</button>
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-response-btn">Submit Response</button>`);
  lucide.createIcons({ nameAttr: 'data-lucide' });

  $('#ai-gen-review').onclick = async () => {
    const btn = $('#ai-gen-review');
    btn.innerHTML = '<i data-lucide="loader"></i> Generating...';
    btn.disabled = true;
    const rating = review.rating || 3;
    const restaurantName = review.restaurant_name || 'our restaurant';
    const reviewText = review.review_text || review.content || 'the customer experience';
    const result = await generateAIContent(
      `You are a restaurant manager responding to a ${rating}-star review for ${restaurantName}.
The review says: "${reviewText}"
Write a professional, warm response. ${rating >= 4 ? 'Thank the customer genuinely and encourage them to return.' : 'Apologize sincerely, acknowledge the specific issue, and offer to make it right.'}
Keep it under 100 words. Sound human, not corporate.`, 200
    );
    btn.innerHTML = '<i data-lucide="sparkles"></i> AI Suggest Response';
    btn.disabled = false;
    lucide.createIcons({ nameAttr: 'data-lucide' });
    if (result) {
      $('#review-response').value = result;
      toast('Response generated — review and edit before submitting', 'success');
    } else {
      toast('Failed to generate response', 'error');
    }
  };

  $('#save-response-btn').onclick = async () => {
    const response = $('#review-response').value;
    if (!response.trim()) return toast('Please write a response', 'error');
    await db.update('reviews', id, {
      response_text: response,
      status: 'responded',
      response_by: currentUser.id,
      response_date: new Date().toISOString().slice(0, 10),
    });
    await logActivity('respond_review', 'Responded to a review');
    closeModal();
    toast('Response submitted', 'success');
    navigate('reviews');
  };
};

async function renderLocSEO(c, ln) {
  await getEmployees();

  c.innerHTML = `
    <h1 class="page-title">${ln} — SEO</h1>
    <p class="page-subtitle">Local SEO management for this location</p>
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
  const tabs = $$('.tab', c);
  const tc = $('#seo-tab-content');

  async function showTab(tab) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    showLoading(tc);
    if (tab === 'seo-gbp') await renderLocSEO_GBP(tc);
    else if (tab === 'seo-keywords') await renderLocSEO_Keywords(tc);
    else if (tab === 'seo-citations') await renderLocSEO_Citations(tc);
    else if (tab === 'seo-schema') await renderLocSEO_Schema(tc);
    else if (tab === 'seo-audit') await renderLocSEO_Audit(tc);
    else if (tab === 'seo-maps') await renderLocSEO_Maps(tc);
    lucide.createIcons({ nameAttr: 'data-lucide' });
  }

  tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
  await showTab('seo-gbp');
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

async function renderLocSEO_GBP(container) {
  const { data: listings } = await db.select('gbp_listings');
  const items = listings || [];
  const connected = items.filter(l => l.sync_status === 'active').length;
  container.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-label">GBP Listings</div><div class="kpi-value">${items.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Connected</div><div class="kpi-value" style="color:var(--success)">${connected}</div></div>
      <div class="kpi-card"><div class="kpi-label">Needs Update</div><div class="kpi-value" style="color:var(--warning)">${items.filter(l => l.sync_status === 'stale').length}</div></div>
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
      <p style="color:var(--text-muted)">Connect your Google Business Profile to manage listings.</p>
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
  $('#gbp-connect-btn')?.addEventListener('click', () => toast('Google Business Profile OAuth will be configured after deployment', 'info'));
  $('#gbp-sync-btn')?.addEventListener('click', () => toast('GBP sync initiated', 'info'));
}

async function renderLocSEO_Keywords(container) {
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
      <div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="kw-add-btn"><i data-lucide="plus"></i> Add Keyword</button></div>
    </div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="search" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Keywords Tracked</h4>
      <p style="color:var(--text-muted)">Add keywords to track your local search rankings.</p>
    </div>` : `<div class="table-wrapper"><table>
      <thead><tr><th data-key="keyword">Keyword</th><th>Type</th><th data-key="current_rank">Rank</th><th>Change</th><th>Local Pack</th><th>Volume</th></tr></thead>
      <tbody>${items.map(k => `<tr>
        <td><strong>${k.keyword || '—'}</strong></td>
        <td>${badgeHTML(k.keyword_type || 'custom')}</td>
        <td style="font-weight:600">${k.current_rank || '—'}</td>
        <td>${k.rank_change > 0 ? `<span style="color:var(--success)">▲${k.rank_change}</span>` : k.rank_change < 0 ? `<span style="color:var(--danger)">▼${Math.abs(k.rank_change)}</span>` : '—'}</td>
        <td>${k.in_local_pack ? '<span style="color:var(--success)">✓</span>' : '—'}</td>
        <td>${k.search_volume || '—'}</td>
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
    `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="kw-save">Save</button>`);
    $('#kw-save').onclick = async () => {
      const keyword = $('#kw-text').value.trim();
      if (!keyword) return toast('Keyword is required', 'error');
      await db.insert('seo_keywords', { keyword, keyword_type: $('#kw-type').value });
      closeModal();
      toast('Keyword added', 'success');
      await logActivity('add_keyword', `Added SEO keyword: ${keyword}`);
      navigate('seo');
    };
  });
}

async function renderLocSEO_Citations(container) {
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
    </div>` : `<div class="table-wrapper"><table>
      <thead><tr><th>Directory</th><th>Location</th><th>Status</th><th>Last Checked</th></tr></thead>
      <tbody>${items.map(ci => `<tr>
        <td><strong>${ci.directory_name || '—'}</strong></td>
        <td>${ci.location_name || '—'}</td>
        <td>${ci.match_status === 'match' ? '<span style="color:var(--success)">✓ Match</span>' : ci.match_status === 'mismatch' ? '<span style="color:var(--danger)">✗ Mismatch</span>' : badgeHTML(ci.match_status || 'unknown')}</td>
        <td>${formatDate(ci.last_checked_at)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

async function renderLocSEO_Schema(container) {
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
      <p style="color:var(--text-muted)">Generate Restaurant, Menu, and FAQ schema for this location.</p>
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

async function renderLocSEO_Audit(container) {
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
      <p style="color:var(--text-muted)">Run an SEO audit to check this location for common issues.</p>
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
          body: JSON.stringify({ action: 'audit', page_url: url, restaurant_id: restaurantId }),
        });
        if (resp.ok) { toast('Audit complete', 'success'); navigate('seo'); }
        else toast('Audit failed — check API configuration', 'error');
      } catch { toast('Audit failed — API not configured yet', 'error'); }
    };
  });
}

async function renderLocSEO_Maps(container) {
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

async function renderLocAds(c, ln) {
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

  c.innerHTML = `
    <h1 class="page-title">${ln} — Ads Manager</h1>
    <p class="page-subtitle">Manage ad campaigns for this location</p>
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
  const tabs = $$('.tab', c);
  const tc = $('#ads-tab-content');

  async function showTab(tab) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    showLoading(tc);
    if (tab === 'ads-overview') renderLocAds_Overview(tc, { campaigns, performance, totalSpend, totalImpressions, totalClicks, totalConversions });
    else if (tab === 'ads-campaigns') await renderLocAds_Campaigns(tc);
    else if (tab === 'ads-creatives') await renderLocAds_Creatives(tc);
    else if (tab === 'ads-audiences') await renderLocAds_Audiences(tc);
    else if (tab === 'ads-experiments') await renderLocAds_Experiments(tc);
    else if (tab === 'ads-connections') renderLocAds_Connections(tc, connections);
    lucide.createIcons({ nameAttr: 'data-lucide' });
  }

  tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
  showTab('ads-overview');
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

function renderLocAds_Overview(container, { campaigns, performance, totalSpend, totalImpressions, totalClicks, totalConversions }) {
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
      <div class="kpi-card"><div class="kpi-label">Active Campaigns</div><div class="kpi-value">${campaigns.filter(cm => cm.status === 'active').length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Conversions</div><div class="kpi-value" style="color:var(--success)">${totalConversions}</div></div>
    </div>
    ${campaigns.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="target" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Ad Campaigns Yet</h4>
      <p style="color:var(--text-muted)">Connect Google Ads or Meta to start managing campaigns.</p>
    </div>` : `<h3 style="margin:20px 0 12px">Recent Campaigns</h3>
    <div class="table-wrapper"><table>
      <thead><tr><th>Campaign</th><th>Platform</th><th>Status</th><th>Budget</th><th>Spend</th><th>Clicks</th></tr></thead>
      <tbody>${campaigns.slice(0, 10).map(cm => `<tr>
        <td><strong>${cm.name || '—'}</strong></td>
        <td>${badgeHTML(cm.platform || '—')}</td>
        <td>${badgeHTML(cm.status || 'draft')}</td>
        <td>$${(cm.daily_budget || 0).toLocaleString()}/day</td>
        <td>$${(cm.total_spend || 0).toLocaleString()}</td>
        <td>${(cm.total_clicks || 0).toLocaleString()}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

async function renderLocAds_Campaigns(container) {
  const { data: campaigns } = await db.select('ad_campaigns', { order: { column: 'created_at', ascending: false } });
  const items = campaigns || [];
  container.innerHTML = `
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Filter campaigns..." id="ad-camp-filter"></div>
      <div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="new-ad-camp-btn"><i data-lucide="plus"></i> Create Campaign</button></div>
    </div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="target" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Campaigns</h4>
    </div>` : `<div class="table-wrapper"><table>
      <thead><tr><th>Name</th><th>Platform</th><th>Objective</th><th>Status</th><th>Budget</th><th>Spend</th></tr></thead>
      <tbody>${items.map(cm => `<tr>
        <td><strong>${cm.name || '—'}</strong></td>
        <td>${badgeHTML(cm.platform || '—')}</td>
        <td>${cm.objective || '—'}</td>
        <td>${badgeHTML(cm.status || 'draft')}</td>
        <td>$${(cm.daily_budget || 0).toLocaleString()}/day</td>
        <td>$${(cm.total_spend || 0).toLocaleString()}</td>
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
          <option value="store_visits">Drive Store Visits</option><option value="online_orders">Online Orders</option><option value="brand_awareness">Brand Awareness</option><option value="reservations">Reservations</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Daily Budget ($)</label><input class="form-input" id="ad-budget" type="number" placeholder="50"></div>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="ad-save">Create Campaign</button>`);
    $('#ad-save').onclick = async () => {
      const name = $('#ad-name').value.trim();
      if (!name) return toast('Campaign name is required', 'error');
      await db.insert('ad_campaigns', { name, platform: $('#ad-platform').value, objective: $('#ad-objective').value, daily_budget: parseFloat($('#ad-budget').value) || 0, status: 'draft' });
      closeModal();
      toast('Campaign created', 'success');
      await logActivity('create_ad_campaign', `Created ad campaign: ${name}`);
      navigate('ads');
    };
  });
}

async function renderLocAds_Creatives(container) {
  const { data: creatives } = await db.select('ad_creatives', { order: { column: 'created_at', ascending: false } });
  const items = creatives || [];
  container.innerHTML = `
    <div class="table-toolbar"><h3 style="margin:0">Ad Creatives</h3><div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="new-creative-btn"><i data-lucide="plus"></i> Upload Creative</button></div></div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><i data-lucide="image" style="width:48px;height:48px;color:var(--text-muted)"></i><h4 style="margin:12px 0 4px">No Creatives</h4></div>` : `<div class="table-wrapper"><table>
      <thead><tr><th>Name</th><th>Type</th><th>Format</th><th>Campaign</th><th>Status</th></tr></thead>
      <tbody>${items.map(cr => `<tr><td><strong>${cr.name || '—'}</strong></td><td>${cr.creative_type || '—'}</td><td>${cr.format || '—'}</td><td>${cr.campaign_name || '—'}</td><td>${badgeHTML(cr.status || 'draft')}</td></tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

async function renderLocAds_Audiences(container) {
  const { data: audiences } = await db.select('ad_audiences', { order: { column: 'created_at', ascending: false } });
  const items = audiences || [];
  container.innerHTML = `
    <div class="table-toolbar"><h3 style="margin:0">Audiences</h3><div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="new-audience-btn"><i data-lucide="plus"></i> Create Audience</button></div></div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><i data-lucide="users" style="width:48px;height:48px;color:var(--text-muted)"></i><h4 style="margin:12px 0 4px">No Audiences</h4></div>` : `<div class="table-wrapper"><table>
      <thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Platform</th></tr></thead>
      <tbody>${items.map(a => `<tr><td><strong>${a.name || '—'}</strong></td><td>${a.audience_type || '—'}</td><td>${(a.estimated_size || 0).toLocaleString()}</td><td>${badgeHTML(a.platform || '—')}</td></tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

async function renderLocAds_Experiments(container) {
  const { data: experiments } = await db.select('ad_experiments', { order: { column: 'created_at', ascending: false } });
  const items = experiments || [];
  container.innerHTML = `
    <div class="table-toolbar"><h3 style="margin:0">A/B Tests</h3><div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="new-experiment-btn"><i data-lucide="plus"></i> New Test</button></div></div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><i data-lucide="flask-conical" style="width:48px;height:48px;color:var(--text-muted)"></i><h4 style="margin:12px 0 4px">No A/B Tests</h4></div>` : `<div class="table-wrapper"><table>
      <thead><tr><th>Test Name</th><th>Campaign</th><th>Status</th><th>Winner</th><th>Confidence</th></tr></thead>
      <tbody>${items.map(e => `<tr><td><strong>${e.name || '—'}</strong></td><td>${e.campaign_name || '—'}</td><td>${badgeHTML(e.status || 'draft')}</td><td>${e.winner || '—'}</td><td>${e.confidence ? e.confidence + '%' : '—'}</td></tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

function renderLocAds_Connections(container, connections) {
  container.innerHTML = `
    <h3 style="margin:0 0 16px">Platform Connections</h3>
    <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);gap:16px">
      <div class="kpi-card" style="padding:24px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="width:40px;height:40px;background:#4285f4;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">G</div>
          <div><strong>Google Ads</strong><div style="font-size:12px;color:var(--text-muted)">${connections.find(cn => cn.platform === 'google_ads') ? 'Connected' : 'Not connected'}</div></div>
        </div>
        <button class="btn ${connections.find(cn => cn.platform === 'google_ads') ? 'btn-secondary' : 'btn-primary'} btn-sm" id="connect-google-ads">
          ${connections.find(cn => cn.platform === 'google_ads') ? 'Manage' : 'Connect'}
        </button>
      </div>
      <div class="kpi-card" style="padding:24px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="width:40px;height:40px;background:#1877f2;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">M</div>
          <div><strong>Meta Ads</strong><div style="font-size:12px;color:var(--text-muted)">${connections.find(cn => cn.platform === 'meta') ? 'Connected' : 'Not connected'}</div></div>
        </div>
        <button class="btn ${connections.find(cn => cn.platform === 'meta') ? 'btn-secondary' : 'btn-primary'} btn-sm" id="connect-meta-ads">
          ${connections.find(cn => cn.platform === 'meta') ? 'Manage' : 'Connect'}
        </button>
      </div>
    </div>
  `;
  $('#connect-google-ads')?.addEventListener('click', () => toast('Google Ads OAuth will be configured after deployment', 'info'));
  $('#connect-meta-ads')?.addEventListener('click', () => toast('Meta Ads OAuth will be configured after deployment', 'info'));
}

async function renderLocCompetitors(c, ln) {
  await getEmployees();
  const [competitorsRes, snapshotsRes, alertsRes] = await Promise.all([
    db.select('competitors', { order: { column: 'name', ascending: true } }),
    db.select('competitor_review_snapshots', { order: { column: 'snapshot_date', ascending: false }, limit: 50 }),
    db.select('competitor_alerts', { order: { column: 'created_at', ascending: false }, limit: 20 }),
  ]);
  const competitors = competitorsRes.data || [];
  const alerts = alertsRes.data || [];

  c.innerHTML = `
    <h1 class="page-title">${ln} — Competitors</h1>
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
  const tabs = $$('.tab', c);
  const tc = $('#comp-tab-content');

  async function showTab(tab) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    showLoading(tc);
    if (tab === 'comp-profiles') renderLocComp_Profiles(tc, competitors);
    else if (tab === 'comp-reviews') await renderLocComp_Reviews(tc);
    else if (tab === 'comp-social') await renderLocComp_Social(tc);
    else if (tab === 'comp-menu') await renderLocComp_Menu(tc);
    else if (tab === 'comp-promos') await renderLocComp_Promos(tc);
    else if (tab === 'comp-rankings') await renderLocComp_Rankings(tc);
    else if (tab === 'comp-alerts') renderLocComp_Alerts(tc, alerts);
    else if (tab === 'comp-benchmark') await renderLocComp_Benchmarks(tc);
    lucide.createIcons({ nameAttr: 'data-lucide' });
  }

  tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
  showTab('comp-profiles');
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

function renderLocComp_Profiles(container, competitors) {
  container.innerHTML = `
    <div class="table-toolbar">
      <div class="search-filter"><i data-lucide="search"></i><input type="text" placeholder="Search competitors..." id="comp-filter"></div>
      <div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="add-competitor-btn"><i data-lucide="plus"></i> Add Competitor</button></div>
    </div>
    ${competitors.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="eye" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Competitors Tracked</h4>
      <p style="color:var(--text-muted)">Add competitors to monitor their reviews, social media, and promotions.</p>
    </div>` : `<div class="brand-grid">${competitors.map(cm => `
      <div class="brand-card" style="cursor:pointer">
        <div class="brand-card-logo"><span>${(cm.name || '').substring(0, 2).toUpperCase()}</span></div>
        <div class="brand-card-info">
          <div class="brand-card-name">${cm.name}</div>
          <div class="brand-card-meta">
            ${cm.google_rating ? `<span style="color:var(--warning)">★ ${cm.google_rating}</span>` : ''}
            ${cm.cuisine_type ? `<span class="badge badge-accent">${cm.cuisine_type}</span>` : ''}
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${cm.address || '—'}</div>
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
      await db.insert('competitors', { name, google_place_id: $('#comp-place-id').value.trim() || null, address: $('#comp-address').value.trim(), cuisine_type: $('#comp-cuisine').value.trim(), website: $('#comp-website').value.trim() });
      closeModal();
      toast('Competitor added', 'success');
      await logActivity('add_competitor', `Added competitor: ${name}`);
      navigate('competitors');
    };
  });
}

async function renderLocComp_Reviews(container) {
  const { data: snapshots } = await db.select('competitor_review_snapshots', { order: { column: 'snapshot_date', ascending: false }, limit: 50 });
  const items = snapshots || [];
  container.innerHTML = `<h3 style="margin:0 0 16px">Review Monitoring</h3>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No review snapshots yet.</p></div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Competitor</th><th>Platform</th><th>Rating</th><th>Reviews</th><th>Date</th></tr></thead>
      <tbody>${items.map(s => `<tr><td><strong>${s.competitor_name || '—'}</strong></td><td>${s.platform || '—'}</td><td style="color:var(--warning)">★ ${s.avg_rating || '—'}</td><td>${s.total_reviews || 0}</td><td>${formatDate(s.snapshot_date)}</td></tr>`).join('')}</tbody>
    </table></div>`}`;
}

async function renderLocComp_Social(container) {
  const { data: snapshots } = await db.select('competitor_social_snapshots', { order: { column: 'snapshot_date', ascending: false }, limit: 50 });
  const items = snapshots || [];
  container.innerHTML = `<h3 style="margin:0 0 16px">Social Media Monitoring</h3>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No social snapshots yet.</p></div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Competitor</th><th>Platform</th><th>Followers</th><th>Posts (30d)</th><th>Engagement</th><th>Date</th></tr></thead>
      <tbody>${items.map(s => `<tr><td><strong>${s.competitor_name || '—'}</strong></td><td>${s.platform || '—'}</td><td>${(s.followers || 0).toLocaleString()}</td><td>${s.post_count_30d || 0}</td><td>${s.avg_engagement_rate ? s.avg_engagement_rate.toFixed(2) + '%' : '—'}</td><td>${formatDate(s.snapshot_date)}</td></tr>`).join('')}</tbody>
    </table></div>`}`;
}

async function renderLocComp_Menu(container) {
  const { data: items } = await db.select('competitor_menu_items', { order: { column: 'competitor_name', ascending: true } });
  const menuItems = items || [];
  container.innerHTML = `<h3 style="margin:0 0 16px">Menu & Pricing</h3>
    ${menuItems.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No menu data tracked yet.</p></div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Competitor</th><th>Item</th><th>Category</th><th>Price</th><th>Last Updated</th></tr></thead>
      <tbody>${menuItems.map(m => `<tr><td><strong>${m.competitor_name || '—'}</strong></td><td>${m.item_name || '—'}</td><td>${m.category || '—'}</td><td>$${(m.price || 0).toFixed(2)}</td><td>${formatDate(m.updated_at)}</td></tr>`).join('')}</tbody>
    </table></div>`}`;
}

async function renderLocComp_Promos(container) {
  const { data: promos } = await db.select('competitor_promotions', { order: { column: 'discovered_at', ascending: false } });
  const items = promos || [];
  container.innerHTML = `<h3 style="margin:0 0 16px">Competitor Promotions</h3>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No competitor promotions tracked yet.</p></div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Competitor</th><th>Promotion</th><th>Type</th><th>Platform</th><th>Discovered</th></tr></thead>
      <tbody>${items.map(p => `<tr><td><strong>${p.competitor_name || '—'}</strong></td><td>${p.description || '—'}</td><td>${badgeHTML(p.promo_type || '—')}</td><td>${p.source_platform || '—'}</td><td>${formatDate(p.discovered_at)}</td></tr>`).join('')}</tbody>
    </table></div>`}`;
}

async function renderLocComp_Rankings(container) {
  const { data: rankings } = await db.select('local_search_rankings', { order: { column: 'checked_at', ascending: false }, limit: 50 });
  const items = rankings || [];
  container.innerHTML = `<h3 style="margin:0 0 16px">Local Search Rankings</h3>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No ranking data yet.</p></div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Keyword</th><th>Your Rank</th><th>Competitor</th><th>Their Rank</th><th>Date</th></tr></thead>
      <tbody>${items.map(r => `<tr><td><strong>${r.keyword || '—'}</strong></td><td style="font-weight:600;color:${(r.your_rank || 99) <= 3 ? 'var(--success)' : 'var(--text)'}">${r.your_rank || '—'}</td><td>${r.competitor_name || '—'}</td><td>${r.competitor_rank || '—'}</td><td>${formatDate(r.checked_at)}</td></tr>`).join('')}</tbody>
    </table></div>`}`;
}

function renderLocComp_Alerts(container, alerts) {
  container.innerHTML = `<h3 style="margin:0 0 16px">Competitor Alerts</h3>
    ${alerts.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No alerts yet.</p></div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Alert</th><th>Competitor</th><th>Type</th><th>Date</th></tr></thead>
      <tbody>${alerts.map(a => `<tr><td><strong>${a.message || '—'}</strong></td><td>${a.competitor_name || '—'}</td><td>${badgeHTML(a.alert_type || '—')}</td><td>${formatDate(a.created_at)}</td></tr>`).join('')}</tbody>
    </table></div>`}`;
}

async function renderLocComp_Benchmarks(container) {
  const { data: benchmarks } = await db.select('competitor_benchmarks');
  const items = benchmarks || [];
  container.innerHTML = `<h3 style="margin:0 0 16px">Benchmarking Dashboard</h3>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="bar-chart-3" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Benchmark Data</h4>
      <p style="color:var(--text-muted)">Add competitors and enable syncing to see benchmark comparisons.</p>
    </div>` : `<div class="table-wrapper"><table>
      <thead><tr><th>Metric</th><th>You</th><th>Avg Competitor</th><th>Best Competitor</th><th>Gap</th></tr></thead>
      <tbody>${items.map(b => `<tr><td><strong>${b.metric_name || '—'}</strong></td><td>${b.your_value || '—'}</td><td>${b.avg_competitor_value || '—'}</td><td>${b.best_competitor_value || '—'} <span style="font-size:11px;color:var(--text-muted)">(${b.best_competitor_name || ''})</span></td><td style="color:${(b.gap || 0) >= 0 ? 'var(--success)' : 'var(--danger)'}">${b.gap > 0 ? '+' : ''}${b.gap || '0'}</td></tr>`).join('')}</tbody>
    </table></div>`}`;
}

async function renderLocLoyalty(c, ln) {
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

  c.innerHTML = `
    <h1 class="page-title">${ln} — Loyalty & Promos</h1>
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
  const tabs = $$('.tab', c);
  const tc = $('#loy-tab-content');

  async function showTab(tab) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    showLoading(tc);
    if (tab === 'loy-promos') renderLocLoy_Promos(tc, promos);
    else if (tab === 'loy-redemptions') renderLocLoy_Redemptions(tc, redemptions);
    else if (tab === 'loy-program') renderLocLoy_Program(tc, programs);
    else if (tab === 'loy-members') renderLocLoy_Members(tc, members);
    else if (tab === 'loy-rewards') await renderLocLoy_Rewards(tc);
    else if (tab === 'loy-tiers') await renderLocLoy_Tiers(tc);
    else if (tab === 'loy-triggers') await renderLocLoy_Triggers(tc);
    else if (tab === 'loy-analytics') renderLocLoy_Analytics(tc, { promos, members, redemptions });
    lucide.createIcons({ nameAttr: 'data-lucide' });
  }

  tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
  showTab('loy-promos');
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

function renderLocLoy_Promos(container, promos) {
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
    </div>` : `<div class="table-wrapper"><table>
      <thead><tr><th>Promotion</th><th>Type</th><th>Value</th><th>Status</th><th>Redemptions</th><th>Expires</th></tr></thead>
      <tbody>${promos.map(p => `<tr>
        <td><strong>${p.name || '—'}</strong></td>
        <td>${badgeHTML(p.promo_type || '—')}</td>
        <td>${p.discount_value ? (p.promo_type === 'percentage_off' ? p.discount_value + '%' : '$' + p.discount_value) : '—'}</td>
        <td>${badgeHTML(p.status || 'draft')}</td>
        <td>${p.redemption_count || 0}${p.max_redemptions ? '/' + p.max_redemptions : ''}</td>
        <td>${formatDate(p.expires_at)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
  $('#new-promo-btn')?.addEventListener('click', () => {
    openModal('Create Promotion', `
      <div class="form-group"><label class="form-label">Promotion Name</label><input class="form-input" id="promo-name" placeholder="e.g., Happy Hour 20% Off"></div>
      <div class="form-group"><label class="form-label">Type</label>
        <select class="form-select" id="promo-type">
          <option value="percentage_off">Percentage Off</option><option value="dollar_off">Dollar Off</option><option value="bogo">Buy One Get One</option><option value="free_item">Free Item</option><option value="happy_hour">Happy Hour</option><option value="custom">Custom</option>
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
      await db.insert('promotions', { name, promo_type: $('#promo-type').value, discount_value: parseFloat($('#promo-value').value) || 0, code: code || null, max_redemptions: parseInt($('#promo-max').value) || null, expires_at: $('#promo-expires').value || null, description: $('#promo-desc').value.trim(), status: 'active' });
      if (code) await db.insert('promotion_codes', { code, promotion_name: name, status: 'active' });
      closeModal();
      toast('Promotion created', 'success');
      await logActivity('create_promotion', `Created promotion: ${name}`);
      navigate('loyalty');
    };
  });
}

function renderLocLoy_Redemptions(container, redemptions) {
  container.innerHTML = `<h3 style="margin:0 0 16px">Recent Redemptions</h3>
    ${redemptions.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No redemptions yet.</p></div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Code</th><th>Promotion</th><th>Customer</th><th>Location</th><th>Date</th></tr></thead>
      <tbody>${redemptions.map(r => `<tr><td><code>${r.code || '—'}</code></td><td>${r.promotion_name || '—'}</td><td>${r.customer_name || r.customer_email || '—'}</td><td>${r.location_name || '—'}</td><td>${formatDateTime(r.redeemed_at)}</td></tr>`).join('')}</tbody>
    </table></div>`}`;
}

function renderLocLoy_Program(container, programs) {
  container.innerHTML = `<h3 style="margin:0 0 16px">Loyalty Programs</h3>
    <div class="table-toolbar"><div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="new-program-btn"><i data-lucide="plus"></i> Create Program</button></div></div>
    ${programs.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <i data-lucide="crown" style="width:48px;height:48px;color:var(--text-muted)"></i>
      <h4 style="margin:12px 0 4px">No Loyalty Program</h4>
    </div>` : `<div class="brand-grid">${programs.map(p => `
      <div class="kpi-card" style="padding:20px">
        <h4 style="margin:0 0 8px">${p.name || 'Loyalty Program'}</h4>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">${p.program_type || 'points_based'} program</div>
        <div style="display:flex;gap:16px;font-size:13px">
          <div><strong>${p.member_count || 0}</strong> members</div>
          <div><strong>${p.points_per_dollar || 1}</strong> pts/$</div>
          <div>${badgeHTML(p.status || 'active')}</div>
        </div>
      </div>`).join('')}</div>`}`;
  $('#new-program-btn')?.addEventListener('click', () => {
    openModal('Create Loyalty Program', `
      <div class="form-group"><label class="form-label">Program Name</label><input class="form-input" id="prog-name" placeholder="e.g., Rewards Club"></div>
      <div class="form-group"><label class="form-label">Type</label>
        <select class="form-select" id="prog-type"><option value="points_based">Points Based</option><option value="visit_based">Visit Based</option><option value="spend_based">Spend Based</option><option value="hybrid">Hybrid</option></select>
      </div>
      <div class="form-group"><label class="form-label">Points per Dollar</label><input class="form-input" id="prog-ppp" type="number" value="1"></div>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="prog-save">Create</button>`);
    $('#prog-save').onclick = async () => {
      const name = $('#prog-name').value.trim();
      if (!name) return toast('Name is required', 'error');
      await db.insert('loyalty_programs', { name, program_type: $('#prog-type').value, points_per_dollar: parseInt($('#prog-ppp').value) || 1, status: 'active' });
      closeModal();
      toast('Loyalty program created', 'success');
      await logActivity('create_loyalty_program', `Created: ${name}`);
      navigate('loyalty');
    };
  });
}

function renderLocLoy_Members(container, members) {
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
      <tbody>${members.map(m => `<tr><td><strong>${m.name || '—'}</strong></td><td>${m.email || '—'}</td><td>${badgeHTML(m.tier || 'member')}</td><td>${(m.current_points || 0).toLocaleString()}</td><td>${m.visit_count || 0}</td><td>${formatDate(m.created_at)}</td></tr>`).join('')}</tbody>
    </table></div>`}`;
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
      await db.insert('loyalty_members', { name, email, phone: $('#mem-phone').value.trim(), tier: 'member', status: 'active', current_points: 0, total_points_earned: 0, visit_count: 0 });
      closeModal();
      toast('Member enrolled', 'success');
      await logActivity('enroll_member', `Enrolled: ${name}`);
      navigate('loyalty');
    };
  });
}

async function renderLocLoy_Rewards(container) {
  const { data: rewards } = await db.select('loyalty_rewards', { order: { column: 'points_required', ascending: true } });
  const items = rewards || [];
  container.innerHTML = `
    <div class="table-toolbar"><h3 style="margin:0">Rewards Catalog</h3><div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="add-reward-btn"><i data-lucide="plus"></i> Add Reward</button></div></div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No rewards configured yet.</p></div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Reward</th><th>Points Required</th><th>Type</th><th>Status</th></tr></thead>
      <tbody>${items.map(r => `<tr><td><strong>${r.name || '—'}</strong></td><td>${(r.points_required || 0).toLocaleString()} pts</td><td>${r.reward_type || '—'}</td><td>${badgeHTML(r.status || 'active')}</td></tr>`).join('')}</tbody>
    </table></div>`}`;
}

async function renderLocLoy_Tiers(container) {
  const { data: tiers } = await db.select('loyalty_tiers', { order: { column: 'min_points', ascending: true } });
  const items = tiers || [];
  container.innerHTML = `
    <div class="table-toolbar"><h3 style="margin:0">Tier System</h3><div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="add-tier-btn"><i data-lucide="plus"></i> Add Tier</button></div></div>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center">
      <p style="color:var(--text-muted)">No tiers configured. Default 4-tier system: Member, Silver, Gold, Platinum.</p>
      <button class="btn btn-primary" id="setup-tiers-btn"><i data-lucide="sparkles"></i> Set Up Default Tiers</button>
    </div>` : `
    <div class="brand-grid">${items.map(t => `
      <div class="kpi-card" style="padding:20px;border-left:4px solid ${t.color || 'var(--accent)'}">
        <h4 style="margin:0 0 8px">${t.name || '—'}</h4>
        <div style="font-size:13px;color:var(--text-muted)">Min: ${(t.min_points || 0).toLocaleString()} pts</div>
        <div style="font-size:13px;color:var(--text-muted)">Maintain: ${(t.maintain_points || 0).toLocaleString()} pts/year</div>
        <div style="font-size:13px;margin-top:8px">${t.benefits || '—'}</div>
      </div>`).join('')}</div>`}`;
  $('#setup-tiers-btn')?.addEventListener('click', async () => {
    const defaultTiers = [
      { name: 'Member', min_points: 0, maintain_points: 0, color: '#6b7280', benefits: 'Earn points on every visit', sort_order: 1 },
      { name: 'Silver', min_points: 500, maintain_points: 300, color: '#94a3b8', benefits: '5% bonus points, birthday reward', sort_order: 2 },
      { name: 'Gold', min_points: 1500, maintain_points: 1000, color: '#f59e0b', benefits: '10% bonus, priority seating, exclusive events', sort_order: 3 },
      { name: 'Platinum', min_points: 5000, maintain_points: 3000, color: '#8b5cf6', benefits: '15% bonus, free delivery, VIP events', sort_order: 4 },
    ];
    for (const tier of defaultTiers) await db.insert('loyalty_tiers', tier);
    toast('Default tiers created', 'success');
    navigate('loyalty');
  });
}

async function renderLocLoy_Triggers(container) {
  const { data: triggers } = await db.select('automated_triggers', { order: { column: 'created_at', ascending: false } });
  const items = triggers || [];
  container.innerHTML = `
    <div class="table-toolbar"><h3 style="margin:0">Automated Triggers</h3><div style="margin-left:auto"><button class="btn btn-primary btn-sm" id="add-trigger-btn"><i data-lucide="plus"></i> Add Trigger</button></div></div>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">Automatically send rewards or messages based on customer events.</p>
    ${items.length === 0 ? `<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No triggers configured.</p></div>` : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Trigger</th><th>Event</th><th>Action</th><th>Status</th><th>Times Fired</th></tr></thead>
      <tbody>${items.map(t => `<tr><td><strong>${t.name || '—'}</strong></td><td>${t.trigger_event || '—'}</td><td>${t.action_type || '—'}</td><td>${badgeHTML(t.status || 'active')}</td><td>${t.fire_count || 0}</td></tr>`).join('')}</tbody>
    </table></div>`}`;
  $('#add-trigger-btn')?.addEventListener('click', () => {
    openModal('Add Automated Trigger', `
      <div class="form-group"><label class="form-label">Trigger Name</label><input class="form-input" id="trig-name" placeholder="e.g., Birthday Reward"></div>
      <div class="form-group"><label class="form-label">Event</label>
        <select class="form-select" id="trig-event">
          <option value="birthday">Birthday</option><option value="anniversary">Membership Anniversary</option><option value="inactivity_30d">Inactive 30 Days</option><option value="inactivity_60d">Inactive 60 Days</option><option value="tier_upgrade">Tier Upgrade</option><option value="milestone_visits">Visit Milestone</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Action</label>
        <select class="form-select" id="trig-action">
          <option value="send_promo_code">Send Promo Code</option><option value="add_bonus_points">Add Bonus Points</option><option value="send_sms">Send SMS</option><option value="send_email">Send Email</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Details</label><textarea class="form-input" id="trig-details" rows="2" placeholder="e.g., 20% off code, 500 bonus points..."></textarea></div>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="trig-save">Create</button>`);
    $('#trig-save').onclick = async () => {
      const name = $('#trig-name').value.trim();
      if (!name) return toast('Name is required', 'error');
      await db.insert('automated_triggers', { name, trigger_event: $('#trig-event').value, action_type: $('#trig-action').value, action_details: $('#trig-details').value.trim(), status: 'active', fire_count: 0 });
      closeModal();
      toast('Trigger created', 'success');
      await logActivity('create_trigger', `Created trigger: ${name}`);
      navigate('loyalty');
    };
  });
}

function renderLocLoy_Analytics(container, { promos, members, redemptions }) {
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

async function renderLocReports(c, ln) {
  Object.values(chartInstances).forEach(ch => ch.destroy());
  chartInstances = {};

  const [postsRes, socialRes, reviewsRes, campaignsRes, activityRes] = await Promise.all([
    db.select('content_posts'),
    db.select('social_accounts'),
    db.select('reviews'),
    db.select('campaigns'),
    db.select('activity_log'),
  ]);
  await getEmployees();
  const posts = postsRes.data || [];
  const social = socialRes.data || [];
  const reviews = reviewsRes.data || [];
  const campaigns = campaignsRes.data || [];
  const activity = activityRes.data || [];

  const totalFollowers = social.reduce((s, a) => s + (a.followers || 0), 0);
  const publishedPosts = posts.filter(p => p.status === 'published').length;
  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1) : '—';

  c.innerHTML = `
    <h1 class="page-title">${ln} — Reports & Analytics</h1>
    <p class="page-subtitle">Marketing performance overview</p>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Total Followers</div><div class="kpi-value">${totalFollowers.toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Posts Published</div><div class="kpi-value">${publishedPosts}</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg Review Rating</div><div class="kpi-value">${avgRating}</div></div>
      <div class="kpi-card"><div class="kpi-label">Active Campaigns</div><div class="kpi-value">${campaigns.filter(cm => cm.status === 'active').length}</div></div>
    </div>
    <div class="chart-grid">
      <div class="chart-card"><h4>Content by Platform</h4><canvas id="chart-platforms" height="250"></canvas></div>
      <div class="chart-card"><h4>Review Ratings</h4><canvas id="chart-ratings" height="250"></canvas></div>
    </div>
    <div class="chart-card">
      <h4>Campaign ROI Summary</h4>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Campaign</th><th>Status</th><th>Budget</th><th>Spend</th><th>Utilization</th><th>KPI Target</th><th>KPI Actual</th></tr></thead>
          <tbody>${campaigns.map(cm => {
            const pct = cm.budget > 0 ? Math.round((cm.spend / cm.budget) * 100) : 0;
            return `<tr>
              <td>${cm.name}</td>
              <td>${badgeHTML(cm.status)}</td>
              <td>$${(cm.budget || 0).toLocaleString()}</td>
              <td>$${(cm.spend || 0).toLocaleString()}</td>
              <td><div class="progress-bar" style="width:80px;display:inline-block"><div class="progress-fill" style="width:${pct}%;background:var(--accent)"></div></div> ${pct}%</td>
              <td>${cm.kpi_target || '—'}</td>
              <td>${cm.kpi_actual || '—'}</td>
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

  const platformCounts = {};
  posts.forEach(p => {
    parseJSON(p.platforms).forEach(pl => { platformCounts[pl] = (platformCounts[pl] || 0) + 1; });
  });
  const ctx1 = document.getElementById('chart-platforms');
  if (ctx1) {
    chartInstances.platforms = new Chart(ctx1, {
      type: 'bar',
      data: { labels: Object.keys(platformCounts), datasets: [{ label: 'Posts', data: Object.values(platformCounts), backgroundColor: '#4f98a3' }] },
      options: chartOpts,
    });
  }

  const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach(r => { if (r.rating >= 1 && r.rating <= 5) ratingCounts[r.rating]++; });
  const ctx2 = document.getElementById('chart-ratings');
  if (ctx2) {
    chartInstances.ratings = new Chart(ctx2, {
      type: 'doughnut',
      data: { labels: ['5 Stars', '4 Stars', '3 Stars', '2 Stars', '1 Star'], datasets: [{ data: [ratingCounts[5], ratingCounts[4], ratingCounts[3], ratingCounts[2], ratingCounts[1]], backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#666'] }] },
      options: { responsive: true, plugins: { legend: { labels: { color: chartTextColor } } } },
    });
  }

  lucide.createIcons({ nameAttr: 'data-lucide' });
}

async function renderLocSocialAccounts(c, ln) {
  await getEmployees();
  const { data: accounts } = await db.select('social_accounts', { order: { column: 'followers', ascending: false } });
  const items = accounts || [];
  const { data: posts } = await db.select('content_posts', { order: { column: 'scheduled_date', ascending: true } });
  const scheduled = (posts || []).filter(p => p.status === 'scheduled');

  const totalFollowers = items.reduce((s, a) => s + (a.followers || 0), 0);
  const connected = items.filter(a => a.status === 'active' || a.status === 'connected').length;
  const totalPosts = items.reduce((s, a) => s + (a.posts_count || 0), 0);
  const avgEng = items.length ? (items.reduce((s, a) => s + (parseFloat(a.engagement_rate) || 0), 0) / items.length).toFixed(1) : '0';
  const topPlatform = items.length ? items.sort((a, b) => (b.followers || 0) - (a.followers || 0))[0].platform : '—';
  const platColors = { Instagram: '#E1306C', Facebook: '#1877F2', Twitter: '#1DA1F2', TikTok: '#010101', LinkedIn: '#0A66C2', YouTube: '#FF0000', Pinterest: '#E60023' };

  c.innerHTML = `
    <h1 class="page-title">${ln} — Social Accounts</h1>
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
    const { data } = await db.getById('social_accounts', id);
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
      platform: $('#sa-platform').value, handle: $('#sa-handle').value,
      followers: parseInt($('#sa-followers').value) || 0, following: parseInt($('#sa-following').value) || 0,
      posts_count: parseInt($('#sa-posts').value) || 0, engagement_rate: parseFloat($('#sa-engagement').value) || 0,
      profile_url: $('#sa-url').value, status: $('#sa-status').value, bio: $('#sa-bio').value,
      manager_id: $('#sa-manager').value || null,
    };
    if (id) {
      obj.updated_at = new Date().toISOString();
      await db.update('social_accounts', id, obj);
    } else {
      await db.insert('social_accounts', obj);
    }
    closeModal();
    toast(id ? 'Account updated' : 'Account added', 'success');
    navigate('social-accounts');
  };
};

window.deleteSocialAccount = function(id) {
  openConfirm('Delete Account', 'Are you sure?', async () => {
    await db.delete('social_accounts', id);
    toast('Deleted', 'success');
    navigate('social-accounts');
  });
};

async function renderLocTeam(c, ln) {
  // Team is global (not scoped by restaurant_id), so use db directly without auto-scope
  const { data: employees } = await db.select('employees', { order: { column: 'name', ascending: true }, restaurant_id: null });
  const items = (employees || []).filter(e => e.is_active);
  c.innerHTML = `
    <h1 class="page-title">${ln} — Team</h1>
    <div class="table-wrapper"><table>
      <thead><tr><th>Name</th><th>Title</th><th>Role</th><th>Email</th></tr></thead>
      <tbody>${items.map(e => `<tr>
        <td><div style="display:flex;align-items:center;gap:8px">
          <div class="user-avatar" style="background:${e.avatar_color || '#4f98a3'};width:28px;height:28px;font-size:10px">${getInitials(e.name)}</div>
          <strong>${e.name}</strong>
        </div></td>
        <td>${e.title || '—'}</td>
        <td>${badgeHTML(e.role || '—')}</td>
        <td>${e.email || '—'}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

async function renderLocAuditLog(c, ln) {
  await getEmployees();
  const { data: logs } = await db.select('activity_log', { order: { column: 'created_at', ascending: false }, limit: 200 });
  const items = logs || [];

  c.innerHTML = `
    <h1 class="page-title">${ln} — Audit Log</h1>
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

async function renderLocSettings(c, ln) {
  if (!hasRole('Owner')) {
    c.innerHTML = '<div class="empty-state"><h4>Access Denied</h4><p>Only Owners can access Settings.</p></div>';
    return;
  }
  const { data: settings } = await db.select('settings', { restaurant_id: null });
  let allSettings = settings || [];

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

  // Auto-create missing settings keys
  const allKeys = Object.values(groupMap).flatMap(g => g.keys);
  const existingKeys = new Set(allSettings.map(s => s.key));
  const missingKeys = allKeys.filter(k => !existingKeys.has(k));
  if (missingKeys.length) {
    for (const key of missingKeys) {
      await db.insert('settings', { key, value: '', updated_at: new Date().toISOString() }, { restaurant_id: null });
    }
    const { data: refreshed } = await db.select('settings', { restaurant_id: null });
    allSettings = refreshed || allSettings;
  }

  function renderSettingField(s) {
    const label = s.key.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
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
    if (['employee_roles','post_platforms','influencer_categories','campaign_types','asset_categories','review_platforms','media_outlet_types','influencer_stages'].includes(s.key)) {
      return `<div class="form-group"><label class="form-label">${label}</label>
        <textarea class="form-textarea" data-setting-key="${s.key}" rows="3">${s.value || ''}</textarea>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">JSON array of values</div></div>`;
    }
    return `<div class="form-group"><label class="form-label">${label}</label>
      <input class="form-input" data-setting-key="${s.key}" value="${s.value || ''}"></div>`;
  }

  function render() {
    const gm = groupMap[activeGroup];
    const groupSettings = allSettings.filter(s => gm.keys.includes(s.key));
    c.innerHTML = `
      <h1 class="page-title">${ln} — Settings</h1>
      <p class="page-subtitle">Configure application preferences</p>
      <div class="kpi-card" style="padding:16px;margin-bottom:20px;display:flex;gap:24px;font-size:13px">
        <div><strong>Restaurant ID:</strong> <code style="font-size:12px;color:var(--text-muted)">${restaurantId}</code></div>
        <div><strong>Brand:</strong> ${restaurantData?.name || '—'}</div>
        <div><strong>Location:</strong> ${locationData?.name || 'All'}</div>
      </div>
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
        await db.update('settings', s.id, { value, updated_at: new Date().toISOString() }, { restaurant_id: null });
      }
      toast('Settings saved', 'success');
      await logActivity('update_settings', `Updated ${activeGroup} settings`);
    };

    $$('.toggle[data-setting-key]').forEach(t => {
      t.onclick = () => t.classList.toggle('active');
    });
  }
  render();
}

// --- AI Assistant (simplified for location) ---
function initAI() {
  const btn = $('#ai-btn');
  const panel = $('#ai-panel');
  const overlay = $('#ai-overlay');
  const closeBtn = $('#ai-close-btn');
  if (!btn || !panel) return;
  btn.onclick = () => { panel.classList.toggle('open'); overlay.classList.toggle('open'); };
  closeBtn.onclick = () => { panel.classList.remove('open'); overlay.classList.remove('open'); };
  overlay.onclick = () => { panel.classList.remove('open'); overlay.classList.remove('open'); };
}

// --- Notifications (simplified) ---
function initNotifications() {
  const btn = $('#notification-btn');
  const panel = $('#notification-panel');
  if (!btn || !panel) return;
  btn.onclick = () => panel.classList.toggle('open');
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && !btn.contains(e.target)) panel.classList.remove('open');
  });
}

// --- Theme (matches app.js: data-theme attribute + hermes-theme key) ---
function initTheme() {
  const saved = localStorage.getItem('hermes-theme') || localStorage.getItem('ivea-theme') || 'dark';
  applyTheme(saved);
  const toggle = $('#theme-toggle');
  if (toggle) {
    toggle.onclick = () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem('hermes-theme', next);
      applyTheme(next);
    };
  }
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  const darkIcon = $('#theme-icon-dark');
  const lightIcon = $('#theme-icon-light');
  const label = $('#theme-label');
  if (darkIcon) darkIcon.style.display = theme === 'dark' ? '' : 'none';
  if (lightIcon) lightIcon.style.display = theme === 'light' ? '' : 'none';
  if (label) label.textContent = theme === 'dark' ? 'Dark' : 'Light';
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initAuth();
});
