const Tool = require('../../models/Tool');
const User = require('../../models/User');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

exports.getTools = async (req, res) => {
  try {
    const { search, status, manufacturer, type, releaseYear } = req.query;
    const query = {};
    if (search) {
      query.$or = [ { name: { $regex: search, $options: 'i' } }, { serial: { $regex: search, $options: 'i' } }, { manufacturer: { $regex: search, $options: 'i' } } ];
    }
    if (status) query.status = status;
    if (manufacturer) query.manufacturer = { $regex: manufacturer, $options: 'i' };
    if (type) query.type = { $regex: type, $options: 'i' };
    if (releaseYear) query.releaseYear = parseInt(releaseYear);
    let tools;
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const aggregationPipeline = [
        { $lookup: { from: 'users', localField: 'assigned', foreignField: '_id', as: 'assignedUsers' } },
        { $match: { $or: [ { name: searchRegex }, { serial: searchRegex }, { manufacturer: searchRegex }, { 'assignedUsers.fullname': searchRegex } ] } },
        { $sort: { createdAt: -1 } },
      ];
      tools = await Tool.aggregate(aggregationPipeline);
      const toolIds = tools.map((t) => t._id);
      const populated = await Tool.find({ _id: { $in: toolIds } })
        .populate('assigned', 'fullname jobTitle department avatarUrl')
        .populate('room', 'name location status')
        .populate('assignmentHistory.user', 'fullname email jobTitle avatarUrl')
        .populate('assignmentHistory.assignedBy', 'fullname email title')
        .populate('assignmentHistory.revokedBy', 'fullname email')
        .lean();
      tools = populated;
    } else {
      tools = await Tool.find(query)
        .sort({ createdAt: -1 })
        .populate('assigned', 'fullname jobTitle department avatarUrl')
        .populate('room', 'name location status')
        .populate('assignmentHistory.user', 'fullname email jobTitle avatarUrl')
        .populate('assignmentHistory.assignedBy', 'fullname email title')
        .populate('assignmentHistory.revokedBy', 'fullname email')
        .lean();
    }
    const populatedTools = tools.map((t) => ({ ...t, room: t.room ? { ...t.room, location: t.room.location?.map((loc) => `${loc.building}, tầng ${loc.floor}`) || ['Không xác định'] } : { name: 'Không xác định', location: ['Không xác định'] } }));
    return res.status(200).json({ populatedTools });
  } catch (error) {
    console.error('Error fetching tools:', error.message);
    return res.status(500).json({ message: 'Error fetching tools', error: error.message });
  }
};

