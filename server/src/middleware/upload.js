const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function getResourceType(mimetype = '') {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  return 'raw';
}

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const resourceType = getResourceType(file.mimetype);
    return {
      folder: 'hrms-private-documents',
      resource_type: resourceType,
      type: 'authenticated',
      format: resourceType === 'raw'
        ? (file.originalname.split('.').pop() || 'bin')
        : undefined,
      public_id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

module.exports = { upload, cloudinary, getResourceType };