const Phone = require('../../models/Phone');
const User = require('../../models/User');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const redisService = require('../../services/redisService');
const { ensureFullnameInHistory } = require('../../utils/assignmentHelper');
const { populateBuildingInRoom, ROOM_POPULATE_FIELDS } = require('../../utils/roomHelper');

exports.getPhones = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { search, status, manufacturer, type, releaseYear } = req.query;
    const hasFilters = search || status || manufacturer || type || releaseYear;

    if (!hasFilters) {
      const cachedData = await redisService.getDevicePage('phone', page, limit);
      if (cachedData) {
        return res.status(200).json({
          populatedPhones: cachedData.devices,
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
        { imei1: { $regex: search, $options: 'i' } },
        { imei2: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
      ];
    }
    // Support both single value and comma-separated multiple values
    if (status) {
      const statusValues = status.includes(',') ? status.split(',').map(s => s.trim()) : [status];
      query.status = statusValues.length === 1 ? statusValues[0] : { $in: statusValues };
    }
    if (manufacturer) {
      const manuValues = manufacturer.includes(',') ? manufacturer.split(',').map(m => m.trim()) : [manufacturer];
      if (manuValues.length === 1) {
        query.manufacturer = { $regex: manuValues[0], $options: 'i' };
      } else {
        query.manufacturer = { $in: manuValues.map(m => new RegExp(m, 'i')) };
      }
    }
    if (type) {
      const typeValues = type.includes(',') ? type.split(',').map(t => t.trim()) : [type];
      if (typeValues.length === 1) {
        query.type = { $regex: typeValues[0], $options: 'i' };
      } else {
        query.type = { $in: typeValues.map(t => new RegExp(t, 'i')) };
      }
    }
    if (releaseYear) query.releaseYear = parseInt(releaseYear);

    let phones, totalItems;
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const aggregationPipeline = [
        { $lookup: { from: 'users', localField: 'assigned', foreignField: '_id', as: 'assignedUsers' } },
        { $match: { $or: [
          { name: searchRegex },
          { serial: searchRegex },
          { manufacturer: searchRegex },
          { 'assignedUsers.fullname': searchRegex },
          { imei1: searchRegex },
          { imei2: searchRegex },
          { phoneNumber: searchRegex },
        ] } },
        { $facet: { data: [ { $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit } ], total: [ { $count: 'count' } ] } },
      ];
      const result = await Phone.aggregate(aggregationPipeline);
      phones = result[0]?.data || [];
      totalItems = result[0]?.total[0]?.count || 0;
      const ids = phones.map((p) => p._id);
      const populated = await Phone.find({ _id: { $in: ids } })
        .populate('assigned', 'fullname jobTitle department avatarUrl')
        .populate('room', ROOM_POPULATE_FIELDS)
        .populate('assignmentHistory.user', 'fullname email jobTitle avatarUrl')
        .populate('assignmentHistory.assignedBy', 'fullname email title')
        .populate('assignmentHistory.revokedBy', 'fullname email')
        .lean();
      phones = ensureFullnameInHistory(populated);
    } else {
      totalItems = await Phone.countDocuments(query);
      phones = await Phone.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('assigned', 'fullname jobTitle department avatarUrl')
        .populate('room', ROOM_POPULATE_FIELDS)
        .populate('assignmentHistory.user', 'fullname email jobTitle avatarUrl')
        .populate('assignmentHistory.assignedBy', 'fullname email title')
        .populate('assignmentHistory.revokedBy', 'fullname email')
        .lean();
      phones = ensureFullnameInHistory(phones);
    }

    const populatedPhones = phones.map((p) => ({
      ...p,
      room: p.room ? populateBuildingInRoom(p.room) : null,
    }));

    if (!hasFilters) await redisService.setDevicePage('phone', page, limit, populatedPhones, totalItems, 300);

    const totalPages = Math.ceil(totalItems / limit);
    return res.status(200).json({ populatedPhones, pagination: { currentPage: page, totalPages, totalItems, itemsPerPage: limit, hasNext: page < totalPages, hasPrev: page > 1 } });
  } catch (error) {
    console.error('Error fetching phones:', error.message);
    return res.status(500).json({ message: 'Error fetching phones', error: error.message });
  }
};

exports.getPhoneById = async (req, res) => {
  try {
    const { id } = req.params;
    const phone = await Phone.findById(id)
      .populate('assigned', 'fullname email jobTitle avatarUrl')
      .populate('room', ROOM_POPULATE_FIELDS)
      .populate('assignmentHistory.user', 'fullname email jobTitle avatarUrl')
      .populate('assignmentHistory.assignedBy', 'fullname email jobTitle avatarUrl')
      .populate('assignmentHistory.revokedBy', 'fullname email jobTitle avatarUrl');
    if (!phone) return res.status(404).json({ message: 'Không tìm thấy phone' });

    ensureFullnameInHistory(phone);

    // Transform room data to include building object
    const transformedPhone = {
      ...phone.toObject(),
      room: phone.room ? populateBuildingInRoom(phone.room) : null
    };

    res.status(200).json(transformedPhone);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi máy chủ', error });
  }
};

