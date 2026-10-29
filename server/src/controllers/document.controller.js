const Document = require('../models/EmployeeDocument');
const Project = require('../models/Project');
const User = require('../models/User');
const mongoose = require('mongoose');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { hasPermission } = require('../utils/permissions');

async function list(req, res) {
  if (req.user.role === 'SUPER_ADMIN')
    return sendError(res, {
      statusCode: 403,
      message: 'Superadmin manages branches only; employee documents are private.',
      code: 'FORBIDDEN',
    });

  const canViewDocuments =
    hasPermission(req.user, 'document.view') ||
    hasPermission(req.user, 'document.verify');
  const canManageProjects = hasPermission(req.user, 'project.manage');
  const canAccessDocuments =
    canViewDocuments ||
    hasPermission(req.user, 'document.upload') ||
    canManageProjects;

  if (!canAccessDocuments)
    return sendError(res, {
      statusCode: 403,
      message: 'You do not have permission to access documents.',
      code: 'FORBIDDEN',
    });

  const filter = {};
  if (canViewDocuments) {
    filter.branchId = req.user.branchId;
  } else if (canManageProjects) {
    filter.branchId = req.user.branchId;
    filter.projectId = { $ne: null };
  } else {
    filter.userId = req.user.id;
    filter.projectId = null;
  }

  // 🆕 Tab filter: employee vs project
  if (req.query.scope === 'employee') {
    filter.projectId = null;
  } else if (req.query.scope === 'project') {
    if (!canManageProjects && !canViewDocuments)
      return sendError(res, {
        statusCode: 403,
        message: 'You cannot view project documents.',
        code: 'FORBIDDEN',
      });
    filter.projectId = { $ne: null };
  }

  if (req.query.projectId) {
    if (!canManageProjects)
      return sendError(res, {
        statusCode: 403,
        message: 'You cannot view project documents.',
        code: 'FORBIDDEN',
      });
    if (!mongoose.isValidObjectId(req.query.projectId))
      return sendError(res, {
        statusCode: 400,
        message: 'Select a valid project.',
        code: 'INVALID_PROJECT',
      });
    filter.projectId = req.query.projectId;
  }

  if (req.query.userId && req.user.role !== 'EMPLOYEE' && canViewDocuments) {
    if (!mongoose.isValidObjectId(req.query.userId))
      return sendError(res, {
        statusCode: 400,
        message: 'Select a valid employee.',
        code: 'INVALID_EMPLOYEE',
      });
    filter.userId = req.query.userId;
  }

  // 🆕 Search: title / fileName / employee name
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const q = req.query.search.trim().slice(0, 100);

    // Employee name ke liye pehle matching users dhundo
    const matchingUsers = await User.find({
      branchId: req.user.branchId,
      status: 'ACTIVE',
      isDelete: { $ne: true },
      $or: [
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { employeeCode: { $regex: q, $options: 'i' } },
      ],
    })
      .select('_id')
      .limit(50)
      .lean();

    const userIds = matchingUsers.map(u => u._id);

    filter.$or = [
      { title: { $regex: q, $options: 'i' } },
      { fileName: { $regex: q, $options: 'i' } },
      ...(userIds.length ? [{ userId: { $in: userIds } }] : []),
    ];
  }

  const activeUserIds = await User.find({ branchId: req.user.branchId, isDelete: { $ne: true }, status: 'ACTIVE' }).distinct('_id');
  filter.$and = [...(filter.$and || []), { $or: [{ projectId: { $ne: null } }, { userId: { $in: activeUserIds } }] }];

  const rows = await Document.find(filter)
    .populate('userId', 'firstName lastName employeeCode')
    .populate('projectId', 'name')
    .populate('reviewedBy', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return sendSuccess(res, { message: 'Documents loaded.', data: rows });
}

