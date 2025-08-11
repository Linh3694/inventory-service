const multer = require('multer');
const path = require('path');
const fs = require('fs');
const moment = require('moment');

const uploadPath = path.join(__dirname, '../uploads/Handovers');
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.memoryStorage();
const upload = multer({ storage });

const processFile = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Không có file được tải lên!' });
  }
  const username = req.body.username || 'Unknown';
  const formattedDate = moment().format('YYYY-MM-DD');
  const fileExtension = path.extname(req.file.originalname);
  const newFileName = `BBBG-${username}-${formattedDate}${fileExtension}`;
  const filePath = path.join(uploadPath, newFileName);
  fs.writeFileSync(filePath, req.file.buffer);
  req.file.path = `/uploads/Handovers/${newFileName}`;
  next();
};

module.exports = { upload, processFile };


