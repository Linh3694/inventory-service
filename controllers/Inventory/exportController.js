const ExcelJS = require('exceljs');
const Laptop = require('../../models/Laptop');
const Monitor = require('../../models/Monitor');
const Printer = require('../../models/Printer');
const Projector = require('../../models/Projector');
const Phone = require('../../models/Phone');
const Tool = require('../../models/Tool');
const { ROOM_POPULATE_FIELDS } = require('../../utils/roomHelper');

// Map deviceType -> Model
const modelMap = {
  laptop: Laptop,
  monitor: Monitor,
  printer: Printer,
  projector: Projector,
  phone: Phone,
  tool: Tool,
};

// Nhãn tiếng Việt cho từng deviceType
const deviceTypeLabels = {
  laptop: 'Laptop',
  monitor: 'Màn hình',
  printer: 'Máy in',
  projector: 'Máy chiếu',
  phone: 'Điện thoại',
  tool: 'Công cụ',
};

// Trạng thái tiếng Việt
const statusLabels = {
  Active: 'Đang sử dụng',
  Standby: 'Sẵn sàng bàn giao',
  Broken: 'Hỏng',
  PendingDocumentation: 'Thiếu biên bản',
};

// Cấu hình cột thông số kỹ thuật riêng theo loại thiết bị
const specsColumnsConfig = {
  laptop: [
    { header: 'Processor', key: 'specs_processor', width: 20 },
    { header: 'RAM', key: 'specs_ram', width: 12 },
    { header: 'Ổ cứng', key: 'specs_storage', width: 15 },
    { header: 'Màn hình', key: 'specs_display', width: 15 },
  ],
  monitor: [
    { header: 'RAM', key: 'specs_ram', width: 12 },
    { header: 'Ổ cứng', key: 'specs_storage', width: 15 },
    { header: 'Màn hình', key: 'specs_display', width: 20 },
  ],
  printer: [
    { header: 'Địa chỉ IP', key: 'specs_ip', width: 18 },
    { header: 'RAM', key: 'specs_ram', width: 12 },
    { header: 'Ổ cứng', key: 'specs_storage', width: 15 },
  ],
  projector: [
    { header: 'Processor', key: 'specs_processor', width: 20 },
    { header: 'RAM', key: 'specs_ram', width: 12 },
    { header: 'Ổ cứng', key: 'specs_storage', width: 15 },
    { header: 'Màn hình', key: 'specs_display', width: 15 },
  ],
  phone: [
    { header: 'IMEI 1', key: 'imei1', width: 20 },
    { header: 'IMEI 2', key: 'imei2', width: 20 },
    { header: 'Số điện thoại', key: 'phoneNumber', width: 16 },
    { header: 'Processor', key: 'specs_processor', width: 20 },
    { header: 'RAM', key: 'specs_ram', width: 12 },
    { header: 'Ổ cứng', key: 'specs_storage', width: 15 },
    { header: 'Màn hình', key: 'specs_display', width: 15 },
  ],
  tool: [
    { header: 'Processor', key: 'specs_processor', width: 20 },
    { header: 'RAM', key: 'specs_ram', width: 12 },
    { header: 'Ổ cứng', key: 'specs_storage', width: 15 },
    { header: 'Màn hình', key: 'specs_display', width: 15 },
  ],
};

// Cột chung cho tất cả thiết bị
const baseColumns = [
  { header: 'STT', key: 'stt', width: 6 },
  { header: 'Tên thiết bị', key: 'name', width: 25 },
  { header: 'Loại thiết bị', key: 'type', width: 22 },
  { header: 'Hãng sản xuất', key: 'manufacturer', width: 18 },
  { header: 'Serial', key: 'serial', width: 20 },
  { header: 'Năm sản xuất', key: 'releaseYear', width: 14 },
  { header: 'Trạng thái', key: 'status', width: 22 },
];

const assignedColumns = [
  { header: 'Người sử dụng', key: 'assignedUser', width: 25 },
  { header: 'Chức danh', key: 'assignedJobTitle', width: 25 },
  { header: 'Phòng', key: 'roomName', width: 22 },
];

/**
 * Tạo cấu hình cột đầy đủ cho 1 deviceType
 */
function getColumnsForDevice(deviceType) {
  const specsCols = specsColumnsConfig[deviceType] || [];
  return [...baseColumns, ...specsCols, ...assignedColumns];
}

