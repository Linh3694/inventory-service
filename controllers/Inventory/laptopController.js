const Laptop = require('../../models/Laptop');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const User = require('../../models/User');
const Room = require('../../models/Room');
const redisService = require('../../services/redisService');

// Copy logic từ backend, giữ nguyên hành vi
// Lấy danh sách laptop với pagination và cache
exports.getLaptops = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { search, status, manufacturer, type, releaseYear } = req.query;
    const hasFilters = search || status || manufacturer || type || releaseYear;
    if (!hasFilters) {
      const cachedData = await redisService.getDevicePage('laptop', page, limit);
      if (cachedData) {
        return res.status(200).json({
          populatedLaptops: cachedData.devices,
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

    let laptops, totalItems;
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const aggregationPipeline = [
        { $lookup: { from: 'users', localField: 'assigned', foreignField: '_id', as: 'assignedUsers' } },
        { $match: { $or: [ { name: searchRegex }, { serial: searchRegex }, { manufacturer: searchRegex }, { 'assignedUsers.fullname': searchRegex } ] } },
        { $facet: { data: [ { $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit } ], total: [ { $count: 'count' } ] } },
      ];
      const result = await Laptop.aggregate(aggregationPipeline);
      laptops = result[0]?.data || [];
      totalItems = result[0]?.total[0]?.count || 0;
      const laptopIds = laptops.map((l) => l._id);
      const populated = await Laptop.find({ _id: { $in: laptopIds } })
        .populate('assigned', 'fullname jobTitle department avatarUrl')
        .populate('room', 'name room_number building floor block status')
        .populate('assignmentHistory.user', 'fullname email jobTitle avatarUrl')
        .populate('assignmentHistory.assignedBy', 'fullname email title')
        .populate('assignmentHistory.revokedBy', 'fullname email')
        .lean();
      laptops = populated;
    } else {
      totalItems = await Laptop.countDocuments(query);
      laptops = await Laptop.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('assigned', 'fullname jobTitle department avatarUrl')
        .populate('room', 'name room_number building floor block status')
        .populate('assignmentHistory.user', 'fullname email jobTitle avatarUrl')
        .populate('assignmentHistory.assignedBy', 'fullname email title')
        .populate('assignmentHistory.revokedBy', 'fullname email')
        .lean();
    }
    const populatedLaptops = laptops.map((l) => ({
      ...l,
      room: l.room ? {
        ...l.room,
        location: l.room.getDisplayLocation ? [l.room.getDisplayLocation()] : ['Không xác định']
      } : { name: 'Không xác định', location: ['Không xác định'] },
    }));
    if (!hasFilters) {
      await redisService.setDevicePage('laptop', page, limit, populatedLaptops, totalItems, 300);
    }
    const totalPages = Math.ceil(totalItems / limit);
    return res.status(200).json({ populatedLaptops, pagination: { currentPage: page, totalPages, totalItems, itemsPerPage: limit, hasNext: page < totalPages, hasPrev: page > 1 } });
  } catch (error) {
    console.error('Error fetching laptops:', error.message);
    return res.status(500).json({ message: 'Error fetching laptops', error: error.message });
  }
};

exports.createLaptop = async (req, res) => {
  try {
    const { name, manufacturer, serial, assigned, status, specs, type, room, reason } = req.body;
    if (!name || !serial) return res.status(400).json({ message: 'Thiếu thông tin bắt buộc (name, serial)!' });
    if (!specs || typeof specs !== 'object') return res.status(400).json({ message: 'Thông tin specs không hợp lệ!' });
    const existing = await Laptop.findOne({ serial });
    if (existing) return res.status(400).json({ message: `Serial "${serial}" đã tồn tại trong hệ thống.` });
    if (assigned && !Array.isArray(assigned)) return res.status(400).json({ message: 'Assigned phải là mảng ID người sử dụng hợp lệ.' });
    if (room && !mongoose.Types.ObjectId.isValid(room)) return res.status(400).json({ message: 'Room ID không hợp lệ!' });
    if (status === 'Broken' && !reason) return res.status(400).json({ message: "Lý do báo hỏng là bắt buộc khi trạng thái là 'Broken'!" });
    let validStatus = status;
    if (!['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(status)) validStatus = 'Standby';
    if (assigned && assigned.length > 0 && validStatus === 'Standby') validStatus = 'PendingDocumentation';
    const laptop = new Laptop({ name, manufacturer, serial, assigned, specs, type, room, reason: validStatus === 'Broken' ? reason : undefined, status: validStatus });
    await laptop.save();
    await redisService.deleteDeviceCache('laptop');
    res.status(201).json(laptop);
  } catch (error) {
    console.error('Error creating laptop:', error.message);
    res.status(500).json({ message: 'Lỗi khi thêm laptop', error: error.message });
  }
};

exports.updateLaptop = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, manufacturer, serial, assigned, status, releaseYear, specs, type, room, reason } = req.body;
    if (assigned && !Array.isArray(assigned)) return res.status(400).json({ message: 'Assigned phải là mảng ID người sử dụng hợp lệ.' });
    if (room && !mongoose.Types.ObjectId.isValid(room)) return res.status(400).json({ message: 'Room ID không hợp lệ!' });
    let validStatus = status;
    if (!['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(status)) {
      const oldLaptop = await Laptop.findById(id).lean();
      if (!oldLaptop) return res.status(404).json({ message: 'Không tìm thấy laptop.' });
      validStatus = oldLaptop.status;
    }
    if (validStatus === 'Broken' && !reason) return res.status(400).json({ message: "Lý do báo hỏng là bắt buộc khi trạng thái là 'Broken'!" });
    if (assigned && assigned.length > 0 && validStatus === 'Standby') validStatus = 'PendingDocumentation';
    const updatedData = { name, manufacturer, serial, assigned, status: validStatus, releaseYear, specs, type, room, reason: validStatus === 'Broken' ? reason : undefined, assignmentHistory: req.body.assignmentHistory };
    const laptop = await Laptop.findByIdAndUpdate(id, updatedData, { new: true });
    if (!laptop) return res.status(404).json({ message: 'Không tìm thấy laptop' });
    await redisService.deleteDeviceCache('laptop');
    res.json(laptop);
  } catch (error) {
    console.error('Error updating laptop:', error.message);
    res.status(400).json({ message: 'Error updating laptop', error: error.message });
  }
};

exports.deleteLaptop = async (req, res) => {
  try {
    await Laptop.findByIdAndDelete(req.params.id);
    await redisService.deleteDeviceCache('laptop');
    res.json({ message: 'Laptop deleted' });
  } catch (error) {
    res.status(400).json({ message: 'Error deleting laptop', error });
  }
};

exports.assignLaptop = async (req, res) => {
  try {
    const { id } = req.params;
    const { newUserId, notes } = req.body;
    const laptop = await Laptop.findById(id).populate('assigned');
    if (!laptop) return res.status(404).json({ message: 'Không tìm thấy laptop' });
    laptop.assignmentHistory.forEach((e) => { if (!e.endDate) e.endDate = new Date(); });
    const currentUser = req.user;
    if (laptop.assigned?.length > 0) {
      const oldUserId = laptop.assigned[0]._id;
      const lastHistory = laptop.assignmentHistory.find((h) => h.user.toString() === oldUserId.toString() && !h.endDate);
      if (lastHistory) { lastHistory.endDate = new Date(); lastHistory.revokedBy = currentUser?._id || null; }
    }
    const newUser = await User.findById(newUserId);
    if (!newUser) return res.status(404).json({ message: 'Không tìm thấy user mới' });
    laptop.assignmentHistory.push({ user: newUser._id, userName: newUser.fullname, startDate: new Date(), notes: notes || '', assignedBy: currentUser?.id || null, jobTitle: newUser.jobTitle || 'Không xác định' });
    laptop.currentHolder = { id: newUser._id, fullname: newUser.fullname, jobTitle: newUser.jobTitle, department: newUser.department, avatarUrl: newUser.avatarUrl };
    laptop.assigned = [newUser._id];
    laptop.status = 'PendingDocumentation';
    await laptop.save();
    await redisService.deleteDeviceCache('laptop');
    const populated = await laptop.populate({ path: 'assignmentHistory.user', select: 'fullname jobTitle avatarUrl department' });
    res.status(200).json(populated);
  } catch (error) {
    console.error('Lỗi assignLaptop:', error);
    res.status(500).json({ message: 'Lỗi server', error });
  }
};

exports.revokeLaptop = async (req, res) => {
  try {
    const { id } = req.params;
    const { revokedBy, reasons, status } = req.body;
    const laptop = await Laptop.findById(id).populate('assigned');
    if (!laptop) return res.status(404).json({ message: 'Laptop không tồn tại' });
    const currentUser = req.user;
    if (laptop.assigned.length > 0) {
      const oldUserId = laptop.assigned[0]._id;
      const lastHistory = laptop.assignmentHistory.find((h) => h.user?.toString() === oldUserId.toString() && !h.endDate);
      if (lastHistory) { lastHistory.endDate = new Date(); lastHistory.revokedBy = currentUser.id; lastHistory.revokedReason = reasons; }
    } else {
      laptop.assignmentHistory.push({ revokedBy, revokedReason: reasons, endDate: new Date() });
    }
    laptop.status = status || 'Standby';
    laptop.currentHolder = null;
    laptop.assigned = [];
    await laptop.save();
    await redisService.deleteDeviceCache('laptop');
    res.status(200).json({ message: 'Thu hồi thành công', laptop });
  } catch (error) {
    console.error('Lỗi revokeLaptop:', error);
    res.status(500).json({ message: 'Lỗi server', error });
  }
};

exports.updateLaptopStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, brokenReason } = req.body;
    if (!['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(status)) return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    if (status === 'Broken' && !brokenReason) return res.status(400).json({ error: 'Lý do báo hỏng là bắt buộc!' });
    const laptop = await Laptop.findById(id);
    if (!laptop) return res.status(404).json({ message: 'Không tìm thấy thiết bị' });
    if (status === 'Broken') { laptop.brokenReason = brokenReason || 'Không xác định'; }
    laptop.status = status;
    await laptop.save();
    await redisService.deleteDeviceCache('laptop');
    res.status(200).json(laptop);
  } catch (error) {
    console.error('Lỗi updateLaptopStatus:', error);
    res.status(500).json({ message: 'Lỗi server', error });
  }
};

