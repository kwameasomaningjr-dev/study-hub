const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Ensure local uploads directory exists
const localUploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(localUploadsDir)) {
  fs.mkdirSync(localUploadsDir, { recursive: true });
}

// Check if AWS S3 config is provided (either via environment variables or implicit IAM Role on EC2)
const isS3Configured = !!process.env.AWS_BUCKET_NAME;

let s3Client = null;
if (isS3Configured) {
  const s3Config = {
    region: process.env.AWS_REGION || 'us-east-1'
  };

  // If credentials are explicitly provided (e.g. for local development), use them
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    s3Config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    };
  }

  s3Client = new S3Client(s3Config);
  console.log('AWS S3 upload service configured successfully.');
} else {
  console.log('AWS S3 not configured. Falling back to local storage.');
}

// Setup Multer storage
// For S3 we keep file in memory buffer, for local we save to disk
const storage = isS3Configured 
  ? multer.memoryStorage() 
  : multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, localUploadsDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
      }
    });

const upload = multer({ storage });

// Helper function to handle upload execution and return file details
async function handleFileUpload(file) {
  if (!file) return null;

  if (isS3Configured && s3Client) {
    const key = `uploads/${Date.now()}-${file.originalname}`;
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read' // Enable public URL viewing, change if bucket has other policies
    });

    await s3Client.send(command);
    
    // AWS S3 URL format
    const fileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
    return {
      filename: file.originalname,
      fileUrl: fileUrl,
      fileType: file.mimetype
    };
  } else {
    // Local storage details
    const fileUrl = `/uploads/${file.filename}`;
    return {
      filename: file.originalname,
      fileUrl: fileUrl,
      fileType: file.mimetype
    };
  }
}

module.exports = {
  upload,
  handleFileUpload,
  isS3Configured
};