/**
 * Map 1 device document thành 1 row object
 */
function deviceToRow(device, index, deviceType) {
  const specs = device.specs || {};
  const assignedUser = device.assigned && device.assigned[0];
  const room = device.room;

  const row = {
    stt: index + 1,
    name: device.name || '',
    type: device.type || '',
    manufacturer: device.manufacturer || '',
    serial: device.serial || '',
    releaseYear: device.releaseYear || '',
    status: statusLabels[device.status] || device.status || '',
    assignedUser: assignedUser ? assignedUser.fullname || '' : '',
    assignedJobTitle: assignedUser ? assignedUser.jobTitle || '' : '',
    roomName: room ? (room.room_name || room.name || '') : '',
  };

  // Thông số kỹ thuật
  row.specs_processor = specs.processor || '';
  row.specs_ram = specs.ram || '';
  row.specs_storage = specs.storage || '';
  row.specs_display = specs.display || '';
  row.specs_ip = specs.ip || '';

  // Phone-specific
  if (deviceType === 'phone') {
    row.imei1 = device.imei1 || '';
    row.imei2 = device.imei2 || '';
    row.phoneNumber = device.phoneNumber || '';
  }

  return row;
}

/**
 * Style cho header row
 */
function styleHeaderRow(worksheet) {
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002855' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 30;
}

// ======================== EXPORT ========================

/**
 * Export danh sách thiết bị ra Excel
 * GET /api/inventory/{type}s/export
 * Chỉ export thiết bị có người được bàn giao (assigned)
 */
