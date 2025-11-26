const axios = require('axios');

/**
 * Frappe API Service   
 * 🔐 Unified service để gọi Frappe API với xác thực đồng bộ
 */

// Configuration từ environment
const FRAPPE_API_URL = process.env.FRAPPE_API_URL || 'https://admin.sis.wellspring.edu.vn';
const API_TIMEOUT = parseInt(process.env.AUTH_TIMEOUT) || 5000;

// Tạo axios instance với default config
const frappeAxios = axios.create({
  baseURL: FRAPPE_API_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * Thêm token vào request headers
 * @param {string} token - Bearer token từ client
 */
const addAuthHeaders = (token) => {
  if (!token) return {};

  return {
    'Authorization': `Bearer ${token}`,
    'X-Frappe-CSRF-Token': token
  };
};

/**
 * 🔑 Verify token và lấy thông tin user hiện tại
 * @param {string} token - Bearer token
 * @returns {Promise} - User information từ Frappe
 */
const verifyTokenAndGetUser = async (token) => {
  try {
    console.log('🔍 [Frappe Service] Verifying token with Frappe...');

    // Bước 1: Lấy logged user
    const userResponse = await frappeAxios.get('/api/method/frappe.auth.get_logged_user', {
      headers: addAuthHeaders(token)
    });

    if (!userResponse.data?.message) {
      throw new Error('No user information in Frappe response');
    }

    const userName = userResponse.data.message;
    console.log(`✅ [Frappe Service] Token verified. User: ${userName}`);

    // Bước 2: Lấy full user details
    const userDetails = await getUserDetails(userName, token);

    return userDetails;

  } catch (error) {
    console.error('❌ [Frappe Service] Token verification failed:', error.message);
    throw new Error(`Frappe token verification failed: ${error.message}`);
  }
};

/**
 * 📋 Lấy chi tiết user từ Frappe
 * @param {string} userName - User email hoặc username
 * @param {string} token - Bearer token
 * @returns {Promise} - User details
 */
const getUserDetails = async (userName, token) => {
  try {
    const response = await frappeAxios.get(`/api/resource/User/${userName}`, {
      headers: addAuthHeaders(token)
    });

    if (!response.data?.data) {
      throw new Error('Invalid user data from Frappe');
    }

    const user = response.data.data;

    // Normalize roles
    const roles = Array.isArray(user.roles)
      ? user.roles.map(r => typeof r === 'string' ? r : r?.role).filter(Boolean)
      : [];

    return {
      name: user.name,
      email: user.email,
      full_name: user.full_name || user.first_name,
      roles: roles,
      enabled: user.enabled === 1 ? 1 : 0,
      user_image: user.user_image || '',
      department: user.department || '',
      phone: user.phone || '',
      mobile_no: user.mobile_no || '',
      job_title: user.job_title || user.designation || '',
      employee_code: user.employee_code || ''
    };

  } catch (error) {
    console.error('❌ [Frappe Service] Get user details failed:', error.message);
    throw error;
  }
};

module.exports = {
  // Token & User
  verifyTokenAndGetUser,
  getUserDetails,

  // Utils
  addAuthHeaders,
  frappeAxios
};
