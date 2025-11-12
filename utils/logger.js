/**
 * Winston Logger for Inventory Service
 * Structured JSON logging cho tất cả CRUD operations
 */

const winston = require('winston');

// Custom JSON formatter
const jsonFormat = winston.format.printf(({ timestamp, level, message, ...meta }) => {
  const logObject = {
    timestamp,
    level,
    service: 'inventory',
    message,
  };

  // Add metadata fields if present
  if (meta.user_email) logObject.user_email = meta.user_email;
  if (meta.user_name) logObject.user_name = meta.user_name;
  if (meta.action) logObject.action = meta.action;
  if (meta.device_id) logObject.device_id = meta.device_id;
  if (meta.device_type) logObject.device_type = meta.device_type;
  if (meta.from_user) logObject.from_user = meta.from_user;
  if (meta.to_user) logObject.to_user = meta.to_user;
  if (meta.room_id) logObject.room_id = meta.room_id;
  if (meta.duration_ms) logObject.duration_ms = meta.duration_ms;
  if (meta.http_status) logObject.http_status = meta.http_status;
  if (meta.ip) logObject.ip = meta.ip;
  if (meta.details) logObject.details = meta.details;

  return JSON.stringify(logObject, null, 0);
});

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss Z' }),
    jsonFormat
  ),
  defaultMeta: { service: 'inventory' },
  transports: [
    // Console transport for PM2 capture
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss Z' }),
        jsonFormat
      ),
    }),
  ],
});

/**
 * Log device creation
 */
function logDeviceCreated(user_email, user_name, device_id, device_type, name, serial) {
  logger.info(`Thiết bị tạo: ${device_type}`, {
    user_email,
    user_name,
    action: 'device_created',
    device_id,
    device_type,
    details: {
      name,
      serial,
      created_at: new Date().toISOString(),
    },
  });
}

/**
 * Log device updated
 */
function logDeviceUpdated(user_email, user_name, device_id, device_type, changes = {}) {
  logger.info(`Thiết bị cập nhật: ${device_type}`, {
    user_email,
    user_name,
    action: 'device_updated',
    device_id,
    device_type,
    details: {
      changes,
      updated_at: new Date().toISOString(),
    },
  });
}

/**
 * Log device deleted
 */
function logDeviceDeleted(user_email, user_name, device_id, device_type, device_name) {
  logger.info(`Thiết bị xóa: ${device_type}`, {
    user_email,
    user_name,
    action: 'device_deleted',
    device_id,
    device_type,
    details: {
      device_name,
      deleted_at: new Date().toISOString(),
    },
  });
}

/**
 * Log device handover (assign to user)
 */
function logDeviceHandover(assigned_by_email, assigned_by_name, device_id, device_type, from_user_name, to_user_name, to_room) {
  logger.info(`Thiết bị bàn giao: ${device_type}`, {
    user_email: assigned_by_email,
    user_name: assigned_by_name,
    action: 'device_handover',
    device_id,
    device_type,
    from_user: from_user_name,
    to_user: to_user_name,
    room_id: to_room,
    details: {
      handover_at: new Date().toISOString(),
    },
  });
}

/**
 * Log device revocation (take back)
 */
function logDeviceRevoked(revoked_by_email, revoked_by_name, device_id, device_type, from_user_name) {
  logger.info(`Thiết bị thu hồi: ${device_type}`, {
    user_email: revoked_by_email,
    user_name: revoked_by_name,
    action: 'device_revoked',
    device_id,
    device_type,
    from_user: from_user_name,
    details: {
      revoked_at: new Date().toISOString(),
    },
  });
}

/**
 * Log device inspection
 */
function logDeviceInspected(inspector_email, inspector_name, device_id, device_type, status, issues = '') {
  const level = issues ? 'warn' : 'info';
  logger[level](`Thiết bị kiểm tra: ${device_type}`, {
    user_email: inspector_email,
    user_name: inspector_name,
    action: 'device_inspected',
    device_id,
    device_type,
    details: {
      status,
      issues,
      inspected_at: new Date().toISOString(),
    },
  });
}

/**
 * Log API call with response time
 */
function logAPICall(user_email, method, endpoint, response_time_ms, http_status, ip = '') {
  const level = http_status >= 400 ? 'warn' : 'info';
  const slow_marker = response_time_ms > 2000 ? ' [CHẬM]' : '';

  logger[level](`API${slow_marker}: ${method} ${endpoint}`, {
    user_email,
    action: `api_${method.toLowerCase()}`,
    duration_ms: response_time_ms,
    http_status,
    ip,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log error
 */
function logError(user_email, action, error_message, device_id = '', details = {}) {
  logger.error(`Lỗi: ${action}`, {
    user_email,
    action,
    device_id,
    error_message,
    details,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log cache operation
 */
function logCacheOperation(operation, key, hit = null) {
  const action = hit ? 'cache_hit' : hit === false ? 'cache_miss' : 'cache_invalidate';
  logger.info(`Cache ${operation}`, {
    action,
    key,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  logger,
  logDeviceCreated,
  logDeviceUpdated,
  logDeviceDeleted,
  logDeviceHandover,
  logDeviceRevoked,
  logDeviceInspected,
  logAPICall,
  logError,
  logCacheOperation,
};

