(function () {
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

    const me = await fetchStaffMe();
    if (!me.ok) {
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
      const ok = anyOfPermissions.some(p => perms.includes(p));
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
