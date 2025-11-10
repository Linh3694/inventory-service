const Projector = require('../../models/Projector');
const User = require('../../models/User');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const redisService = require('../../services/redisService');

exports.getProjectors = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { search, status, manufacturer, type, releaseYear } = req.query;
    const hasFilters = search || status || manufacturer || type || releaseYear;
    if (!hasFilters) {
      const cachedData = await redisService.getDevicePage('projector', page, limit);
      if (cachedData) {
        return res.status(200).json({
          populatedProjectors: cachedData.devices,
          pagination: { currentPage: page, totalPages: Math.ceil(cachedData.total / limit), totalItems: cachedData.total, itemsPerPage: limit, hasNext: page < Math.ceil(cachedData.total / limit), hasPrev: page > 1 },
        });
      }
    }
    const query = {};
    if (search) query.$or = [ { name: { $regex: search, $options: 'i' } }, { serial: { $regex: search, $options: 'i' } }, { manufacturer: { $regex: search, $options: 'i' } } ];
    if (status) query.status = status;
    if (manufacturer) query.manufacturer = { $regex: manufacturer, $options: 'i' };
    if (type) query.type = { $regex: type, $options: 'i' };
    if (releaseYear) query.releaseYear = parseInt(releaseYear);
    let projectors, totalItems;
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const aggregationPipeline = [
        { $lookup: { from: 'users', localField: 'assigned', foreignField: '_id', as: 'assignedUsers' } },
        { $match: { $or: [ { name: searchRegex }, { serial: searchRegex }, { manufacturer: searchRegex }, { 'assignedUsers.fullname': searchRegex } ] } },
        { $facet: { data: [ { $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit } ], total: [ { $count: 'count' } ] } },
      ];
      const result = await Projector.aggregate(aggregationPipeline);
      projectors = result[0]?.data || [];
      totalItems = result[0]?.total[0]?.count || 0;
      const ids = projectors.map((p) => p._id);
      const populated = await Projector.find({ _id: { $in: ids } })
        .populate('assigned', 'fullname jobTitle department avatarUrl')
        .populate('room', 'name location status')
        .populate('assignmentHistory.user', 'fullname email jobTitle avatarUrl')
        .populate('assignmentHistory.assignedBy', 'fullname email title')
        .populate('assignmentHistory.revokedBy', 'fullname email')
        .lean();
      projectors = populated;
    } else {
      totalItems = await Projector.countDocuments(query);
      projectors = await Projector.find(query)
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
    const populatedProjectors = projectors.map((p) => ({ ...p, room: p.room ? { ...p.room, location: p.room.location?.map((loc) => `${loc.building}, tầng ${loc.floor}`) || ['Không xác định'] } : { name: 'Không xác định', location: ['Không xác định'] } }));
    if (!hasFilters) await redisService.setDevicePage('projector', page, limit, populatedProjectors, totalItems, 300);
    const totalPages = Math.ceil(totalItems / limit);
    return res.status(200).json({ populatedProjectors, pagination: { currentPage: page, totalPages, totalItems, itemsPerPage: limit, hasNext: page < totalPages, hasPrev: page > 1 } });
  } catch (error) {
    console.error('Error fetching projectors:', error.message);
    return res.status(500).json({ message: 'Error fetching projectors', error: error.message });
  }
};

