const Monitor = require('../../models/Monitor');
const User = require('../../models/User');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const redisService = require('../../services/redisService');

// Rút gọn: copy hành vi từ backend
exports.getMonitors = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { search, status, manufacturer, type, releaseYear } = req.query;
    const hasFilters = search || status || manufacturer || type || releaseYear;
    if (!hasFilters) {
      const cachedData = await redisService.getDevicePage('monitor', page, limit);
      if (cachedData) {
        return res.status(200).json({
          populatedMonitors: cachedData.devices,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(cachedData.total / limit),
            totalItems: cachedData.total,
            itemsPerPage: limit,
            hasNext: page < Math.ceil(cachedData.total / limit),
            hasPrev: page > 1,
          },
        });
      }
    }
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { serial: { $regex: search, $options: 'i' } },
        { manufacturer: { $regex: search, $options: 'i' } },
      ];
    }
    if (status) query.status = status;
    if (manufacturer) query.manufacturer = { $regex: manufacturer, $options: 'i' };
    if (type) query.type = { $regex: type, $options: 'i' };
    if (releaseYear) query.releaseYear = parseInt(releaseYear);
    let monitors, totalItems;
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const aggregationPipeline = [
        { $lookup: { from: 'users', localField: 'assigned', foreignField: '_id', as: 'assignedUsers' } },
        { $match: { $or: [ { name: searchRegex }, { serial: searchRegex }, { manufacturer: searchRegex }, { 'assignedUsers.fullname': searchRegex } ] } },
        { $facet: { data: [ { $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit } ], total: [ { $count: 'count' } ] } },
      ];
      const result = await Monitor.aggregate(aggregationPipeline);
      monitors = result[0]?.data || [];
      totalItems = result[0]?.total[0]?.count || 0;
      const monitorIds = monitors.map((m) => m._id);
      const populated = await Monitor.find({ _id: { $in: monitorIds } })
        .populate('assigned', 'fullname jobTitle department avatarUrl')
        .populate('room', 'name location status')
        .populate('assignmentHistory.user', 'fullname email jobTitle avatarUrl')
        .populate('assignmentHistory.assignedBy', 'fullname email title')
        .populate('assignmentHistory.revokedBy', 'fullname email')
        .lean();
      monitors = populated;
    } else {
      totalItems = await Monitor.countDocuments(query);
      monitors = await Monitor.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('assigned', 'fullname jobTitle department avatarUrl')
        .populate('room', 'name location status')
        .populate('assignmentHistory.user', 'fullname email jobTitle avatarUrl')
        .populate('assignmentHistory.assignedBy', 'fullname email title')
        .populate('assignmentHistory.revokedBy', 'fullname email')
        .lean();
    }
    const populatedMonitors = monitors.map((m) => ({
      ...m,
      room: m.room ? { ...m.room, location: m.room.location?.map((loc) => `${loc.building}, tầng ${loc.floor}`) || ['Không xác định'] } : { name: 'Không xác định', location: ['Không xác định'] },
    }));
    if (!hasFilters) await redisService.setDevicePage('monitor', page, limit, populatedMonitors, totalItems, 300);
    const totalPages = Math.ceil(totalItems / limit);
    return res.status(200).json({ populatedMonitors, pagination: { currentPage: page, totalPages, totalItems, itemsPerPage: limit, hasNext: page < totalPages, hasPrev: page > 1 } });
  } catch (error) {
    console.error('Error fetching monitors:', error.message);
    return res.status(500).json({ message: 'Error fetching monitors', error: error.message });
  }
};

exports.getMonitorById = async (req, res) => {
  try {
    const { id } = req.params;
    const monitor = await Monitor.findById(id)
      .populate('assigned', 'fullname email jobTitle avatarUrl')
      .populate('room', 'name location status')
      .populate('assignmentHistory.user', 'fullname email jobTitle avatarUrl')
      .populate('assignmentHistory.assignedBy', 'fullname email jobTitle avatarUrl')
      .populate('assignmentHistory.revokedBy', 'fullname email jobTitle avatarUrl');
    if (!monitor) return res.status(404).send({ message: 'Không tìm thấy monitor' });
    res.status(200).json(monitor);
  } catch (error) {
    res.status(500).send({ message: 'Lỗi máy chủ', error });
  }
};

exports.createMonitor = async (req, res) => {
  try {
    const { name, manufacturer, serial, assigned, status, room, reason } = req.body;
    if (!name || !serial) return res.status(400).json({ message: 'Thiếu thông tin bắt buộc!' });
    const existing = await Monitor.findOne({ serial });
    if (existing) return res.status(400).json({ message: `Serial "${serial}" đã tồn tại trong hệ thống.` });
    if (assigned && !Array.isArray(assigned)) return res.status(400).json({ message: 'Assigned phải là mảng ID người sử dụng hợp lệ.' });
    if (room && !mongoose.Types.ObjectId.isValid(room)) return res.status(400).json({ message: 'Room ID không hợp lệ!' });
    if (status === 'Broken' && !reason) return res.status(400).json({ message: "Lý do báo hỏng là bắt buộc khi trạng thái là 'Broken'!" });
    const monitor = new Monitor({ name, manufacturer, serial, assigned, status, room, reason: status === 'Broken' ? reason : undefined });
    await monitor.save();
    await redisService.deleteDeviceCache('monitor');
    res.status(201).json(monitor);
  } catch (error) {
    console.error('Error creating monitor:', error.message);
    res.status(500).json({ message: 'Lỗi khi thêm monitor', error: error.message });
  }
};

