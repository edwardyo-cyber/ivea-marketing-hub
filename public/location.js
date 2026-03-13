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
  const [postsRes, campaignsRes, reviewsRes, activityRes] = await Promise.all([
    db.select('content_posts'),
    db.select('campaigns'),
    db.select('reviews'),
    db.select('activity_log', { order: { column: 'created_at', ascending: false }, limit: 15 }),
  ]);
  const posts = postsRes.data || [];
  const campaigns = campaignsRes.data || [];
  const reviews = reviewsRes.data || [];
  const activity = activityRes.data || [];
  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1) : '—';

  container.innerHTML = `
    <h1 class="page-title">${locName} Dashboard</h1>
    <p class="page-subtitle">${locationData?.address || ''}${locationData?.city ? ', ' + locationData.city : ''}${locationData?.state ? ', ' + locationData.state : ''}</p>
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:24px">
      <div class="kpi-card"><div class="kpi-label">Posts</div><div class="kpi-value">${posts.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Campaigns</div><div class="kpi-value">${campaigns.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Reviews</div><div class="kpi-value">${reviews.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg Rating</div><div class="kpi-value" style="color:var(--warning)">${avgRating}</div></div>
    </div>
    <h3 style="margin:20px 0 12px">Recent Activity</h3>
    ${activity.length === 0 ? '<p style="color:var(--text-muted)">No recent activity</p>' : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Action</th><th>Details</th><th>By</th><th>Time</th></tr></thead>
      <tbody>${activity.map(a => `<tr>
        <td>${badgeHTML(a.action || '—')}</td>
        <td>${a.details || '—'}</td>
        <td>${employeeName(a.employee_id)}</td>
        <td>${formatDateTime(a.created_at)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
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
  await renderScopedTable(c, ln, {
    title: 'Content Hub', table: 'content_posts',
    columns: [
      { label: 'Title', key: 'title', render: r => `<strong>${r.title || '—'}</strong>` },
      { label: 'Platform', key: 'platforms' },
      { label: 'Status', key: 'status', render: r => badgeHTML(r.status || 'draft') },
      { label: 'Date', key: 'created_at', render: r => formatDate(r.created_at) },
    ],
    orderCol: 'created_at', emptyIcon: 'file-text', emptyText: 'No posts for this location',
    addLabel: 'New Post',
    addFields: [
      { key: 'title', label: 'Title', placeholder: 'Post title' },
      { key: 'platforms', label: 'Platforms', placeholder: 'instagram, facebook' },
      { key: 'status', label: 'Status', type: 'select', options: [{ value: 'draft', label: 'Draft' }, { value: 'review', label: 'Review' }, { value: 'approved', label: 'Approved' }, { value: 'scheduled', label: 'Scheduled' }] },
      { key: 'body', label: 'Content', type: 'textarea' },
    ],
  });
}

async function renderLocCalendar(c, ln) {
  const [postsRes, campaignsRes] = await Promise.all([
    db.select('content_posts'),
    db.select('campaigns'),
  ]);
  const posts = postsRes.data || [];
  const campaigns = campaignsRes.data || [];
  const events = [
    ...posts.filter(p => p.scheduled_date).map(p => ({ title: p.title, date: p.scheduled_date, type: 'post' })),
    ...campaigns.filter(c => c.start_date).map(c => ({ title: c.name, date: c.start_date, type: 'campaign' })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  c.innerHTML = `
    <h1 class="page-title">${ln} — Calendar</h1>
    ${events.length === 0 ? '<div class="empty-state" style="padding:48px;text-align:center"><i data-lucide="calendar" style="width:48px;height:48px;color:var(--text-muted)"></i><h4>No scheduled events</h4></div>' : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Date</th><th>Event</th><th>Type</th></tr></thead>
      <tbody>${events.map(e => `<tr><td>${formatDate(e.date)}</td><td><strong>${e.title}</strong></td><td>${badgeHTML(e.type)}</td></tr>`).join('')}</tbody>
    </table></div>`}
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });
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
  await renderScopedTable(c, ln, {
    title: 'Campaigns', table: 'campaigns',
    columns: [
      { label: 'Name', key: 'name', render: r => `<strong>${r.name || '—'}</strong>` },
      { label: 'Status', key: 'status', render: r => badgeHTML(r.status || 'draft') },
      { label: 'Budget', key: 'budget', render: r => '$' + (r.budget || 0).toLocaleString() },
      { label: 'Start', key: 'start_date', render: r => formatDate(r.start_date) },
    ],
    orderCol: 'created_at', emptyIcon: 'megaphone', emptyText: 'No campaigns',
    addLabel: 'New Campaign',
    addFields: [
      { key: 'name', label: 'Campaign Name', placeholder: 'Campaign name' },
      { key: 'status', label: 'Status', type: 'select', options: [{ value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }] },
      { key: 'budget', label: 'Budget', type: 'number' },
    ],
  });
}

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
  await renderScopedTable(c, ln, {
    title: 'Reviews', table: 'reviews',
    columns: [
      { label: 'Reviewer', key: 'reviewer_name', render: r => `<strong>${r.reviewer_name || '—'}</strong>` },
      { label: 'Platform', key: 'platform', render: r => badgeHTML(r.platform || '—') },
      { label: 'Rating', key: 'rating', render: r => `<span style="color:var(--warning)">${'★'.repeat(r.rating || 0)}</span>` },
      { label: 'Status', key: 'status', render: r => badgeHTML(r.status || 'new') },
      { label: 'Date', key: 'created_at', render: r => formatDate(r.created_at) },
    ],
    orderCol: 'created_at', emptyIcon: 'message-square', emptyText: 'No reviews',
  });
}