exports.createProjector = async (req, res) => {
  try {
    const { name, manufacturer, serial, assigned, status, specs, type, room, reason } = req.body;
    if (!name || !serial) return res.status(400).json({ message: 'Thiếu thông tin bắt buộc (name, serial)!' });
    if (!specs || typeof specs !== 'object') return res.status(400).json({ message: 'Thông tin specs không hợp lệ!' });
    const existing = await Projector.findOne({ serial });
    if (existing) return res.status(400).json({ message: `Serial "${serial}" đã tồn tại trong hệ thống.` });
    if (assigned && !Array.isArray(assigned)) return res.status(400).json({ message: 'Assigned phải là mảng ID người sử dụng hợp lệ.' });
    if (room && !mongoose.Types.ObjectId.isValid(room)) return res.status(400).json({ message: 'Room ID không hợp lệ!' });
    if (status === 'Broken' && !reason) return res.status(400).json({ message: "Lý do báo hỏng là bắt buộc khi trạng thái là 'Broken'!" });
    let validStatus = status;
    if (!['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(status)) validStatus = 'Standby';
    if (assigned && assigned.length > 0 && validStatus === 'Standby') validStatus = 'PendingDocumentation';
    const projector = new Projector({ name, manufacturer, serial, assigned, specs, type, room, reason: validStatus === 'Broken' ? reason : undefined, status: validStatus });
    await projector.save();
    await redisService.deleteDeviceCache('projector');
    res.status(201).json(projector);
  } catch (error) {
    console.error('Error creating projector:', error.message);
    res.status(500).json({ message: 'Lỗi khi thêm projector', error: error.message });
  }
};

exports.updateProjector = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, manufacturer, serial, assigned, status, releaseYear, specs, type, room, reason } = req.body;
    if (assigned && !Array.isArray(assigned)) return res.status(400).json({ message: 'Assigned phải là mảng ID người sử dụng hợp lệ.' });
    if (room && !mongoose.Types.ObjectId.isValid(room)) return res.status(400).json({ message: 'Room ID không hợp lệ!' });
    let validStatus = status;
    if (!['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(status)) {
      const oldProjector = await Projector.findById(id).lean();
      if (!oldProjector) return res.status(404).json({ message: 'Không tìm thấy projector.' });
      validStatus = oldProjector.status;
    }
    if (validStatus === 'Broken' && !reason) return res.status(400).json({ message: "Lý do báo hỏng là bắt buộc khi trạng thái là 'Broken'!" });
    if (assigned && assigned.length > 0 && validStatus === 'Standby') validStatus = 'PendingDocumentation';
    const updatedData = { name, manufacturer, serial, assigned, status: validStatus, releaseYear, specs, type, room, reason: validStatus === 'Broken' ? reason : undefined, assignmentHistory: req.body.assignmentHistory };
    const projector = await Projector.findByIdAndUpdate(id, updatedData, { new: true });
    if (!projector) return res.status(404).json({ message: 'Không tìm thấy projector' });
    res.json(projector);
  } catch (error) {
    console.error('Error updating projector:', error.message);
    res.status(400).json({ message: 'Error updating projector', error: error.message });
  }
};

exports.deleteProjector = async (req, res) => {
  try {
    await Projector.findByIdAndDelete(req.params.id);
    res.json({ message: 'Projector deleted' });
  } catch (error) {
    res.status(400).json({ message: 'Error deleting projector', error });
  }
};