exports.createPhone = async (req, res) => {
  try {
    const { name, manufacturer, serial, imei1, imei2, phoneNumber, assigned, status, specs, type, room, reason } = req.body;
    if (!name || !serial || !imei1) return res.status(400).json({ message: 'Thiếu thông tin bắt buộc!' });
    if (!specs || typeof specs !== 'object') return res.status(400).json({ message: 'Thông tin specs không hợp lệ!' });
    const existing = await Phone.findOne({ $or: [ { serial }, { imei1 } ] });
    if (existing) return res.status(400).json({ message: `Serial hoặc IMEI1 đã tồn tại trong hệ thống.` });
    if (assigned && !Array.isArray(assigned)) return res.status(400).json({ message: 'Assigned phải là mảng ID người sử dụng hợp lệ.' });
    if (room && !mongoose.Types.ObjectId.isValid(room)) return res.status(400).json({ message: 'Room ID không hợp lệ!' });
    if (status === 'Broken' && !reason) return res.status(400).json({ message: "Lý do báo hỏng là bắt buộc khi trạng thái là 'Broken'!" });
    if (status && !['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(status)) return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    const phone = new Phone({ name, manufacturer, serial, imei1, imei2, phoneNumber, assigned, specs, status, type, room, reason: status === 'Broken' ? reason : undefined });
    await phone.save();
    await redisService.deleteDeviceCache('phone');
    res.status(201).json(phone);
  } catch (error) {
    console.error('Error creating phone:', error.message);
    res.status(500).json({ message: 'Lỗi khi thêm phone', error: error.message });
  }
};

exports.updatePhone = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, manufacturer, serial, imei1, imei2, phoneNumber, assigned, status, releaseYear, specs, type, room, reason } = req.body;

    if (assigned && !Array.isArray(assigned)) {
      return res.status(400).json({ message: 'Assigned phải là mảng ID người sử dụng hợp lệ.' });
    }

    // Handle room: can be MongoDB ObjectId, Frappe room ID (string), or null to unassign
    let resolvedRoomId = room;
    if (room !== undefined) {
      if (room === null) {
        // Explicitly unassign room
        resolvedRoomId = null;
      } else if (!mongoose.Types.ObjectId.isValid(room)) {
        return res.status(400).json({ message: 'Room ID không hợp lệ!' });
      }
    }

    const updatedData = {
      ...(name !== undefined && { name }),
      ...(manufacturer !== undefined && { manufacturer }),
      ...(serial !== undefined && { serial }),
      ...(imei1 !== undefined && { imei1 }),
      ...(imei2 !== undefined && { imei2 }),
      ...(phoneNumber !== undefined && { phoneNumber }),
      ...(assigned !== undefined && { assigned }),
      ...(status && { status }),
      ...(releaseYear !== undefined && { releaseYear }),
      ...(specs !== undefined && { specs }),
      ...(type !== undefined && { type }),
      ...(resolvedRoomId !== undefined && { room: resolvedRoomId }),
      ...(status === 'Broken' && reason && { reason }),
      ...(req.body.assignmentHistory && { assignmentHistory: req.body.assignmentHistory })
    };

    console.log('📝 Updating phone with:', updatedData);
    const updated = await Phone.findByIdAndUpdate(id, updatedData, { new: true });
    if (!updated) return res.status(404).json({ message: 'Không tìm thấy phone' });
    await redisService.deleteDeviceCache('phone');
    res.json(updated);
  } catch (error) {
    console.error('Error updating phone:', error.message);
    res.status(400).json({ message: 'Error updating phone', error: error.message });
  }
};

exports.deletePhone = async (req, res) => {
  try {
    await Phone.findByIdAndDelete(req.params.id);
    await redisService.deleteDeviceCache('phone');
    res.json({ message: 'Phone deleted' });
  } catch (error) {
    res.status(400).json({ message: 'Error deleting phone', error });
  }
};

