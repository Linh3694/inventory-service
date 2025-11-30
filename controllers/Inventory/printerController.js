const Printer = require('../../models/Printer');
const User = require('../../models/User');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const redisService = require('../../services/redisService');
const { ensureFullnameInHistory } = require('../../utils/assignmentHelper');
const { populateBuildingInRoom, ROOM_POPULATE_FIELDS } = require('../../utils/roomHelper');

exports.getPrinters = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { search, status, manufacturer, type, releaseYear } = req.query;
    const hasFilters = search || status || manufacturer || type || releaseYear;
    if (!hasFilters) {
      const cachedData = await redisService.getDevicePage('printer', page, limit);
      if (cachedData) {
        return res.status(200).json({
          populatedPrinters: cachedData.devices,
          pagination: { currentPage: page, totalPages: Math.ceil(cachedData.total / limit), totalItems: cachedData.total, itemsPerPage: limit, hasNext: page < Math.ceil(cachedData.total / limit), hasPrev: page > 1 },
        });
      }
    }
    const query = {};
    if (search) query.$or = [ { name: { $regex: search, $options: 'i' } }, { serial: { $regex: search, $options: 'i' } }, { manufacturer: { $regex: search, $options: 'i' } } ];
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
    let printers, totalItems;
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const aggregationPipeline = [
        { $lookup: { from: 'users', localField: 'assigned', foreignField: '_id', as: 'assignedUsers' } },
        { $match: { $or: [ { name: searchRegex }, { serial: searchRegex }, { manufacturer: searchRegex }, { 'assignedUsers.fullname': searchRegex } ] } },
        { $facet: { data: [ { $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit } ], total: [ { $count: 'count' } ] } },
      ];
      const result = await Printer.aggregate(aggregationPipeline);
      printers = result[0]?.data || [];
      totalItems = result[0]?.total[0]?.count || 0;
      const ids = printers.map((p) => p._id);
      const populated = await Printer.find({ _id: { $in: ids } })
        .populate('assigned', 'fullname jobTitle department avatarUrl')
        .populate('room', ROOM_POPULATE_FIELDS)
        .populate('assignmentHistory.user', 'fullname email jobTitle avatarUrl')
        .populate('assignmentHistory.assignedBy', 'fullname email title')
        .populate('assignmentHistory.revokedBy', 'fullname email')
        .lean();
      printers = ensureFullnameInHistory(populated);
    } else {
      totalItems = await Printer.countDocuments(query);
      printers = await Printer.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('assigned', 'fullname jobTitle department avatarUrl')
        .populate('room', ROOM_POPULATE_FIELDS)
        .populate('assignmentHistory.user', 'fullname email jobTitle avatarUrl')
        .populate('assignmentHistory.assignedBy', 'fullname email title')
        .populate('assignmentHistory.revokedBy', 'fullname email')
        .lean();
      printers = ensureFullnameInHistory(printers);
    }
    const populatedPrinters = printers.map((p) => ({ ...p, room: p.room ? populateBuildingInRoom(p.room) : null }));
    if (!hasFilters) await redisService.setDevicePage('printer', page, limit, populatedPrinters, totalItems, 300);
    const totalPages = Math.ceil(totalItems / limit);
    return res.status(200).json({ populatedPrinters, pagination: { currentPage: page, totalPages, totalItems, itemsPerPage: limit, hasNext: page < totalPages, hasPrev: page > 1 } });
  } catch (error) {
    console.error('Error fetching printers:', error.message);
    return res.status(500).json({ message: 'Error fetching printers', error: error.message });
  }
};

exports.getPrinterById = async (req, res) => {
  try {
    const { id } = req.params;
    const printer = await Printer.findById(id)
      .populate('assigned', 'fullname email jobTitle avatarUrl')
      .populate('room', ROOM_POPULATE_FIELDS)
      .populate('assignmentHistory.user', 'fullname email jobTitle avatarUrl')
      .populate('assignmentHistory.assignedBy', 'fullname email jobTitle avatarUrl')
      .populate('assignmentHistory.revokedBy', 'fullname email jobTitle avatarUrl');
    if (!printer) return res.status(404).json({ message: 'Không tìm thấy printer' });

    ensureFullnameInHistory(printer);

    // Transform room data to include building object
    const transformedPrinter = {
      ...printer.toObject(),
      room: printer.room ? populateBuildingInRoom(printer.room) : null
    };

    res.status(200).json(transformedPrinter);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi máy chủ', error });
  }
};