exports.createTool = async (req, res) => {
  try {
    const { name, manufacturer, serial, assigned, status, specs, type, room, reason } = req.body;
    if (!name || !serial) return res.status(400).json({ message: 'Thiếu thông tin bắt buộc (name, serial)!' });
    if (!specs || typeof specs !== 'object') return res.status(400).json({ message: 'Thông tin specs không hợp lệ!' });
    const existing = await Tool.findOne({ serial });
    if (existing) return res.status(400).json({ message: `Serial "${serial}" đã tồn tại trong hệ thống.` });
    if (assigned && !Array.isArray(assigned)) return res.status(400).json({ message: 'Assigned phải là mảng ID người sử dụng hợp lệ.' });
    if (room && !mongoose.Types.ObjectId.isValid(room)) return res.status(400).json({ message: 'Room ID không hợp lệ!' });
    if (status === 'Broken' && !reason) return res.status(400).json({ message: "Lý do báo hỏng là bắt buộc khi trạng thái là 'Broken'!" });
    let validStatus = status;
    if (!['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(status)) validStatus = 'Standby';
    if (assigned && assigned.length > 0 && validStatus === 'Standby') validStatus = 'PendingDocumentation';
    const tool = new Tool({ name, manufacturer, serial, assigned, specs, type, room, reason: validStatus === 'Broken' ? reason : undefined, status: validStatus });
    await tool.save();
    res.status(201).json(tool);
  } catch (error) {
    console.error('Error creating tool:', error.message);
    res.status(500).json({ message: 'Lỗi khi thêm tool', error: error.message });
  }
};

exports.updateTool = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, manufacturer, serial, assigned, status, releaseYear, specs, type, room, reason } = req.body;
    if (assigned && !Array.isArray(assigned)) return res.status(400).json({ message: 'Assigned phải là mảng ID người sử dụng hợp lệ.' });
    if (room && !mongoose.Types.ObjectId.isValid(room)) return res.status(400).json({ message: 'Room ID không hợp lệ!' });
    let validStatus = status;
    if (!['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(status)) {
      const oldTool = await Tool.findById(id).lean();
      if (!oldTool) return res.status(404).json({ message: 'Không tìm thấy tool.' });
      validStatus = oldTool.status;
    }
    if (validStatus === 'Broken' && !reason) return res.status(400).json({ message: "Lý do báo hỏng là bắt buộc khi trạng thái là 'Broken'!" });
    if (assigned && assigned.length > 0 && validStatus === 'Standby') validStatus = 'PendingDocumentation';
    const updatedData = { name, manufacturer, serial, assigned, status: validStatus, releaseYear, specs, type, room, reason: validStatus === 'Broken' ? reason : undefined, assignmentHistory: req.body.assignmentHistory };
    const tool = await Tool.findByIdAndUpdate(id, updatedData, { new: true });
    if (!tool) return res.status(404).json({ message: 'Không tìm thấy tool' });
    res.json(tool);
  } catch (error) {
    console.error('Error updating tool:', error.message);
    res.status(400).json({ message: 'Error updating tool', error: error.message });
  }
};

exports.deleteTool = async (req, res) => {
  try {
    await Tool.findByIdAndDelete(req.params.id);
    res.json({ message: 'Tool deleted' });
  } catch (error) {
    res.status(400).json({ message: 'Error deleting tool', error });
  }
};