exports.exportDevices = (deviceType) => async (req, res) => {
  try {
    const Model = modelMap[deviceType];
    if (!Model) {
      return res.status(400).json({ message: `Loại thiết bị không hợp lệ: ${deviceType}` });
    }

    // Query tất cả thiết bị có assigned
    const devices = await Model.find({ assigned: { $exists: true, $ne: [] } })
      .populate('assigned', 'fullname jobTitle department email avatarUrl')
      .populate('room', ROOM_POPULATE_FIELDS)
      .sort({ name: 1 })
      .lean();

    // Đếm tổng thiết bị (bao gồm chưa bàn giao) để thông báo
    const totalCount = await Model.countDocuments();
    const skippedCount = totalCount - devices.length;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Wellspring IT Inventory';
    workbook.created = new Date();

    const label = deviceTypeLabels[deviceType] || deviceType;
    const worksheet = workbook.addWorksheet(`Danh sách ${label}`);

    // Thiết lập cột
    worksheet.columns = getColumnsForDevice(deviceType);

    // Ghi dữ liệu
    devices.forEach((device, index) => {
      worksheet.addRow(deviceToRow(device, index, deviceType));
    });

    styleHeaderRow(worksheet);

    // Thêm border cho tất cả cell có data
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    // Ghi thông tin bổ sung ở cuối
    const infoRowNum = devices.length + 3;
    worksheet.getCell(`A${infoRowNum}`).value = `Tổng thiết bị đã export: ${devices.length}`;
    worksheet.getCell(`A${infoRowNum}`).font = { italic: true, color: { argb: 'FF666666' } };
    if (skippedCount > 0) {
      worksheet.getCell(`A${infoRowNum + 1}`).value = `Số thiết bị chưa bàn giao (bỏ qua): ${skippedCount}`;
      worksheet.getCell(`A${infoRowNum + 1}`).font = { italic: true, color: { argb: 'FFFF6600' } };
    }

    // Gửi file
    const fileName = `thiet-bi-${deviceType}-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('X-Skipped-Count', String(skippedCount));
    res.setHeader('X-Exported-Count', String(devices.length));

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(`Lỗi export ${deviceType}:`, error);
    res.status(500).json({ message: 'Lỗi khi export dữ liệu', error: error.message });
  }
};

// ======================== IMPORT TEMPLATE ========================

/**
 * Tạo file template Excel để import thiết bị
 * GET /api/inventory/{type}s/import-template
 */
exports.getImportTemplate = (deviceType) => async (req, res) => {
  try {
    if (!modelMap[deviceType]) {
      return res.status(400).json({ message: `Loại thiết bị không hợp lệ: ${deviceType}` });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Wellspring IT Inventory';
    workbook.created = new Date();

    const label = deviceTypeLabels[deviceType] || deviceType;

    // ----- Sheet 1: Template nhập liệu -----
    const ws = workbook.addWorksheet(`Nhập ${label}`);
    const columns = getColumnsForDevice(deviceType).filter(c => c.key !== 'stt');
    ws.columns = columns;

    // Thêm 1 dòng mẫu
    const sampleRow = {};
    columns.forEach(col => {
      switch (col.key) {
        case 'name': sampleRow[col.key] = 'Tên thiết bị mẫu'; break;
        case 'type': {
          if (deviceType === 'laptop') sampleRow[col.key] = 'Laptop';
          else if (deviceType === 'printer') sampleRow[col.key] = 'Máy in Màu';
          else if (deviceType === 'projector') sampleRow[col.key] = 'Máy chiếu';
          else sampleRow[col.key] = '';
          break;
        }
        case 'manufacturer': sampleRow[col.key] = 'Dell'; break;
        case 'serial': sampleRow[col.key] = 'SN-XXXXXX'; break;
        case 'releaseYear': sampleRow[col.key] = 2024; break;
        case 'status': sampleRow[col.key] = 'Standby'; break;
        case 'assignedUser': sampleRow[col.key] = 'Nguyễn Văn A'; break;
        default: sampleRow[col.key] = ''; break;
      }
    });
    ws.addRow(sampleRow);

    styleHeaderRow(ws);

    // Data validation cho cột trạng thái
    const statusColIndex = columns.findIndex(c => c.key === 'status') + 1;
    if (statusColIndex > 0) {
      for (let row = 2; row <= 1000; row++) {
        ws.getCell(row, statusColIndex).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"Active,Standby,Broken,PendingDocumentation"'],
          showErrorMessage: true,
          errorTitle: 'Trạng thái không hợp lệ',
          error: 'Vui lòng chọn: Active, Standby, Broken hoặc PendingDocumentation',
        };
      }
    }

    // Data validation cho cột loại thiết bị (nếu có enum)
    const typeColIndex = columns.findIndex(c => c.key === 'type') + 1;
    if (typeColIndex > 0) {
      let typeEnum = null;
      if (deviceType === 'laptop') typeEnum = '"Laptop,Desktop"';
      else if (deviceType === 'printer') typeEnum = '"Máy in Màu,Máy in Đen trắng,Máy Scan,Máy Photocopier,Máy đa chức năng"';
      else if (deviceType === 'projector') typeEnum = '"Máy chiếu,Tivi,Màn hình tương tác"';

      if (typeEnum) {
        for (let row = 2; row <= 1000; row++) {
          ws.getCell(row, typeColIndex).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [typeEnum],
            showErrorMessage: true,
            errorTitle: 'Loại không hợp lệ',
            error: 'Vui lòng chọn từ danh sách',
          };
        }
      }
    }

    // ----- Sheet 2: Hướng dẫn -----
    const guideWs = workbook.addWorksheet('Hướng dẫn');
    guideWs.columns = [
      { header: 'Cột', key: 'col', width: 25 },
      { header: 'Mô tả', key: 'desc', width: 50 },
      { header: 'Bắt buộc', key: 'required', width: 12 },
      { header: 'Ghi chú', key: 'note', width: 40 },
    ];

    const guideData = [
      { col: 'Tên thiết bị', desc: 'Tên đầy đủ của thiết bị', required: 'Có', note: '' },
      { col: 'Loại thiết bị', desc: 'Phân loại chi tiết', required: 'Không', note: getTypeNote(deviceType) },
      { col: 'Hãng sản xuất', desc: 'Tên hãng sản xuất', required: 'Không', note: 'Ví dụ: Dell, HP, Lenovo...' },
      { col: 'Serial', desc: 'Số serial thiết bị', required: 'Có', note: 'Phải là duy nhất, không trùng lặp' },
      { col: 'Năm sản xuất', desc: 'Năm sản xuất thiết bị', required: 'Không', note: 'Số nguyên, ví dụ: 2024' },
      { col: 'Trạng thái', desc: 'Trạng thái thiết bị', required: 'Không', note: 'Active / Standby / Broken / PendingDocumentation. Mặc định: Standby' },
    ];

    // Thêm hướng dẫn cho cột specs theo deviceType
    const specsGuide = getSpecsGuide(deviceType);
    guideData.push(...specsGuide);

    guideData.push(
      { col: 'Người sử dụng', desc: 'Tên đầy đủ người được bàn giao', required: 'Không', note: 'Phải khớp chính xác với tên trong hệ thống' },
      { col: 'Chức danh', desc: 'Chức danh người sử dụng', required: 'Không', note: 'Tự động lấy từ hệ thống nếu tìm thấy user' },
      { col: 'Phòng', desc: 'Tên phòng đặt thiết bị', required: 'Không', note: 'Bỏ trống nếu chưa xác định' },
    );

    guideData.forEach(row => guideWs.addRow(row));
    styleHeaderRow(guideWs);

    // Gửi file
    const fileName = `template-import-${deviceType}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(`Lỗi tạo template ${deviceType}:`, error);
    res.status(500).json({ message: 'Lỗi khi tạo template import', error: error.message });
  }
};

