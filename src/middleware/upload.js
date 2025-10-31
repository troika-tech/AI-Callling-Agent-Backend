const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cfg = require('../config');

// Ensure upload directory exists
const uploadPath = path.resolve(cfg.fileUpload.uploadPath);
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Security: Sanitize campaign ID to prevent path traversal
    let destPath = uploadPath;

    if (req.body.campaign_id || req.params.campaignId) {
      const campaignId = (req.body.campaign_id || req.params.campaignId)
        .toString()
        .replace(/[^a-zA-Z0-9_-]/g, '') // Remove dangerous path characters
        .substring(0, 50); // Limit length
      
      if (campaignId) {
        destPath = path.join(uploadPath, 'campaigns', campaignId);
        // Ensure path is within upload directory (prevent path traversal)
        const resolvedPath = path.resolve(destPath);
        const resolvedUploadPath = path.resolve(uploadPath);
        if (!resolvedPath.startsWith(resolvedUploadPath)) {
          cb(new Error('Invalid upload path'), null);
          return;
        }

        if (!fs.existsSync(destPath)) {
          fs.mkdirSync(destPath, { recursive: true });
        }
      }
    }

    cb(null, destPath);
  },
  filename: function (req, file, cb) {
    // Security: Sanitize filename to prevent path traversal attacks
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Remove dangerous characters
      .substring(0, 100); // Limit length
    // Generate unique filename: timestamp-random-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, basename + '-' + uniqueSuffix + ext);
  }
});

// File filter
const fileFilter = function (req, file, cb) {
  // Allowed file types
  const allowedMimeTypes = {
    csv: ['text/csv', 'application/csv', 'text/plain'],
    documents: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ]
  };

  // Check if it's CSV upload (for target numbers)
  if (file.fieldname === 'target_numbers_csv') {
    if (allowedMimeTypes.csv.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed for target numbers'), false);
    }
  }
  // Check if it's document upload (for knowledge base)
  else if (file.fieldname === 'kb_files' || file.fieldname === 'documents') {
    if (allowedMimeTypes.documents.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX, and TXT files are allowed'), false);
    }
  }
  // Default: allow
  else {
    cb(null, true);
  }
};

// Multer instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: cfg.fileUpload.maxSizeMB * 1024 * 1024 // Convert MB to bytes
  }
});

// Export different upload configurations
module.exports = {
  // Upload single CSV file
  uploadCSV: upload.single('target_numbers_csv'),

  // Upload multiple KB documents (max 10 files)
  uploadKBDocuments: upload.array('kb_files', 10),

  // Upload both CSV and KB documents
  uploadCampaignFiles: upload.fields([
    { name: 'target_numbers_csv', maxCount: 1 },
    { name: 'kb_files', maxCount: 10 }
  ]),

  // Generic file upload
  upload: upload
};
