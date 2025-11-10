# Fix Linh Nguyễn Hải - fullname = null

## 📋 Vấn đề

User: **Linh Nguyễn Hải**
- Email: `linh.nguyenhai@wellspring.edu.vn`
- User ID: `6759d48300ed146910c108cd`
- Status: `fullname = null` nhưng `fullName = "Linh Nguyễn Hải"`
- Ảnh hưởng: Nhiều thiết bị (Monitor, Laptop, etc.)

## ✅ Giải Pháp

### Option 1: Script Node.js (RECOMMENDED)

```bash
cd /Users/gau/frappe-bench-mac/inventory-service
node scripts/fixSpecificUser.js
```

**Tác dụng:**
- ✅ Update User collection (fullname = null → "Linh Nguyễn Hải")
- ✅ Update tất cả assignment history với fullname = null
- ✅ Update assigned field nếu có
- ✅ Áp dụng lên tất cả models (Monitor, Laptop, Phone, etc.)

### Option 2: MongoDB Shell Command

```bash
cd /Users/gau/frappe-bench-mac/inventory-service
bash scripts/fixLinhNguyenHaiManual.sh
```

**Tác dụng:**
- ✅ Chạy MongoDB commands trực tiếp
- ✅ Chi tiết hơn, có thể xem từng bước

### Option 3: Manual MongoDB

Nếu muốn tự chạy:

```bash
mongosh inventory_service
```

Sau đó copy-paste các command từ script trên.

## 🎯 Kết Quả Dự Kiến

```
✅ User collection: 1 user updated
✅ Monitor assignment history: ~6 entries updated
✅ Laptop assignment history: ~3 entries updated
✅ Phone/Printer/Projector/Tool: ~2 entries updated
✅ Assigned field: ~3 entries updated

Total: ~15 entries updated
```

## 📊 Trước và Sau

### Trước
```json
{
  "_id": "6759d48300ed146910c108cd",
  "email": "linh.nguyenhai@wellspring.edu.vn",
  "fullname": null,
  "fullName": "Linh Nguyễn Hải"
}
```

### Sau
```json
{
  "_id": "6759d48300ed146910c108cd",
  "email": "linh.nguyenhai@wellspring.edu.vn",
  "fullname": "Linh Nguyễn Hải",
  "fullName": "Linh Nguyễn Hải"
}
```

## 🔒 An Toàn

- ✅ Không thay đổi User ID
- ✅ Không tạo user mới
- ✅ Chỉ update `fullname` từ `fullName`
- ✅ Preserve tất cả dữ liệu khác

## 📞 Troubleshooting

### Script không chạy
```bash
npm install
node scripts/fixSpecificUser.js
```

### MongoDB không kết nối
```bash
# Check MongoDB running
brew services list

# Start MongoDB
brew services start mongodb-community
```

### Muốn revert/undo
```bash
# Backup trước khi chạy
mongodump --db inventory_service --out ./backup_before_fix
```

---

**Status**: ✅ Ready to fix
**Created**: 2025-11-10

