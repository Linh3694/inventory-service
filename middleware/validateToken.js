const jwt = require('jsonwebtoken');
const User = require('../models/User');
const frappeService = require('../services/frappeService');

// Helper: trích xuất userId linh hoạt từ token (tương thích đa nguồn)
function getUserIdFromDecoded(decoded) {
  return decoded?.id || decoded?.userId || decoded?.user || decoded?.name || decoded?.email || decoded?.sub || null;
}

// Verify token using frappeService
async function resolveFrappeUserByToken(token) {
  try {
    const userInfo = await frappeService.verifyTokenAndGetUser(token);
    return userInfo;
  } catch (error) {
    console.warn('⚠️ [Auth] Frappe service verification failed:', error.message);
    return null;
  }
}

// Authentication using frappeService (similar to ticket-service)
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    let userInfo;
    try {
      console.log('🔍 [Auth] Verifying token with Frappe API...');
      userInfo = await frappeService.verifyTokenAndGetUser(token);
      console.log('✅ [Auth] Token verified with Frappe for user:', userInfo?.email);
    } catch (frappeError) {
      console.warn('⚠️ [Auth] Frappe API verification failed:', frappeError.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token.'
      });
    }

    // Validate user info
    if (!userInfo || !userInfo.email) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token: missing user information.'
      });
    }

    // Check if user is enabled
    if (userInfo.enabled !== undefined && userInfo.enabled !== 1) {
      return res.status(401).json({
        success: false,
        message: 'User account is disabled.'
      });
    }

    // 📦 Sync/Update user trong MongoDB
    const frappeRoles = Array.isArray(userInfo.roles)
      ? userInfo.roles.map(r => typeof r === 'string' ? r : r?.role).filter(Boolean)
      : [];

    // Get existing user để preserve fields
    const existingUser = await User.findOne({ email: userInfo.email });

    // Build update object - CHỈ update fields có giá trị (tránh ghi đè với empty)
    const userData = {
      email: userInfo.email,
      fullname: userInfo.full_name || userInfo.fullname || userInfo.name,
      provider: 'frappe',
      disabled: userInfo.enabled !== 1,
      active: userInfo.enabled === 1,
      roles: frappeRoles,
      role: frappeRoles.length > 0 ? frappeRoles[0].toLowerCase() : 'user',
      updatedAt: new Date()
    };

    // Conditional updates - chỉ update nếu có giá trị mới
    if (userInfo.user_image || userInfo.avatar) {
      userData.avatarUrl = userInfo.user_image || userInfo.avatar;
    } else if (!existingUser) {
      userData.avatarUrl = '';  // Default for new users
    }

    if (userInfo.department) {
      userData.department = userInfo.department;
    } else if (!existingUser) {
      userData.department = '';
    }

    if (userInfo.job_title || userInfo.designation) {
      userData.jobTitle = userInfo.job_title || userInfo.designation;
    } else if (!existingUser) {
      userData.jobTitle = 'User';
    }

    if (userInfo.employee_code) {
      userData.employeeCode = userInfo.employee_code;
    }

    let localUser = await User.findOneAndUpdate(
      { email: userInfo.email },
      userData,
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    console.log(`✅ [Auth] User synced: ${localUser.email} (roles: ${frappeRoles.join(', ')})`);

    // ✅ Set authenticated user on request
    req.user = {
      _id: localUser._id,
      fullname: localUser.fullname || userInfo.email,
      email: localUser.email,
      role: localUser.role || 'user',
      avatarUrl: localUser.avatarUrl || '',
      department: localUser.department || '',
      roles: localUser.roles || frappeRoles || [],
      isActive: !localUser.disabled
    };

    console.log(`🔐 [Auth] Request authenticated for: ${req.user.email}`);
    next();

  } catch (error) {
    console.error('❌ [Auth] Authentication error:', error.message);
    res.status(401).json({
      success: false,
      message: 'Authentication failed.'
    });
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