exports.updatePhoneSpecs = async (req, res) => {
  try {
    const { id } = req.params;
    const { specs = {}, releaseYear, manufacturer, type } = req.body;
    const current = await Phone.findById(id);
    if (!current) return res.status(404).json({ message: 'Phone không tồn tại.' });
    const cleanedSpecs = {
      processor: specs.processor ?? current.specs.processor,
      ram: specs.ram ?? current.specs.ram,
      storage: specs.storage ?? current.specs.storage,
      display: specs.display ?? current.specs.display,
    };
    const updates = { specs: cleanedSpecs, releaseYear: releaseYear ?? current.releaseYear, manufacturer: manufacturer ?? current.manufacturer, type: type ?? current.type };
    const updated = await Phone.findByIdAndUpdate(id, updates, { new: true });
    if (!updated) return res.status(404).json({ message: 'Không thể cập nhật phone.' });
    res.status(200).json(updated);
  } catch (error) {
    console.error('Lỗi khi cập nhật specs:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.assignPhone = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedTo, reason } = req.body;
    const phone = await Phone.findById(id).populate('assigned');
    if (!phone) return res.status(404).json({ message: 'Không tìm thấy phone' });
    phone.assignmentHistory.forEach((e) => { if (!e.endDate) e.endDate = new Date(); });
    const currentUser = req.user;
    if (phone.assigned?.length > 0) {
      const oldUserId = phone.assigned[0]._id;
      const lastHistory = phone.assignmentHistory.find((h) => h.user.toString() === oldUserId.toString() && !h.endDate);
      if (lastHistory) { lastHistory.endDate = new Date(); lastHistory.revokedBy = currentUser?._id || null; }
    }
    // Lookup user by frappeUserId or email (assignedTo could be either from Frappe)
    const newUser = await User.findOne({
      $or: [
        { frappeUserId: assignedTo },
        { email: assignedTo }
      ]
    });
    if (!newUser) return res.status(404).json({ message: 'Không tìm thấy user mới' });
    phone.assignmentHistory.push({ 
      user: newUser._id, 
      fullnameSnapshot: newUser.fullname, // New field: snapshot of fullname
      userName: newUser.fullname, // Keep for backward compatibility
      startDate: new Date(), 
      notes: reason || '', 
      assignedBy: currentUser?.id || null, 
      jobTitle: newUser.jobTitle || 'Không xác định' 
    });
    phone.currentHolder = { id: newUser._id, fullname: newUser.fullname, jobTitle: newUser.jobTitle, department: newUser.department, avatarUrl: newUser.avatarUrl };
    phone.assigned = [newUser._id];
    phone.status = 'PendingDocumentation';
    await phone.save();
    const populated = await phone.populate({ path: 'assignmentHistory.user', select: 'fullname jobTitle avatarUrl' });
    res.status(200).json(populated);
  } catch (error) {
    console.error('Lỗi assignPhone:', error);
    res.status(500).json({ message: 'Lỗi server', error });
  }
};

exports.revokePhone = async (req, res) => {
  try {
    const { id } = req.params;
    const { reasons, status } = req.body;
    const phone = await Phone.findById(id).populate('assigned');
    if (!phone) return res.status(404).json({ message: 'Phone không tồn tại' });
    const currentUser = req.user;
    if (phone.assigned.length > 0) {
      const oldUserId = phone.assigned[0]._id;
      const lastHistory = phone.assignmentHistory.find((hist) => hist.user?.toString() === oldUserId.toString() && !hist.endDate);
      if (lastHistory) {
        lastHistory.endDate = new Date();
        lastHistory.revokedBy = currentUser._id;
        lastHistory.revokedReason = Array.isArray(reasons) ? reasons.filter(r => typeof r === 'string') : [];
      }
    } else {
      phone.assignmentHistory.push({
        revokedBy: currentUser._id,
        revokedReason: Array.isArray(reasons) ? reasons.filter(r => typeof r === 'string') : [],
        endDate: new Date()
      });
    }
    phone.status = status || 'Standby';
    phone.currentHolder = null;
    phone.assigned = [];
    await phone.save();
    res.status(200).json({ message: 'Thu hồi thành công', phone });
  } catch (error) {
    console.error('Lỗi revokePhone:', error);
    res.status(500).json({ message: 'Lỗi server', error });
  }
};

// Bulk upload phones
exports.bulkUploadPhones = async (req, res) => {
  try {
    const { phones } = req.body;
    if (!phones || !Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ message: 'Không có dữ liệu hợp lệ để tải lên!' });
    }
    const errors = [];
    const validPhones = [];
    for (const phone of phones) {
      try {
        phone.room = phone.room && mongoose.Types.ObjectId.isValid(phone.room) ? phone.room : null;
        phone.status = ['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(phone.status)
          ? phone.status : 'Standby';

        if (phone.assigned && Array.isArray(phone.assigned) && phone.assigned.length > 0) {
          const isId = mongoose.Types.ObjectId.isValid(phone.assigned[0]);
          if (isId) {
            const validIds = await User.find({ _id: { $in: phone.assigned } }).select('_id');
            if (validIds.length !== phone.assigned.length) throw new Error('Một số ID người dùng không tồn tại trong hệ thống.');
          } else {
            const assignedIds = await Promise.all(
              phone.assigned.map(async (fullname) => {
                const user = await User.findOne({ fullname: fullname.trim() }).select('_id');
                if (!user) throw new Error(`Người dùng "${fullname}" không tồn tại trong hệ thống.`);
                return user._id;
              })
            );
            phone.assigned = assignedIds;
          }
        }

        if (!phone.name || !phone.serial || !phone.imei1) {
          errors.push({
            serial: phone.serial || 'Không xác định',
            message: 'Thông tin phone không hợp lệ (thiếu tên, serial hoặc IMEI 1).'
          });
          continue;
        }

        const existing = await Phone.findOne({ $or: [{ serial: phone.serial }, { imei1: phone.imei1 }] });
        if (existing) {
          errors.push({
            serial: phone.serial,
            name: phone.name,
            message: `Serial ${phone.serial} hoặc IMEI1 ${phone.imei1} đã tồn tại.`
          });
          continue;
        }

        validPhones.push(phone);
      } catch (err) {
        errors.push({ serial: phone.serial || 'Không xác định', message: err.message || 'Lỗi không xác định khi xử lý phone.' });
      }
    }

    if (validPhones.length > 0) {
      await Phone.insertMany(validPhones);
      await redisService.deleteDeviceCache('phone');
    }

    return res.status(201).json({ message: 'Thêm mới hàng loạt thành công!', addedPhones: validPhones.length, errors });
  } catch (error) {
    console.error('Lỗi khi thêm mới hàng loạt phones:', error.message);
    return res.status(500).json({ message: 'Lỗi khi thêm mới hàng loạt', error: error.message });
  }
};