async function create(req, res) {
  const body = req.body || {};
  const items = Array.isArray(body.documents) ? body.documents : [body];

  if (!items.length)
    return sendError(res, {
      statusCode: 400,
      message: 'No document metadata received.',
      code: 'VALIDATION_ERROR',
    });

  const first = items[0];
  const isProjectDocument = Boolean(first.projectId);
  const onboardingUpload =
    hasPermission(req.user, 'employee.create') && req.user.role !== 'SUPER_ADMIN';
  const authorized = isProjectDocument
    ? hasPermission(req.user, 'project.manage')
    : hasPermission(req.user, 'document.upload') || onboardingUpload;

  if (!authorized)
    return sendError(res, {
      statusCode: 403,
      message: 'You do not have permission to upload this document.',
      code: 'FORBIDDEN',
    });

  let targetUser;
  let project = null;

  if (isProjectDocument) {
    if (!mongoose.isValidObjectId(first.projectId))
      return sendError(res, {
        statusCode: 400,
        message: 'Select a valid project.',
        code: 'INVALID_PROJECT',
      });
    project = await Project.findOne({
      _id: first.projectId,
      branchId: req.user.branchId,
    });
    if (!project)
      return sendError(res, {
        statusCode: 400,
        message: 'Project is outside your permitted scope.',
        code: 'INVALID_PROJECT',
      });
    if (first.userId && String(first.userId) !== String(req.user.id))
      return sendError(res, {
        statusCode: 400,
        message: 'Project documents are attributed to their uploader.',
        code: 'INVALID_EMPLOYEE',
      });
    targetUser = await User.findOne({
      _id: req.user.id,
      branchId: req.user.branchId,
    }).select('_id branchId');
  } else {
    const targetId = first.userId || req.user.id;
    targetUser = await User.findById(targetId).select('_id branchId');
    if (
      !targetUser || targetUser.isDelete === true || targetUser.status !== 'ACTIVE' ||
      (req.user.role !== 'SUPER_ADMIN' &&
        String(targetUser.branchId) !== String(req.user.branchId))
    )
      return sendError(res, {
        statusCode: 400,
        message: 'Employee is outside your permitted scope.',
        code: 'INVALID_EMPLOYEE',
      });
    if (String(targetId) !== String(req.user.id) && req.user.role === 'SUPER_ADMIN')
      return sendError(res, {
        statusCode: 403,
        message: 'You can only upload your own documents.',
        code: 'FORBIDDEN',
      });
  }

  if (!targetUser)
    return sendError(res, {
      statusCode: 400,
      message: 'Uploader account is outside your permitted scope.',
      code: 'INVALID_EMPLOYEE',
    });

  const allowedCategories = [
    'IDENTITY', 'EDUCATION', 'EXPERIENCE',
    'CONTRACT', 'PAYSLIP', 'PROJECT', 'OTHER',
  ];

  // 🆕 resource types: image / video / raw
  const keyRegex = /^[^\s|]+\|(image|video|raw)$/i;

  const toInsert = [];
  const errors = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i] || {};
    const {
      category = 'OTHER',
      title,
      fileName,
      storageKey,
      mimeType,
      size,
      publicId,
      fileUrl,
    } = item;

    const keyOk =
      typeof storageKey === 'string' && keyRegex.test(storageKey);

    if (
      typeof title !== 'string' ||
      title.trim().length < 2 ||
      typeof fileName !== 'string' ||
      !keyOk ||
      !/^\d+$/.test(String(size)) ||
      Number(size) < 1 ||
      Number(size) > 25 * 1024 * 1024 ||
      typeof mimeType !== 'string'
    ) {
      errors.push({
        index: i,
        message: 'Valid document metadata is required (maximum 25 MB).',
      });
      continue;
    }
    if (!allowedCategories.includes(category)) {
      errors.push({ index: i, message: 'Invalid document category.' });
      continue;
    }

    toInsert.push({
      branchId: isProjectDocument ? project.branchId : targetUser.branchId,
      userId: targetUser._id,
      projectId: project?._id || null,
      category,
      title: title.trim(),
      fileName: fileName.slice(0, 255),
      storageKey: storageKey.slice(0, 500),
      publicId: typeof publicId === 'string' ? publicId.slice(0, 300) : '',
      fileUrl: typeof fileUrl === 'string' ? fileUrl.slice(0, 1000) : '',
      mimeType: mimeType.slice(0, 120),
      size: Number(size),
      uploadedBy: req.user.id,
    });
  }

  if (!toInsert.length)
    return sendError(res, {
      statusCode: 400,
      message: 'No valid documents to save.',
      code: 'VALIDATION_ERROR',
      details: errors,
    });

  const saved = await Document.insertMany(toInsert);

  return sendSuccess(res, {
    statusCode: 201,
    message: `${saved.length} document(s) saved.`,
    data: saved,
    meta: { failed: errors },
  });
}