// Bulk upload laptops
exports.bulkUploadLaptops = async (req, res) => {
  try {
    const { laptops } = req.body;
    if (!laptops || !Array.isArray(laptops) || laptops.length === 0) {
      return res.status(400).json({ message: 'Không có dữ liệu hợp lệ để tải lên!' });
    }

    const errors = [];
    const validDocs = [];

    for (const laptop of laptops) {
      try {
        // Normalize and validate fields
        laptop.room = laptop.room && mongoose.Types.ObjectId.isValid(laptop.room) ? laptop.room : null;
        laptop.status = ['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(laptop.status)
          ? laptop.status
          : 'Standby';

        if (laptop.assigned && Array.isArray(laptop.assigned) && laptop.assigned.length > 0) {
          const looksLikeId = mongoose.Types.ObjectId.isValid(laptop.assigned[0]);
          if (looksLikeId) {
            const validIds = await User.find({ _id: { $in: laptop.assigned } }).select('_id');
            if (validIds.length !== laptop.assigned.length) {
              throw new Error('Một số ID người dùng không tồn tại trong hệ thống.');
            }
          } else {
            // Map from fullnames to user ids
            const assignedIds = await Promise.all(
              laptop.assigned.map(async (fullname) => {
                const user = await User.findOne({ fullname: fullname.trim() }).select('_id');
                if (!user) throw new Error(`Người dùng "${fullname}" không tồn tại trong hệ thống.`);
                return user._id;
              })
            );
            laptop.assigned = assignedIds;
          }
        }

        if (!laptop.name || !laptop.serial) {
          errors.push({ serial: laptop.serial || 'Không xác định', message: 'Thông tin laptop không hợp lệ (thiếu tên, serial).' });
          continue;
        }

        const existing = await Laptop.findOne({ serial: laptop.serial });
        if (existing) {
          errors.push({ serial: laptop.serial, name: laptop.name, message: `Serial ${laptop.serial} đã tồn tại.` });
          continue;
        }

        validDocs.push(laptop);
      } catch (err) {
        errors.push({ serial: laptop.serial || 'Không xác định', message: err.message || 'Lỗi không xác định khi xử lý laptop.' });
      }
    }

    if (validDocs.length > 0) {
      await Laptop.insertMany(validDocs);
    }

    return res.status(201).json({ message: 'Thêm mới hàng loạt thành công!', addedLaptops: validDocs.length, errors });
  } catch (error) {
    console.error('Lỗi khi thêm mới hàng loạt laptops:', error.message);
    return res.status(500).json({ message: 'Lỗi khi thêm mới hàng loạt', error: error.message });
  }
};

exports.searchLaptops = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.trim() === '') return res.status(400).json({ message: 'Từ khóa tìm kiếm không hợp lệ!' });
    const searchQuery = { $or: [ { name: { $regex: query, $options: 'i' } }, { serial: { $regex: query, $options: 'i' } }, { 'assigned.fullname': { $regex: query, $options: 'i' } } ] };
    const laptops = await Laptop.find(searchQuery).populate('assigned', 'fullname jobTitle department avatarUrl').populate('room', 'name location status').lean();
    res.status(200).json(laptops);
  } catch (error) {
    console.error('Error during search:', error.message);
    res.status(500).json({ message: 'Lỗi khi tìm kiếm laptops', error: error.message });
  }
};

