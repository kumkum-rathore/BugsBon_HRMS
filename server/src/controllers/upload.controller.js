const { sendSuccess, sendError } = require('../utils/apiResponse');
const { cloudinary, getResourceType } = require('../middleware/upload');
const Document = require('../models/EmployeeDocument');
const Task = require('../models/Task');
const { hasPermission } = require('../utils/permissions');

/**
 * Extract file format from filename (e.g. "report.pdf" -> "pdf").
 * Cloudinary private_download_url requires actual format, NOT 'auto'.
 */
function getFormat(fileName, publicId) {
  const name = String(fileName || publicId || '');
  const ext = name.split('.').pop()?.toLowerCase() || '';
  // Valid-looking extension (letters/digits, max 5 chars) → use it
  return /^[a-z0-9]{1,5}$/.test(ext) && ext !== name ? ext : 'bin';
}

/**
 * Generate a short-lived signed URL for a private Cloudinary asset.
 * resourceType MUST match how it was uploaded (image / video / raw).
 */
function buildSignedUrl(publicId, resourceType = 'raw', format = 'bin', expiresInSeconds = 300) {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const type = ['image', 'video', 'raw'].includes(resourceType) ? resourceType : 'raw';

  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: type,
    type: 'authenticated',
    expires_at: expiresAt,
    attachment: false,
  });
}

/**
 * Resolve + authorize a private file by its storage key ("publicId|resourceType").
 */
async function resolvePrivateFile(req) {
const key = String(req.params[0] || '');
  if (!key) return null;

  const parts = key.split('|');
  const publicId = parts[0];
  const resourceType = parts[1] || 'raw';
  if (!publicId) return null;

  const doc = await Document.findOne({ storageKey: key });
  let allowed = false;
  let fileName = publicId.split('/').pop() || key;

  if (doc) {
    fileName = doc.fileName || fileName;
    const ownerMatch = doc.userId && String(doc.userId) === String(req.user.id);
    const branchMatch =
      req.user.branchId &&
      doc.branchId &&
      String(doc.branchId) === String(req.user.branchId) &&
      (hasPermission(req.user, 'document.view') ||
        hasPermission(req.user, 'document.verify') ||
        (doc.projectId && hasPermission(req.user, 'project.manage')));
    allowed = ownerMatch || branchMatch;
  }

  if (!allowed) {
    const task = await Task.findOne({ 'submissions.files.url': key });
    if (task) {
      const submission = task.submissions.find(item =>
        item.files.some(file => file.url === key)
      );
      allowed =
        req.user.branchId &&
        task.branchId &&
        String(task.branchId) === String(req.user.branchId) &&
        !!submission &&
        (String(submission.submittedBy) === String(req.user.id) ||
          (submission.submittedTo &&
            String(submission.submittedTo) === String(req.user.id)));
    }
  }

  if (!allowed) return null;

  const format = getFormat(fileName, publicId);
  const url = buildSignedUrl(publicId, resourceType, format, 300);

  return { url, fileName, publicId, resourceType, format };
}

/**
 * Handles single ('file') and multiple ('files') uploads.
 * Always returns an ARRAY in `data`.
 */
async function upload(req, res) {
  if (
    !hasPermission(req.user, 'document.upload') &&
    !hasPermission(req.user, 'employee.create') &&
    !hasPermission(req.user, 'task.submit') &&
    !hasPermission(req.user, 'task.assign') &&
    !hasPermission(req.user, 'project.manage')
  )
    return sendError(res, {
      statusCode: 403,
      message: 'You do not have permission to upload files.',
      code: 'FORBIDDEN',
    });

  const files = [];
  if (req.files) {
    if (Array.isArray(req.files)) files.push(...req.files);
    else Object.values(req.files).forEach(list => files.push(...list));
  } else if (req.file) {
    files.push(req.file);
  }

  if (!files.length)
    return sendError(res, {
      statusCode: 400,
      message: 'Choose at least one file to upload.',
      code: 'FILE_REQUIRED',
    });

  const mapped = files.map(file => {
    // 🆕 cloudinary-storage returns `path` = secure_url, `filename` = public_id
    //    fallback: use mimetype to derive correct resource type
    const publicId = file.public_id || file.filename || file.path;
    const resourceType =
      file.resource_type || getResourceType(file.mimetype) || 'raw';
    const storageKey = `${publicId}|${resourceType}`;

    return {
      storageKey,
      publicId,
      resourceType,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      fileUrl: file.secure_url || file.url || file.path,
      downloadEndpoint: `/api/v1/uploads/${encodeURIComponent(storageKey)}`,
      previewEndpoint: `/api/v1/uploads/${encodeURIComponent(storageKey)}/preview`,
    };
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: `${mapped.length} file(s) stored privately on Cloudinary. Save the returned metadata with a document or task submission.`,
    data: mapped,
  });
}

/**
 * Proxy file content through the backend (avoids CORS to Cloudinary).
 */
async function proxyFile(req, res) {
  const file = await resolvePrivateFile(req);
  if (!file)
    return sendError(res, {
      statusCode: 404,
      message: 'File not found or access denied.',
      code: 'FILE_NOT_FOUND',
    });

  try {
    const upstream = await fetch(file.url, { redirect: 'follow' });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.error('Cloudinary upstream error:', upstream.status, errText);
      return sendError(res, {
        statusCode: 502,
        message: `Storage returned ${upstream.status}. Unable to fetch file.`,
        code: 'UPSTREAM_ERROR',
      });
    }

    const contentType =
      upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);

    const isPreview = req.path.endsWith('/preview');
    const disposition = isPreview ? 'inline' : 'attachment';
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(file.fileName)}"`
    );
    res.setHeader('Cache-Control', 'private, max-age=300');

    const arrayBuffer = await upstream.arrayBuffer();
    res.setHeader('Content-Length', String(arrayBuffer.byteLength));
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('proxyFile error:', err);
    return sendError(res, {
      statusCode: 502,
      message: err.message || 'Failed to fetch file from storage.',
      code: 'UPSTREAM_ERROR',
    });
  }
}

async function download(req, res) {
  return proxyFile(req, res);
}

async function preview(req, res) {
  return proxyFile(req, res);
}

module.exports = { upload, download, preview };