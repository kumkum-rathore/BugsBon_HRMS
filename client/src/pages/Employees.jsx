import React, { useEffect, useState } from 'react';
import {
  Users,
  Archive,
  X,
  Pencil,
  Trash2,
  Mail,
  CalendarDays,
  Building2,
  BriefcaseBusiness,
  Phone,
  Save,
  AlertTriangle,
  UserRound,
  Clock,
  FileText,
  Eye,
  UserRoundCheck,
  Plus,
  Download,
  IndianRupee,
  Fingerprint,
  ShieldCheck,
  UserRoundX,
} from 'lucide-react';
import { PhoneInput } from '../components/common.jsx';

import { api, downloadFile, fetchFileBlob } from '../lib/api';
import { roleLabel, initials, niceDate } from '../utils/labels.js';

import { Status, EmptyState, LoadingRows } from '../components/common.jsx';
import { PERMISSION_OPTIONS } from '../utils/permissions.js';

const MAX_FILES = 10;
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// 🆕 Factory for a new empty document row
function newDocRow(defaultCategory = 'IDENTITY') {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: '',
    category: defaultCategory,
    file: null
  };
}

export default function Employees({
  employees = [],
  loading = false,
  query = '',
  user,
  notify,
  onRefresh,
  shifts = []
}) {
  const [employeeRows, setEmployeeRows] = useState(employees);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // 🆕 Dynamic document rows for edit modal (replaces newDocs + newDocsCategory)
  const [newDocRows, setNewDocRows] = useState([newDocRow('IDENTITY')]);

  // 🆕 Documents state (list, loading, download)
  const [employeeDocs, setEmployeeDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
// Employee component के अंदर, बाकी states के साथ
const [showDeptModal, setShowDeptModal] = useState(false);
const [deptForm, setDeptForm] = useState({ name: '', description: '' });
const [deptSaving, setDeptSaving] = useState(false);
const [localDepartments, setLocalDepartments] = useState([]);
const [branchFilter, setBranchFilter] = useState('ALL');
const [branchOptions, setBranchOptions] = useState([]);
const [branchFilterLoading, setBranchFilterLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    joiningDate: '',
    shiftId: '',
    salaryAmount: 0,
    status: 'ACTIVE',
    experienceYears: 0,
    hasPreviousExperience: false,
    previousCompanyName: '',
    previousCompanyLeavingDate: '',
    previousCompanyLeavingReason: '',
    permissions: [],
    departmentId: '',
    customRoleId: '',
    role: ''
  });

  const canEdit = user?.permissions?.includes('employee.update');
  const canEditEmployee = employee =>
    canEdit &&
    !(
      user?.role === 'BRANCH_ADMIN' &&
      String(getEmployeeId(employee)) === String(user.id)
    );

  useEffect(() => {
    setEmployeeRows(employees);
  }, [employees]);
  useEffect(() => {
  if (user?.role !== 'SUPER_ADMIN') {
    setBranchOptions([]);
    setBranchFilter('ALL');
    return undefined;
  }

  let active = true;

  api('/branches?limit=100')
    .then(result => {
      if (active) {
        setBranchOptions(Array.isArray(result.data) ? result.data : []);
      }
    })
    .catch(err => {
      if (active) {
        setError(err.message || 'Unable to load branches.');
      }
    });

  return () => {
    active = false;
  };
}, [user?.role]);

  const departments = [
    ...new Map(
      employeeRows
        .filter(employee => employee.departmentId)
        .map(employee => {
          const department = employee.departmentId;
          const id = String(department._id || department);
          return [id, { id, name: department.name || 'Department' }];
        })
    ).values()
  ];

  const departmentRoles = employeeRows.reduce((map, employee) => {
    const dept = employee.departmentId;
    if (!dept) return map;

    const deptId = String(dept._id || dept);
    const roleObj = employee.customRole;
    const roleId = roleObj?._id ? String(roleObj._id) : '';
    const roleName = roleObj?.name || '';

    if (!roleName) return map;

    if (!map[deptId]) map[deptId] = [];
    const already = map[deptId].some(r => r.name === roleName);
    if (!already) {
      map[deptId].push({ id: roleId, name: roleName });
    }
    return map;
  }, {});

  const roles = [
    ...new Set(
      employeeRows
        .map(e => e.customRole?.name || roleLabel(e.role))
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b));

  const formRoles = formData.departmentId
    ? departmentRoles[String(formData.departmentId)] || []
    : [];

  const filtered = employeeRows.filter(employee => {
    const searchText = [
      employee.firstName,
      employee.lastName,
      employee.email,
      employee.role,
      employee.customRole?.name,
      employee.branch?.name
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const departmentId = employee.departmentId?._id || employee.departmentId;
    const role = employee.customRole?.name || roleLabel(employee.role);
    return (
      searchText.includes(query.toLowerCase()) &&
      `${employee.firstName || ''} ${employee.lastName || ''}`
        .toLowerCase()
        .includes(nameFilter.toLowerCase()) &&
      (departmentFilter === 'ALL' ||
        String(departmentId) === departmentFilter) &&
      (roleFilter === 'ALL' || role === roleFilter) &&
      (statusFilter === 'ALL' || employee.status === statusFilter)
    );
  });

async function handleBranchFilterChange(branchId) {
  setBranchFilter(branchId);
  setError('');

  if (branchId === 'ALL') {
    if (onRefresh) {
      await onRefresh();
    } else {
      setEmployeeRows(employees);
    }
    return;
  }

  setBranchFilterLoading(true);

  try {
    const result = await api(
      `/employees?branchId=${encodeURIComponent(branchId)}&limit=100`
    );

    setEmployeeRows(Array.isArray(result.data) ? result.data : []);
  } catch (err) {
    setError(err.message || 'Unable to filter employees by branch.');
  } finally {
    setBranchFilterLoading(false);
  }
}


  function getEmployeeId(employee) {
    return employee?.id || employee?._id;
  }

  // 🆕 Document row helpers
  function addNewDocRow() {
    if (newDocRows.length >= MAX_FILES) return;
    setNewDocRows(prev => [...prev, newDocRow(prev[0]?.category || 'IDENTITY')]);
  }

  function removeNewDocRow(key) {
    setNewDocRows(prev => {
      if (prev.length === 1) {
        return [newDocRow(prev[0]?.category || 'IDENTITY')];
      }
      return prev.filter(r => r.key !== key);
    });
  }

  function updateNewDocRow(key, patch) {
    setNewDocRows(prev =>
      prev.map(r => (r.key === key ? { ...r, ...patch } : r))
    );
  }

  // 🆕 Load documents for selected employee
  async function loadDocuments(employeeId) {
    if (!employeeId) return;
    setDocsLoading(true);
    try {
      const res = await api(
        `/documents?userId=${encodeURIComponent(employeeId)}`
      );
      const list = Array.isArray(res.data)
        ? res.data
        : res.data?.items || [];
      setEmployeeDocs(list);
    } catch (err) {
      setEmployeeDocs([]);
    } finally {
      setDocsLoading(false);
    }
  }

  // 🆕 Download a document
  async function downloadDocument(doc) {
    const id = doc.id || doc._id;
    setDownloadingId(id);
    try {
      if (!doc.storageKey) throw new Error('File location is unavailable.');
      await downloadFile(
        `/uploads/${encodeURIComponent(doc.storageKey)}`,
        doc.fileName || doc.title || 'document'
      );
    } catch (err) {
      if (notify) notify(err.message || 'Failed to download document.', 'error');
      else setError(err.message || 'Failed to download document.');
    } finally {
      setDownloadingId(null);
    }
  }

  function openDetails(employee, startEditing = false, confirmDeactivate = false) {
    setSelectedEmployee(employee);
    setFormData({
      firstName: employee.firstName || '',
      lastName: employee.lastName || '',
      email: employee.email || '',
      phone: employee.phone || '',
      joiningDate: employee.joiningDate
        ? String(employee.joiningDate).slice(0, 10)
        : '',
      shiftId: String(employee.shiftId?._id || employee.shiftId || ''),
      salaryAmount: employee.salaryAmount ?? 0,
      status: employee.status || 'ACTIVE',
      experienceYears: employee.experienceYears ?? 0,
      hasPreviousExperience: employee.hasPreviousExperience || false,
      previousCompanyName: employee.previousCompanyName || '',
      previousCompanyLeavingDate: employee.previousCompanyLeavingDate
        ? String(employee.previousCompanyLeavingDate).slice(0, 10)
        : '',
      previousCompanyLeavingReason: employee.previousCompanyLeavingReason || '',
      permissions: employee.permissions || [],
      departmentId: String(
        employee.departmentId?._id || employee.departmentId || ''
      ),
      customRoleId: String(employee.customRole?._id || employee.customRole || ''),
      role: employee.role || ''
    });

    // 🆕 Reset document rows
    setNewDocRows([newDocRow('IDENTITY')]);

    setEditing(startEditing);
    setDeleting(confirmDeactivate);
    setError('');
    setSuccess('');

    // 🆕 Load documents
    loadDocuments(getEmployeeId(employee));
  }

  function closeDetails() {
    if (saving) return;

    setSelectedEmployee(null);
    setEditing(false);
    setDeleting(false);
    setNewDocRows([newDocRow('IDENTITY')]);
    setEmployeeDocs([]);
    setError('');
    setSuccess('');
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData(previous => ({
      ...previous,
      [name]: value
    }));
  }

  async function handleSave(event) {
    event.preventDefault();

    if (!canEditEmployee(selectedEmployee)) {
      setError('You do not have permission to update employee records.');
      return;
    }

    const id = getEmployeeId(selectedEmployee);

    if (!id) {
      setError('Employee ID is missing.');
      return;
    }

    // 🆕 Basic validation for newly added fields
    if (!formData.firstName.trim() || formData.firstName.trim().length < 2) {
      setError('First name must be at least 2 characters.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError('Enter a valid email address.');
      return;
    }

    const experience = Number(formData.experienceYears);

    if (
      !Number.isFinite(experience) ||
      experience < (formData.hasPreviousExperience ? 0.5 : 0) ||
      experience > 70
    ) {
      setError(
        formData.hasPreviousExperience
          ? 'Experience must be between 0.5 and 70 years when previous experience is selected.'
          : 'Experience must be between 0 and 70 years.'
      );
      return;
    }

    if (
      formData.hasPreviousExperience &&
      (!formData.previousCompanyName.trim() ||
        !formData.previousCompanyLeavingDate ||
        !formData.previousCompanyLeavingReason.trim())
    ) {
      setError('Complete all previous experience details.');
      return;
    }

    // 🆕 Validate new documents (only rows with a file)
    const rowsWithFiles = newDocRows.filter(row => row.file);

    if (rowsWithFiles.length > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} documents per upload.`);
      return;
    }

    const unsupported = rowsWithFiles.find(row => !/\.(pdf|doc|docx)$/i.test(row.file.name));
    if (unsupported) {
      setError('Only PDF, DOC and DOCX documents are allowed.');
      return;
    }

    const oversized = rowsWithFiles.find(
      row => row.file.size > MAX_FILE_SIZE
    );
    if (oversized) {
      setError(`"${oversized.file.name}" exceeds 25 MB.`);
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.phone,
        joiningDate: formData.joiningDate || null,
        shiftId: formData.shiftId || null,
        salaryAmount: Number(formData.salaryAmount) || 0,
        status: formData.status,
        experienceYears: experience,
        hasPreviousExperience: formData.hasPreviousExperience,
        previousCompanyName: formData.hasPreviousExperience
          ? formData.previousCompanyName.trim()
          : '',
        previousCompanyLeavingDate: formData.hasPreviousExperience
          ? formData.previousCompanyLeavingDate
          : null,
        previousCompanyLeavingReason: formData.hasPreviousExperience
          ? formData.previousCompanyLeavingReason.trim()
          : '',
        permissions: formData.permissions,
        departmentId: formData.departmentId || null,
        customRoleId: formData.customRoleId || null,
        role: formData.role || undefined
      };

      const result = await api(`/employees/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      const updatedEmployee = result.data;

      // 🆕 Upload rows that have a file — ONE call, then loop /documents
      if (rowsWithFiles.length > 0) {
        const formDataObj = new FormData();
        rowsWithFiles.forEach(row => formDataObj.append('file', row.file));

        const upload = await api('/uploads', {
          method: 'POST',
          body: formDataObj
        });

        const uploadedFiles = Array.isArray(upload.data)
          ? upload.data
          : [upload.data];

        await Promise.all(
          uploadedFiles.map((uploadedFile, index) => {
            const row = rowsWithFiles[index];
            return api('/documents', {
              method: 'POST',
              body: JSON.stringify({
                userId: id,
                category: row.category || 'OTHER',
                title: row.title?.trim() || row.file.name,
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

        if (notify) {
          notify(`${uploadedFiles.length} document(s) uploaded.`);
        }

        await loadDocuments(id);
      }

      setNewDocRows([newDocRow('IDENTITY')]);

      setEmployeeRows(previous =>
        previous.map(employee =>
          String(getEmployeeId(employee)) === String(id)
            ? {
                ...employee,
                ...updatedEmployee,
                id: updatedEmployee.id || employee.id,
                branch: employee.branch,
                customRole: employee.customRole
              }
            : employee
        )
      );

      setSelectedEmployee(previous => ({
        ...previous,
        ...updatedEmployee,
        id: updatedEmployee.id || previous.id,
        branch: previous.branch,
        customRole: previous.customRole
      }));

      setFormData(previous => ({
        ...previous,
        firstName: updatedEmployee.firstName ?? previous.firstName,
        lastName: updatedEmployee.lastName ?? previous.lastName,
        email: updatedEmployee.email ?? previous.email,
        phone: updatedEmployee.phone ?? previous.phone,
        joiningDate: updatedEmployee.joiningDate
          ? String(updatedEmployee.joiningDate).slice(0, 10)
          : previous.joiningDate,
        shiftId: String(
          updatedEmployee.shiftId?._id ||
            updatedEmployee.shiftId ||
            previous.shiftId ||
            ''
        ),
        salaryAmount: updatedEmployee.salaryAmount ?? previous.salaryAmount,
        status: updatedEmployee.status ?? previous.status,
        experienceYears:
          updatedEmployee.experienceYears ?? previous.experienceYears,
        hasPreviousExperience:
          updatedEmployee.hasPreviousExperience ?? previous.hasPreviousExperience,
        previousCompanyName:
          updatedEmployee.previousCompanyName ?? previous.previousCompanyName,
        previousCompanyLeavingDate: updatedEmployee.previousCompanyLeavingDate
          ? String(updatedEmployee.previousCompanyLeavingDate).slice(0, 10)
          : '',
        previousCompanyLeavingReason:
          updatedEmployee.previousCompanyLeavingReason ??
          previous.previousCompanyLeavingReason,
        permissions: updatedEmployee.permissions ?? previous.permissions,
        departmentId: String(
          updatedEmployee.departmentId?._id ||
            updatedEmployee.departmentId ||
            previous.departmentId ||
            ''
        ),
        customRoleId: String(
          updatedEmployee.customRole?._id ||
            updatedEmployee.customRole ||
            previous.customRoleId ||
            ''
        ),
        role: updatedEmployee.role ?? previous.role
      }));

      setEditing(false);
      setDeleting(false);
      setSuccess(result.message || 'Employee updated successfully.');

      if (onRefresh) await onRefresh();
    } catch (err) {
      setError(err.message || 'Failed to update employee.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!canEditEmployee(selectedEmployee)) {
      setError('Only a Branch Admin can deactivate employee accounts.');
      return;
    }

    const id = getEmployeeId(selectedEmployee);

    if (!id) {
      setError('Employee ID is missing.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const result = await api(`/employees/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'INACTIVE'
        })
      });

      const updatedEmployee = result.data;

      setEmployeeRows(previous =>
        previous.map(employee =>
          String(getEmployeeId(employee)) === String(id)
            ? {
                ...employee,
                ...updatedEmployee,
                branch: employee.branch,
                customRole: employee.customRole
              }
            : employee
        )
      );

      setSelectedEmployee(previous => ({
        ...previous,
        ...updatedEmployee,
        branch: previous.branch,
        customRole: previous.customRole
      }));

      setFormData(previous => ({
        ...previous,
        status: updatedEmployee.status || 'INACTIVE'
      }));

      setDeleting(false);
      setEditing(false);
      setSuccess(
        result.message ||
          'Employee deactivated. Historical records have been retained.'
      );
      if (notify) notify('Employee deactivated.');
    } catch (err) {
      setError(err.message || 'Failed to deactivate employee.');
    } finally {
      setSaving(false);
    }
  }

  async function archiveEmployee(employee) {
    if (!canEditEmployee(employee)) return;
    const id = getEmployeeId(employee);
    if (
      !id ||
      !window.confirm(
        `Archive ${employee.firstName} ${employee.lastName}? This hides the employee from the directory while retaining HR history.`
      )
    )
      return;
    setSaving(true);
    try {
      const result = await api(`/employees/${encodeURIComponent(id)}/archive`, {
        method: 'DELETE'
      });
      setEmployeeRows(previous =>
        previous.filter(row => String(getEmployeeId(row)) !== String(id))
      );
      if (String(getEmployeeId(selectedEmployee)) === String(id)) closeDetails();
      if (notify) notify(result.message || 'Employee archived.');
      if (onRefresh) await onRefresh();
    } catch (err) {
      if (notify) notify(err.message || 'Failed to archive employee.', 'error');
      else setError(err.message || 'Failed to archive employee.');
    } finally {
      setSaving(false);
    }
  }

  async function reactivateEmployee(employee) {
    if (!canEditEmployee(employee)) return;
    const id = getEmployeeId(employee);
    if (!id) return;

    setSaving(true);
    try {
      const result = await api(`/employees/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACTIVE' })
      });
      const updatedEmployee = result.data;
      setEmployeeRows(previous =>
        previous.map(row =>
          String(getEmployeeId(row)) === String(id)
            ? {
                ...row,
                ...updatedEmployee,
                branch: row.branch,
                customRole: row.customRole
              }
            : row
        )
      );
      if (String(getEmployeeId(selectedEmployee)) === String(id)) {
        setSelectedEmployee(previous => ({ ...previous, ...updatedEmployee }));
        setFormData(previous => ({
          ...previous,
          status: 'ACTIVE'
        }));
      }
      if (notify) notify('Employee reactivated.');
      if (onRefresh) await onRefresh();
    } catch (err) {
      if (notify)
        notify(err.message || 'Unable to reactivate employee.', 'error');
      else setError(err.message || 'Unable to reactivate employee.');
    } finally {
      setSaving(false);
    }
  }

  const availablePermissions = PERMISSION_OPTIONS.filter(([permission]) =>
    (user.permissions || []).includes(permission)
  );

  const rowsWithFilesCount = newDocRows.filter(r => r.file).length;

  return (
    <>
      <div className="panel data-panel">
        <div className="panel-heading">
          <div>
            <h3>All employees</h3>
            <p>Your people directory and account status</p>
          </div>

          <span className="count-pill">{employeeRows.length} people</span>
        </div>

        <div className="employee-directory-filters">
          <input
            type="search"
            value={nameFilter}
            onChange={event => setNameFilter(event.target.value)}
            placeholder="Search employee name"
            aria-label="Search employee name"
          />
          {user?.role === 'SUPER_ADMIN' && (
  <select
    value={branchFilter}
    onChange={event => handleBranchFilterChange(event.target.value)}
    aria-label="Filter employees by branch"
    disabled={branchFilterLoading}
  >
    <option value="ALL">All branches</option>

    {branchOptions.map(branch => (
      <option
        key={branch._id || branch.id}
        value={branch._id || branch.id}
      >
        {branch.name} ({branch.branchCode})
      </option>
    ))}
  </select>
)}
          <select
            value={departmentFilter}
            onChange={event => setDepartmentFilter(event.target.value)}
            aria-label="Filter by department"
          >
            <option value="ALL">All departments</option>
            {departments.map(department => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
          <select
            value={roleFilter}
            onChange={event => setRoleFilter(event.target.value)}
            aria-label="Filter by role"
          >
            <option value="ALL">All roles</option>
            {roles.map(role => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="ALL">All statuses</option>
            {['ACTIVE', 'INACTIVE', 'INVITED', 'SUSPENDED'].map(status => (
              <option key={status} value={status}>
                {status[0] + status.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>

{loading || branchFilterLoading ? (
            <LoadingRows />
        ) : filtered.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>EMPLOYEE</th>
                  {user?.role === 'SUPER_ADMIN' && <th>BRANCH</th>}
                  <th>ROLE</th>
                  <th>JOINED</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map(employee => (
                  <tr
                    key={getEmployeeId(employee)}
                    onClick={() => openDetails(employee)}
                    className="employee-clickable-row"
                    title="Click to view employee details"
                  >
                    <td>
                      <div className="table-person">
                        <div className="avatar avatar-soft">
                          {initials(employee)}
                        </div>

                        <div>
                          <strong>
                            {employee.firstName} {employee.lastName}
                          </strong>
                          <span>{employee.email}</span>
                        </div>
                      </div>
                    </td>

                    {user?.role === 'SUPER_ADMIN' && (
                      <td>
                        {employee.branch?.name || '—'}
                        <span className="table-secondary">
                          {employee.branch?.branchCode || ''}
                        </span>
                      </td>
                    )}

                    <td>
                      <span className="role-pill">
                        {employee.customRole?.name || roleLabel(employee.role)}
                      </span>
                    </td>

                    <td>{niceDate(employee.joiningDate)}</td>

                    <td>
                      <Status value={employee.status} />
                    </td>

                    <td>
                      <div
                        className="employee-row-actions"
                        onClick={event => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="icon-button employee-action-icon"
                          onClick={() => openDetails(employee)}
                          title="View employee"
                          aria-label={`View ${employee.firstName} ${employee.lastName}`}
                        >
                          <Eye size={17} />
                        </button>

                        {canEditEmployee(employee) && (
                          <>
                            <button
                              type="button"
                              className="icon-button employee-action-icon"
                              onClick={() => openDetails(employee, true)}
                              title="Edit employee"
                              aria-label={`Edit ${employee.firstName} ${employee.lastName}`}
                            >
                              <Pencil size={16} />
                            </button>

                            {employee.status === 'ACTIVE' ? (
                              <button
                                type="button"
                                className="icon-button employee-action-icon employee-action-danger"
                                onClick={() =>
                                  openDetails(employee, false, true)
                                }
                                title="Deactivate employee"
                                aria-label={`Deactivate ${employee.firstName} ${employee.lastName}`}
                              >
                                <UserRoundX size={17} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="icon-button employee-action-icon employee-action-activate"
                                onClick={() => reactivateEmployee(employee)}
                                disabled={saving}
                                title="Activate employee"
                                aria-label={`Activate ${employee.firstName} ${employee.lastName}`}
                              >
                                <UserRoundCheck size={17} />
                              </button>
                            )}

                            <button
                              type="button"
                              className="icon-button employee-action-icon employee-action-danger"
                              onClick={() => archiveEmployee(employee)}
                              disabled={saving}
                              title="Archive employee"
                              aria-label={`Archive ${employee.firstName} ${employee.lastName}`}
                            >
                              <Archive size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No matching employees"
            description="Try a different search or add your first employee."
          />
        )}
      </div>

      {selectedEmployee && (
        <div
          className="employee-overlay"
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              closeDetails();
            }
          }}
        >
          <section
            className="employee-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-modal-title"
          >
            <header className="employee-modal-header">
              <div>
                <h2 id="employee-modal-title">
                  {editing ? 'Edit Employee' : 'Employee Details'}
                </h2>

                <p>Employee profile</p>
              </div>

              <button
                type="button"
                className="employee-icon-button"
                onClick={closeDetails}
                disabled={saving}
                aria-label="Close employee details"
              >
                <X size={20} />
              </button>
            </header>

            <div className="employee-profile">
              <div className="avatar avatar-soft employee-large-avatar">
                {initials(selectedEmployee)}
              </div>

              <div className="employee-profile-info">
                <h3>
                  {selectedEmployee.firstName} {selectedEmployee.lastName}
                </h3>

                <p>
                  {selectedEmployee.customRole?.name ||
                    roleLabel(selectedEmployee.role)}
                </p>

                <Status value={selectedEmployee.status} />
              </div>
            </div>

            {error && (
              <div className="employee-error" role="alert">
                <AlertTriangle size={17} />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="employee-success" role="status">
                {success}
              </div>
            )}

            {editing ? (
              <form onSubmit={handleSave}>
                <div className="employee-form-grid">
                  <label>
                    First name
                    <input
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      maxLength={80}
                      required
                    />
                  </label>

                  <label>
                    Last name
                    <input
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      maxLength={80}
                    />
                  </label>

                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      maxLength={254}
                      required
                    />
                  </label>

                  <label>
                    Phone
                    <PhoneInput
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                    />
                  </label>

                  <label>
                    Joining date
                    <input
                      name="joiningDate"
                      type="date"
                      value={formData.joiningDate}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={handleChange}
                    />
                  </label>

                  <label>
                    Shift
                    <select
                      name="shiftId"
                      value={formData.shiftId}
                      onChange={handleChange}
                    >
                      <option value="">Select a shift</option>
                      {shifts.map(s => (
                        <option key={s.id || s._id} value={s.id || s._id}>
                          {s.name} ({s.startTime}–{s.endTime})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Salary amount
                    <input
                      name="salaryAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.salaryAmount}
                      onChange={handleChange}
                    />
                  </label>

                  <label>
                    Department
                    <select
                      name="departmentId"
                      value={formData.departmentId}
                      onChange={event => {
                        const departmentId = event.target.value;
                        setFormData(previous => {
                          const nextRoles =
                            departmentRoles[String(departmentId)] || [];
                          const stillValid = nextRoles.some(
                            r => r.id === previous.customRoleId
                          );
                          return {
                            ...previous,
                            departmentId,
                            customRoleId: stillValid
                              ? previous.customRoleId
                              : '',
                            role: stillValid ? previous.role : ''
                          };
                        });
                      }}
                    >
                      <option value="">Select a department</option>
                      {departments.map(department => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Role
                    <select
                      name="customRoleId"
                      value={formData.customRoleId}
                      onChange={event => {
                        const customRoleId = event.target.value;
                        const picked = formRoles.find(
                          r => r.id === customRoleId
                        );
                        setFormData(previous => ({
                          ...previous,
                          customRoleId,
                          role: picked?.name || previous.role
                        }));
                      }}
                      disabled={!formData.departmentId || !formRoles.length}
                      required
                    >
                      <option value="">
                        {!formData.departmentId
                          ? 'Select a department first'
                          : formRoles.length === 0
                            ? 'No roles in this department'
                            : 'Select a role'}
                      </option>
                      {formRoles.map(role => (
                        <option key={role.id || role.name} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Has previous work experience?
                    <select
                      name="hasPreviousExperience"
                      value={formData.hasPreviousExperience ? 'yes' : 'no'}
                      onChange={event => {
                        const hasPreviousExperience =
                          event.target.value === 'yes';
                        setFormData(previous => ({
                          ...previous,
                          hasPreviousExperience,
                          experienceYears: hasPreviousExperience
                            ? previous.experienceYears || 0.5
                            : 0,
                          previousCompanyName: hasPreviousExperience
                            ? previous.previousCompanyName
                            : '',
                          previousCompanyLeavingDate: hasPreviousExperience
                            ? previous.previousCompanyLeavingDate
                            : '',
                          previousCompanyLeavingReason: hasPreviousExperience
                            ? previous.previousCompanyLeavingReason
                            : ''
                        }));
                      }}
                    >
                      <option value="no">No previous experience</option>
                      <option value="yes">Yes, has previous experience</option>
                    </select>
                  </label>

                  {formData.hasPreviousExperience && (
                    <>
                      <label>
                        Previous company name
                        <input
                          name="previousCompanyName"
                          value={formData.previousCompanyName}
                          onChange={handleChange}
                          maxLength={120}
                          required
                        />
                      </label>

                      <label>
                        Previous company leaving date
                        <input
                          name="previousCompanyLeavingDate"
                          type="date"
                          value={formData.previousCompanyLeavingDate}
                          max={new Date().toISOString().slice(0, 10)}
                          onChange={handleChange}
                          required
                        />
                      </label>

                      <label className="employee-full-width">
                        Reason for leaving
                        <textarea
                          name="previousCompanyLeavingReason"
                          value={formData.previousCompanyLeavingReason}
                          onChange={handleChange}
                          maxLength={1000}
                          rows={3}
                          required
                        />
                      </label>

                      <label>
                        Total experience (years)
                        <input
                          name="experienceYears"
                          type="number"
                          min="0.5"
                          max="70"
                          step="0.5"
                          value={formData.experienceYears}
                          onChange={handleChange}
                          required
                        />
                      </label>
                    </>
                  )}

                  <label>
                    Status
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="SUSPENDED">Suspended</option>
                    </select>
                  </label>

                  {/* 🆕 Existing documents with download */}
                  <fieldset className="employee-permissions-section employee-full-width">
                    <legend>Existing documents</legend>
                    {docsLoading ? (
                      <p>Loading documents...</p>
                    ) : employeeDocs.length === 0 ? (
                      <p>No documents uploaded yet.</p>
                    ) : (
                      <ul className="employee-doc-list">
                        {employeeDocs.map(doc => {
                          const docId = doc.id || doc._id;
                          return (
                            <li key={docId} className="employee-doc-item">
                              <div>
                                <strong>
                                  {doc.title || doc.fileName || 'Document'}
                                </strong>
                                <span>
                                  {' '}
                                  · {doc.category || 'OTHER'}
                                  {doc.size
                                    ? ` · ${(doc.size / 1024).toFixed(1)} KB`
                                    : ''}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="employee-btn employee-btn-secondary"
                                onClick={() => downloadDocument(doc)}
                                disabled={downloadingId === docId}
                              >
                                <Download size={15} />{' '}
                                {downloadingId === docId
                                  ? 'Downloading...'
                                  : 'Download'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </fieldset>

                  {/* 🆕 DYNAMIC DOCUMENT ROWS — with Add Another button */}
                  <fieldset className="employee-permissions-section employee-full-width">
                    <legend>Upload new documents</legend>
                    <p>
                      Add one or more documents. Each row has its own title,
                      category and file. Max {MAX_FILES} files, 25 MB each.
                    </p>

                    <div className="doc-upload-rows">
                      {newDocRows.map((row, index) => (
                        <div key={row.key} className="doc-upload-row">
                          <div className="doc-upload-row-header">
                            <span>Document #{index + 1}</span>
                            {newDocRows.length > 1 && (
                              <button
                                type="button"
                                className="icon-button"
                                onClick={() => removeNewDocRow(row.key)}
                                title="Remove this document"
                                aria-label="Remove this document"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>

                          <div className="employee-form-grid">
                            <label>
                              Title
                              <input
                                type="text"
                                value={row.title}
                                onChange={event =>
                                  updateNewDocRow(row.key, {
                                    title: event.target.value
                                  })
                                }
                                placeholder={
                                  row.file
                                    ? row.file.name
                                    : 'Optional — uses file name if blank'
                                }
                                maxLength={150}
                              />
                            </label>

                            <label>
                              Category
                              <select
                                value={row.category}
                                onChange={event =>
                                  updateNewDocRow(row.key, {
                                    category: event.target.value
                                  })
                                }
                              >
                                <option value="IDENTITY">Identity</option>
                                <option value="EDUCATION">Education</option>
                                <option value="EXPERIENCE">Experience</option>
                                <option value="CONTRACT">Contract</option>
                                <option value="OTHER">Other</option>
                              </select>
                            </label>

                            <label className="employee-full-width">
                              File (max 25 MB)
                              <input
                                className="employee-document-file-input"
                                type="file"
                                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                onChange={event =>
                                  updateNewDocRow(row.key, {
                                    file: event.target.files?.[0] || null
                                  })
                                }
                              />
                              {row.file && (
                                <small>
                                  Selected: <strong>{row.file.name}</strong> (
                                  {(row.file.size / 1024).toFixed(1)} KB)
                                </small>
                              )}
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <button
                        type="button"
                        className="employee-btn employee-btn-secondary"
                        onClick={addNewDocRow}
                        disabled={newDocRows.length >= MAX_FILES}
                      >
                        <Plus size={16} /> Add another document
                        {newDocRows.length >= MAX_FILES &&
                          ` (max ${MAX_FILES})`}
                      </button>
                      {rowsWithFilesCount > 0 && (
                        <small style={{ marginLeft: 8 }}>
                          {rowsWithFilesCount} document(s) ready to upload
                        </small>
                      )}
                    </div>
                  </fieldset>

                  <fieldset className="employee-permissions-section">
                    <legend>Employee access permissions</legend>
                    <p>
                      Permissions belong to this employee and are independent of
                      their job title.
                    </p>
                    <div className="employee-permissions-grid">
                      {availablePermissions.length ? (
                        availablePermissions.map(([permission, label]) => (
                          <label key={permission}>
                            <input
                              type="checkbox"
                              checked={formData.permissions.includes(permission)}
                              onChange={event =>
                                setFormData(previous => ({
                                  ...previous,
                                  permissions: event.target.checked
                                    ? [
                                        ...new Set([
                                          ...previous.permissions,
                                          permission
                                        ])
                                      ]
                                    : previous.permissions.filter(
                                        item => item !== permission
                                      )
                                }))
                              }
                            />
                            <span>{label}</span>
                          </label>
                        ))
                      ) : (
                        <p>
                          No permissions are delegated to your account to
                          assign.
                        </p>
                      )}
                    </div>
                  </fieldset>
                </div>

                <footer className="employee-modal-actions">
                  <button
                    type="button"
                    className="employee-btn employee-btn-secondary"
                    onClick={() => {
                      setEditing(false);
                      setNewDocRows([newDocRow('IDENTITY')]);
                      setError('');
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="employee-btn employee-btn-primary"
                    disabled={saving}
                  >
                    <Save size={16} />
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </footer>
              </form>
            ) : (
              <>
                <div className="employee-details-grid">
                  <Detail
                    icon={UserRound}
                    label="Employee code"
                    value={selectedEmployee.employeeCode}
                  />

                  <Detail
                    icon={Mail}
                    label="Email"
                    value={selectedEmployee.email}
                  />

                  <Detail
                    icon={Phone}
                    label="Phone"
                    value={selectedEmployee.phone}
                  />

                  <Detail
                    icon={CalendarDays}
                    label="Joining Date"
                    value={niceDate(selectedEmployee.joiningDate)}
                  />

                  <Detail icon={UserRoundCheck} label="Employment status" value={selectedEmployee.status || '—'} />

                  <Detail
                    icon={Building2}
                    label="Branch"
                    value={
                      selectedEmployee.branch?.name ||
                      selectedEmployee.branchId?.name
                    }
                  />

                  <Detail
                    icon={BriefcaseBusiness}
                    label="Department"
                    value={
                      selectedEmployee.department?.name ||
                      selectedEmployee.departmentId?.name
                    }
                  />

                  <Detail
                    icon={UserRound}
                    label="Account Role"
                    value={roleLabel(selectedEmployee.role)}
                  />

                  <Detail
                    icon={UserRound}
                    label="Job Role"
                    value={selectedEmployee.customRole?.name || '—'}
                  />

                  <Detail
                    icon={Clock}
                    label="Shift"
                    value={
                      selectedEmployee.shift?.name
                        ? `${selectedEmployee.shift.name} (${selectedEmployee.shift.startTime}–${selectedEmployee.shift.endTime})`
                        : selectedEmployee.shiftId?.name
                          ? `${selectedEmployee.shiftId.name} (${selectedEmployee.shiftId.startTime}–${selectedEmployee.shiftId.endTime})`
                          : '—'
                    }
                  />

                  <Detail
                    icon={IndianRupee}
                    label="Salary"
                    value={
                      selectedEmployee.salaryAmount != null
                        ? `${selectedEmployee.salaryAmount} INR`
                        : '—'
                    }
                  />

                  <Detail
                    icon={Clock}
                    label="Experience"
                    value={
                      selectedEmployee.experienceYears > 0
                        ? `${selectedEmployee.experienceYears} years`
                        : 'No previous experience'
                    }
                  />

                  <div className="employee-detail-item employee-permissions-detail">
                    <div className="employee-detail-icon"><ShieldCheck size={17} /></div>
                    <div className="employee-detail-content"><span>Assigned permissions</span><strong>{Array.isArray(selectedEmployee.permissions) && selectedEmployee.permissions.length ? selectedEmployee.permissions.join(', ') : 'No additional permissions'}</strong></div>
                  </div>

                  {selectedEmployee.hasPreviousExperience && (
                    <>
                      <Detail
                        icon={Building2}
                        label="Previous company"
                        value={selectedEmployee.previousCompanyName}
                      />
                      <Detail
                        icon={CalendarDays}
                        label="Previous company leaving date"
                        value={niceDate(
                          selectedEmployee.previousCompanyLeavingDate
                        )}
                      />
                      <Detail
                        icon={FileText}
                        label="Reason for leaving"
                        value={selectedEmployee.previousCompanyLeavingReason}
                      />
                    </>
                  )}
                </div>

                {/* 🆕 Documents with download in view mode */}
                <div className="employee-documents-view">
                  <h4>Documents</h4>
                  {docsLoading ? (
                    <p>Loading documents...</p>
                  ) : employeeDocs.length === 0 ? (
                    <p>No documents uploaded yet.</p>
                  ) : (
                    <ul className="employee-doc-list">
                      {employeeDocs.map(doc => {
                        const docId = doc.id || doc._id;
                        return (
                          <li key={docId} className="employee-doc-item">
                            <div>
                              <Fingerprint size={16} />{' '}
                              <strong>
                                {doc.title || doc.fileName || 'Document'}
                              </strong>
                              <span>
                                {' '}
                                · {doc.category || 'OTHER'}
                                {doc.size
                                  ? ` · ${(doc.size / 1024).toFixed(1)} KB`
                                  : ''}
                              </span>
                            </div>
                            {String(doc.fileName || doc.title || '').toLowerCase().endsWith('.pdf') && <button
                              type="button"
                              className="employee-btn employee-btn-secondary"
                              onClick={async () => {
                                try {
                                  if (!doc.storageKey) throw new Error('File location is unavailable.');
                                  const blob = await fetchFileBlob(`/uploads/${encodeURIComponent(doc.storageKey)}/preview`);
                                  const url = URL.createObjectURL(blob);
                                  window.open(url, '_blank', 'noopener,noreferrer');
                                  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
                                } catch (err) { notify?.(err.message || 'Preview failed.', 'error'); }
                              }}
                            >
                              <Eye size={15} /> Preview
                            </button>}
                            <button
                              type="button"
                              className="employee-btn employee-btn-secondary"
                              onClick={() => downloadDocument(doc)}
                              disabled={downloadingId === docId}
                            >
                              <Download size={15} />{' '}
                              {downloadingId === docId
                                ? 'Downloading...'
                                : 'Download'}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {deleting && (
                  <div className="employee-delete-confirm">
                    <strong>Deactivate this employee?</strong>

                    <p>
                      The account will become inactive. Historical attendance,
                      salary and task records will be retained.
                    </p>

                    <div className="employee-modal-actions">
                      <button
                        type="button"
                        className="employee-btn employee-btn-secondary"
                        onClick={() => {
                          setDeleting(false);
                          setError('');
                        }}
                        disabled={saving}
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        className="employee-btn employee-btn-danger"
                        onClick={handleDelete}
                        disabled={saving}
                      >
                        <UserRoundX size={16} />
                        {saving ? 'Deactivating...' : 'Confirm Deactivation'}
                      </button>
                    </div>
                  </div>
                )}

                {!deleting && (
                  <footer className="employee-modal-actions">
                    {canEditEmployee(selectedEmployee) &&
                      selectedEmployee.status === 'ACTIVE' && (
                        <button
                          type="button"
                          className="employee-btn employee-btn-danger"
                          onClick={() => {
                            setDeleting(true);
                            setError('');
                            setSuccess('');
                          }}
                          disabled={saving}
                        >
                          <UserRoundX size={16} />
                          Deactivate
                        </button>
                      )}
                    {canEditEmployee(selectedEmployee) &&
                      selectedEmployee.status !== 'ACTIVE' && (
                        <button
                          type="button"
                          className="employee-btn employee-btn-primary"
                          onClick={() => reactivateEmployee(selectedEmployee)}
                          disabled={saving}
                        >
                          <UserRoundCheck size={16} />
                          Activate
                        </button>
                      )}

                    {canEditEmployee(selectedEmployee) && (
                      <button
                        type="button"
                        className="employee-btn employee-btn-primary"
                        onClick={() => {
                          setEditing(true);
                          setError('');
                          setSuccess('');
                          setDeleting(false);
                        }}
                        disabled={saving}
                      >
                        <Pencil size={16} />
                        Edit Employee
                      </button>
                    )}
                  </footer>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function Detail({ icon: Icon, label, value }) {
  return (
    <div className="employee-detail-item">
      <div className="employee-detail-icon">
        <Icon size={17} />
      </div>

      <div className="employee-detail-content">
        <span>{label}</span>
        <strong>{value || '—'}</strong>
      </div>
    </div>
  );
}