exports.bulkUploadProjectors = async (req, res) => {
  try {
    const { projectors } = req.body;
    if (!projectors || !Array.isArray(projectors) || projectors.length === 0) return res.status(400).json({ message: 'Không có dữ liệu hợp lệ để tải lên!' });
    const errors = [];
    const validProjectors = [];
    for (const projector of projectors) {
      try {
        projector.room = projector.room && mongoose.Types.ObjectId.isValid(projector.room) ? projector.room : null;
        if (!['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(projector.status)) projector.status = 'Standby';
        if (projector.assigned && Array.isArray(projector.assigned)) {
          const isId = mongoose.Types.ObjectId.isValid(projector.assigned[0]);
          if (isId) {
            const validIds = await User.find({ _id: { $in: projector.assigned } }).select('_id');
            if (validIds.length !== projector.assigned.length) throw new Error('Một số ID người dùng không tồn tại trong hệ thống.');
          } else {
            const assignedIds = await Promise.all(projector.assigned.map(async (fullname) => {
              const user = await User.findOne({ fullname: fullname.trim() }).select('_id');
              if (!user) throw new Error(`Người dùng "${fullname}" không tồn tại trong hệ thống.`);
              return user._id;
            }));
            projector.assigned = assignedIds;
          }
        }
        if (projector.assigned && projector.assigned.length > 0 && projector.status === 'Standby') projector.status = 'PendingDocumentation';
        if (projector.room && !mongoose.Types.ObjectId.isValid(projector.room)) throw new Error(`Room ID "${projector.room}" không hợp lệ.`);
        if (!projector.name || !projector.serial) { errors.push({ serial: projector.serial || 'Không xác định', message: 'Thông tin projector không hợp lệ (thiếu tên, serial).' }); continue; }
        const existingProjector = await Projector.findOne({ serial: projector.serial });
        if (existingProjector) { errors.push({ serial: projector.serial, name: projector.name, message: `Serial ${projector.serial} đã tồn tại.` }); continue; }
        validProjectors.push(projector);
      } catch (error) {
        errors.push({ serial: projector.serial || 'Không xác định', message: error.message || 'Lỗi không xác định khi xử lý projector.' });
      }
    }
    if (validProjectors.length > 0) await Projector.insertMany(validProjectors);
    res.status(201).json({ message: 'Thêm mới hàng loạt thành công!', addedProjectors: validProjectors.length, errors });
  } catch (error) {
    console.error('Lỗi khi thêm mới hàng loạt:', error.message);
    res.status(500).json({ message: 'Lỗi khi thêm mới hàng loạt', error: error.message });
  }
};

exports.assignProjector = async (req, res) => {
  try {
    const { id } = req.params;
    const { newUserId, notes } = req.body;
    const projector = await Projector.findById(id).populate('assigned');
    if (!projector) return res.status(404).json({ message: 'Không tìm thấy projector' });
    projector.assignmentHistory.forEach((e) => { if (!e.endDate) e.endDate = new Date(); });
    const currentUser = req.user;
    if (projector.assigned?.length > 0) {
      const oldUserId = projector.assigned[0]._id;
      const lastHistory = projector.assignmentHistory.find((h) => h.user.toString() === oldUserId.toString() && !h.endDate);
      if (lastHistory) { lastHistory.endDate = new Date(); lastHistory.revokedBy = currentUser?._id || null; }
    }
    const newUser = await User.findById(newUserId);
    if (!newUser) return res.status(404).json({ message: 'Không tìm thấy user mới' });
    projector.assignmentHistory.push({ user: newUser._id, userName: newUser.fullname, startDate: new Date(), notes: notes || '', assignedBy: currentUser?.id || null, jobTitle: newUser.jobTitle || 'Không xác định' });
    projector.currentHolder = { id: newUser._id, fullname: newUser.fullname, jobTitle: newUser.jobTitle, department: newUser.department, avatarUrl: newUser.avatarUrl };
    projector.assigned = [newUser._id];
    projector.status = 'PendingDocumentation';
    await projector.save();
    const populated = await projector.populate({ path: 'assignmentHistory.user', select: 'fullname jobTitle avatarUrl department' });
    res.status(200).json(populated);
  } catch (error) {
    console.error('Lỗi assignProjector:', error);
    res.status(500).json({ message: 'Lỗi server', error });
  }
};

exports.revokeProjector = async (req, res) => {
  try {
    const { id } = req.params;
    const { reasons, status } = req.body;
    const projector = await Projector.findById(id).populate('assigned');
    if (!projector) return res.status(404).json({ message: 'Projector không tồn tại' });
    const currentUser = req.user;
    if (projector.assigned.length > 0) {
      const oldUserId = projector.assigned[0]._id;
      const lastHistory = projector.assignmentHistory.find((hist) => hist.user?.toString() === oldUserId.toString() && !hist.endDate);
      if (lastHistory) {
        lastHistory.endDate = new Date();
        lastHistory.revokedBy = currentUser._id;
        lastHistory.revokedReason = Array.isArray(reasons) ? reasons.filter(r => typeof r === 'string') : [];
      }
    } else {
      projector.assignmentHistory.push({
        revokedBy: currentUser._id,
        revokedReason: Array.isArray(reasons) ? reasons.filter(r => typeof r === 'string') : [],
        endDate: new Date()
      });
    }
    projector.status = status || 'Standby';
    projector.currentHolder = null;
    projector.assigned = [];
    await projector.save();
    res.status(200).json({ message: 'Thu hồi thành công', projector });
  } catch (error) {
    console.error('Lỗi revokeProjector:', error);
    res.status(500).json({ message: 'Lỗi server', error });
  }
};

exports.updateProjectorStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, brokenReason, brokenDescription } = req.body;
    if (!['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(status)) return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    if (status === 'Broken' && !brokenReason) return res.status(400).json({ error: 'Lý do báo hỏng là bắt buộc!' });
    const projector = await Projector.findById(id);
    if (!projector) return res.status(404).json({ message: 'Không tìm thấy thiết bị' });
    if (status === 'Broken') {
      projector.brokenReason = brokenReason || 'Không xác định';
      projector.brokenDescription = brokenDescription || null;
    }
    projector.status = status;
    await projector.save();
    res.status(200).json(projector);
  } catch (error) {
    console.error('Lỗi updateProjectorStatus:', error);
    res.status(500).json({ message: 'Lỗi server', error });
  }
};

exports.searchProjectors = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.trim() === '') return res.status(400).json({ message: 'Từ khóa tìm kiếm không hợp lệ!' });
    const searchQuery = { $or: [ { name: { $regex: query, $options: 'i' } }, { serial: { $regex: query, $options: 'i' } }, { 'assigned.fullname': { $regex: query, $options: 'i' } } ] };
    const projectors = await Projector.find(searchQuery).populate('assigned', 'fullname jobTitle department avatarUrl').populate('room', 'name location status').lean();
    res.status(200).json(projectors);
  } catch (error) {
    console.error('Error during search:', error.message);
    res.status(500).json({ message: 'Lỗi khi tìm kiếm projectors', error: error.message });
  }
};

