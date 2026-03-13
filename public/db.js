/* ============================================
   db.js — Frontend Data Wrapper
   Routes all data through /api/data for server-side security
   Includes Supabase-compatible proxy so existing sb.from() calls
   automatically route through the API middleware
   ============================================ */

const db = {
  _getUserId() {
    try {
      const u = JSON.parse(localStorage.getItem('hermes_user'));
      return u?.id || null;
    } catch { return null; }
  },

  // Active restaurant_id for location-scoped pages
  _restaurantId: null,

  setRestaurantId(id) { this._restaurantId = id; },
  getRestaurantId() { return this._restaurantId; },

  async _request(body) {
    // Auto-inject restaurant_id if set and not already provided
    if (this._restaurantId && !body.restaurant_id) {
      body.restaurant_id = this._restaurantId;
    }
    const resp = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, user_id: this._getUserId() }),
    });
    const json = await resp.json();
    if (!resp.ok || json.error) {
      console.error('db error:', json.error);
      return { data: null, error: json.error };
    }
    return { data: json.data, error: null };
  },

  async select(table, { filters, order, limit, select, restaurant_id } = {}) {
    return this._request({ action: 'select', table, filters, order, limit, select, restaurant_id });
  },

  async insert(table, data, { restaurant_id } = {}) {
    return this._request({ action: 'insert', table, data, restaurant_id });
  },

  async update(table, id, data, { filters, restaurant_id } = {}) {
    return this._request({ action: 'update', table, id, data, filters, restaurant_id });
  },

  async delete(table, id, { filters, restaurant_id } = {}) {
    return this._request({ action: 'delete', table, id, filters, restaurant_id });
  },

  async upsert(table, data, { onConflict, restaurant_id } = {}) {
    return this._request({ action: 'upsert', table, data, onConflict, restaurant_id });
  },

  async getById(table, id, { select } = {}) {
    const { data, error } = await this.select(table, { filters: { id }, select });
    return { data: data?.[0] || null, error };
  },

  async getSetting(key) {
    const { data } = await this.select('settings', { filters: { key }, select: 'value' });
    return data?.[0]?.value || null;
  },

  async setSetting(key, value) {
    return this.upsert('settings', { key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  },
};

/* ============================================
   Supabase-compatible proxy
   Intercepts sb.from() so ALL existing code automatically
   routes through /api/data without changing every call
   ============================================ */
function _createDbChain(table) {
  const state = {
    table,
    _select: '*',
    _filters: {},
    _order: null,
    _limit: null,
    _single: false,
    _count: null,
  };

  const chain = {
    select(cols, opts) {
      state._select = cols || '*';
      if (opts?.count) state._count = opts.count;
      return chain;
    },
    eq(col, val) { state._filters[col] = val; return chain; },
    neq(col, val) { state._filters[col] = { neq: val }; return chain; },
    gt(col, val) { state._filters[col] = { gt: val }; return chain; },
    gte(col, val) { state._filters[col] = { gte: val }; return chain; },
    lt(col, val) { state._filters[col] = { lt: val }; return chain; },
    lte(col, val) { state._filters[col] = { lte: val }; return chain; },
    like(col, val) { state._filters[col] = { like: val }; return chain; },
    ilike(col, val) { state._filters[col] = { ilike: val }; return chain; },
    or(expr) { state._filters.__or = { or: expr }; return chain; },
    order(col, opts) {
      state._order = { column: col, ascending: opts?.ascending !== false };
      return chain;
    },
    limit(n) { state._limit = n; return chain; },
    single() { state._single = true; return chain; },

    // INSERT — sb.from('x').insert(data)
    insert(data) {
      return db.insert(state.table, data);
    },

    // UPDATE — sb.from('x').update(data).eq('id', id)
    update(data) {
      state._updateData = data;
      const updateChain = {
        eq(col, val) {
          if (col === 'id') return db.update(state.table, val, state._updateData);
          return db.update(state.table, null, state._updateData, { filters: { [col]: val } });
        },
      };
      return updateChain;
    },

    // DELETE — sb.from('x').delete().eq('id', id)
    delete() {
      const deleteChain = {
        eq(col, val) {
          if (col === 'id') return db.delete(state.table, val);
          return db.delete(state.table, null, { filters: { [col]: val } });
        },
      };
      return deleteChain;
    },

    // UPSERT — sb.from('x').upsert(data)
    upsert(data, opts) {
      return db.upsert(state.table, data, { onConflict: opts?.onConflict });
    },

    // Make chain thenable so await sb.from('x').select('*') works
    then(resolve, reject) {
      const order = state._order;
      return db.select(state.table, {
        select: state._select,
        filters: Object.keys(state._filters).length ? state._filters : undefined,
        order: order || undefined,
        limit: state._limit || undefined,
      }).then(result => {
        if (state._single && result.data) {
          result.data = Array.isArray(result.data) ? (result.data[0] || null) : result.data;
        }
        resolve(result);
      }).catch(reject);
    },
    catch(fn) { return chain.then(undefined, fn); },
  };

  return chain;
}

// Override sb.from() after Supabase client is created
// This is called in app.js after sb is initialized
function installDbProxy() {
  if (typeof sb !== 'undefined') {
    const _originalFrom = sb.from.bind(sb);
    // Keep original for login (which runs before user is authenticated)
    sb._originalFrom = _originalFrom;
    sb.from = (table) => {
      // Use original Supabase for login check (no user_id yet)
      // Everything else goes through API middleware
      return _createDbChain(table);
    };
  }
}
