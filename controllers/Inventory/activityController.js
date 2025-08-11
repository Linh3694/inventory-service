const Activity = require('../../models/Activity');

exports.getActivities = async (req, res) => {
  const { entityType, entityId } = req.params;
  try {
    const activities = await Activity.find({ entityType, entityId }).sort({ date: -1 });
    res.status(200).json(activities);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy lịch sử hoạt động', error });
  }
};

exports.addActivity = async (req, res) => {
  const { entityType, entityId, type, description, details, date, updatedBy } = req.body;
  if (!entityType || !entityId) return res.status(400).json({ message: 'entityType và entityId là bắt buộc' });
  if (!type || !['repair', 'update'].includes(type)) return res.status(400).json({ message: 'type phải là repair hoặc update' });
  if (!description || description.trim() === '') return res.status(400).json({ message: 'description là bắt buộc' });
  try {
    const newActivity = new Activity({ entityType, entityId, type, description: description.trim(), details: details ? details.trim() : '', date: date || new Date(), updatedBy: updatedBy || 'Hệ thống' });
    await newActivity.save();
    res.status(201).json(newActivity);
  } catch (error) {
    console.error('Error adding activity:', error);
    res.status(500).json({ message: 'Lỗi khi thêm hoạt động', error: error.message });
  }
};

exports.updateActivity = async (req, res) => {
  const { id } = req.params;
  const { description, details, date } = req.body;
  try {
    const updatedActivity = await Activity.findByIdAndUpdate(id, { description, details, date }, { new: true });
    res.status(200).json(updatedActivity);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi cập nhật hoạt động', error });
  }
};

exports.deleteActivity = async (req, res) => {
  const { id } = req.params;
  try {
    await Activity.findByIdAndDelete(id);
    res.status(200).json({ message: 'Xóa hoạt động thành công' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi xóa hoạt động', error });
  }
};