const { uploadHandoverReport: uploadHelper, getHandoverReport: getHandoverHelper } = require('../../utils/uploadHelper');

exports.uploadHandoverReport = async (req, res) => {
  return uploadHelper(req, res, Projector, 'projectorId');
};

exports.getHandoverReport = async (req, res) => {
  return getHandoverHelper(req, res);
};

exports.getProjectorById = async (req, res) => {
  try {
    const { id } = req.params;
    const projector = await Projector.findById(id)
      .populate('assigned', 'fullname email jobTitle avatarUrl department')
      .populate('room', 'name location status')
      .populate('assignmentHistory.user', 'fullname email jobTitle avatarUrl')
      .populate('assignmentHistory.assignedBy', 'fullname email jobTitle avatarUrl')
      .populate('assignmentHistory.revokedBy', 'fullname email jobTitle avatarUrl');
    if (!projector) return res.status(404).json({ message: 'Không tìm thấy projector' });
    res.status(200).json(projector);
  } catch (error) {
    console.error('Lỗi khi lấy thông tin projector:', error);
    res.status(500).json({ message: 'Lỗi máy chủ', error });
  }
};

exports.updateProjectorSpecs = async (req, res) => {
  try {
    const { id } = req.params;
    const { specs = {}, releaseYear, manufacturer, type } = req.body;
    const current = await Projector.findById(id);
    if (!current) return res.status(404).json({ message: 'Projector không tồn tại.' });
    const cleanedSpecs = { processor: specs.processor ?? current.specs.processor, ram: specs.ram ?? current.specs.ram, storage: specs.storage ?? current.specs.storage, display: specs.display ?? current.specs.display };
    const updates = { specs: cleanedSpecs, releaseYear: releaseYear ?? current.releaseYear, manufacturer: manufacturer ?? current.manufacturer, type: type ?? current.type };
    const updated = await Projector.findByIdAndUpdate(id, updates, { new: true });
    if (!updated) return res.status(404).json({ message: 'Không thể cập nhật projector.' });
    res.status(200).json(updated);
  } catch (error) {
    console.error('Lỗi khi cập nhật specs:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

// Get projector statistics
exports.getProjectorStatistics = async (req, res) => {
  try {
    const Projector = require('../../models/Projector');

    // Count projectors by status
    const total = await Projector.countDocuments();
    const active = await Projector.countDocuments({ status: 'Active' });
    const standby = await Projector.countDocuments({ status: 'Standby' });
    const broken = await Projector.countDocuments({ status: 'Broken' });

    res.json({
      total,
      active,
      standby,
      broken
    });
  } catch (error) {
    console.error('Lỗi getProjectorStatistics:', error);
    res.status(500).json({ message: 'Đã xảy ra lỗi khi lấy thống kê projector.', error });
  }
};