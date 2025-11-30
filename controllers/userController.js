const axios = require('axios');
const User = require('../models/User');

const FRAPPE_API_URL = process.env.FRAPPE_API_URL || 'https://admin.sis.wellspring.edu.vn';

// Helper function to format Frappe user data
function formatFrappeUser(frappeUser) {
  const fullName = frappeUser.full_name ||
    [frappeUser.first_name, frappeUser.middle_name, frappeUser.last_name].filter(Boolean).join(' ') ||
    frappeUser.name;

  const userData = {
    frappeUserId: frappeUser.name,
    email: frappeUser.email,
    avatarUrl: frappeUser.user_image,
    roles: Array.isArray(frappeUser.roles) 
      ? frappeUser.roles.map(r => typeof r === 'string' ? r : r?.role).filter(Boolean)
      : [],
    name: frappeUser.name,
    department: frappeUser.department,
    designation: frappeUser.designation,
    jobTitle: frappeUser.job_title || frappeUser.designation,
  };
  
  // Only include fullname if it has a valid value (don't overwrite with null/undefined)
  if (fullName && fullName.trim()) {
    userData.fullname = fullName;
  }
  
  return userData;
}

// Fetch user details từ Frappe
async function getFrappeUserDetail(userEmail, token) {
  try {
    const response = await axios.get(
      `${FRAPPE_API_URL}/api/resource/User/${userEmail}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Frappe-CSRF-Token': token
        }
      }
    );
    return response.data.data;
  } catch (error) {
    console.warn(`⚠️  Failed to fetch user ${userEmail}: ${error.message}`);
    return null;
  }
}

// Fetch enabled users từ Frappe
async function getAllFrappeUsers(token) {
  try {
    console.log('🔍 [Sync] Fetching all enabled users from Frappe...');

    const response = await axios.get(
      `${FRAPPE_API_URL}/api/method/erp.api.erp_common_user.user_sync.get_all_enabled_users`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const result = response.data.message || response.data;
    
    if (!result.success) {
      throw new Error(result.error || result.message || 'Failed to fetch users');
    }

    const users = result.data || [];
    console.log(`✅ Found ${users.length} enabled users from Frappe`);

    return users;
  } catch (error) {
    console.error('❌ [Sync] Error fetching users:', error.message);
    throw error;
  }
}

// ✅ ENDPOINT 1: Manual sync all enabled users
exports.syncUsersManual = async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token required' });
    }

    console.log('🔄 [Inventory Sync] Starting user sync...');
    const startTime = Date.now();

    const frappeUsers = await getAllFrappeUsers(token);

    if (frappeUsers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No enabled users to sync',
        stats: { synced: 0, failed: 0, total: 0 }
      });
    }

    const validUsers = frappeUsers.filter(user => {
      const email = user.email || user.name || '';
      return email && email.includes('@');
    });
    
    const skipped = frappeUsers.length - validUsers.length;
    if (skipped > 0) {
      console.log(`⚠️  [Sync] Skipped ${skipped} users without valid email`);
    }

    let synced = 0;
    let failed = 0;
    const batchSize = 20;

    for (let i = 0; i < validUsers.length; i += batchSize) {
      const batch = validUsers.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(async (frappeUser) => {
          const userData = formatFrappeUser(frappeUser);
          await User.findOneAndUpdate(
            { email: frappeUser.email },
            { $set: userData },
            { upsert: true, new: true }
          );
          return { email: frappeUser.email };
        })
      );

      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          synced++;
        } else {
          failed++;
        }
      });
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ [Inventory Sync] Complete: ${synced} synced, ${failed} failed in ${duration}s`);

    res.status(200).json({
      success: true,
      message: 'User sync completed',
      stats: {
        synced,
        failed,
        total: synced + failed
      }
    });
  } catch (error) {
    console.error('❌ [Inventory Sync] Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ✅ ENDPOINT 2: Debug fetch users
exports.debugFetchUsers = async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token required' });
    }

    const listResponse = await axios.get(
      `${FRAPPE_API_URL}/api/resource/User`,
      {
        params: {
          fields: JSON.stringify(['name', 'email', 'full_name', 'user_image', 'enabled', 'roles', 'docstatus', 'disabled', 'user_type', 'creation', 'modified']),
          limit_start: 0,
          limit_page_length: 10,
          order_by: 'name asc'
        },
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Frappe-CSRF-Token': token
        }
      }
    );

    const userList = listResponse.data.data || [];
    const totalCount = listResponse.data.total_count || listResponse.data.total;

    console.log(`📦 Found ${userList.length} users (total_count: ${totalCount})`);

    const fieldStats = {
      total: userList.length,
      enabled_true: userList.filter(u => u.enabled === true).length,
      enabled_1_number: userList.filter(u => u.enabled === 1).length,
      disabled_0: userList.filter(u => u.disabled === 0 || u.disabled === "0" || u.disabled === false).length,
      docstatus_0: userList.filter(u => u.docstatus === 0).length,
      docstatus_1: userList.filter(u => u.docstatus === 1).length,
      docstatus_2: userList.filter(u => u.docstatus === 2).length,
    };

    const sampleUsers = userList.slice(0, 5).map(user => ({
      email: user.email,
      name: user.name,
      enabled: user.enabled,
      disabled: user.disabled,
      docstatus: user.docstatus,
      full_name: user.full_name
    }));

    res.status(200).json({
      success: true,
      message: 'Debug fetch completed',
      stats: fieldStats,
      sample_users: sampleUsers,
      total_count: totalCount
    });
  } catch (error) {
    console.error('❌ [Debug] Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ✅ ENDPOINT 3: Sync user by email
exports.syncUserByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token required'
      });
    }
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email parameter required'
      });
    }
    
    console.log(`📧 [Sync Email] Syncing user: ${email}`);
    
    const frappeUser = await getFrappeUserDetail(email, token);
    
    if (!frappeUser) {
      return res.status(404).json({
        success: false,
        message: `User not found in Frappe: ${email}`
      });
    }
    
    const isEnabled = frappeUser.docstatus === 0;
    if (!isEnabled) {
      return res.status(400).json({
        success: false,
        message: `User is not active in Frappe: ${email}`
      });
    }
    
    const userData = formatFrappeUser(frappeUser);
    const result = await User.findOneAndUpdate(
      { email: frappeUser.email },
      userData,
      { upsert: true, new: true }
    );
    
    console.log(`✅ [Sync Email] User synced: ${email}`);
    
    res.status(200).json({
      success: true,
      message: 'User synced successfully',
      user: {
        email: result.email,
        fullname: result.fullname,
        roles: result.roles,
        department: result.department
      }
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ✅ ENDPOINT 4: Webhook - User changed in Frappe
exports.webhookUserChanged = async (req, res) => {
  try {
    const { doc, event } = req.body;

    if (process.env.DEBUG_WEBHOOK === '1') {
      console.log('🔔 [Webhook] Raw payload:', JSON.stringify(req.body, null, 2));
    }

    let actualEvent = event;
    if (typeof event === 'string' && event.includes('{{')) {
      actualEvent = 'update';
    }

    console.log(`🔔 [Webhook] User ${actualEvent}: ${doc?.name}`);

    if (!doc || !doc.name) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook payload'
      });
    }
    
    if (actualEvent === 'delete' || actualEvent === 'on_trash') {
      console.log(`🗑️  Deleting user: ${doc.name}`);
      await User.deleteOne({ email: doc.email });
      
      return res.status(200).json({
        success: true,
        message: 'User deleted'
      });
    }
    
    if (actualEvent === 'insert' || actualEvent === 'update' || actualEvent === 'after_insert' || actualEvent === 'on_update') {
      if (doc.disabled === true || doc.disabled === 1 || doc.disabled === "1") {
        console.log(`⏭️  Skipping disabled user: ${doc.name} (disabled: ${doc.disabled})`);
        return res.status(200).json({
          success: true,
          message: 'User is disabled, skipped'
        });
      }
      
      let isEnabled = true;
      if (doc.enabled !== undefined && doc.enabled !== null) {
        isEnabled = doc.enabled === 1 || doc.enabled === true || doc.enabled === "1";
      } else if (doc.docstatus !== undefined && doc.docstatus !== null) {
        isEnabled = doc.docstatus === 0;
      }
      
      if (!isEnabled) {
        console.log(`⏭️  Skipping disabled user: ${doc.name} (enabled: ${doc.enabled})`);
        return res.status(200).json({
          success: true,
          message: 'User is disabled, skipped'
        });
      }
      
      const userData = formatFrappeUser(doc);
      const result = await User.findOneAndUpdate(
        { email: doc.email },
        userData,
        { upsert: true, new: true }
      );
      
      console.log(`✅ User synced: ${result.email}`);
      
      return res.status(200).json({
        success: true,
        message: 'User synced',
        user: {
          email: result.email,
          fullname: result.fullname
        }
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Event processed'
    });
  } catch (error) {
    console.error('❌ [Webhook] Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get all users for device assignment
exports.getAllUsers = async (req, res) => {
  try {
    const { search, department, limit = 100, page = 1 } = req.query;
    
    let query = {};
    
    // Search by name or email
    if (search) {
      query.$or = [
        { fullname: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filter by department
    if (department) {
      query.department = department;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const users = await User.find(query)
      .select('fullname email department jobTitle avatarUrl frappeUserId')
      .sort({ fullname: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    const total = await User.countDocuments(query);
    
    res.json({
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error getting users:', error.message);
    res.status(500).json({
      success: false,
      message: 'Không thể lấy danh sách người dùng',
      error: error.message
    });
  }
};

