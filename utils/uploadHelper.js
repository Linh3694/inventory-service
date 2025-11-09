const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

/**
 * Sanitize filename - remove special characters and Vietnamese accents
 * @param {string} originalName - Original filename
 * @returns {string} Sanitized filename
 */
const sanitizeFileName = (originalName) => {
  // Remove Vietnamese accents
  let temp = originalName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Replace spaces with underscores
  temp = temp.replace(/\s+/g, '_');
  return temp;
};

/**
 * Unified upload handover report handler for all device types
 * 
 * Usage:
 *   const { uploadHandoverReport } = require('../../utils/uploadHelper');
 *   exports.uploadHandoverReport = (req, res) => uploadHandoverReport(req, res, Laptop, 'laptopId');
 * 
 * @param {object} req - Express request object (must have req.file, req.body with deviceId and userId)
 * @param {object} res - Express response object
 * @param {object} DeviceModel - Mongoose model (Laptop, Monitor, Printer, etc.)
 * @param {string} deviceIdParam - Device ID parameter name ('laptopId', 'monitorId', etc.)
 * @returns {Promise<void>}
 */
const uploadHandoverReport = async (req, res, DeviceModel, deviceIdParam) => {
  try {
    // ✅ Validate file
    if (!req.file) {
      return res.status(400).json({ 
        message: 'File không được tải lên.',
        code: 'NO_FILE'
      });
    }

    // ✅ Extract parameters
    const deviceId = req.body[deviceIdParam];
    const userId = req.body.userId;

    if (!deviceId) {
      return res.status(400).json({ 
        message: `Thiếu tham số ${deviceIdParam}`,
        code: 'MISSING_DEVICE_ID'
      });
    }

    if (!userId) {
      return res.status(400).json({ 
        message: 'Thiếu tham số userId',
        code: 'MISSING_USER_ID'
      });
    }

    // ✅ Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ 
        message: 'userId không hợp lệ.',
        code: 'INVALID_USER_ID'
      });
    }

    // ✅ Fetch device
    const device = await DeviceModel.findById(deviceId);
    if (!device) {
      return res.status(404).json({ 
        message: 'Không tìm thấy thiết bị.',
        code: 'DEVICE_NOT_FOUND'
      });
    }

    // ✅ Get original filename and sanitize
    const originalFileName = path.basename(req.file.path);
    const sanitizedName = sanitizeFileName(originalFileName);
    const oldPath = path.join(__dirname, '../../uploads/Handovers', originalFileName);
    const newPath = path.join(__dirname, '../../uploads/Handovers', sanitizedName);

    // ✅ Rename file on disk
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
    }

    // ✅ Find current assignment (user with no endDate)
    let currentAssignment = device.assignmentHistory.find(
      (h) => h.user && h.user.toString() === userId && !h.endDate
    );

    // ✅ IMPORTANT: Validate that user is current holder
    if (!currentAssignment) {
      return res.status(400).json({ 
        message: 'Chỉ có thể upload biên bản cho người đang sử dụng thiết bị. Vui lòng bàn giao thiết bị cho người này trước.',
        code: 'NOT_CURRENT_HOLDER'
      });
    }

    // ✅ Update document field with sanitized filename
    currentAssignment.document = sanitizedName;

    // ✅ Update device status to Active
    device.status = 'Active';

    // ✅ Save device
    await device.save();

    // ✅ Populate and return updated device
    const populated = await device.populate([
      { path: 'assigned', select: 'fullname email jobTitle avatarUrl department' },
      { path: 'room', select: 'name location status' },
      { path: 'assignmentHistory.user', select: 'fullname email jobTitle avatarUrl' },
      { path: 'assignmentHistory.assignedBy', select: 'fullname email jobTitle' },
      { path: 'assignmentHistory.revokedBy', select: 'fullname email jobTitle' }
    ]);

    return res.status(200).json({ 
      message: 'Tải lên biên bản thành công!',
      data: populated,
      logs: {
        deviceId,
        userId,
        documentName: sanitizedName,
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error('❌ Lỗi khi tải lên biên bản:', error);
    return res.status(500).json({ 
      message: 'Đã xảy ra lỗi server khi tải lên biên bản.',
      error: error.message,
      code: 'UPLOAD_ERROR'
    });
  }
};

/**
 * Get handover report file by filename
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const getHandoverReport = async (req, res) => {
  try {
    const { filename } = req.params;

    if (!filename) {
      return res.status(400).json({ 
        message: 'Thiếu filename',
        code: 'MISSING_FILENAME'
      });
    }

    // ✅ Sanitize filename to prevent directory traversal
    const sanitized = sanitizeFileName(filename);
    const filePath = path.join(__dirname, '../../uploads/Handovers', sanitized);

    // ✅ Validate path is within uploads directory
    const uploadsDir = path.join(__dirname, '../../uploads/Handovers');
    if (!filePath.startsWith(uploadsDir)) {
      return res.status(403).json({ 
        message: 'Truy cập bị từ chối.',
        code: 'FORBIDDEN'
      });
    }

    // ✅ Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        message: 'Không tìm thấy file.',
        code: 'FILE_NOT_FOUND'
      });
    }

    return res.sendFile(filePath);

  } catch (error) {
    console.error('❌ Lỗi khi lấy file biên bản:', error);
    return res.status(500).json({ 
      message: 'Đã xảy ra lỗi server khi lấy file.',
      error: error.message,
      code: 'DOWNLOAD_ERROR'
    });
  }
};

module.exports = {
  sanitizeFileName,
  uploadHandoverReport,
  getHandoverReport
};