exports.bulkUploadTools = async (req, res) => {
  try {
    const { tools } = req.body;
    if (!tools || !Array.isArray(tools) || tools.length === 0) return res.status(400).json({ message: 'Không có dữ liệu hợp lệ để tải lên!' });
    const errors = [];
    const validTools = [];
    for (const tool of tools) {
      try {
        tool.room = tool.room && mongoose.Types.ObjectId.isValid(tool.room) ? tool.room : null;
        if (!['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(tool.status)) tool.status = 'Standby';
        if (tool.assigned && Array.isArray(tool.assigned)) {
          const isId = mongoose.Types.ObjectId.isValid(tool.assigned[0]);
          if (isId) {
            const validIds = await User.find({ _id: { $in: tool.assigned } }).select('_id');
            if (validIds.length !== tool.assigned.length) throw new Error('Một số ID người dùng không tồn tại trong hệ thống.');
          } else {
            const assignedIds = await Promise.all(tool.assigned.map(async (fullname) => {
              const user = await User.findOne({ fullname: fullname.trim() }).select('_id');
              if (!user) throw new Error(`Người dùng "${fullname}" không tồn tại trong hệ thống.`);
              return user._id;
            }));
            tool.assigned = assignedIds;
          }
        }
        if (tool.assigned && tool.assigned.length > 0 && tool.status === 'Standby') tool.status = 'PendingDocumentation';
        if (tool.room && !mongoose.Types.ObjectId.isValid(tool.room)) throw new Error(`Room ID "${tool.room}" không hợp lệ.`);
        if (!tool.name || !tool.serial) { errors.push({ serial: tool.serial || 'Không xác định', message: 'Thông tin tool không hợp lệ (thiếu tên, serial).' }); continue; }
        const existing = await Tool.findOne({ serial: tool.serial });
        if (existing) { errors.push({ serial: tool.serial, name: tool.name, message: `Serial ${tool.serial} đã tồn tại.` }); continue; }
        validTools.push(tool);
      } catch (error) {
        errors.push({ serial: tool.serial || 'Không xác định', message: error.message || 'Lỗi không xác định khi xử lý tool.' });
      }
    }
    if (validTools.length > 0) await Tool.insertMany(validTools);
    res.status(201).json({ message: 'Thêm mới hàng loạt thành công!', addedTools: validTools.length, errors });
  } catch (error) {
    console.error('Lỗi khi thêm mới hàng loạt:', error.message);
    res.status(500).json({ message: 'Lỗi khi thêm mới hàng loạt', error: error.message });
  }
};

exports.assignTool = async (req, res) => {
  try {
    const { id } = req.params;
    const { newUserId, notes } = req.body;
    const tool = await Tool.findById(id).populate('assigned');
    if (!tool) return res.status(404).json({ message: 'Không tìm thấy tool' });
    tool.assignmentHistory.forEach((e) => { if (!e.endDate) e.endDate = new Date(); });
    const currentUser = req.user;
    if (tool.assigned?.length > 0) {
      const oldUserId = tool.assigned[0]._id;
      const lastHistory = tool.assignmentHistory.find((h) => h.user.toString() === oldUserId.toString() && !h.endDate);
      if (lastHistory) { lastHistory.endDate = new Date(); lastHistory.revokedBy = currentUser?._id || null; }
    }
    const newUser = await User.findById(newUserId);
    if (!newUser) return res.status(404).json({ message: 'Không tìm thấy user mới' });
    tool.assignmentHistory.push({ user: newUser._id, userName: newUser.fullname, startDate: new Date(), notes: notes || '', assignedBy: currentUser?.id || null, jobTitle: newUser.jobTitle || 'Không xác định' });
    tool.currentHolder = { id: newUser._id, fullname: newUser.fullname, jobTitle: newUser.jobTitle, department: newUser.department, avatarUrl: newUser.avatarUrl };
    tool.assigned = [newUser._id];
    tool.status = 'PendingDocumentation';
    await tool.save();
    const populated = await tool.populate({ path: 'assignmentHistory.user', select: 'fullname jobTitle avatarUrl department' });
    res.status(200).json(populated);
  } catch (error) {
    console.error('Lỗi assignTool:', error);
    res.status(500).json({ message: 'Lỗi server', error });
  }
};

exports.revokeTool = async (req, res) => {
  try {
    const { id } = req.params;
    const { reasons, status } = req.body;
    const tool = await Tool.findById(id).populate('assigned');
    if (!tool) return res.status(404).json({ message: 'Tool không tồn tại' });
    const currentUser = req.user;
    if (tool.assigned.length > 0) {
      const oldUserId = tool.assigned[0]._id;
      const lastHistory = tool.assignmentHistory.find((hist) => hist.user?.toString() === oldUserId.toString() && !hist.endDate);
      if (lastHistory) {
        lastHistory.endDate = new Date();
        lastHistory.revokedBy = currentUser._id;
        lastHistory.revokedReason = Array.isArray(reasons) ? reasons.filter(r => typeof r === 'string') : [];
      }
    } else {
      tool.assignmentHistory.push({
        revokedBy: currentUser._id,
        revokedReason: Array.isArray(reasons) ? reasons.filter(r => typeof r === 'string') : [],
        endDate: new Date()
      });
    }
    tool.status = status || 'Standby';
    tool.currentHolder = null;
    tool.assigned = [];
    await tool.save();
    res.status(200).json({ message: 'Thu hồi thành công', tool });
  } catch (error) {
    console.error('Lỗi revokeTool:', error);
    res.status(500).json({ message: 'Lỗi server', error });
  }
};

exports.updateToolStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, brokenReason, brokenDescription } = req.body;
    if (!['Active', 'Standby', 'Broken', 'PendingDocumentation'].includes(status)) return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    if (status === 'Broken' && !brokenReason) return res.status(400).json({ error: 'Lý do báo hỏng là bắt buộc!' });
    const tool = await Tool.findById(id);
    if (!tool) return res.status(404).json({ message: 'Không tìm thấy thiết bị' });
    if (status === 'Broken') {
      tool.brokenReason = brokenReason || 'Không xác định';
      tool.brokenDescription = brokenDescription || null;
    }
    tool.status = status;
    await tool.save();
    res.status(200).json(tool);
  } catch (error) {
    console.error('Lỗi updateToolStatus:', error);
    res.status(500).json({ message: 'Lỗi server', error });
  }
};