function getTypeNote(deviceType) {
  switch (deviceType) {
    case 'laptop': return 'Laptop hoặc Desktop';
    case 'printer': return 'Máy in Màu / Máy in Đen trắng / Máy Scan / Máy Photocopier / Máy đa chức năng';
    case 'projector': return 'Máy chiếu / Tivi / Màn hình tương tác';
    default: return '';
  }
}

function getSpecsGuide(deviceType) {
  const guides = {
    laptop: [
      { col: 'Processor', desc: 'Bộ xử lý', required: 'Không', note: 'Ví dụ: Intel Core i7-1365U' },
      { col: 'RAM', desc: 'Dung lượng RAM', required: 'Không', note: 'Ví dụ: 16GB DDR5' },
      { col: 'Ổ cứng', desc: 'Dung lượng ổ cứng', required: 'Không', note: 'Ví dụ: 512GB SSD NVMe' },
      { col: 'Màn hình', desc: 'Thông số màn hình', required: 'Không', note: 'Ví dụ: 14" FHD IPS' },
    ],
    monitor: [
      { col: 'RAM', desc: 'RAM (nếu có)', required: 'Không', note: '' },
      { col: 'Ổ cứng', desc: 'Ổ cứng (nếu có)', required: 'Không', note: '' },
      { col: 'Màn hình', desc: 'Kích thước và độ phân giải', required: 'Không', note: 'Ví dụ: 27" 4K IPS' },
    ],
    printer: [
      { col: 'Địa chỉ IP', desc: 'Địa chỉ IP máy in', required: 'Không', note: 'Ví dụ: 192.168.1.100' },
      { col: 'RAM', desc: 'RAM máy in', required: 'Không', note: '' },
      { col: 'Ổ cứng', desc: 'Ổ cứng máy in', required: 'Không', note: '' },
    ],
    projector: [
      { col: 'Processor', desc: 'Bộ xử lý', required: 'Không', note: '' },
      { col: 'RAM', desc: 'RAM', required: 'Không', note: '' },
      { col: 'Ổ cứng', desc: 'Ổ cứng', required: 'Không', note: '' },
      { col: 'Màn hình', desc: 'Thông số hiển thị', required: 'Không', note: 'Ví dụ: 3000 lumens, 1080p' },
    ],
    phone: [
      { col: 'IMEI 1', desc: 'Số IMEI 1', required: 'Có', note: '15 chữ số' },
      { col: 'IMEI 2', desc: 'Số IMEI 2', required: 'Không', note: '' },
      { col: 'Số điện thoại', desc: 'Số điện thoại', required: 'Không', note: '' },
      { col: 'Processor', desc: 'Bộ xử lý', required: 'Không', note: '' },
      { col: 'RAM', desc: 'Dung lượng RAM', required: 'Không', note: '' },
      { col: 'Ổ cứng', desc: 'Dung lượng bộ nhớ', required: 'Không', note: '' },
      { col: 'Màn hình', desc: 'Thông số màn hình', required: 'Không', note: '' },
    ],
    tool: [
      { col: 'Processor', desc: 'Bộ xử lý (nếu có)', required: 'Không', note: '' },
      { col: 'RAM', desc: 'RAM (nếu có)', required: 'Không', note: '' },
      { col: 'Ổ cứng', desc: 'Ổ cứng (nếu có)', required: 'Không', note: '' },
      { col: 'Màn hình', desc: 'Màn hình (nếu có)', required: 'Không', note: '' },
    ],
  };
  return guides[deviceType] || [];
}