async function renderLocSEO(c, ln) {
  const [keywordsRes, citationsRes, auditsRes] = await Promise.all([
    db.select('seo_keywords'),
    db.select('citations'),
    db.select('seo_audits', { order: { column: 'created_at', ascending: false }, limit: 5 }),
  ]);
  const keywords = keywordsRes.data || [];
  const citations = citationsRes.data || [];
  const audits = auditsRes.data || [];

  c.innerHTML = `
    <h1 class="page-title">${ln} — SEO</h1>
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:24px">
      <div class="kpi-card"><div class="kpi-label">Tracked Keywords</div><div class="kpi-value">${keywords.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Citations</div><div class="kpi-value">${citations.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Last Audit Score</div><div class="kpi-value" style="color:${audits[0]?.score >= 80 ? 'var(--success)' : 'var(--warning)'}">${audits[0]?.score || '—'}</div></div>
    </div>
    ${keywords.length > 0 ? `<h3>Keywords</h3><div class="table-wrapper"><table>
      <thead><tr><th>Keyword</th><th>Rank</th><th>Change</th><th>Local Pack</th></tr></thead>
      <tbody>${keywords.map(k => `<tr>
        <td><strong>${k.keyword}</strong></td>
        <td>${k.current_rank || '—'}</td>
        <td>${k.rank_change > 0 ? `<span style="color:var(--success)">▲${k.rank_change}</span>` : k.rank_change < 0 ? `<span style="color:var(--danger)">▼${Math.abs(k.rank_change)}</span>` : '—'}</td>
        <td>${k.in_local_pack ? '✓' : '—'}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty-state" style="padding:32px;text-align:center"><p style="color:var(--text-muted)">No SEO data for this location yet.</p></div>'}
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

async function renderLocAds(c, ln) {
  const [campaignsRes, perfRes] = await Promise.all([
    db.select('ad_campaigns', { order: { column: 'created_at', ascending: false } }),
    db.select('ad_performance_daily', { order: { column: 'date', ascending: false }, limit: 30 }),
  ]);
  const campaigns = campaignsRes.data || [];
  const perf = perfRes.data || [];
  const totalSpend = perf.reduce((s, p) => s + (p.spend || 0), 0);

  c.innerHTML = `
    <h1 class="page-title">${ln} — Ads Manager</h1>
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:24px">
      <div class="kpi-card"><div class="kpi-label">Active Campaigns</div><div class="kpi-value">${campaigns.filter(c => c.status === 'active').length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Spend (30d)</div><div class="kpi-value">$${totalSpend.toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Conversions</div><div class="kpi-value" style="color:var(--success)">${perf.reduce((s, p) => s + (p.conversions || 0), 0)}</div></div>
    </div>
    ${campaigns.length === 0 ? '<div class="empty-state" style="padding:32px;text-align:center"><p style="color:var(--text-muted)">No ad campaigns for this location yet.</p></div>' : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Campaign</th><th>Platform</th><th>Status</th><th>Budget</th></tr></thead>
      <tbody>${campaigns.map(c => `<tr>
        <td><strong>${c.name}</strong></td>
        <td>${badgeHTML(c.platform || '—')}</td>
        <td>${badgeHTML(c.status || 'draft')}</td>
        <td>$${(c.daily_budget || 0).toLocaleString()}/day</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

async function renderLocCompetitors(c, ln) {
  const { data: competitors } = await db.select('competitors', { order: { column: 'name', ascending: true } });
  const items = competitors || [];
  c.innerHTML = `
    <h1 class="page-title">${ln} — Competitors</h1>
    ${items.length === 0 ? '<div class="empty-state" style="padding:48px;text-align:center"><i data-lucide="eye" style="width:48px;height:48px;color:var(--text-muted)"></i><h4>No competitors tracked</h4></div>' : `
    <div class="brand-grid">${items.map(c => `
      <div class="kpi-card" style="padding:20px">
        <h4 style="margin:0 0 4px">${c.name}</h4>
        <div style="font-size:13px;color:var(--text-muted)">${c.cuisine_type || ''}</div>
        ${c.google_rating ? `<div style="margin-top:8px;color:var(--warning)">★ ${c.google_rating}</div>` : ''}
      </div>`).join('')}</div>`}
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

async function renderLocLoyalty(c, ln) {
  const [promosRes, membersRes] = await Promise.all([
    db.select('promotions', { order: { column: 'created_at', ascending: false } }),
    db.select('loyalty_members', { order: { column: 'created_at', ascending: false } }),
  ]);
  const promos = promosRes.data || [];
  const members = membersRes.data || [];

  c.innerHTML = `
    <h1 class="page-title">${ln} — Loyalty & Promos</h1>
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:24px">
      <div class="kpi-card"><div class="kpi-label">Active Promos</div><div class="kpi-value" style="color:var(--success)">${promos.filter(p => p.status === 'active').length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Members</div><div class="kpi-value">${members.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Redemptions</div><div class="kpi-value">${promos.reduce((s, p) => s + (p.redemption_count || 0), 0)}</div></div>
    </div>
    ${promos.length > 0 ? `<h3>Active Promotions</h3><div class="table-wrapper"><table>
      <thead><tr><th>Promotion</th><th>Type</th><th>Status</th><th>Redemptions</th></tr></thead>
      <tbody>${promos.map(p => `<tr>
        <td><strong>${p.name}</strong></td>
        <td>${badgeHTML(p.promo_type || '—')}</td>
        <td>${badgeHTML(p.status || 'draft')}</td>
        <td>${p.redemption_count || 0}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty-state" style="padding:32px;text-align:center"><p style="color:var(--text-muted)">No promotions for this location.</p></div>'}
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

async function renderLocReports(c, ln) {
  const [postsRes, reviewsRes, campaignsRes] = await Promise.all([
    db.select('content_posts'),
    db.select('reviews'),
    db.select('campaigns'),
  ]);
  const posts = postsRes.data || [];
  const reviews = reviewsRes.data || [];
  const campaigns = campaignsRes.data || [];

  c.innerHTML = `
    <h1 class="page-title">${ln} — Reports</h1>
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:24px">
      <div class="kpi-card"><div class="kpi-label">Total Posts</div><div class="kpi-value">${posts.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Published</div><div class="kpi-value" style="color:var(--success)">${posts.filter(p => p.status === 'published').length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Reviews</div><div class="kpi-value">${reviews.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Active Campaigns</div><div class="kpi-value">${campaigns.filter(c => c.status === 'active').length}</div></div>
    </div>
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

async function renderLocSocialAccounts(c, ln) {
  await renderScopedTable(c, ln, {
    title: 'Social Accounts', table: 'social_accounts',
    columns: [
      { label: 'Platform', key: 'platform', render: r => badgeHTML(r.platform || '—') },
      { label: 'Handle', key: 'handle', render: r => `<strong>${r.handle || '—'}</strong>` },
      { label: 'Followers', key: 'followers', render: r => (r.followers || 0).toLocaleString() },
      { label: 'Status', key: 'status', render: r => badgeHTML(r.status || 'active') },
    ],
    orderCol: 'followers', emptyIcon: 'share-2', emptyText: 'No social accounts',
  });
}

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
  const { data: logs } = await db.select('activity_log', { order: { column: 'created_at', ascending: false }, limit: 100 });
  const items = logs || [];
  c.innerHTML = `
    <h1 class="page-title">${ln} — Audit Log</h1>
    ${items.length === 0 ? '<div class="empty-state" style="padding:48px;text-align:center"><p style="color:var(--text-muted)">No activity recorded</p></div>' : `
    <div class="table-wrapper"><table>
      <thead><tr><th>Action</th><th>Details</th><th>By</th><th>Time</th></tr></thead>
      <tbody>${items.map(l => `<tr>
        <td>${badgeHTML(l.action || '—')}</td>
        <td>${l.details || '—'}</td>
        <td>${employeeName(l.employee_id)}</td>
        <td>${formatDateTime(l.created_at)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

async function renderLocSettings(c, ln) {
  c.innerHTML = `
    <h1 class="page-title">${ln} — Settings</h1>
    <div class="kpi-card" style="padding:24px;max-width:600px">
      <h3 style="margin:0 0 16px">Location Settings</h3>
      <p style="color:var(--text-muted);font-size:13px">Location-specific settings will be available here. Configure API keys, notification preferences, and integration settings for this location.</p>
      <div style="margin-top:16px">
        <div style="padding:12px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between">
          <span>Restaurant ID</span>
          <code style="font-size:12px;color:var(--text-muted)">${restaurantId}</code>
        </div>
        <div style="padding:12px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between">
          <span>Brand</span>
          <span>${restaurantData?.name || '—'}</span>
        </div>
        <div style="padding:12px 0;display:flex;justify-content:space-between">
          <span>Location</span>
          <span>${locationData?.name || 'All'}</span>
        </div>
      </div>
    </div>
  `;
  lucide.createIcons({ nameAttr: 'data-lucide' });
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
