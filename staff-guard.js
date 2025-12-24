(function () {
  function normalizePermissionKey(input) {
    const raw = String(input || '').trim().toLowerCase();
    if (!raw) return '';
    const key = raw.replace(/[^a-z0-9]/g, '');
    if (!key) return '';

    if (key === 'media' || key === 'medialibrary' || key === 'mediafiles') return 'media';
    if (key === 'blog' || key === 'blogadmin' || key === 'createpost' || key === 'posts') return 'blog';

    if (
      key === 'products' ||
      key === 'product' ||
      key === 'addproduct' ||
      key === 'productspage' ||
      key === 'productsmanager' ||
      key === 'productshtml' ||
      key === 'producthtml'
    ) return 'products';

    if (key === 'categories' || key === 'category' || key === 'productcategories') return 'categories';
    if (key === 'inventory' || key === 'stock' || key === 'productstock') return 'inventory';
    if (key === 'analytics' || key === 'productanalytics') return 'analytics';
    if (key === 'reviews' || key === 'productreviews') return 'reviews';
    if (key === 'files' || key === 'filemanager' || key === 'pages' || key === 'websitepages') return 'files';

    if (key === 'send' || key === 'sendnotification' || key === 'senddelivery' || key === 'delivery' || key === 'notification') return 'send';
    if (key === 'orders' || key === 'order' || key === 'ordermanagement') return 'orders';
    if (key === 'notifications' || key === 'accountrequests') return 'notifications';
    if (key === 'payments' || key === 'paymentsettings' || key === 'promocodes' || key === 'promo') return 'payments';
    if (key === 'users' || key === 'usermanagement') return 'users';
    if (key === 'backup' || key === 'sitebackup') return 'backup';
    if (key === 'note' || key === 'notes' || key === 'createnote') return 'note';
    if (key === 'comment' || key === 'comments' || key === 'createcomment') return 'comment';

    return key;
  }

  function getStaffMeUrl() {
    try {
      const apiBase = (window.CONFIG && typeof window.CONFIG.API === 'string') ? window.CONFIG.API.trim() : '';
      if (apiBase) {
        // CONFIG.API is typically like "https://domain/api" or "http://localhost:3000/api"
        return apiBase.replace(/\/+$/, '') + '/staff/me';
      }
    } catch (e) {}
    return '/api/staff/me';
  }

  async function fetchStaffMe() {
    const token = localStorage.getItem('admin_auth_token');
    if (!token) return { ok: false, reason: 'no_token' };

    try {
      const res = await fetch(getStaffMeUrl(), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.success) {
        return { ok: false, reason: 'invalid_token', data };
      }
      return { ok: true, user: data.user };
    } catch (e) {
      return { ok: false, reason: 'network_error' };
    }
  }

  async function fetchStaffMeWithRetry() {
    const first = await fetchStaffMe();
    if (first.ok) return first;
    // If the backend is briefly unavailable (Live Server refresh, slow startup, etc.),
    // a short retry avoids wiping a valid token.
    if (first.reason === 'network_error') {
      await new Promise(r => setTimeout(r, 350));
      return await fetchStaffMe();
    }
    return first;
  }

  function clearStaffAuth() {
    try {
      localStorage.removeItem('admin_auth_token');
      localStorage.removeItem('adminLoggedIn');
      localStorage.removeItem('adminToken');
      localStorage.removeItem('admin_user');
    } catch (e) {}
  }

  function showAccessDenied(message) {
    try {
      document.documentElement.style.height = '100%';
      document.body.style.height = '100%';
      document.body.style.margin = '0';
      document.body.innerHTML = `
        <div style="min-height:100%;display:flex;align-items:center;justify-content:center;background:#f5f5f5;font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;">
          <div style="max-width:520px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:22px;box-shadow:0 10px 25px rgba(0,0,0,0.10);">
            <div style="font-size:18px;font-weight:700;color:#1a202c;">Access Denied</div>
            <div style="margin-top:8px;color:#4a5568;line-height:1.4;">${String(message || 'You do not have permission to access this page.')}</div>
          </div>
        </div>
      `;
    } catch (e) {}
  }

  async function requireAccess(options) {
    const opts = options || {};
    const allowAnonymous = opts.allowAnonymous === true;
    const loginPage = String(opts.loginPage || 'admin.html');
    const redirectOnDeny = String(opts.redirectOnDeny || 'dashboard.html');
    const requiredRole = opts.role ? String(opts.role).toLowerCase() : null;
    const disallowRoles = Array.isArray(opts.disallowRoles) ? opts.disallowRoles.map(r => String(r).toLowerCase()) : [];
    const anyOfPermissions = Array.isArray(opts.anyOfPermissions)
      ? opts.anyOfPermissions.map(p => String(p))
      : null;

    const token = localStorage.getItem('admin_auth_token');
    if (!token) {
      if (allowAnonymous) return;
      window.location.href = loginPage;
      return;
    }

    const me = await fetchStaffMeWithRetry();
    if (!me.ok) {
      // Important: don't clear a token on transient network/CORS/backend issues.
      // When using Live Server, a refresh can happen right as backend writes JSON
      // (triggering auto-reload) and a single failed request should not log out.
      if (me.reason === 'network_error') {
        if (allowAnonymous) return;
        showAccessDenied('Cannot reach the backend server. Make sure the backend is running on http://localhost:3000.');
        return;
      }
      clearStaffAuth();
      window.location.href = loginPage;
      return;
    }

    const role = String(me.user?.role || '').toLowerCase();
    if (disallowRoles.includes(role)) {
      showAccessDenied('You are not allowed to access this page.');
      setTimeout(() => {
        window.location.href = redirectOnDeny;
      }, 700);
      return;
    }

    if (requiredRole && role !== requiredRole) {
      showAccessDenied('Admin access required.');
      setTimeout(() => {
        window.location.href = redirectOnDeny;
      }, 700);
      return;
    }

    if (anyOfPermissions && role !== 'admin') {
      const perms = Array.isArray(me.user?.permissions) ? me.user.permissions : [];
      const normalized = new Set(perms.map(normalizePermissionKey).filter(Boolean));
      const ok = anyOfPermissions.some(p => normalized.has(normalizePermissionKey(p)));
      if (!ok) {
        showAccessDenied('You do not have permission to use this feature.');
        setTimeout(() => {
          window.location.href = redirectOnDeny;
        }, 700);
      }
    }
  }

  window.StaffGuard = {
    require: requireAccess,
    fetchMe: fetchStaffMe,
    clearAuth: clearStaffAuth
  };
})();