exports.createPrinter = async (req, res) => {
  try {
    const { name, manufacturer, serial, assigned, status, specs, type, room, reason } = req.body;
    if (!name || !serial) return res.status(400).json({ message: 'Thiếu thông tin bắt buộc!' });
    if (!specs || typeof specs !== 'object') return res.status(400).json({ message: 'Thông tin specs không hợp lệ!' });
    const existing = await Printer.findOne({ serial });
    if (existing) return res.status(400).json({ message: `Serial "${serial}" đã tồn tại trong hệ thống.` });
    if (assigned && !Array.isArray(assigned)) return res.status(400).json({ message: 'Assigned phải là mảng ID người sử dụng hợp lệ.' });
    if (room && !mongoose.Types.ObjectId.isValid(room)) return res.status(400).json({ message: 'Room ID không hợp lệ!' });
    if (status === 'Broken' && !reason) return res.status(400).json({ message: "Lý do báo hỏng là bắt buộc khi trạng thái là 'Broken'!" });
    if (status && !['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(status)) return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    const printer = new Printer({ name, manufacturer, serial, assigned, specs, status, type, room, reason: status === 'Broken' ? reason : undefined });
    await printer.save();
    await redisService.deleteDeviceCache('printer');
    res.status(201).json(printer);
  } catch (error) {
    console.error('Error creating printer:', error.message);
    res.status(500).json({ message: 'Lỗi khi thêm printer', error: error.message });
  }
};

exports.updatePrinter = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, manufacturer, serial, assigned, status, releaseYear, specs, type, room, reason } = req.body;

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
      ...(assigned !== undefined && { assigned }),
      ...(status && { status }),
      ...(releaseYear !== undefined && { releaseYear }),
      ...(specs !== undefined && { specs }),
      ...(type !== undefined && { type }),
      ...(resolvedRoomId !== undefined && { room: resolvedRoomId }),
      ...(status === 'Broken' && reason && { reason }),
      ...(req.body.assignmentHistory && { assignmentHistory: req.body.assignmentHistory })
    };

    console.log('📝 Updating printer with:', updatedData);
    const printer = await Printer.findByIdAndUpdate(id, updatedData, { new: true });
    if (!printer) return res.status(404).json({ message: 'Không tìm thấy printer' });
    await redisService.deleteDeviceCache('printer');
    res.json(printer);
  } catch (error) {
    console.error('Error updating printer:', error.message);
    res.status(400).json({ message: 'Error updating printer', error: error.message });
  }
};

exports.deletePrinter = async (req, res) => {
  try {
    await Printer.findByIdAndDelete(req.params.id);
    await redisService.deleteDeviceCache('printer');
    res.json({ message: 'Printer deleted' });
  } catch (error) {
    res.status(400).json({ message: 'Error deleting printer', error });
  }
};

