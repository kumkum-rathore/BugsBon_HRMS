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

// Roles that must NEVER appear in the employee directory
const EXCLUDED_FROM_DIRECTORY = ['BRANCH_ADMIN', 'SUPER_ADMIN'];

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function newDocRow(defaultCategory = 'IDENTITY') {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: '',
    category: defaultCategory,
    file: null
  };
}

function getId(value) {
  if (!value) return '';

  if (typeof value === 'object') {
    return String(value._id || value.id || '');
  }

  return String(value);
}

function getApiList(response, type) {
  const data = response?.data;

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.[type])) return data[type];
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.items)) return data.data.items;

  return [];
}

function getRoleDepartmentId(role) {
  return getId(
    role?.departmentId ||
    role?.department ||
    role?.department_id
  );
}

// --------------------------------------------------
// EMPLOYEE ID HELPER
// --------------------------------------------------

function getEmployeeId(employee) {
  return employee?.id || employee?._id;
}

// --------------------------------------------------
// INTERN HELPERS
// --------------------------------------------------

function isUnpaidIntern(employee) {
  return (
    employee?.employmentType === 'INTERN' &&
    employee?.internPaymentType === 'UNPAID'
  );
}

function employmentTypeLabel(employee) {
  if (employee?.employmentType === 'INTERN') {
    return employee?.internPaymentType === 'UNPAID'
      ? 'Intern (Unpaid)'
      : 'Intern (Paid)';
  }
  return 'Employee';
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
  // --------------------------------------------------
  // EMPLOYEE STATES
  // --------------------------------------------------

  const [employeeRows, setEmployeeRows] = useState(() =>
    (employees || []).filter(
      emp => !EXCLUDED_FROM_DIRECTORY.includes(emp?.role)
    )
  );

  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // --------------------------------------------------
  // FILTER STATES
  // --------------------------------------------------

  const [nameFilter, setNameFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState('ALL');

  // --------------------------------------------------
  // MASTER DEPARTMENT AND ROLE STATES
  // --------------------------------------------------

  const [localDepartments, setLocalDepartments] = useState([]);
  const [allRoles, setAllRoles] = useState([]);
  const [masterDataLoading, setMasterDataLoading] = useState(false);

  // --------------------------------------------------
  // DOCUMENT STATES
  // --------------------------------------------------

  const [newDocRows, setNewDocRows] = useState([
    newDocRow('IDENTITY')
  ]);

  const [employeeDocs, setEmployeeDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  // --------------------------------------------------
  // DEPARTMENT MODAL STATES
  // --------------------------------------------------

  const [showDeptModal, setShowDeptModal] = useState(false);
  const [deptForm, setDeptForm] = useState({
    name: '',
    description: ''
  });
  const [deptSaving, setDeptSaving] = useState(false);

  // --------------------------------------------------
  // EMPLOYEE FORM
  // --------------------------------------------------

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
    role: '',
    employmentType: 'EMPLOYEE',   // NEW
    internPaymentType: ''         // NEW
  });

  // --------------------------------------------------
  // PERMISSIONS
  // --------------------------------------------------

  const canEdit = user?.permissions?.includes('employee.update');

  const canEditEmployee = employee =>
    canEdit &&
    !(
      user?.role === 'BRANCH_ADMIN' &&
      String(getEmployeeId(employee)) === String(user.id)
    );

  // --------------------------------------------------
  // UPDATE EMPLOYEE ROWS
  // --------------------------------------------------

  useEffect(() => {
    const directoryOnly = (employees || []).filter(
      emp => !EXCLUDED_FROM_DIRECTORY.includes(emp?.role)
    );

    setEmployeeRows(directoryOnly);

    setSelectedEmployee(previous => {
      if (!previous) return previous;

      const stillExists = directoryOnly.some(
        emp =>
          String(getEmployeeId(emp)) ===
          String(getEmployeeId(previous))
      );

      return stillExists ? previous : null;
    });
  }, [employees]);

  // --------------------------------------------------
  // LOAD ALL DEPARTMENTS AND ROLES
  // --------------------------------------------------

  useEffect(() => {
    let mounted = true;

    async function loadMasterData() {
      setMasterDataLoading(true);

      try {
        const [departmentResponse, roleResponse] = await Promise.all([
          api('/departments'),
          api('/roles')
        ]);

        if (!mounted) return;

        const departmentList = getApiList(
          departmentResponse,
          'departments'
        );

        const roleList = getApiList(
          roleResponse,
          'roles'
        );

        const formattedDepartments = departmentList
          .filter(department => !department.isArchived)
          .map(department => ({
            ...department,
            id: getId(department)
          }))
          .filter(department => department.id)
          .sort((a, b) =>
            (a.name || '').localeCompare(b.name || '')
          );

        const formattedRoles = roleList
          .filter(role => !role.isArchived)
          .map(role => ({
            ...role,
            id: getId(role),
            departmentId: getRoleDepartmentId(role)
          }))
          .filter(role => role.id && role.name)
          .sort((a, b) =>
            (a.name || '').localeCompare(b.name || '')
          );

        setLocalDepartments(formattedDepartments);
        setAllRoles(formattedRoles);

      } catch (err) {
        console.error('Master data loading error:', err);

        if (mounted) {
          notify?.(
            err.message || 'Unable to load departments and roles.',
            'error'
          );
        }
      } finally {
        if (mounted) {
          setMasterDataLoading(false);
        }
      }
    }

    loadMasterData();

    return () => {
      mounted = false;
    };
  }, []);

  // --------------------------------------------------
  // DEPARTMENTS
  // --------------------------------------------------

  const departments = localDepartments;

  // --------------------------------------------------
  // DEPARTMENT-WISE ROLES
  // --------------------------------------------------

  const departmentRoles = allRoles.reduce((map, role) => {
    const deptId = role.departmentId;

    if (!deptId) return map;

    if (!map[deptId]) {
      map[deptId] = [];
    }

    map[deptId].push({
      id: role.id,
      name: role.name
    });

    return map;
  }, {});

  // --------------------------------------------------
  // EDIT FORM ROLES
  // --------------------------------------------------

  const formRoles = formData.departmentId
    ? departmentRoles[String(formData.departmentId)] || []
    : [];

  // --------------------------------------------------
  // FILTER ROLES
  // --------------------------------------------------

  const filterRoles =
    departmentFilter !== 'ALL'
      ? departmentRoles[String(departmentFilter)] || []
      : [];

  // --------------------------------------------------
  // FILTERED EMPLOYEES
  // --------------------------------------------------

  const filtered = employeeRows.filter(employee => {
    if (EXCLUDED_FROM_DIRECTORY.includes(employee?.role)) {
      return false;
    }

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

    const departmentId = getId(employee.departmentId);
    const employeeRoleId = getId(employee.customRole);

    return (
      searchText.includes(query.toLowerCase()) &&

      `${employee.firstName || ''} ${employee.lastName || ''}`
        .toLowerCase()
        .includes(nameFilter.toLowerCase()) &&

      (
        departmentFilter === 'ALL' ||
        departmentId === departmentFilter
      ) &&

      (
        roleFilter === 'ALL' ||
        employeeRoleId === roleFilter
      ) &&

      (
        statusFilter === 'ALL' ||
        employee.status === statusFilter
      ) &&

      (
        employmentTypeFilter === 'ALL' ||
        (employee.employmentType || 'EMPLOYEE') === employmentTypeFilter
      )
    );
  });

  // --------------------------------------------------
  // DOCUMENT HELPERS
  // --------------------------------------------------

  function addNewDocRow() {
    if (newDocRows.length >= MAX_FILES) return;

    setNewDocRows(previous => [
      ...previous,
      newDocRow(previous[0]?.category || 'IDENTITY')
    ]);
  }

  function removeNewDocRow(key) {
    setNewDocRows(previous => {
      if (previous.length === 1) {
        return [
          newDocRow(previous[0]?.category || 'IDENTITY')
        ];
      }

      return previous.filter(row => row.key !== key);
    });
  }

  function updateNewDocRow(key, patch) {
    setNewDocRows(previous =>
      previous.map(row =>
        row.key === key
          ? { ...row, ...patch }
          : row
      )
    );
  }

  // --------------------------------------------------
  // LOAD EMPLOYEE DOCUMENTS
  // --------------------------------------------------

  async function loadDocuments(employeeId) {
    if (!employeeId) return;

    setDocsLoading(true);

    try {
      const response = await api(
        `/documents?userId=${encodeURIComponent(employeeId)}`
      );

      const list = Array.isArray(response.data)
        ? response.data
        : response.data?.items || [];

      setEmployeeDocs(list);

    } catch (err) {
      setEmployeeDocs([]);
    } finally {
      setDocsLoading(false);
    }
  }

  // --------------------------------------------------
  // DOWNLOAD DOCUMENT
  // --------------------------------------------------

  async function downloadDocument(doc) {
    const id = doc.id || doc._id;

    setDownloadingId(id);

    try {
      if (!doc.storageKey) {
        throw new Error('File location is unavailable.');
      }

      await downloadFile(
        `/uploads/${encodeURIComponent(doc.storageKey)}`,
        doc.fileName || doc.title || 'document'
      );

    } catch (err) {
      if (notify) {
        notify(err.message || 'Failed to download document.', 'error');
      } else {
        setError(err.message || 'Failed to download document.');
      }
    } finally {
      setDownloadingId(null);
    }
  }

  // --------------------------------------------------
  // OPEN EMPLOYEE DETAILS
  // --------------------------------------------------

  function openDetails(
    employee,
    startEditing = false,
    confirmDeactivate = false
  ) {
    if (EXCLUDED_FROM_DIRECTORY.includes(employee?.role)) {
      return;
    }

    setSelectedEmployee(employee);

    setFormData({
      firstName: employee.firstName || '',
      lastName: employee.lastName || '',
      email: employee.email || '',
      phone: employee.phone || '',

      joiningDate: employee.joiningDate
        ? String(employee.joiningDate).slice(0, 10)
        : '',

      shiftId: getId(employee.shiftId),

      salaryAmount: employee.salaryAmount ?? 0,
      status: employee.status || 'ACTIVE',

      experienceYears: employee.experienceYears ?? 0,

      hasPreviousExperience:
        employee.hasPreviousExperience || false,

      previousCompanyName:
        employee.previousCompanyName || '',

      previousCompanyLeavingDate:
        employee.previousCompanyLeavingDate
          ? String(employee.previousCompanyLeavingDate).slice(0, 10)
          : '',

      previousCompanyLeavingReason:
        employee.previousCompanyLeavingReason || '',

      permissions: employee.permissions || [],

      departmentId: getId(employee.departmentId),

      customRoleId: getId(employee.customRole),

      role: employee.role || '',

      employmentType: employee.employmentType || 'EMPLOYEE',   // NEW
      internPaymentType: employee.internPaymentType || ''      // NEW
    });

    setNewDocRows([newDocRow('IDENTITY')]);

    setEditing(startEditing);
    setDeleting(confirmDeactivate);

    setError('');
    setSuccess('');

    loadDocuments(getEmployeeId(employee));
  }

  // --------------------------------------------------
  // CLOSE DETAILS
  // --------------------------------------------------

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

  // --------------------------------------------------
  // HANDLE FORM CHANGE
  // --------------------------------------------------

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData(previous => ({
      ...previous,
      [name]: value
    }));
  }

  // --------------------------------------------------
  // SAVE EMPLOYEE
  // --------------------------------------------------

  async function handleSave(event) {
    event.preventDefault();

    if (!canEditEmployee(selectedEmployee)) {
      setError(
        'You do not have permission to update employee records.'
      );
      return;
    }

    const id = getEmployeeId(selectedEmployee);

    if (!id) {
      setError('Employee ID is missing.');
      return;
    }

    if (
      !formData.firstName.trim() ||
      formData.firstName.trim().length < 2
    ) {
      setError('First name must be at least 2 characters.');
      return;
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)
    ) {
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
      (
        !formData.previousCompanyName.trim() ||
        !formData.previousCompanyLeavingDate ||
        !formData.previousCompanyLeavingReason.trim()
      )
    ) {
      setError('Complete all previous experience details.');
      return;
    }

    // ✅ Intern validations
    if (formData.employmentType === 'INTERN' && !formData.internPaymentType) {
      setError('Please select Paid or Unpaid for the intern.');
      return;
    }

    const unpaidIntern =
      formData.employmentType === 'INTERN' &&
      formData.internPaymentType === 'UNPAID';

    if (
      !unpaidIntern &&
      formData.employmentType === 'INTERN' &&
      formData.internPaymentType === 'PAID' &&
      (Number(formData.salaryAmount) || 0) <= 0
    ) {
      setError('Paid interns must have a salary greater than 0.');
      return;
    }

    const rowsWithFiles = newDocRows.filter(row => row.file);

    if (rowsWithFiles.length > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} documents per upload.`);
      return;
    }

    const unsupported = rowsWithFiles.find(
      row => !/\.(pdf|doc|docx)$/i.test(row.file.name)
    );

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

        salaryAmount: unpaidIntern
          ? 0
          : Number(formData.salaryAmount) || 0,
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

        role: formData.role || undefined,

        employmentType: formData.employmentType,
        internPaymentType:
          formData.employmentType === 'INTERN'
            ? formData.internPaymentType
            : null
      };

      const result = await api(
        `/employees/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload)
        }
      );

      const updatedEmployee = result.data;

      // UPLOAD DOCUMENTS

      if (rowsWithFiles.length > 0) {
        const formDataObj = new FormData();

        rowsWithFiles.forEach(row => {
          formDataObj.append('file', row.file);
        });

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

        notify?.(`${uploadedFiles.length} document(s) uploaded.`);

        await loadDocuments(id);
      }

      setNewDocRows([newDocRow('IDENTITY')]);

      const becomesExcluded = EXCLUDED_FROM_DIRECTORY.includes(
        updatedEmployee?.role
      );

      setEmployeeRows(previous => {
        if (becomesExcluded) {
          return previous.filter(
            employee =>
              String(getEmployeeId(employee)) !== String(id)
          );
        }

        return previous.map(employee =>
          String(getEmployeeId(employee)) === String(id)
            ? {
                ...employee,
                ...updatedEmployee,
                id: updatedEmployee.id || employee.id,
                branch: employee.branch,
                customRole: updatedEmployee.customRole ||
                  employee.customRole
              }
            : employee
        );
      });

      if (becomesExcluded) {
        setSelectedEmployee(null);
        setEditing(false);
        setDeleting(false);
        setSuccess(
          result.message || 'Employee updated successfully.'
        );
        if (onRefresh) await onRefresh();
        return;
      }

      setSelectedEmployee(previous => ({
        ...previous,
        ...updatedEmployee,
        id: updatedEmployee.id || previous.id,
        branch: previous.branch,
        customRole: updatedEmployee.customRole ||
          previous.customRole
      }));

      setFormData(previous => ({
        ...previous,

        firstName:
          updatedEmployee.firstName ?? previous.firstName,

        lastName:
          updatedEmployee.lastName ?? previous.lastName,

        email:
          updatedEmployee.email ?? previous.email,

        phone:
          updatedEmployee.phone ?? previous.phone,

        joiningDate: updatedEmployee.joiningDate
          ? String(updatedEmployee.joiningDate).slice(0, 10)
          : previous.joiningDate,

        shiftId: getId(updatedEmployee.shiftId) ||
          previous.shiftId,

        salaryAmount:
          updatedEmployee.salaryAmount ?? previous.salaryAmount,

        status:
          updatedEmployee.status ?? previous.status,

        experienceYears:
          updatedEmployee.experienceYears ?? previous.experienceYears,

        hasPreviousExperience:
          updatedEmployee.hasPreviousExperience ??
          previous.hasPreviousExperience,

        previousCompanyName:
          updatedEmployee.previousCompanyName ??
          previous.previousCompanyName,

        previousCompanyLeavingDate:
          updatedEmployee.previousCompanyLeavingDate
            ? String(updatedEmployee.previousCompanyLeavingDate).slice(0, 10)
            : '',

        previousCompanyLeavingReason:
          updatedEmployee.previousCompanyLeavingReason ??
          previous.previousCompanyLeavingReason,

        permissions:
          updatedEmployee.permissions ?? previous.permissions,

        departmentId:
          getId(updatedEmployee.departmentId) ||
          previous.departmentId,

        customRoleId:
          getId(updatedEmployee.customRole) ||
          previous.customRoleId,

        role:
          updatedEmployee.role ?? previous.role,

        employmentType:
          updatedEmployee.employmentType ?? previous.employmentType,

        internPaymentType:
          updatedEmployee.internPaymentType ?? previous.internPaymentType
      }));

      setEditing(false);
      setDeleting(false);

      setSuccess(
        result.message || 'Employee updated successfully.'
      );

      if (onRefresh) {
        await onRefresh();
      }

    } catch (err) {
      setError(err.message || 'Failed to update employee.');
    } finally {
      setSaving(false);
    }
  }

  // --------------------------------------------------
  // DEACTIVATE EMPLOYEE
  // --------------------------------------------------

  async function handleDelete() {
    if (!canEditEmployee(selectedEmployee)) {
      setError(
        'Only a Branch Admin can deactivate employee accounts.'
      );
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
      const result = await api(
        `/employees/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'INACTIVE'
          })
        }
      );

      const updatedEmployee = result.data;

      setEmployeeRows(previous =>
        previous.map(employee =>
          String(getEmployeeId(employee)) === String(id)
            ? {
                ...employee,
                ...updatedEmployee,
                branch: employee.branch,
                customRole: updatedEmployee.customRole ||
                  employee.customRole
              }
            : employee
        )
      );

      setSelectedEmployee(previous => ({
        ...previous,
        ...updatedEmployee,
        branch: previous.branch,
        customRole: updatedEmployee.customRole ||
          previous.customRole
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

      notify?.('Employee deactivated.');

    } catch (err) {
      setError(err.message || 'Failed to deactivate employee.');
    } finally {
      setSaving(false);
    }
  }

  // --------------------------------------------------
  // ARCHIVE EMPLOYEE
  // --------------------------------------------------

  async function archiveEmployee(employee) {
    if (!canEditEmployee(employee)) return;

    if (EXCLUDED_FROM_DIRECTORY.includes(employee?.role)) return;

    const id = getEmployeeId(employee);

    if (
      !id ||
      !window.confirm(
        `Archive ${employee.firstName} ${employee.lastName}? This hides the employee from the directory while retaining HR history.`
      )
    ) {
      return;
    }

    setSaving(true);

    try {
      const result = await api(
        `/employees/${encodeURIComponent(id)}/archive`,
        {
          method: 'DELETE'
        }
      );

      setEmployeeRows(previous =>
        previous.filter(
          row => String(getEmployeeId(row)) !== String(id)
        )
      );

      if (
        String(getEmployeeId(selectedEmployee)) === String(id)
      ) {
        closeDetails();
      }

      notify?.(result.message || 'Employee archived.');

      if (onRefresh) {
        await onRefresh();
      }

    } catch (err) {
      if (notify) {
        notify(err.message || 'Failed to archive employee.', 'error');
      } else {
        setError(err.message || 'Failed to archive employee.');
      }
    } finally {
      setSaving(false);
    }
  }

  // --------------------------------------------------
  // REACTIVATE EMPLOYEE
  // --------------------------------------------------

  async function reactivateEmployee(employee) {
    if (!canEditEmployee(employee)) return;

    if (EXCLUDED_FROM_DIRECTORY.includes(employee?.role)) return;

    const id = getEmployeeId(employee);

    if (!id) return;

    setSaving(true);

    try {
      const result = await api(
        `/employees/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'ACTIVE'
          })
        }
      );

      const updatedEmployee = result.data;

      setEmployeeRows(previous =>
        previous.map(row =>
          String(getEmployeeId(row)) === String(id)
            ? {
                ...row,
                ...updatedEmployee,
                branch: row.branch,
                customRole: updatedEmployee.customRole ||
                  row.customRole
              }
            : row
        )
      );

      if (
        String(getEmployeeId(selectedEmployee)) === String(id)
      ) {
        setSelectedEmployee(previous => ({
          ...previous,
          ...updatedEmployee
        }));

        setFormData(previous => ({
          ...previous,
          status: 'ACTIVE'
        }));
      }

      notify?.('Employee reactivated.');

      if (onRefresh) {
        await onRefresh();
      }

    } catch (err) {
      if (notify) {
        notify(err.message || 'Unable to reactivate employee.', 'error');
      } else {
        setError(err.message || 'Unable to reactivate employee.');
      }
    } finally {
      setSaving(false);
    }
  }

  // --------------------------------------------------
  // AVAILABLE PERMISSIONS
  // --------------------------------------------------

  const availablePermissions = PERMISSION_OPTIONS.filter(
    ([permission]) =>
      (user?.permissions || []).includes(permission)
  );

  const rowsWithFilesCount = newDocRows.filter(
    row => row.file
  ).length;

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------

  return (
    <>
      <div className="panel data-panel">

        <div className="panel-heading">
          <div>
            <h3>All employees</h3>
            <p>Your people directory and account status</p>
          </div>

          <span className="count-pill">
            {employeeRows.length} people
          </span>
        </div>

        {/* FILTERS */}

        <div className="employee-directory-filters">

          <input
            type="search"
            value={nameFilter}
            onChange={event =>
              setNameFilter(event.target.value)
            }
            placeholder="Search employee name"
            aria-label="Search employee name"
          />

          {/* DEPARTMENT FILTER */}

          <select
            value={departmentFilter}
            onChange={event => {
              setDepartmentFilter(event.target.value);
              setRoleFilter('ALL');
            }}
            aria-label="Filter by department"
          >
            <option value="ALL">
              All departments
            </option>

            {departments.map(department => (
              <option
                key={department.id}
                value={department.id}
              >
                {department.name}
              </option>
            ))}
          </select>

          {/* ROLE FILTER */}

          <select
            value={roleFilter}
            onChange={event =>
              setRoleFilter(event.target.value)
            }
            aria-label="Filter by role"
            disabled={departmentFilter === 'ALL'}
          >
            <option value="ALL">
              {departmentFilter === 'ALL'
                ? 'Select department first'
                : 'All roles'}
            </option>

            {filterRoles.map(role => (
              <option
                key={role.id}
                value={role.id}
              >
                {role.name}
              </option>
            ))}
          </select>

          {/* STATUS FILTER */}

          <select
            value={statusFilter}
            onChange={event =>
              setStatusFilter(event.target.value)
            }
            aria-label="Filter by status"
          >
            <option value="ALL">All statuses</option>

            {[
              'ACTIVE',
              'INACTIVE',
              'INVITED',
              'SUSPENDED'
            ].map(status => (
              <option key={status} value={status}>
                {status[0] + status.slice(1).toLowerCase()}
              </option>
            ))}
          </select>

          {/* EMPLOYMENT TYPE FILTER */}

          <select
            value={employmentTypeFilter}
            onChange={event =>
              setEmploymentTypeFilter(event.target.value)
            }
            aria-label="Filter by account type"
          >
            <option value="ALL">All account types</option>
            <option value="EMPLOYEE">Employees</option>
            <option value="INTERN">Interns</option>
          </select>

        </div>

        {loading ? (
          <LoadingRows />
        ) : filtered.length > 0 ? (

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>EMPLOYEE</th>

                  {user?.role === 'SUPER_ADMIN' && (
                    <th>BRANCH</th>
                  )}

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
                            {employee.employmentType === 'INTERN' && (
                              <span
                                style={{
                                  marginLeft: 8,
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background:
                                    employee.internPaymentType === 'UNPAID'
                                      ? '#fdecea'
                                      : '#e8f5e9',
                                  color:
                                    employee.internPaymentType === 'UNPAID'
                                      ? '#b71c1c'
                                      : '#1b5e20'
                                }}
                              >
                                Intern · {employee.internPaymentType === 'UNPAID' ? 'Unpaid' : 'Paid'}
                              </span>
                            )}
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
                        {employee.customRole?.name ||
                          roleLabel(employee.role)}
                      </span>
                    </td>

                    <td>
                      {niceDate(employee.joiningDate)}
                    </td>

                    <td>
                      <Status value={employee.status} />
                    </td>

                    <td>
                      <div
                        className="employee-row-actions"
                        onClick={event =>
                          event.stopPropagation()
                        }
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
                              onClick={() =>
                                openDetails(employee, true)
                              }
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
                                onClick={() =>
                                  reactivateEmployee(employee)
                                }
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
                              onClick={() =>
                                archiveEmployee(employee)
                              }
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

      {/* EMPLOYEE DETAILS MODAL */}

      {selectedEmployee && !EXCLUDED_FROM_DIRECTORY.includes(selectedEmployee.role) && (
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
                  {editing
                    ? 'Edit Employee'
                    : 'Employee Details'}
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

            {/* PROFILE */}

            <div className="employee-profile">
              <div className="avatar avatar-soft employee-large-avatar">
                {initials(selectedEmployee)}
              </div>

              <div className="employee-profile-info">
                <h3>
                  {selectedEmployee.firstName}{' '}
                  {selectedEmployee.lastName}
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

            {/* EDIT FORM */}

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

                      {shifts.map(shift => (
                        <option
                          key={shift.id || shift._id}
                          value={shift.id || shift._id}
                        >
                          {shift.name} ({shift.startTime}–{shift.endTime})
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* ACCOUNT TYPE */}

                  <label>
                    Account type
                    <select
                      name="employmentType"
                      value={formData.employmentType}
                      onChange={event => {
                        const value = event.target.value;
                        setFormData(previous => ({
                          ...previous,
                          employmentType: value,
                          internPaymentType:
                            value === 'INTERN'
                              ? previous.internPaymentType
                              : '',
                          salaryAmount:
                            value === 'INTERN' &&
                            previous.internPaymentType === 'UNPAID'
                              ? 0
                              : previous.salaryAmount
                        }));
                      }}
                    >
                      <option value="EMPLOYEE">Employee</option>
                      <option value="INTERN">Intern</option>
                    </select>
                  </label>

                  {/* INTERN PAYMENT TYPE */}

                  {formData.employmentType === 'INTERN' && (
                    <label>
                      Intern payment type
                      <select
                        name="internPaymentType"
                        value={formData.internPaymentType}
                        onChange={event => {
                          const value = event.target.value;
                          setFormData(previous => ({
                            ...previous,
                            internPaymentType: value,
                            salaryAmount:
                              value === 'UNPAID'
                                ? 0
                                : previous.salaryAmount
                          }));
                        }}
                        required
                      >
                        <option value="">Select payment type</option>
                        <option value="PAID">Paid</option>
                        <option value="UNPAID">Unpaid</option>
                      </select>
                    </label>
                  )}

                  {/* SALARY — hide for unpaid interns */}

                  {!(
                    formData.employmentType === 'INTERN' &&
                    formData.internPaymentType === 'UNPAID'
                  ) && (
                    <label>
                      Salary amount
                      <input
                        name="salaryAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.salaryAmount}
                        onChange={handleChange}
                        required={
                          formData.employmentType === 'INTERN' &&
                          formData.internPaymentType === 'PAID'
                        }
                      />
                    </label>
                  )}

                  {/* UNPAID INTERN INFO */}

                  {formData.employmentType === 'INTERN' &&
                    formData.internPaymentType === 'UNPAID' && (
                      <div
                        className="employee-full-width"
                        style={{
                          padding: '10px 14px',
                          background: '#eef6ff',
                          border: '1px solid #b6d4fe',
                          borderRadius: 8,
                          color: '#0b4a8f',
                          fontSize: 13
                        }}
                      >
                        Unpaid intern selected — no monthly salary will be recorded.
                      </div>
                    )}

                  {/* DEPARTMENT */}

                  <label>
                    Department

                    <select
                      name="departmentId"
                      value={formData.departmentId}
                      onChange={event => {
                        const departmentId = event.target.value;

                        setFormData(previous => ({
                          ...previous,
                          departmentId,
                          customRoleId: '',
                          role: ''
                        }));
                      }}
                    >
                      <option value="">
                        Select a department
                      </option>

                      {departments.map(department => (
                        <option
                          key={department.id}
                          value={department.id}
                        >
                          {department.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* DEPARTMENT-WISE ROLE */}

                  <label>
                    Role

                    <select
                      name="customRoleId"
                      value={formData.customRoleId}
                      onChange={event => {
                        const customRoleId = event.target.value;

                        const picked = formRoles.find(
                          role => role.id === customRoleId
                        );

                        setFormData(previous => ({
                          ...previous,
                          customRoleId,
                          role: picked?.name || ''
                        }));
                      }}
                      disabled={
                        !formData.departmentId ||
                        !formRoles.length
                      }
                      required
                    >
                      <option value="">
                        {!formData.departmentId
                          ? 'Select a department first'
                          : !formRoles.length
                            ? 'No roles in this department'
                            : 'Select a role'}
                      </option>

                      {formRoles.map(role => (
                        <option
                          key={role.id}
                          value={role.id}
                        >
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* EXPERIENCE */}

                  <label>
                    Has previous work experience?

                    <select
                      name="hasPreviousExperience"
                      value={
                        formData.hasPreviousExperience
                          ? 'yes'
                          : 'no'
                      }
                      onChange={event => {
                        const hasPreviousExperience =
                          event.target.value === 'yes';

                        setFormData(previous => ({
                          ...previous,
                          hasPreviousExperience,

                          experienceYears:
                            hasPreviousExperience
                              ? previous.experienceYears || 0.5
                              : 0,

                          previousCompanyName:
                            hasPreviousExperience
                              ? previous.previousCompanyName
                              : '',

                          previousCompanyLeavingDate:
                            hasPreviousExperience
                              ? previous.previousCompanyLeavingDate
                              : '',

                          previousCompanyLeavingReason:
                            hasPreviousExperience
                              ? previous.previousCompanyLeavingReason
                              : ''
                        }));
                      }}
                    >
                      <option value="no">
                        No previous experience
                      </option>

                      <option value="yes">
                        Yes, has previous experience
                      </option>
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

                  {/* STATUS */}

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

                  {/* EXISTING DOCUMENTS */}

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
                            <li
                              key={docId}
                              className="employee-doc-item"
                            >
                              <div>
                                <strong>
                                  {doc.title || doc.fileName || 'Document'}
                                </strong>

                                <span>
                                  {' '}· {doc.category || 'OTHER'}

                                  {doc.size
                                    ? ` · ${(doc.size / 1024).toFixed(1)} KB`
                                    : ''}
                                </span>
                              </div>

                              <button
                                type="button"
                                className="employee-btn employee-btn-secondary"
                                onClick={() =>
                                  downloadDocument(doc)
                                }
                                disabled={downloadingId === docId}
                              >
                                <Download size={15} />

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

                  {/* UPLOAD NEW DOCUMENTS */}

                  <fieldset className="employee-permissions-section employee-full-width">

                    <legend>Upload new documents</legend>

                    <p>
                      Add one or more documents. Each row has its own
                      title, category and file. Max {MAX_FILES} files,
                      25 MB each.
                    </p>

                    <div className="doc-upload-rows">

                      {newDocRows.map((row, index) => (
                        <div
                          key={row.key}
                          className="doc-upload-row"
                        >

                          <div className="doc-upload-row-header">
                            <span>Document #{index + 1}</span>

                            {newDocRows.length > 1 && (
                              <button
                                type="button"
                                className="icon-button"
                                onClick={() =>
                                  removeNewDocRow(row.key)
                                }
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
                                  Selected: <strong>{row.file.name}</strong>
                                  {' '}({(row.file.size / 1024).toFixed(1)} KB)
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
                        <Plus size={16} />

                        Add another document

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

                  {/* EMPLOYEE PERMISSIONS */}

                  <fieldset className="employee-permissions-section">

                    <legend>Employee access permissions</legend>

                    <p>
                      Permissions belong to this employee and are
                      independent of their job title.
                    </p>

                    <div className="employee-permissions-grid">

                      {availablePermissions.length ? (

                        availablePermissions.map(
                          ([permission, label]) => (
                            <label key={permission}>
                              <input
                                type="checkbox"
                                checked={formData.permissions.includes(
                                  permission
                                )}
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
                          )
                        )

                      ) : (
                        <p>
                          No permissions are delegated to your account
                          to assign.
                        </p>
                      )}

                    </div>
                  </fieldset>

                </div>

                {/* SAVE BUTTONS */}

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
                {/* EMPLOYEE DETAILS */}

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

                  <Detail
                    icon={UserRoundCheck}
                    label="Employment status"
                    value={selectedEmployee.status || '—'}
                  />

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

                  {/* <Detail
                    icon={UserRound}
                    label="Account Role"
                    value={roleLabel(selectedEmployee.role)}
                  /> */}

                  <Detail
                    icon={UserRound}
                    label="Job Role"
                    value={selectedEmployee.customRole?.name || '—'}
                  />

                  {/* ✅ NEW: Account type detail */}
                 <Detail
  icon={UserRound}
  label="Account type"
  value={employmentTypeLabel(selectedEmployee)}
/>

<Detail
  icon={UserRound}
  label="Base role"
  value={roleLabel(selectedEmployee.role)}
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

                  {/* ✅ Salary — conditional for unpaid intern */}
                  <Detail
                    icon={IndianRupee}
                    label="Salary"
                    value={
                      isUnpaidIntern(selectedEmployee)
                        ? 'Unpaid intern'
                        : selectedEmployee.salaryAmount != null
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
                    <div className="employee-detail-icon">
                      <ShieldCheck size={17} />
                    </div>

                    <div className="employee-detail-content">
                      <span>Assigned permissions</span>

                      <strong>
                        {Array.isArray(selectedEmployee.permissions) &&
                        selectedEmployee.permissions.length
                          ? selectedEmployee.permissions.join(', ')
                          : 'No additional permissions'}
                      </strong>
                    </div>
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
                        value={
                          selectedEmployee.previousCompanyLeavingReason
                        }
                      />
                    </>
                  )}

                </div>

                {/* DOCUMENTS IN VIEW MODE */}

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
                          <li
                            key={docId}
                            className="employee-doc-item"
                          >

                            <div>
                              <Fingerprint size={16} />

                              <strong>
                                {doc.title || doc.fileName || 'Document'}
                              </strong>

                              <span>
                                {' '}· {doc.category || 'OTHER'}

                                {doc.size
                                  ? ` · ${(doc.size / 1024).toFixed(1)} KB`
                                  : ''}
                              </span>
                            </div>

                            {String(
                              doc.fileName || doc.title || ''
                            ).toLowerCase().endsWith('.pdf') && (

                              <button
                                type="button"
                                className="employee-btn employee-btn-secondary"
                                onClick={async () => {
                                  try {
                                    if (!doc.storageKey) {
                                      throw new Error(
                                        'File location is unavailable.'
                                      );
                                    }

                                    const blob = await fetchFileBlob(
                                      `/uploads/${encodeURIComponent(
                                        doc.storageKey
                                      )}/preview`
                                    );

                                    const url = URL.createObjectURL(blob);

                                    window.open(
                                      url,
                                      '_blank',
                                      'noopener,noreferrer'
                                    );

                                    window.setTimeout(
                                      () => URL.revokeObjectURL(url),
                                      60000
                                    );

                                  } catch (err) {
                                    notify?.(
                                      err.message || 'Preview failed.',
                                      'error'
                                    );
                                  }
                                }}
                              >
                                <Eye size={15} />
                                Preview
                              </button>
                            )}

                            <button
                              type="button"
                              className="employee-btn employee-btn-secondary"
                              onClick={() => downloadDocument(doc)}
                              disabled={downloadingId === docId}
                            >
                              <Download size={15} />

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

                {/* DEACTIVATION CONFIRMATION */}

                {deleting && (
                  <div className="employee-delete-confirm">

                    <strong>
                      Deactivate this employee?
                    </strong>

                    <p>
                      The account will become inactive. Historical
                      attendance, salary and task records will be retained.
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

                        {saving
                          ? 'Deactivating...'
                          : 'Confirm Deactivation'}
                      </button>

                    </div>
                  </div>
                )}

                {/* VIEW MODE ACTIONS */}

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
                          onClick={() =>
                            reactivateEmployee(selectedEmployee)
                          }
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

// --------------------------------------------------
// DETAIL COMPONENT
// --------------------------------------------------

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