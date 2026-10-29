import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  XCircle,
  Download,
  Trash2,
  Plus,
  Search,
  Users,
  FolderKanban,
  X
} from 'lucide-react';

import { api, downloadFile } from '../lib/api';

import { titleCase, niceDate } from '../utils/labels.js';

import {
  Field,
  Status,
  EmptyState,
  LoadingRows
} from '../components/common.jsx';
import FormModal from '../components/FormModal.jsx';

const MAX_FILES = 10;
const MAX_FILE_SIZE = 25 * 1024 * 1024;

function newDocRow(defaultCategory = 'EXPERIENCE') {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: '',
    category: defaultCategory,
    file: null
  };
}

function DocumentsPage({
  documents = [],
  user,
  loading = false,
  notify,
  onRefresh
}) {
  const [docRows, setDocRows] = useState([newDocRow('EXPERIENCE')]);
  const [busy, setBusy] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [reviewingId, setReviewingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // 🆕 Tabs / search / employee filter
  const [tab, setTab] = useState('employee'); // 'employee' | 'project'
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [employeeFilterId, setEmployeeFilterId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);

  const canReviewDocuments = user?.permissions?.includes('document.verify');
  const canUploadDocuments = user?.permissions?.includes('document.upload');
  const canDeleteDocuments =
    user?.permissions?.includes('document.upload') ||
    user?.permissions?.includes('document.verify');
  const pendingStatuses = ['PENDING', 'SUBMITTED'];

  // 🆕 Search debounce (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // 🆕 Employees load (sirf employee tab pe)
  useEffect(() => {
    if (tab !== 'employee') return;
    let cancelled = false;

    async function loadEmployees() {
      setEmployeesLoading(true);
      try {
        const res = await api('/employees?limit=200');
        const list = Array.isArray(res) ? res : res?.data || [];
        if (!cancelled) setEmployees(list);
      } catch (err) {
        if (!cancelled) notify?.(err.message || 'Unable to load employees.', 'error');
      } finally {
        if (!cancelled) setEmployeesLoading(false);
      }
    }

    loadEmployees();
    return () => { cancelled = true; };
  }, [tab, notify]);

  // 🆕 Server-side filter — parent (App.jsx) ko inform karo
  // documents prop ke saath saath ye callback parent pe fetch trigger karega
  useEffect(() => {
    // This component does not own fetching — App.jsx owns it.
    // We rely on parent to pass filtered `documents`.
    // Parent ko re-fetch karwane ke liye onRefresh ko custom params ke saath call karna hoga.
  }, [tab, debouncedSearch, employeeFilterId]);

  // 🆕 Client-side fallback filter (agar parent server-side filter nahi karta)
  const visibleDocuments = useMemo(() => {
    let list = documents;

    if (tab === 'employee') list = list.filter(d => !d.projectId);
    else if (tab === 'project') list = list.filter(d => d.projectId);

    if (tab === 'employee' && employeeFilterId) {
      list = list.filter(d => String(d.userId?._id || d.userId) === String(employeeFilterId));
    }

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(d => {
        const title = (d.title || '').toLowerCase();
        const fileName = (d.fileName || '').toLowerCase();
        const empName = `${d.userId?.firstName || ''} ${d.userId?.lastName || ''}`.toLowerCase();
        const empCode = (d.userId?.employeeCode || '').toLowerCase();
        return (
          title.includes(q) ||
          fileName.includes(q) ||
          empName.includes(q) ||
          empCode.includes(q)
        );
      });
    }

    return list;
  }, [documents, tab, employeeFilterId, debouncedSearch]);

  function addRow() {
    if (docRows.length >= MAX_FILES) {
      notify?.(`Maximum ${MAX_FILES} documents per upload.`, 'error');
      return;
    }
    setDocRows(prev => [...prev, newDocRow(prev[0]?.category || 'EXPERIENCE')]);
  }

  function removeRow(key) {
    setDocRows(prev => {
      if (prev.length === 1) return [newDocRow(prev[0]?.category || 'EXPERIENCE')];
      return prev.filter(row => row.key !== key);
    });
  }

  function updateRow(key, patch) {
    setDocRows(prev => prev.map(row => (row.key === key ? { ...row, ...patch } : row)));
  }

  function resetUploadForm() {
    setDocRows([newDocRow('EXPERIENCE')]);
    const fileInputs = document.querySelectorAll('.employee-document-file-input');
    fileInputs.forEach(input => { input.value = ''; });
  }

  async function review(doc, status) {
    if (!canReviewDocuments) return notify?.('You do not have permission to review documents.', 'error');
    if (!doc?._id) return notify?.('Document ID is missing.', 'error');
    if (!pendingStatuses.includes(doc.status)) return notify?.('Only pending documents can be reviewed.', 'error');

    setReviewingId(doc._id);
    try {
      await api(`/documents/${encodeURIComponent(doc._id)}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      notify?.(status === 'VERIFIED' ? 'Document verified.' : 'Document rejected.', 'success');
      await onRefresh?.();
    } catch (err) {
      notify?.(err.message || 'Failed to review document.', 'error');
    } finally {
      setReviewingId(null);
    }
  }

  async function handleDelete(doc) {
    if (!canDeleteDocuments) return notify?.('You do not have permission to delete documents.', 'error');
    if (!doc?._id) return notify?.('Document ID is missing.', 'error');
    const confirmed = window.confirm(
      `Delete "${doc.title || doc.fileName || 'this document'}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(doc._id);
    try {
      await api(`/documents/${encodeURIComponent(doc._id)}`, { method: 'DELETE' });
      notify?.('Document deleted.', 'success');
      await onRefresh?.();
    } catch (err) {
      notify?.(err.message || 'Failed to delete document.', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  async function upload(event) {
    event.preventDefault();
    const rowsWithFiles = docRows.filter(row => row.file);

    if (!rowsWithFiles.length) return notify?.('Add at least one file to upload.', 'error');
    if (rowsWithFiles.length > MAX_FILES) return notify?.(`Maximum ${MAX_FILES} documents per upload.`, 'error');

    const unsupported = rowsWithFiles.find(row => !/\.(pdf|doc|docx)$/i.test(row.file.name));
    if (unsupported) return notify?.('Only PDF, DOC and DOCX documents are allowed.', 'error');

    const oversized = rowsWithFiles.find(row => row.file.size > MAX_FILE_SIZE);
    if (oversized) return notify?.(`"${oversized.file.name}" exceeds 25 MB.`, 'error');

    setBusy(true);
    try {
      const formData = new FormData();
      rowsWithFiles.forEach(row => formData.append('file', row.file));

      const uploaded = await api('/uploads', { method: 'POST', body: formData });
      const uploadedFiles = Array.isArray(uploaded.data) ? uploaded.data : [uploaded.data];

      await Promise.all(
        uploadedFiles.map((uploadedFile, index) => {
          const row = rowsWithFiles[index];
          return api('/documents', {
            method: 'POST',
            body: JSON.stringify({
              category: row.category || 'OTHER',
              title: row.title.trim() || row.file.name,
              fileName: uploadedFile.fileName,
              storageKey: uploadedFile.storageKey,
              mimeType: uploadedFile.mimeType,
              size: uploadedFile.size,
              publicId: uploadedFile.publicId || '',
              fileUrl: uploadedFile.fileUrl || ''
            })
          });
        })
      );

      notify?.(`${uploadedFiles.length} document(s) uploaded.`, 'success');
      resetUploadForm();
      setShowUpload(false);
      await onRefresh?.();
    } catch (err) {
      notify?.(err.message || 'Document upload failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(doc) {
    if (!doc?.storageKey) return notify?.('File location is unavailable.', 'error');
    try {
      await downloadFile(
        `/uploads/${encodeURIComponent(doc.storageKey)}`,
        doc.fileName || doc.title || 'document'
      );
    } catch (err) {
      notify?.(err.message || 'File download failed.', 'error');
    }
  }

  const rowsWithFilesCount = docRows.filter(r => r.file).length;
  const hasActiveFilters = Boolean(debouncedSearch || employeeFilterId);
  const employeeCount = documents.filter(d => !d.projectId).length;
  const projectCount = documents.filter(d => d.projectId).length;

  return (
    <div className="panel data-panel">
      <div className="panel-heading">
        <div>
          <h3>Documents</h3>
          <p>Private employee and project files, with verification tools</p>
        </div>
        <div className="heading-actions">
          <span className="count-pill">{visibleDocuments.length} files</span>
          {canUploadDocuments && (
            <button type="button" className="button button-primary" onClick={() => setShowUpload(true)}>
              <Upload size={16} /> Upload document
            </button>
          )}
        </div>
      </div>

      {/* 🆕 Tabs */}
      <div className="doc-tabs" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`button ${tab === 'employee' ? 'button-primary' : 'button-quiet'}`}
          onClick={() => setTab('employee')}
        >
          <Users size={16} /> Employee documents
          <span className="count-pill" style={{ marginLeft: 6 }}>{employeeCount}</span>
        </button>
        <button
          type="button"
          className={`button ${tab === 'project' ? 'button-primary' : 'button-quiet'}`}
          onClick={() => setTab('project')}
        >
          <FolderKanban size={16} /> Project documents
          <span className="count-pill" style={{ marginLeft: 6 }}>{projectCount}</span>
        </button>
      </div>

      {/* 🆕 Filter bar */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'flex-end',
          padding: '0 0 12px',
          flexWrap: 'wrap',
          margin:'20px'
        }}
      >
        <div style={{ flex: '1 1 260px', minWidth: 220 }}>
          <Field label="Search">
            <div style={{ position: 'relative' }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  opacity: 0.6,
                  pointerEvents: 'none'
                }}
              />
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder={
                  tab === 'employee'
                    ? 'Title, file name, employee name or code…'
                    : 'Title or file name…'
                }
                style={{ paddingLeft: 32 }}
              />
            </div>
          </Field>
        </div>

        {tab === 'employee' && (
          <div style={{ flex: '0 1 240px', minWidth: 200 }}>
            <Field label="Employee">
              <select
                value={employeeFilterId}
                onChange={e => setEmployeeFilterId(e.target.value)}
                disabled={employeesLoading}
              >
                <option value="">{employeesLoading ? 'Loading…' : 'All employees'}</option>
                {employees.map(emp => (
                  <option key={emp._id || emp.id} value={emp._id || emp.id}>
                    {`${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.email}
                    {emp.employeeCode ? ` · ${emp.employeeCode}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {hasActiveFilters && (
          <button
            type="button"
            className="button button-quiet"
            onClick={() => {
              setSearchInput('');
              setDebouncedSearch('');
              setEmployeeFilterId('');
            }}
            style={{ marginBottom: 2 }}
          >
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {canUploadDocuments && showUpload && (
        <FormModal
          title="Upload employee documents"
          description="Add one or more documents. Each row can have its own title, category and file."
          onClose={() => { resetUploadForm(); setShowUpload(false); }}
          onSubmit={upload}
          submitLabel={
            rowsWithFilesCount > 1
              ? `Upload ${rowsWithFilesCount} documents`
              : 'Upload document'
          }
          busyLabel="Uploading…"
          busy={busy}
        >
          <div className="doc-upload-rows">
            {docRows.map((row, index) => (
              <div key={row.key} className="doc-upload-row">
                <div className="doc-upload-row-header">
                  <span>Document #{index + 1}</span>
                  {docRows.length > 1 && (
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => removeRow(row.key)}
                      title="Remove this document"
                      aria-label="Remove this document"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                <div className="form-grid">
                  <Field label="Document title">
                    <input
                      type="text"
                      value={row.title}
                      onChange={event => updateRow(row.key, { title: event.target.value })}
                      placeholder={row.file ? row.file.name : 'Optional — uses file name if blank'}
                      maxLength={150}
                    />
                  </Field>

                  <Field label="Category" required>
                    <select
                      value={row.category}
                      onChange={event => updateRow(row.key, { category: event.target.value })}
                      required
                    >
                      <option value="IDENTITY">Identity</option>
                      <option value="EDUCATION">Education</option>
                      <option value="EXPERIENCE">Experience</option>
                      <option value="CONTRACT">Contract</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </Field>

                  <Field label="Choose file (max 25 MB)" required wide>
                    <input
                      className="employee-document-file-input"
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={event =>
                        updateRow(row.key, { file: event.target.files?.[0] || null })
                      }
                      required
                    />
                    {row.file && (
                      <small>
                        Selected: <strong>{row.file.name}</strong> (
                        {(row.file.size / 1024).toFixed(1)} KB)
                      </small>
                    )}
                  </Field>
                </div>
              </div>
            ))}
          </div>

          <div className="doc-upload-add-row">
            <button
              type="button"
              className="button button-secondary"
              onClick={addRow}
              disabled={docRows.length >= MAX_FILES}
            >
              <Plus size={16} /> Add another document
              {docRows.length >= MAX_FILES && ` (max ${MAX_FILES})`}
            </button>
          </div>
        </FormModal>
      )}

      {loading ? (
        <LoadingRows />
      ) : visibleDocuments.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>DOCUMENT</th>
                <th>{tab === 'project' ? 'PROJECT' : 'EMPLOYEE'}</th>
                <th>CATEGORY</th>
                <th>UPLOADED</th>
                <th>STATUS</th>
                <th>FILE</th>
                {canReviewDocuments && <th>REVIEW</th>}
                {canDeleteDocuments && <th>DELETE</th>}
              </tr>
            </thead>
            <tbody>
              {visibleDocuments.map(doc => {
                const canReviewThisDocument =
                  canReviewDocuments && pendingStatuses.includes(doc.status);
                const isReviewing = reviewingId === doc._id;
                const isDeleting = deletingId === doc._id;

                return (
                  <tr key={doc._id}>
                    <td>
                      <div className="document-title-cell">
                        <FileText size={17} />
                        <span>{doc.title || doc.fileName || 'Untitled document'}</span>
                      </div>
                    </td>
                    <td>
                      {doc.projectId
                        ? <span className="project-document-label">{doc.projectId.name}</span>
                        : doc.userId
                        ? `${doc.userId.firstName || ''} ${doc.userId.lastName || ''}`.trim() || '—'
                        : '—'}
                    </td>
                    <td>{titleCase(doc.category || 'OTHER')}</td>
                    <td>{niceDate(doc.createdAt)}</td>
                    <td><Status value={doc.status} /></td>
                    <td>
                      <div className="document-file-actions">
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => handleDownload(doc)}
                          title="Download document"
                        >
                          <Download size={15} /> Download
                        </button>
                      </div>
                    </td>
                    {canReviewDocuments && (
                      <td>
                        {canReviewThisDocument ? (
                          <div className="document-review-actions">
                            <button
                              type="button"
                              className="button button-primary"
                              onClick={() => review(doc, 'VERIFIED')}
                              disabled={isReviewing}
                              title="Verify document"
                            >
                              <CheckCircle2 size={15} />
                              {isReviewing ? 'Please wait…' : 'Verify'}
                            </button>
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() => review(doc, 'REJECTED')}
                              disabled={isReviewing}
                              title="Reject document"
                            >
                              <XCircle size={15} /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className="document-reviewed-label">
                            {doc.status === 'VERIFIED'
                              ? 'Verified'
                              : doc.status === 'REJECTED'
                              ? 'Rejected'
                              : 'No action'}
                          </span>
                        )}
                      </td>
                    )}
                    {canDeleteDocuments && (
                      <td>
                        <button
                          type="button"
                          className="icon-button document-delete-button"
                          onClick={() => handleDelete(doc)}
                          disabled={isDeleting}
                          title="Delete document"
                          aria-label="Delete document"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={tab === 'project' ? FolderKanban : FileText}
          title={
            hasActiveFilters
              ? 'No documents match your filters'
              : tab === 'project'
              ? 'No project documents'
              : 'No employee documents'
          }
          description={
            hasActiveFilters
              ? 'Try clearing search or employee filter.'
              : tab === 'project'
              ? 'Project documents appear here once uploaded inside a project.'
              : 'Upload employee documents using the button above.'
          }
        />
      )}
    </div>
  );
}

export default DocumentsPage;