exports.updateMonitor = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, manufacturer, serial, assigned, status, releaseYear, room, reason } = req.body;
    if (assigned && !Array.isArray(assigned)) return res.status(400).json({ message: 'Assigned phải là mảng ID người sử dụng hợp lệ.' });
    if (room && !mongoose.Types.ObjectId.isValid(room)) return res.status(400).json({ message: 'Room ID không hợp lệ!' });
    const monitor = await Monitor.findByIdAndUpdate(
      id,
      { name, manufacturer, serial, assigned, status, releaseYear, room, reason: status === 'Broken' ? reason : undefined, assignmentHistory: req.body.assignmentHistory },
      { new: true }
    );
    if (!monitor) return res.status(404).json({ message: 'Không tìm thấy monitor' });
    await redisService.deleteDeviceCache('monitor');
    res.json(monitor);
  } catch (error) {
    console.error('Error updating monitor:', error.message);
    res.status(400).json({ message: 'Error updating monitor', error: error.message });
  }
};

exports.deleteMonitor = async (req, res) => {
  try {
    await Monitor.findByIdAndDelete(req.params.id);
    await redisService.deleteDeviceCache('monitor');
    res.json({ message: 'Monitor deleted' });
  } catch (error) {
    res.status(400).json({ message: 'Error deleting monitor', error });
  }
};

