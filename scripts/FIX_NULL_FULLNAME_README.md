# Fix Null Fullname in Assignment History

Hướng dẫn fix các thiết bị có `fullname` bị null trong `assignmentHistory`.

## 🔧 Scripts Có Sẵn

### 1. `fixNullFullnameInHistory.js` (Cơ bản)
- Fix `fullname` null bằng cách tìm user từ MongoDB
- Không fetch từ Frappe
- Nhanh nhất

```bash
cd inventory-service
node scripts/fixNullFullnameInHistory.js
```

### 2. `findMissingUsers.js` (Phân tích)
- Tìm và liệt kê tất cả các user bị thiếu hoặc không có fullname
- Giúp xác định vấn đề cần giải quyết
- Output có thể copy-paste để update MongoDB

```bash
node scripts/findMissingUsers.js
```

### 3. `syncUsersFromFrappe.js` (Sync từ Frappe)
- Sync thông tin user từ Frappe backend
- Cập nhật fullname từ Frappe vào MongoDB

**Yêu cầu**: Phải có `FRAPPE_API_TOKEN` trong `config.env`

Sync tất cả users chưa có fullname:
```bash
node scripts/syncUsersFromFrappe.js
```

Sync specific users:
```bash
node scripts/syncUsersFromFrappe.js 6759d48300ed146910c108cd 6759d48300ed146910c109fa
```

### 4. `fixAllNullFullnameComprehensive.js` (Toàn bộ)
- **RECOMMENDED**: Script tốt nhất
- Tự động sync từ Frappe khi cần
- Nếu Frappe không có, sử dụng `userName` từ history làm fallback
- Xử lý tất cả trường hợp

```bash
node scripts/fixAllNullFullnameComprehensive.js
```

## 📊 Quy Trình Khuyến Nghị

### Option 1: Tự động (Recommended)
```bash
# Chạy comprehensive script - tự động sync và fix tất cả
node scripts/fixAllNullFullnameComprehensive.js
```

### Option 2: Chi tiết
```bash
# 1. Phân tích vấn đề
node scripts/findMissingUsers.js

# 2. Sync users từ Frappe nếu cần
node scripts/syncUsersFromFrappe.js

# 3. Fix lại các null fullname
node scripts/fixNullFullnameInHistory.js
```

## ⚙️ Cấu Hình

### Trong `config.env`
```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/inventory_service
# hoặc
MONGODB_HOST=localhost
MONGODB_PORT=27017
MONGODB_DATABASE=inventory_service

# Frappe (optional, cho sync từ Frappe)
FRAPPE_URL=http://localhost:8000
FRAPPE_API_TOKEN=your_token_here
```

## 📋 Dữ Liệu Được Fix

### Các Model Xử Lý
- Monitor
- Laptop
- Phone
- Printer
- Projector
- Tool
- Activity

### Các Trường Fix
- `assignmentHistory[].fullname` - null → tên người dùng

## 🔍 Output Ví Dụ

```
✏️  Fixed: Monitor (68a2f8e79247718bbaf5a7ef) - History 68a2f8f49247718bbaf5a801: Linh Nguyễn Hải
💾 Saved Monitor (68a2f8e79247718bbaf5a7ef)
⚠️  User not found: Monitor (67629cd7d6ac6d4e9abd3fc9) - User ID: 6759d48300ed146910c109fa
📡 Attempting Frappe sync for: user@example.com
✅ Synced from Frappe: Full Name Here
ℹ️  Using fallback name: Tuyết Trần Thị Ánh

📊 FINAL SUMMARY:
   ✅ Total fixed: 45
   ⏭️  Total skipped: 3
   ❌ Total errors: 0
```

## ⚠️ Lưu Ý

1. **Backup Database**: Luôn backup MongoDB trước khi chạy script
2. **FRAPPE_API_TOKEN**: Cần token hợp lệ để sync từ Frappe
3. **Network**: Script cần kết nối MongoDB, Frappe (tuỳ chọn)
4. **Thời gian**: Với 314+ thiết bị, có thể mất vài phút

## 🐛 Troubleshooting

### `Cannot find module 'mongoose'`
```bash
npm install
```

### `FRAPPE_API_TOKEN not configured`
- Thêm token vào `config.env` nếu muốn sync từ Frappe
- Hoặc bỏ qua, script sẽ dùng fallback

### User không sync từ Frappe
- Kiểm tra `FRAPPE_URL` và `FRAPPE_API_TOKEN`
- Kiểm tra email user trong Frappe
- Script sẽ tự động dùng `userName` từ history làm fallback

### MongoDB connection failed
- Kiểm tra MongoDB đang chạy: `brew services list`
- Kiểm tra `MONGODB_URI` trong `config.env`
- Kiểm tra port MongoDB (mặc định 27017)

## 📞 Hỗ Trợ

Nếu có lỗi:
1. Kiểm tra log output
2. Chạy `findMissingUsers.js` để phân tích chi tiết
3. Fix thủ công trong MongoDB nếu cần

---

Last updated: 2025-11-10