const { uploadHandoverReport: uploadHelper, getHandoverReport: getHandoverHelper } = require('../../utils/uploadHelper');

exports.uploadHandoverReport = async (req, res) => {
  return uploadHelper(req, res, Laptop, 'laptopId');
};

exports.getHandoverReport = async (req, res) => {
  return getHandoverHelper(req, res);
};

exports.getLaptopById = async (req, res) => {
  const { id } = req.params;
  try {
    const laptop = await Laptop.findById(id)
      .populate('assigned', 'fullname email jobTitle avatarUrl department')
      .populate('room', 'name location status')
      .populate('assignmentHistory.user', 'fullname email jobTitle avatarUrl')
      .populate('assignmentHistory.assignedBy', 'fullname email jobTitle avatarUrl')
      .populate('assignmentHistory.revokedBy', 'fullname email jobTitle avatarUrl');
    if (!laptop) return res.status(404).json({ message: 'Không tìm thấy laptop' });
    res.status(200).json(laptop);
  } catch (error) {
    console.error('Lỗi khi lấy thông tin laptop:', error);
    res.status(500).json({ message: 'Lỗi máy chủ', error });
  }
};

exports.updateLaptopSpecs = async (req, res) => {
  try {
    const { id } = req.params;
    const { specs = {}, releaseYear, manufacturer, type } = req.body;
    const currentLaptop = await Laptop.findById(id);
    if (!currentLaptop) return res.status(404).json({ message: 'Laptop không tồn tại.' });
    const cleanedSpecs = { processor: specs.processor ?? currentLaptop.specs.processor, ram: specs.ram ?? currentLaptop.specs.ram, storage: specs.storage ?? currentLaptop.specs.storage, display: specs.display ?? currentLaptop.specs.display };
    const updates = { specs: cleanedSpecs, releaseYear: releaseYear ?? currentLaptop.releaseYear, manufacturer: manufacturer ?? currentLaptop.manufacturer, type: type ?? currentLaptop.type };
    const updatedLaptop = await Laptop.findByIdAndUpdate(id, updates, { new: true });
    if (!updatedLaptop) return res.status(404).json({ message: 'Không thể cập nhật laptop.' });
    res.status(200).json(updatedLaptop);
  } catch (error) {
    console.error('Lỗi khi cập nhật specs:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.fixOldData = async (req, res) => {
  try {
    const allLaptops = await Laptop.find().populate('assigned').populate('assignmentHistory.user');
    let updatedCount = 0;
    for (const laptop of allLaptops) {
      let needSave = false;
      if (laptop.assigned && laptop.assigned.length > 0) {
        const lastUser = laptop.assigned[laptop.assigned.length - 1];
        let openRecord = laptop.assignmentHistory.find((h) => !h.endDate && h.user?.toString() === lastUser._id.toString());
        if (!openRecord) {
          laptop.assignmentHistory.forEach((h) => { if (!h.endDate) h.endDate = new Date(); });
          openRecord = { user: lastUser._id, userName: lastUser.fullname, startDate: new Date(), document: '' };
          laptop.assignmentHistory.push(openRecord); needSave = true;
        }
        if (!openRecord.document) { if (laptop.status !== 'PendingDocumentation') { laptop.status = 'PendingDocumentation'; needSave = true; } }
        else { if (laptop.status !== 'Active') { laptop.status = 'Active'; needSave = true; } }
        if (!laptop.currentHolder || laptop.currentHolder.id?.toString() !== lastUser._id.toString()) {
          laptop.currentHolder = { id: lastUser._id, fullname: lastUser.fullname || 'Không xác định', jobTitle: lastUser.jobTitle || '', department: lastUser.department || '', avatarUrl: lastUser.avatarUrl || '' };
          needSave = true;
        }
      } else {
        const openRecords = laptop.assignmentHistory.filter((h) => !h.endDate);
        if (openRecords.length > 0) { for (let record of openRecords) { record.endDate = new Date(); } needSave = true; }
        if (laptop.status !== 'Standby') { laptop.status = 'Standby'; needSave = true; }
        if (laptop.currentHolder) { laptop.currentHolder = null; needSave = true; }
      }
      if (needSave) { await laptop.save(); updatedCount++; }
    }
    res.json({ message: 'Hoàn thành chuẩn hoá dữ liệu cũ.', totalLaptops: allLaptops.length, updatedCount });
  } catch (error) {
    console.error('Lỗi fixOldData:', error);
    res.status(500).json({ message: 'Đã xảy ra lỗi khi chuẩn hoá.', error });
  }
};

// Get laptop statistics
exports.getLaptopStatistics = async (req, res) => {
  try {
    const Laptop = require('../../models/Laptop');

    // Count laptops by status
    const total = await Laptop.countDocuments();
    const active = await Laptop.countDocuments({ status: 'Active' });
    const standby = await Laptop.countDocuments({ status: 'Standby' });
    const broken = await Laptop.countDocuments({ status: 'Broken' });

    res.json({
      total,
      active,
      standby,
      broken
    });
  } catch (error) {
    console.error('Lỗi getLaptopStatistics:', error);
    res.status(500).json({ message: 'Đã xảy ra lỗi khi lấy thống kê laptop.', error });
  }
};