exports.updateMonitorSpecs = async (req, res) => {
  try {
    const { id } = req.params;
    const { specs = {}, releaseYear, manufacturer, type } = req.body;
    const current = await Monitor.findById(id);
    if (!current) return res.status(404).json({ message: 'Monitor không tồn tại.' });
    const cleanedSpecs = { display: specs.display ?? current.specs.display };
    const updates = { specs: cleanedSpecs, releaseYear: releaseYear ?? current.releaseYear, manufacturer: manufacturer ?? current.manufacturer, type: type ?? current.type };
    const updated = await Monitor.findByIdAndUpdate(id, updates, { new: true });
    if (!updated) return res.status(404).json({ message: 'Không thể cập nhật monitor.' });
    res.status(200).json(updated);
  } catch (error) {
    console.error('Lỗi khi cập nhật specs:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.bulkUploadMonitors = async (req, res) => {
  try {
    const { monitors } = req.body;
    if (!monitors || !Array.isArray(monitors) || monitors.length === 0) return res.status(400).json({ message: 'Không có dữ liệu hợp lệ để tải lên!' });
    const errors = [];
    const validMonitors = [];
    for (const monitor of monitors) {
      try {
        monitor.room = monitor.room && mongoose.Types.ObjectId.isValid(monitor.room) ? monitor.room : null;
        monitor.status = ['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(monitor.status) ? monitor.status : 'Standby';
        if (monitor.assigned && Array.isArray(monitor.assigned)) {
          const isId = mongoose.Types.ObjectId.isValid(monitor.assigned[0]);
          if (isId) {
            const validIds = await User.find({ _id: { $in: monitor.assigned } }).select('_id');
            if (validIds.length !== monitor.assigned.length) throw new Error('Một số ID người dùng không tồn tại trong hệ thống.');
          } else {
            const assignedIds = await Promise.all(
              monitor.assigned.map(async (fullname) => {
                const user = await User.findOne({ fullname: fullname.trim() }).select('_id');
                if (!user) throw new Error(`Người dùng "${fullname}" không tồn tại trong hệ thống.`);
                return user._id;
              })
            );
            monitor.assigned = assignedIds;
          }
        }
        if (monitor.room && !mongoose.Types.ObjectId.isValid(monitor.room)) throw new Error(`Room ID "${monitor.room}" không hợp lệ.`);
        if (!monitor.name || !monitor.serial) {
          errors.push({ serial: monitor.serial || 'Không xác định', message: 'Thông tin monitor không hợp lệ (thiếu tên, serial).' });
          continue;
        }
        const existing = await Monitor.findOne({ serial: monitor.serial });
        if (existing) {
          errors.push({ serial: monitor.serial, name: monitor.name, message: `Serial ${monitor.serial} đã tồn tại.` });
          continue;
        }
        validMonitors.push(monitor);
      } catch (error) {
        errors.push({ serial: monitor.serial || 'Không xác định', message: error.message || 'Lỗi không xác định khi xử lý monitor.' });
      }
    }
    if (validMonitors.length > 0) await Monitor.insertMany(validMonitors);
    res.status(201).json({ message: 'Thêm mới hàng loạt thành công!', addedMonitors: validMonitors.length, errors });
  } catch (error) {
    console.error('Lỗi khi thêm mới hàng loạt:', error.message);
    res.status(500).json({ message: 'Lỗi khi thêm mới hàng loạt', error: error.message });
  }
};

exports.assignMonitor = async (req, res) => {
  try {
    const { id } = req.params;
    const { newUserId, notes } = req.body;
    const monitor = await Monitor.findById(id).populate('assigned');
    if (!monitor) return res.status(404).json({ message: 'Không tìm thấy monitor' });
    monitor.assignmentHistory.forEach((e) => { if (!e.endDate) e.endDate = new Date(); });
    const currentUser = req.user;
    if (monitor.assigned?.length > 0) {
      const oldUserId = monitor.assigned[0]._id;
      const lastHistory = monitor.assignmentHistory.find((h) => h.user.toString() === oldUserId.toString() && !h.endDate);
      if (lastHistory) { lastHistory.endDate = new Date(); lastHistory.revokedBy = currentUser._id; }
    }
    const newUser = await User.findById(newUserId);
    if (!newUser) return res.status(404).json({ message: 'Không tìm thấy user mới' });
    monitor.assignmentHistory.push({ user: newUser._id, userName: newUser.fullname, startDate: new Date(), notes: notes || '', assignedBy: currentUser.id, jobTitle: newUser.jobTitle || 'Không xác định' });
    monitor.currentHolder = { id: newUser._id, fullname: newUser.fullname, jobTitle: newUser.jobTitle, department: newUser.department, avatarUrl: newUser.avatarUrl };
    monitor.assigned = [newUser._id];
    monitor.status = 'PendingDocumentation';
    await monitor.save();
    const populated = await monitor.populate({ path: 'assignmentHistory.user', select: 'fullname jobTitle avatarUrl' });
    res.status(200).json(populated);
  } catch (error) {
    console.error('Lỗi assignMonitor:', error);
    res.status(500).json({ message: 'Lỗi server', error });
  }
};

exports.revokeMonitor = async (req, res) => {
  try {
    const { id } = req.params;
    const { reasons, status } = req.body;
    const monitor = await Monitor.findById(id).populate('assigned');
    if (!monitor) return res.status(404).json({ message: 'Monitor không tồn tại' });
    const currentUser = req.user;
    if (monitor.assigned.length > 0) {
      const oldUserId = monitor.assigned[0]._id;
      const lastHistory = monitor.assignmentHistory.find((hist) => hist.user?.toString() === oldUserId.toString() && !hist.endDate);
      if (lastHistory) {
        lastHistory.endDate = new Date();
        lastHistory.revokedBy = currentUser._id;
        lastHistory.revokedReason = Array.isArray(reasons) ? reasons.filter(r => typeof r === 'string') : [];
      }
    } else {
      monitor.assignmentHistory.push({
        revokedBy: currentUser._id,
        revokedReason: Array.isArray(reasons) ? reasons.filter(r => typeof r === 'string') : [],
        endDate: new Date()
      });
    }
    monitor.status = status || 'Standby';
    monitor.currentHolder = null;
    monitor.assigned = [];
    await monitor.save();
    res.status(200).json({ message: 'Thu hồi thành công', monitor });
  } catch (error) {
    console.error('Lỗi revokeMonitor:', error);
    res.status(500).json({ message: 'Lỗi server', error });
  }
};

exports.updateMonitorStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, brokenReason } = req.body;
    if (!['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(status)) return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    if (status === 'Broken' && !brokenReason) return res.status(400).json({ error: 'Lý do báo hỏng là bắt buộc!' });
    const monitor = await Monitor.findById(id);
    if (!monitor) return res.status(404).json({ message: 'Không tìm thấy thiết bị' });
    if (status === 'Broken') monitor.brokenReason = brokenReason || 'Không xác định';
    monitor.status = status;
    await monitor.save();
    res.status(200).json(monitor);
  } catch (error) {
    console.error('Lỗi updateMonitorStatus:', error);
    res.status(500).json({ message: 'Lỗi server', error });
  }
};

const { uploadHandoverReport: uploadHelper, getHandoverReport: getHandoverHelper } = require('../../utils/uploadHelper');

exports.uploadHandoverReport = async (req, res) => {
  return uploadHelper(req, res, Monitor, 'monitorId');
};

exports.getHandoverReport = async (req, res) => {
  return getHandoverHelper(req, res);
};

// Get monitor statistics
exports.getMonitorStatistics = async (req, res) => {
  try {
    const Monitor = require('../../models/Monitor');

    // Count monitors by status
    const total = await Monitor.countDocuments();
    const active = await Monitor.countDocuments({ status: 'Active' });
    const standby = await Monitor.countDocuments({ status: 'Standby' });
    const broken = await Monitor.countDocuments({ status: 'Broken' });

    res.json({
      total,
      active,
      standby,
      broken
    });
  } catch (error) {
    console.error('Lỗi getMonitorStatistics:', error);
    res.status(500).json({ message: 'Đã xảy ra lỗi khi lấy thống kê monitor.', error });
  }
};