exports.searchTools = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.trim() === '') return res.status(400).json({ message: 'Từ khóa tìm kiếm không hợp lệ!' });
    const searchQuery = { $or: [ { name: { $regex: query, $options: 'i' } }, { serial: { $regex: query, $options: 'i' } }, { 'assigned.fullname': { $regex: query, $options: 'i' } } ] };
    const tools = await Tool.find(searchQuery).populate('assigned', 'fullname jobTitle department avatarUrl').populate('room', 'name location status').lean();
    res.status(200).json(tools);
  } catch (error) {
    console.error('Error during search:', error.message);
    res.status(500).json({ message: 'Lỗi khi tìm kiếm tools', error: error.message });
  }
};

const { uploadHandoverReport: uploadHelper, getHandoverReport: getHandoverHelper } = require('../../utils/uploadHelper');

exports.uploadHandoverReport = async (req, res) => {
  return uploadHelper(req, res, Tool, 'toolId');
};

exports.getHandoverReport = async (req, res) => {
  return getHandoverHelper(req, res);
};

exports.getToolById = async (req, res) => {
  try {
    const { id } = req.params;
    const tool = await Tool.findById(id)
      .populate('assigned', 'fullname email jobTitle avatarUrl department')
      .populate('room', 'name location status')
      .populate('assignmentHistory.user', 'fullname email jobTitle avatarUrl')
      .populate('assignmentHistory.assignedBy', 'fullname email jobTitle avatarUrl')
      .populate('assignmentHistory.revokedBy', 'fullname email jobTitle avatarUrl');
    if (!tool) return res.status(404).json({ message: 'Không tìm thấy tool' });
    res.status(200).json(tool);
  } catch (error) {
    console.error('Lỗi khi lấy thông tin tool:', error);
    res.status(500).json({ message: 'Lỗi máy chủ', error });
  }
};

exports.updateToolSpecs = async (req, res) => {
  try {
    const { id } = req.params;
    const { specs = {}, releaseYear, manufacturer, type } = req.body;
    const current = await Tool.findById(id);
    if (!current) return res.status(404).json({ message: 'Tool không tồn tại.' });
    const cleanedSpecs = { processor: specs.processor ?? current.specs.processor, ram: specs.ram ?? current.specs.ram, storage: specs.storage ?? current.specs.storage, display: specs.display ?? current.specs.display };
    const updates = { specs: cleanedSpecs, releaseYear: releaseYear ?? current.releaseYear, manufacturer: manufacturer ?? current.manufacturer, type: type ?? current.type };
    const updated = await Tool.findByIdAndUpdate(id, updates, { new: true });
    if (!updated) return res.status(404).json({ message: 'Không thể cập nhật tool.' });
    res.status(200).json(updated);
  } catch (error) {
    console.error('Lỗi khi cập nhật specs:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

// Get tool statistics
exports.getToolStatistics = async (req, res) => {
  try {
    const Tool = require('../../models/Tool');

    // Count tools by status
    const total = await Tool.countDocuments();
    const active = await Tool.countDocuments({ status: 'Active' });
    const standby = await Tool.countDocuments({ status: 'Standby' });
    const broken = await Tool.countDocuments({ status: 'Broken' });

    res.json({
      total,
      active,
      standby,
      broken
    });
  } catch (error) {
    console.error('Lỗi getToolStatistics:', error);
    res.status(500).json({ message: 'Đã xảy ra lỗi khi lấy thống kê tool.', error });
  }
};