exports.updatePhoneStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, brokenReason, brokenDescription } = req.body;
    if (!['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(status)) return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    if (status === 'Broken' && !brokenReason) return res.status(400).json({ error: 'Lý do báo hỏng là bắt buộc!' });
    const phone = await Phone.findById(id);
    if (!phone) return res.status(404).json({ message: 'Không tìm thấy thiết bị' });
    if (status === 'Broken') {
      phone.brokenReason = brokenReason || 'Không xác định';
      phone.brokenDescription = brokenDescription || null;
    }
    phone.status = status;
    await phone.save();
    res.status(200).json(phone);
  } catch (error) {
    console.error('Lỗi updatePhoneStatus:', error);
    res.status(500).json({ message: 'Lỗi server', error });
  }
};

const { uploadHandoverReport: uploadHelper, getHandoverReport: getHandoverHelper } = require('../../utils/uploadHelper');

exports.uploadHandoverReport = async (req, res) => {
  return uploadHelper(req, res, Phone, 'phoneId');
};

exports.getHandoverReport = async (req, res) => {
  return getHandoverHelper(req, res);
};

// Get phone filter options
exports.getPhoneFilters = async (req, res) => {
  try {
    // Get distinct statuses
    const statuses = await Phone.distinct('status');

    // Get distinct types
    const types = await Phone.distinct('type');

    // Get distinct manufacturers
    const manufacturers = await Phone.distinct('manufacturer');

    // Get distinct departments from assigned users
    const departmentPipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'assigned',
          foreignField: '_id',
          as: 'assignedUsers'
        }
      },
      { $unwind: '$assignedUsers' },
      { $group: { _id: '$assignedUsers.department' } },
      { $match: { _id: { $ne: null, $exists: true } } }
    ];
    const departmentResults = await Phone.aggregate(departmentPipeline);
    const departments = departmentResults.map(result => result._id).filter(dept => dept);

    // Get year range
    const yearStats = await Phone.aggregate([
      {
        $group: {
          _id: null,
          minYear: { $min: '$releaseYear' },
          maxYear: { $max: '$releaseYear' }
        }
      }
    ]);

    const yearRange = yearStats.length > 0 && yearStats[0].minYear && yearStats[0].maxYear
      ? [yearStats[0].minYear, yearStats[0].maxYear]
      : [2015, 2024];

    res.json({
      statuses: statuses.filter(s => s),
      types: types.filter(t => t),
      manufacturers: manufacturers.filter(m => m),
      departments: departments,
      yearRange
    });
  } catch (error) {
    console.error('Lỗi getPhoneFilters:', error);
    res.status(500).json({ message: 'Đã xảy ra lỗi khi lấy filter options.', error });
  }
};

// Get phone statistics
exports.getPhoneStatistics = async (req, res) => {
  try {
    const Phone = require('../../models/Phone');

    // Count phones by status
    const total = await Phone.countDocuments();
    const active = await Phone.countDocuments({ status: 'Active' });
    const standby = await Phone.countDocuments({ status: 'Standby' });
    const broken = await Phone.countDocuments({ status: 'Broken' });

    res.json({
      total,
      active,
      standby,
      broken
    });
  } catch (error) {
    console.error('Lỗi getPhoneStatistics:', error);
    res.status(500).json({ message: 'Đã xảy ra lỗi khi lấy thống kê phone.', error });
  }
};