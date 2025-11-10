const Inspect = require('../../models/Inspect');
const path = require('path');

exports.getAllInspections = async (req, res) => {
  try {
    const { deviceId, inspectorId, startDate, endDate } = req.query;
    const filter = {};
    if (deviceId) filter.deviceId = deviceId;
    if (inspectorId) filter.inspectorId = inspectorId;
    if (startDate && endDate) filter.inspectionDate = { $gte: new Date(startDate), $lte: new Date(endDate) };

    const inspections = await Inspect.find(filter);

    // Custom populate for deviceId based on deviceType
    const deviceModels = {
      'laptop': require('../../models/Laptop'),
      'monitor': require('../../models/Monitor'),
      'printer': require('../../models/Printer'),
      'projector': require('../../models/Projector'),
      'tool': require('../../models/Tool'),
      'phone': require('../../models/Phone')
    };

    for (const inspection of inspections) {
      if (inspection.deviceId && inspection.deviceType && deviceModels[inspection.deviceType]) {
        try {
          const device = await deviceModels[inspection.deviceType].findById(inspection.deviceId);
          inspection._doc.deviceId = device;
        } catch (populateError) {
          console.warn(`Failed to populate device for inspection ${inspection._id}:`, populateError.message);
          // Keep original deviceId if populate fails
        }
      }
    }

    res.status(200).json({ data: inspections });
  } catch (error) {
    console.error('Error fetching inspections:', error);
    res.status(500).json({ message: 'Error fetching inspections', error: error.message });
  }
};

exports.getInspectionById = async (req, res) => {
  try {
    const { id } = req.params;
    let inspection = await Inspect.findById(id);
    if (!inspection) return res.status(404).json({ message: 'Inspection not found' });

    // Custom populate for deviceId based on deviceType
    const deviceModels = {
      'laptop': require('../../models/Laptop'),
      'monitor': require('../../models/Monitor'),
      'printer': require('../../models/Printer'),
      'projector': require('../../models/Projector'),
      'tool': require('../../models/Tool'),
      'phone': require('../../models/Phone')
    };

    if (inspection.deviceId && inspection.deviceType && deviceModels[inspection.deviceType]) {
      try {
        const device = await deviceModels[inspection.deviceType].findById(inspection.deviceId);
        inspection._doc.deviceId = device;
      } catch (populateError) {
        console.warn(`Failed to populate device for inspection ${inspection._id}:`, populateError.message);
      }
    }

    res.status(200).json({ data: inspection });
  } catch (error) {
    console.error('Error fetching inspection:', error);
    res.status(500).json({ message: 'Error fetching inspection', error: error.message });
  }
};

exports.createInspection = async (req, res) => {
  try {
    const { deviceId, deviceType, results, passed, recommendations, technicalConclusion, followUpRecommendation, overallAssessment } = req.body;
    const inspectorId = req.user?._id;
    if (!deviceId || !deviceType || !inspectorId) return res.status(400).json({ message: 'Thiếu thông tin bắt buộc.' });
    const newInspection = new Inspect({ deviceId, deviceType, inspectorId, inspectionDate: new Date(), results, overallAssessment: overallAssessment || '', passed: passed || false, recommendations: JSON.stringify(recommendations), technicalConclusion: technicalConclusion || '', followUpRecommendation: followUpRecommendation || '' });
    await newInspection.save();
    res.status(201).json({ message: 'Inspection created successfully', data: newInspection });
  } catch (error) {
    console.error('Error creating inspection:', error);
    res.status(500).json({ message: 'Error creating inspection', error });
  }
};

exports.deleteInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedInspection = await Inspect.findByIdAndDelete(id);
    if (!deletedInspection) return res.status(404).json({ message: 'Inspection not found' });
    res.status(200).json({ message: 'Inspection deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting inspection', error });
  }
};

exports.updateInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    if (typeof updatedData.recommendations === 'object') updatedData.recommendations = JSON.stringify(updatedData.recommendations);
    const updatedInspection = await Inspect.findByIdAndUpdate(id, updatedData, { new: true });
    if (!updatedInspection) return res.status(404).json({ message: 'Inspection not found' });
    res.status(200).json({ message: 'Inspection updated successfully', data: updatedInspection });
  } catch (error) {
    console.error('Error updating inspection:', error);
    res.status(500).json({ message: 'Error updating inspection', error });
  }
};

exports.getLatestInspectionByDeviceId = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const inspection = await Inspect.findOne({ deviceId }).sort({ inspectionDate: -1 }).populate('inspectorId', 'fullname jobTitle email');
    if (!inspection) return res.status(404).json({ message: 'Không tìm thấy dữ liệu kiểm tra' });
    res.status(200).json({ message: 'Dữ liệu kiểm tra', data: { _id: inspection._id, inspectionDate: inspection.inspectionDate, inspectorName: inspection.inspectorId?.fullname || 'Không xác định', results: inspection.results, overallCondition: inspection.results?.['Tổng thể']?.overallCondition || 'Không xác định', overallAssessment: inspection.overallAssessment || '', documentUrl: inspection.report?.filePath || '#', technicalConclusion: inspection.technicalConclusion || '', followUpRecommendation: inspection.followUpRecommendation || '' } });
  } catch (error) {
    console.error('Lỗi khi lấy dữ liệu kiểm tra:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

exports.uploadReport = async (req, res) => {
  try {
    const { inspectId } = req.body;
    if (!inspectId || inspectId === 'undefined') return res.status(400).json({ message: 'Inspect ID không hợp lệ.' });
    const inspectionRecord = await Inspect.findById(inspectId);
    if (!inspectionRecord) return res.status(404).json({ message: 'Không tìm thấy dữ liệu kiểm tra' });
    if (!req.file) return res.status(400).json({ message: 'Không có file được tải lên' });
    inspectionRecord.report = { fileName: req.file.filename, filePath: `/uploads/reports/${req.file.filename}` };
    await inspectionRecord.save();
    res.status(201).json({ message: 'Biên bản đã được lưu thành công', data: inspectionRecord });
  } catch (error) {
    console.error('🚨 Lỗi khi tải lên biên bản:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

exports.downloadReport = async (req, res) => {
  try {
    const { inspectId } = req.params;
    const inspection = await Inspect.findById(inspectId);
    if (!inspection || !inspection.report || !inspection.report.filePath) return res.status(404).json({ message: 'Không tìm thấy biên bản kiểm tra.' });
    const filePath = path.join(__dirname, '..', inspection.report.filePath);
    res.download(filePath, inspection.report.fileName, (err) => { if (err) { console.error('Lỗi khi tải xuống biên bản:', err); res.status(500).json({ message: 'Lỗi khi tải xuống biên bản.' }); } });
  } catch (error) {
    console.error('Lỗi khi tải xuống biên bản:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};