exports.updatePrinterSpecs = async (req, res) => {
  try {
    const { id } = req.params;
    const { specs = {}, releaseYear, manufacturer, type } = req.body;
    const current = await Printer.findById(id);
    if (!current) return res.status(404).json({ message: 'Printer không tồn tại.' });
    const cleanedSpecs = { ip: specs.ip ?? current.specs.ip, ram: specs.ram ?? current.specs.ram, storage: specs.storage ?? current.specs.storage, display: specs.display ?? current.specs.display };
    const updates = { specs: cleanedSpecs, releaseYear: releaseYear ?? current.releaseYear, manufacturer: manufacturer ?? current.manufacturer, type: type ?? current.type };
    const updated = await Printer.findByIdAndUpdate(id, updates, { new: true });
    if (!updated) return res.status(404).json({ message: 'Không thể cập nhật printer.' });
    res.status(200).json(updated);
  } catch (error) {
    console.error('Lỗi khi cập nhật specs:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.bulkUploadPrinters = async (req, res) => {
  try {
    const { printers } = req.body;
    if (!printers || !Array.isArray(printers) || printers.length === 0) return res.status(400).json({ message: 'Không có dữ liệu hợp lệ để tải lên!' });
    const errors = [];
    const validPrinters = [];
    for (const printer of printers) {
      try {
        printer.room = printer.room && mongoose.Types.ObjectId.isValid(printer.room) ? printer.room : null;
        printer.status = ['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(printer.status) ? printer.status : 'Standby';
        if (printer.assigned && Array.isArray(printer.assigned)) {
          const isId = mongoose.Types.ObjectId.isValid(printer.assigned[0]);
          if (isId) {
            const validIds = await User.find({ _id: { $in: printer.assigned } }).select('_id');
            if (validIds.length !== printer.assigned.length) throw new Error('Một số ID người dùng không tồn tại trong hệ thống.');
          } else {
            const assignedIds = await Promise.all(
              printer.assigned.map(async (fullname) => {
                const user = await User.findOne({ fullname: fullname.trim() }).select('_id');
                if (!user) throw new Error(`Người dùng "${fullname}" không tồn tại trong hệ thống.`);
                return user._id;
              })
            );
            printer.assigned = assignedIds;
          }
        }
        if (printer.room && !mongoose.Types.ObjectId.isValid(printer.room)) throw new Error(`Room ID "${printer.room}" không hợp lệ.`);
        if (!printer.name || !printer.serial) {
          errors.push({ serial: printer.serial || 'Không xác định', message: 'Thông tin printer không hợp lệ (thiếu tên, serial).' });
          continue;
        }
        const existing = await Printer.findOne({ serial: printer.serial });
        if (existing) { errors.push({ serial: printer.serial, name: printer.name, message: `Serial ${printer.serial} đã tồn tại.` }); continue; }
        validPrinters.push(printer);
      } catch (error) {
        errors.push({ serial: printer.serial || 'Không xác định', message: error.message || 'Lỗi không xác định khi xử lý printer.' });
      }
    }
    if (validPrinters.length > 0) await Printer.insertMany(validPrinters);
    res.status(201).json({ message: 'Thêm mới hàng loạt thành công!', addedPrinters: validPrinters.length, errors });
  } catch (error) {
    console.error('Lỗi khi thêm mới hàng loạt:', error.message);
    res.status(500).json({ message: 'Lỗi khi thêm mới hàng loạt', error: error.message });
  }
};

exports.assignPrinter = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedTo, reason } = req.body;
    const printer = await Printer.findById(id).populate('assigned');
    if (!printer) return res.status(404).json({ message: 'Không tìm thấy printer' });
    printer.assignmentHistory.forEach((e) => { if (!e.endDate) e.endDate = new Date(); });
    const currentUser = req.user;
    if (printer.assigned?.length > 0) {
      const oldUserId = printer.assigned[0]._id;
      const lastHistory = printer.assignmentHistory.find((h) => h.user.toString() === oldUserId.toString() && !h.endDate);
      if (lastHistory) { lastHistory.endDate = new Date(); lastHistory.revokedBy = currentUser._id; }
    }
    // Lookup user by frappeUserId or email (assignedTo could be either from Frappe)
    const newUser = await User.findOne({
      $or: [
        { frappeUserId: assignedTo },
        { email: assignedTo }
      ]
    });
    if (!newUser) return res.status(404).json({ message: 'Không tìm thấy user mới' });
    printer.assignmentHistory.push({ 
      user: newUser._id, 
      fullnameSnapshot: newUser.fullname, // New field: snapshot of fullname
      userName: newUser.fullname, // Keep for backward compatibility
      startDate: new Date(), 
      notes: reason || '', 
      assignedBy: currentUser.id, 
      jobTitle: newUser.jobTitle || 'Không xác định' 
    });
    printer.currentHolder = { id: newUser._id, fullname: newUser.fullname, jobTitle: newUser.jobTitle, department: newUser.department, avatarUrl: newUser.avatarUrl };
    printer.assigned = [newUser._id];
    printer.status = 'PendingDocumentation';
    await printer.save();
    const populated = await printer.populate({ path: 'assignmentHistory.user', select: 'fullname jobTitle avatarUrl' });
    res.status(200).json(populated);
  } catch (error) {
    console.error('Lỗi assignPrinter:', error);
    res.status(500).json({ message: 'Lỗi server', error });
  }
};