async function verify(req, res) {
  if (!hasPermission(req.user, 'document.verify'))
    return sendError(res, {
      statusCode: 403,
      message: 'You cannot verify documents.',
      code: 'FORBIDDEN',
    });

  const { status, reviewNote = '' } = req.body || {};
  if (!['VERIFIED', 'REJECTED'].includes(status))
    return sendError(res, {
      statusCode: 400,
      message: 'Review status must be VERIFIED or REJECTED.',
      code: 'VALIDATION_ERROR',
    });

  const row = await Document.findById(req.params.id);
  if (!row)
    return sendError(res, {
      statusCode: 404,
      message: 'Document not found.',
      code: 'NOT_FOUND',
    });
  if (!req.user.branchId || String(row.branchId) !== String(req.user.branchId))
    return sendError(res, {
      statusCode: 403,
      message: 'Branch access denied.',
      code: 'BRANCH_ACCESS_DENIED',
    });
  if (!['PENDING', 'SUBMITTED'].includes(row.status))
    return sendError(res, {
      statusCode: 409,
      message: 'Only pending documents can be reviewed.',
      code: 'DOCUMENT_ALREADY_REVIEWED',
    });
  if (typeof reviewNote !== 'string' || reviewNote.length > 1000)
    return sendError(res, {
      statusCode: 400,
      message: 'Review note must be 1000 characters or fewer.',
      code: 'VALIDATION_ERROR',
    });

  row.status = status;
  row.reviewNote = reviewNote.trim();
  row.reviewedBy = req.user.id;
  await row.save();

  return sendSuccess(res, {
    message:
      status === 'VERIFIED'
        ? 'Document verified successfully.'
        : 'Document rejected.',
    data: row,
  });
}



//  * 🆕 Delete a document
//  * Allowed for: document.upload OR document.verify permission holders
//  * Scoped to same branch (except SUPER_ADMIN, but SUPER_ADMIN can't access docs anyway)
//  * Also removes the file from Cloudinary (best-effort).
//  */
async function remove(req, res) {
  const canDelete =
    hasPermission(req.user, 'document.upload') ||
    hasPermission(req.user, 'document.verify');
  if (!canDelete)
    return sendError(res, {
      statusCode: 403,
      message: 'You do not have permission to delete documents.',
      code: 'FORBIDDEN'
    });

  if (!mongoose.isValidObjectId(req.params.id))
    return sendError(res, {
      statusCode: 400,
      message: 'Invalid document id.',
      code: 'VALIDATION_ERROR'
    });

  const doc = await Document.findById(req.params.id);
  if (!doc)
    return sendError(res, {
      statusCode: 404,
      message: 'Document not found.',
      code: 'NOT_FOUND'
    });

  // Branch scoping
  if (!req.user.branchId || String(doc.branchId) !== String(req.user.branchId))
    return sendError(res, {
      statusCode: 403,
      message: 'Branch access denied.',
      code: 'BRANCH_ACCESS_DENIED'
    });

  // Best-effort: delete the actual file from Cloudinary
  if (doc.storageKey) {
    try {
      const [publicId, resourceType] = String(doc.storageKey).split('|');
      if (publicId) {
        await cloudinary.uploader.destroy(publicId, {
          resource_type: resourceType || 'raw',
          type: 'authenticated',
          invalidate: true
        });
      }
    } catch (err) {
      // Log but don't block DB deletion — orphan files can be cleaned later
      console.error('Cloudinary delete failed:', err.message);
    }
  }

  await doc.deleteOne();

  return sendSuccess(res, {
    message: 'Document deleted successfully.',
    data: { id: doc._id }
  });
}

module.exports = { list, create, verify, remove };

