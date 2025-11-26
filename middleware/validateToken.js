const jwt = require('jsonwebtoken');
const User = require('../models/User');
const frappeService = require('../services/frappeService');

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'inventory-service-local-jwt-secret-key-2025';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Helper: trích xuất userId linh hoạt từ token (tương thích đa nguồn)
function getUserIdFromDecoded(decoded) {
  return decoded?.id || decoded?.userId || decoded?.user || decoded?.name || decoded?.email || decoded?.sub || null;
}

/**
 * 🔐 Verify JWT token locally (fast authentication)
 * @param {string} token - JWT token
 * @returns {object} - Decoded token payload
 */
function verifyJwtLocally(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('✅ [Auth] JWT verified locally for user:', decoded.email);
    return decoded;
  } catch (error) {
    console.warn('⚠️ [Auth] Local JWT verification failed:', error.message);
    return null;
  }
}

/**
 * 🔄 Sync user data from Frappe (background operation)
 * @param {object} decoded - JWT payload
 * @returns {Promise<User>} - Updated local user
 */
async function syncUserFromFrappe(decoded) {
  try {
    // Try to get fresh user data from Frappe using the same token
    const userInfo = await frappeService.verifyTokenAndGetUser(decoded.originalToken || decoded.token);
    if (userInfo) {
      const updated = await User.updateFromFrappe(userInfo);
      console.log('✅ [Auth] User data synced from Frappe:', updated.email);
      return updated;
    }
  } catch (error) {
    console.warn('⚠️ [Auth] Failed to sync user data from Frappe:', error.message);
  }
  return null;
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

// Authentication with local JWT verification (fast) + optional Frappe sync
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // 🔐 Step 1: Verify JWT locally (fast)
    let decoded;
    try {
      decoded = verifyJwtLocally(token);
      if (!decoded) {
        throw new Error('JWT verification failed');
      }
    } catch (jwtError) {
      console.warn('⚠️ [Auth] Local JWT verification failed, trying Frappe fallback...');

      // Fallback to Frappe verification if local JWT fails
      try {
        const userInfo = await frappeService.verifyTokenAndGetUser(token);
        if (!userInfo || !userInfo.email) {
          throw new Error('Invalid user info from Frappe');
        }

        // Create a synthetic decoded object from Frappe data
        decoded = {
          email: userInfo.email,
          name: userInfo.full_name || userInfo.name,
          roles: Array.isArray(userInfo.roles) ? userInfo.roles : [],
          originalToken: token // Keep for potential sync
        };
      } catch (frappeError) {
        console.error('❌ [Auth] Both local and Frappe verification failed');
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired token.'
        });
      }
    }

    // Validate decoded token
    if (!decoded.email) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token: missing user information.'
      });
    }

    // 📦 Step 2: Get or create local user
    let localUser = await User.findOne({ email: decoded.email });

    // If user doesn't exist locally, try to sync from Frappe
    if (!localUser && decoded.originalToken) {
      console.log('🔄 [Auth] User not found locally, syncing from Frappe...');
      try {
        const userInfo = await frappeService.verifyTokenAndGetUser(decoded.originalToken);
        if (userInfo) {
          localUser = await User.updateFromFrappe(userInfo);
        }
      } catch (syncError) {
        console.warn('⚠️ [Auth] Failed to sync user from Frappe:', syncError.message);
      }
    }

    // If still no user, create basic user from JWT
    if (!localUser) {
      const frappeRoles = Array.isArray(decoded.roles)
        ? decoded.roles.map(r => typeof r === 'string' ? r : r?.role).filter(Boolean)
        : [];

      localUser = new User({
        email: decoded.email,
        fullname: decoded.name || decoded.email,
        provider: 'jwt',
        roles: frappeRoles,
        role: frappeRoles.length > 0 ? frappeRoles[0].toLowerCase() : 'user',
        active: true,
        disabled: false,
        avatarUrl: '',
        department: '',
        jobTitle: 'User'
      });

      await localUser.save();
      console.log(`✅ [Auth] Created new user from JWT: ${localUser.email}`);
    }

    // Check if user is disabled
    if (localUser.disabled) {
      return res.status(401).json({
        success: false,
        message: 'User account is disabled.'
      });
    }

    // Background sync user data (don't block request)
    if (decoded.originalToken) {
      syncUserFromFrappe(decoded).catch(err =>
        console.warn('⚠️ [Auth] Background user sync failed:', err.message)
      );
    }

    // ✅ Set authenticated user on request
    req.user = {
      _id: localUser._id,
      fullname: localUser.fullname || decoded.email,
      email: localUser.email,
      role: localUser.role || 'user',
      avatarUrl: localUser.avatarUrl || '',
      department: localUser.department || '',
      roles: localUser.roles || decoded.roles || [],
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