exports.revokePrinter = async (req, res) => {
  try {
    const { id } = req.params;
    const { reasons, status } = req.body;
    const printer = await Printer.findById(id).populate('assigned');
    if (!printer) return res.status(404).json({ message: 'Printer không tồn tại' });
    const currentUser = req.user;
    if (printer.assigned.length > 0) {
      const oldUserId = printer.assigned[0]._id;
      const lastHistory = printer.assignmentHistory.find((hist) => hist.user?.toString() === oldUserId.toString() && !hist.endDate);
      if (lastHistory) {
        lastHistory.endDate = new Date();
        lastHistory.revokedBy = currentUser._id;
        lastHistory.revokedReason = Array.isArray(reasons) ? reasons.filter(r => typeof r === 'string') : [];
      }
    } else {
      printer.assignmentHistory.push({
        revokedBy: currentUser._id,
        revokedReason: Array.isArray(reasons) ? reasons.filter(r => typeof r === 'string') : [],
        endDate: new Date()
      });
    }
    printer.status = status || 'Standby';
    printer.currentHolder = null;
    printer.assigned = [];
    await printer.save();
    res.status(200).json({ message: 'Thu hồi thành công', printer });
  } catch (error) {
    console.error('Lỗi revokePrinter:', error);
    res.status(500).json({ message: 'Lỗi server', error });
  }
};

exports.updatePrinterStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, brokenReason, brokenDescription } = req.body;
    if (!['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(status)) return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    if (status === 'Broken' && !brokenReason) return res.status(400).json({ error: 'Lý do báo hỏng là bắt buộc!' });
    const printer = await Printer.findById(id);
    if (!printer) return res.status(404).json({ message: 'Không tìm thấy thiết bị' });
    if (status === 'Broken') {
      printer.brokenReason = brokenReason || 'Không xác định';
      printer.brokenDescription = brokenDescription || null;
    }
    printer.status = status;
    await printer.save();
    res.status(200).json(printer);
  } catch (error) {
    console.error('Lỗi updatePrinterStatus:', error);
    res.status(500).json({ message: 'Lỗi server', error });
  }
};

const { uploadHandoverReport: uploadHelper, getHandoverReport: getHandoverHelper } = require('../../utils/uploadHelper');

exports.uploadHandoverReport = async (req, res) => {
  return uploadHelper(req, res, Printer, 'printerId');
};

exports.getHandoverReport = async (req, res) => {
  return getHandoverHelper(req, res);
};

// Get printer filter options
exports.getPrinterFilters = async (req, res) => {
  try {
    // Get distinct statuses
    const statuses = await Printer.distinct('status');

    // Get distinct types
    const types = await Printer.distinct('type');

    // Get distinct manufacturers
    const manufacturers = await Printer.distinct('manufacturer');

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
    const departmentResults = await Printer.aggregate(departmentPipeline);
    const departments = departmentResults.map(result => result._id).filter(dept => dept);

    // Get year range
    const yearStats = await Printer.aggregate([
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
    console.error('Lỗi getPrinterFilters:', error);
    res.status(500).json({ message: 'Đã xảy ra lỗi khi lấy filter options.', error });
  }
};

// Get printer statistics
exports.getPrinterStatistics = async (req, res) => {
  try {
    const Printer = require('../../models/Printer');

    // Count printers by status
    const total = await Printer.countDocuments();
    const active = await Printer.countDocuments({ status: 'Active' });
    const standby = await Printer.countDocuments({ status: 'Standby' });
    const broken = await Printer.countDocuments({ status: 'Broken' });

    res.json({
      total,
      active,
      standby,
      broken
    });
  } catch (error) {
    console.error('Lỗi getPrinterStatistics:', error);
    res.status(500).json({ message: 'Đã xảy ra lỗi khi lấy thống kê printer.', error });
  }
};