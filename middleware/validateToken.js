const jwt = require('jsonwebtoken');
const axios = require('axios');

// Frappe API configuration
const FRAPPE_API_URL = process.env.FRAPPE_API_URL || 'https://admin.sis.wellspring.edu.vn';

// Helper: trích xuất userId linh hoạt từ token (tương thích đa nguồn)
function getUserIdFromDecoded(decoded) {
  return decoded?.id || decoded?.userId || decoded?.user || decoded?.name || null;
}

// Try validating token via Frappe first, then fallback to JWT
async function resolveFrappeUserByToken(token) {
  try {
    const erpResp = await axios.get(
      `${FRAPPE_API_URL}/api/method/erp.api.erp_common_user.auth.get_current_user`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Frappe-CSRF-Token': token,
        },
        timeout: 10000,
      }
    );
    if (erpResp.data?.status === 'success' && erpResp.data.user) {
      return erpResp.data.user;
    }
  } catch (e) {
    // Fallback to Frappe default
    try {
      const loggedResp = await axios.get(
        `${FRAPPE_API_URL}/api/method/frappe.auth.get_logged_user`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Frappe-CSRF-Token': token,
          },
          timeout: 10000,
        }
      );

      if (loggedResp.data?.message) {
        const userResp = await axios.get(
          `${FRAPPE_API_URL}/api/resource/User/${loggedResp.data.message}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'X-Frappe-CSRF-Token': token,
            },
            timeout: 10000,
          }
        );
        return userResp.data?.data || null;
      }
    } catch (fallbackErr) {
      // Will continue to JWT validation
    }
  }
  return null;
}

// Bắt buộc xác thực - try Frappe first, fallback to JWT
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization header missing or invalid',
        code: 'MISSING_TOKEN'
      });
    }

    const token = authHeader.split(' ')[1];

    // 1. Try Frappe authentication first
    let frappeUser = null;
    try {
      frappeUser = await resolveFrappeUserByToken(token);
    } catch (e) {
      // Continue to JWT validation
    }

    if (frappeUser) {
      // Map Frappe user to req.user format
      req.user = {
        _id: frappeUser.email || frappeUser.name,
        id: frappeUser.email || frappeUser.name,
        name: frappeUser.name || frappeUser.email,
        fullname: frappeUser.full_name || frappeUser.fullname || frappeUser.name,
        email: frappeUser.email,
        role: frappeUser.role || frappeUser.user_role || 'user',
        roles: frappeUser.frappe_roles || [frappeUser.role] || ['user'],
        employeeCode: frappeUser.employee_code || null,
        department: frappeUser.department || null,
        jobTitle: frappeUser.job_title || null,
        token,
        provider: 'frappe'
      };
      return next();
    }

    // 2. Fallback to JWT validation for backward compatibility
    const secret = process.env.JWT_SECRET || 'breakpoint';
    try {
      const decoded = jwt.verify(token, secret);
      const userId = getUserIdFromDecoded(decoded);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Invalid token structure', code: 'INVALID_TOKEN' });
      }

      // Map JWT decoded to req.user format
      req.user = {
        _id: userId,
        id: userId,
        name: decoded.name || userId,
        fullname: decoded.fullname || decoded.fullName || decoded.full_name || decoded.name || null,
        email: decoded.email || decoded.user || null,
        role: decoded.role || null,
        roles: decoded.roles || [],
        employeeCode: decoded.employeeCode || null,
        department: decoded.department || null,
        jobTitle: decoded.jobTitle || decoded.designation || null,
        token,
        provider: 'jwt'
      };

      return next();
    } catch (jwtError) {
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ success: false, message: 'Invalid token', code: 'INVALID_TOKEN' });
      }
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ success: false, message: 'Authentication failed', code: 'AUTH_FAILED' });
    }
  } catch (e) {
    console.error('❌ [Inventory Service] Auth middleware error:', e.message);
    return res.status(500).json({ success: false, message: 'Internal authentication error', code: 'AUTH_INTERNAL_ERROR' });
  }
};

// Tuỳ chọn xác thực: không có token vẫn cho qua, nếu có thì xác thực như trên
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }
    // Tái sử dụng authenticate
    return authenticate(req, res, next);
  } catch (e) {
    req.user = null;
    return next();
  }
};

// Yêu cầu quyền admin (đơn giản theo vai trò trong token)
const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
  const allowed = ['admin', 'superadmin', 'technical'];
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  return next();
};

module.exports = {
  authenticate,
  optionalAuth,
  requireAdmin,
  // Chấp nhận user token (Authorization) hoặc service-to-service token
  authenticateServiceOrUser: async (req, res, next) => {
    try {
      const hasUserAuth = !!(req.header('Authorization'));
      if (hasUserAuth) return authenticate(req, res, next);

      const svcToken = req.header('X-Service-Token') || req.header('X-Internal-Token');
      const expected = process.env.INVENTORY_INTERNAL_TOKEN || process.env.INTERNAL_SERVICE_TOKEN;
      if (svcToken && expected && svcToken === expected) {
        const impersonateId = req.header('X-Impersonate-User');
        req.user = {
          _id: impersonateId || 'system',
          id: impersonateId || 'system',
          fullname: 'inventory-service',
          email: 'system@inventory-service',
          role: 'system',
          roles: ['system'],
          isService: true,
        };
        return next();
      }
      return res.status(401).json({ success: false, message: 'Authentication required', code: 'AUTH_REQUIRED' });
    } catch (e) {
      console.error('❌ [Inventory Service] Service auth error:', e.message);
      return res.status(401).json({ success: false, message: 'Service authentication failed', code: 'SERVICE_AUTH_FAILED' });
    }
  }
};


