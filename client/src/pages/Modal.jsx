import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  LoaderCircle,
  MapPin,
  X,
  Plus,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../lib/api';
import { Field, PasswordField, PhoneInput, SearchableSelect } from '../components/common.jsx';
import { EMPLOYEE_DEFAULT_PERMISSIONS, PERMISSION_OPTIONS } from '../utils/permissions.js';
import {
  COUNTRIES,
  getCitiesForCountryState,
  getStatesForCountry,
} from '../utils/locationOptions.js';

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

function Modal({ type, user, onClose, onSuccess }) {
  const [roleOptions, setRoleOptions] = useState([]);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [shiftOptions, setShiftOptions] = useState([]);
  const [branchCode, setBranchCode] = useState('');
  const [branchCities, setBranchCities] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(false);

  // 🆕 Dynamic employee document rows
  const [employeeDocRows, setEmployeeDocRows] = useState([newDocRow('IDENTITY')]);

  // 🆕 Inline department creation state
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [deptForm, setDeptForm] = useState({ name: '', description: '' });
  const [deptSaving, setDeptSaving] = useState(false);
  const [deptError, setDeptError] = useState('');

  const [form, setForm] = useState(() => {
    if (type === 'branches') {
      return {
        name: '',
        line1: '',
        city: '',
        state: '',
        country: '',
        longitude: '',
        latitude: '',
        geofenceRadiusMeters: '100',
        contactEmail: '',
        timezone: 'Asia/Kolkata',
        contactPhone: '',
        postalCode: '',
        adminFirstName: '',
        adminLastName: '',
        adminEmail: '',
        adminPhone: '',
        adminPassword: '',
        adminPermissions: []
      };
    }

    if (type === 'employees') {
      return {
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        role: 'EMPLOYEE',
        branchId: user.branchId || '',
        customRoleId: '',
        permissions: EMPLOYEE_DEFAULT_PERMISSIONS.filter(permission =>
          (user.permissions || []).includes(permission)
        ),
        departmentId: '',
        shiftId: '',
        phone: '',
        joiningDate: new Date().toISOString().slice(0, 10),
        salaryAmount: '0',
        hasPreviousExperience: false,
        experienceYears: '0',
        previousCompanyName: '',
        previousCompanyLeavingDate: '',
        previousCompanyLeavingReason: '',
        experienceFile: null
      };
    }

    return { leaveType: 'CASUAL', startDate: '', endDate: '', reason: '' };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (type !== 'branches') return undefined;
    let active = true;

    const timeout = window.setTimeout(() => {
      api('/branches/code', {
        method: 'POST',
        body: JSON.stringify({})
      })
        .then(result => {
          if (!active) return;
          setBranchCode(result.data.branchCode);
        })
        .catch(loadError => {
          if (active) setError(loadError.message);
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [type]);

  useEffect(() => {
    if (type !== 'employees' || !user.permissions?.includes('employee.create')) return;
    let active = true;

    Promise.all([
      (
        user.permissions?.includes('role.create') ||
        user.permissions?.includes('employee.create')
      )
        ? api('/roles')
        : Promise.resolve({ data: [] }),
      user.permissions?.some(permission => ['department.view', 'department.create', 'employee.create'].includes(permission))
        ? api('/departments')
        : Promise.resolve({ data: [] }),
      api(`/calendar?month=${new Date().toISOString().slice(0, 7)}`)
    ])
      .then(([roles, departments, calendar]) => {
        if (!active) return;
        setRoleOptions(roles.data || []);
        setDepartmentOptions(departments.data || []);
        setShiftOptions(calendar.data?.shifts || []);
      })
      .catch(loadError => {
        if (active) setError(loadError.message);
      });

    return () => {
      active = false;
    };
  }, [type, user.role]);

  useEffect(() => {
    if (type !== 'branches' || !form.country || !form.state) {
      setBranchCities([]);
      setCitiesLoading(false);
      return undefined;
    }

    let active = true;
    setCitiesLoading(true);
    getCitiesForCountryState(form.country, form.state)
      .then(cities => {
        if (active) setBranchCities(cities);
      })
      .catch(loadError => {
        if (active) setError(loadError.message || 'Unable to load cities.');
      })
      .finally(() => {
        if (active) setCitiesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [type, form.country, form.state]);

  function set(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  const branchStates = type === 'branches'
    ? getStatesForCountry(form.country)
    : [];

  const selectedDepartmentRoles = form.departmentId
    ? roleOptions.filter(role => {
        const deptOfRole =
          role.departmentId?._id ||
          role.departmentId ||
          role.department?._id ||
          role.department;
        return String(deptOfRole) === String(form.departmentId);
      })
    : [];

  // 🆕 Document row helpers
  function addEmployeeDocRow() {
    if (employeeDocRows.length >= MAX_FILES) return;
    setEmployeeDocRows(prev => [...prev, newDocRow(prev[0]?.category || 'IDENTITY')]);
  }

  function removeEmployeeDocRow(key) {
    setEmployeeDocRows(prev => {
      if (prev.length === 1) {
        return [newDocRow(prev[0]?.category || 'IDENTITY')];
      }
      return prev.filter(r => r.key !== key);
    });
  }

  function updateEmployeeDocRow(key, patch) {
    setEmployeeDocRows(prev =>
      prev.map(r => (r.key === key ? { ...r, ...patch } : r))
    );
  }

  // 🆕 Inline department creation
  async function createDepartmentInline() {
    const name = deptForm.name.trim();
    if (!name || name.length < 2) {
      setDeptError('Department name must be at least 2 characters.');
      return;
    }
    if (name.length > 100) {
      setDeptError('Department name cannot exceed 100 characters.');
      return;
    }
    if (deptForm.description.length > 500) {
      setDeptError('Description cannot exceed 500 characters.');
      return;
    }

    setDeptSaving(true);
    setDeptError('');
    try {
      const res = await api('/departments', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description: deptForm.description.trim()
        })
      });

      const created = res.data;
      const newId = String(created._id || created.id);

      // dropdown में तुरंत दिखे
      setDepartmentOptions(prev => {
        const already = prev.some(d => String(d._id || d.id) === newId);
        return already ? prev : [...prev, created];
      });

      // form में auto-select
      setForm(prev => ({
        ...prev,
        departmentId: newId,
        customRoleId: ''
      }));

      setShowDeptModal(false);
      setDeptForm({ name: '', description: '' });
      setDeptError('');
    } catch (err) {
      setDeptError(err.message || 'Failed to create department.');
    } finally {
      setDeptSaving(false);
    }
  }

  function closeDeptModal() {
    if (deptSaving) return;
    setShowDeptModal(false);
    setDeptForm({ name: '', description: '' });
    setDeptError('');
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      let path;
      let body;

      if (type === 'branches') {
        path = '/branches';
        body = {
          name: form.name,
          address: {
            line1: form.line1,
            city: form.city,
            state: form.state,
            country: form.country,
            postalCode: form.postalCode
          },
          officeLocation: {
            type: 'Point',
            coordinates: [Number(form.longitude), Number(form.latitude)]
          },
          geofenceRadiusMeters: Number(form.geofenceRadiusMeters),
          contactEmail: form.contactEmail || undefined,
          contactPhone: form.contactPhone || undefined,
          timezone: form.timezone,
          branchAdmin: {
            firstName: form.adminFirstName,
            lastName: form.adminLastName,
            email: form.adminEmail,
            phone: form.adminPhone || undefined,
            password: form.adminPassword,
            permissions: form.adminPermissions
          }
        };
      } else if (type === 'employees') {
        path = '/employees';
        body = { ...form, shiftId: form.shiftId };
        delete body.experienceFile;
      } else {
        path = '/leaves';
        body = form;
      }

      const result = await api(path, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      // 🆕 Employee documents — ONE upload call for all rows + experience file
      if (type === 'employees') {
        const rowsWithFiles = employeeDocRows.filter(row => row.file);

        const allDocs = [
          ...rowsWithFiles.map(row => ({
            file: row.file,
            category: row.category || 'OTHER',
            title: row.title?.trim() || row.file.name
          })),
          ...(form.experienceFile
            ? [{
                file: form.experienceFile,
                category: 'EXPERIENCE',
                title: form.experienceFile.name
              }]
            : [])
        ];

        if (allDocs.length > MAX_FILES) {
          throw new Error(`Maximum ${MAX_FILES} files per upload.`);
        }

        const oversized = allDocs.find(
          d => d.file && d.file.size > MAX_FILE_SIZE
        );
        if (oversized) {
          throw new Error(`"${oversized.file.name}" exceeds 25 MB.`);
        }

        if (allDocs.length) {
          const fileData = new FormData();
          allDocs.forEach(d => fileData.append('file', d.file));

          const uploadRes = await api('/uploads', {
            method: 'POST',
            body: fileData
          });

          const uploadedList = Array.isArray(uploadRes.data)
            ? uploadRes.data
            : [uploadRes.data];

          await Promise.all(
            uploadedList.map((uploaded, i) => {
              const doc = allDocs[i];
              return api('/documents', {
                method: 'POST',
                body: JSON.stringify({
                  userId: result.data.id,
                  category: doc.category || 'OTHER',
                  title: doc.title || uploaded.fileName,
                  fileName: uploaded.fileName,
                  storageKey: uploaded.storageKey,
                  mimeType: uploaded.mimeType,
                  size: uploaded.size,
                  publicId: uploaded.publicId || '',
                  fileUrl: uploaded.fileUrl || ''
                })
              });
            })
          );
        }
      }

      onSuccess(result.message || 'Saved successfully.');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  const title =
    type === 'branches'
      ? 'Add a branch'
      : type === 'employees'
        ? 'Add an employee'
        : 'Request time off';
  const description =
    type === 'branches'
      ? 'Set up the office, attendance boundary and its Subadmin account.'
      : type === 'employees'
        ? 'Add a team member and assign their shift.'
        : 'Let your manager know when you need time away.';

  const rowsWithFilesCount = employeeDocRows.filter(r => r.file).length;

  return (
    <>
      <div
        className="modal-backdrop"
        onMouseDown={event => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className="modal">
          <div className="modal-head">
            <div>
              <span className="eyebrow">WORKSPACE SETUP</span>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
            <button type="button" className="icon-button" onClick={onClose}>
              <X size={19} />
            </button>
          </div>

          <form onSubmit={submit} className="modal-form">
            {type === 'branches' && (
              <>
                <div className="form-grid">
                  <Field label="Branch code">
                    <input
                      value={branchCode || 'Generating branch code…'}
                      readOnly
                      aria-readonly="true"
                    />
                  </Field>
                  <Field label="Branch name" required>
                    <input
                      value={form.name}
                      onChange={event => set('name', event.target.value)}
                      placeholder="Mumbai office"
                      required
                    />
                  </Field>
                  <Field label="Country" required>
                    <SearchableSelect
                      options={COUNTRIES.map(country => ({ value: country.name, label: country.name }))}
                      value={form.country}
                      onChange={event => {
                        set('country', event.target.value);
                        set('state', '');
                        set('city', '');
                      }}
                      placeholder="Choose a country"
                      searchPlaceholder="Search countries"
                    />
                  </Field>
                  <Field label="State" required>
                    {branchStates.length ? (
                      <SearchableSelect
                        options={branchStates.map(state => ({ value: state.name, label: state.name }))}
                        value={form.state}
                        onChange={event => {
                          set('state', event.target.value);
                          set('city', '');
                        }}
                        placeholder="Choose a state"
                        searchPlaceholder="Search states"
                      />
                    ) : (
                      <input
                        value={form.state}
                        onChange={event => {
                          set('state', event.target.value);
                          set('city', '');
                        }}
                        placeholder="Enter state or region"
                        required
                      />
                    )}
                  </Field>
                  <Field label="City" required>
                    {branchCities.length || citiesLoading ? (
                      <SearchableSelect
                        options={branchCities.map((city, index) => ({ value: city.name, label: city.name, key: `${city.name}-${index}` }))}
                        value={form.city}
                        onChange={event => set('city', event.target.value)}
                        disabled={citiesLoading}
                        placeholder={citiesLoading ? 'Loading cities…' : 'Choose a city'}
                        searchPlaceholder="Search cities"
                      />
                    ) : (
                      <input
                        value={form.city}
                        onChange={event => set('city', event.target.value)}
                        placeholder="Enter city"
                        required
                      />
                    )}
                  </Field>
                  <Field label="Address" required wide>
                    <input
                      value={form.line1}
                      onChange={event => set('line1', event.target.value)}
                      placeholder="Street, building, floor"
                      required
                    />
                  </Field>
                  <Field label="Postal code">
                    <input
                      value={form.postalCode}
                      onChange={event => set('postalCode', event.target.value)}
                    />
                  </Field>
                  <Field label="Longitude" required>
                    <input
                      type="number"
                      step="any"
                      value={form.longitude}
                      onChange={event => set('longitude', event.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Latitude" required>
                    <input
                      type="number"
                      step="any"
                      value={form.latitude}
                      onChange={event => set('latitude', event.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Geofence radius (metres)" required>
                    <input
                      type="number"
                      min="20"
                      max="2000"
                      value={form.geofenceRadiusMeters}
                      onChange={event => set('geofenceRadiusMeters', event.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Contact email">
                    <input
                      type="email"
                      value={form.contactEmail}
                      required
                      onChange={event => set('contactEmail', event.target.value)}
                    />
                  </Field>
                  <Field label="Contact phone">
                    <PhoneInput
                      value={form.contactPhone}
                      onChange={event => set('contactPhone', event.target.value)}
                    />
                  </Field>
                </div>
                <h3 className="form-section-title">Branch Admin account</h3>
                <div className="form-grid">
                  <Field label="Admin first name" required>
                    <input
                      value={form.adminFirstName}
                      onChange={event => set('adminFirstName', event.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Admin last name">
                    <input
                      value={form.adminLastName}
                      onChange={event => set('adminLastName', event.target.value)}
                    />
                  </Field>
                  <Field label="Admin email / login" required wide>
                    <input
                      type="email"
                      value={form.adminEmail}
                      onChange={event => set('adminEmail', event.target.value)}
                      required
                    />
                  </Field>
                {/* // Modal.jsx — branches section */}
<Field label="Admin phone">
  <PhoneInput
    value={form.adminPhone}
    required
    onChange={event => set('adminPhone', event.target.value)}
  />
</Field>
                  <PasswordField
                    label="Initial password (12+ characters)"
                    required
                    minLength={12}
                    value={form.adminPassword}
                    onChange={event => set('adminPassword', event.target.value)}
                  />
                </div>
                <section className="branch-permissions-section">
                  <h3>Branch Admin permissions</h3>
                  <p>Choose which sections and actions the Branch Admin can access.</p>
                  <div className="permission-bulk-actions">
                    <button type="button" onClick={() => set('adminPermissions', PERMISSION_OPTIONS.map(([permission]) => permission))}>Select all</button>
                    <button type="button" onClick={() => set('adminPermissions', [])}>Clear all</button>
                  </div>
                  <div className="branch-permissions-grid">
                    {PERMISSION_OPTIONS.map(([permission, label]) => (
                      <label className="branch-permission-option" key={permission}>
                        <input
                          type="checkbox"
                          checked={form.adminPermissions.includes(permission)}
                          onChange={event => {
                            const nextPermissions = event.target.checked
                              ? [...form.adminPermissions, permission]
                              : form.adminPermissions.filter(item => item !== permission);
                            set('adminPermissions', nextPermissions);
                          }}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </section>
                <div className="form-tip">
                  <MapPin size={16} /> Coordinates use longitude first, then latitude.
                  Confirm the office pin before saving.
                </div>
              </>
            )}

            {type === 'employees' && (
              <div className="form-grid">
                <Field label="First name" required>
                  <input value={form.firstName} onChange={event => set('firstName', event.target.value)} required />
                </Field>
                <Field label="Last name">
                  <input value={form.lastName} onChange={event => set('lastName', event.target.value)} />
                </Field>
                <Field label="Work email" required wide>
                  <input type="email" value={form.email} onChange={event => set('email', event.target.value)} required />
                </Field>
                <Field label="Account type" required>
                  <input value="Employee" readOnly aria-readonly="true" />
                  <small>Manager and HR access are assigned through the role selector.</small>
                </Field>

                {/* 🆕 Department — with inline create option */}
                <Field label="Department" required>
                  <select
                    value={form.departmentId}
                    onChange={event => {
                      const departmentId = event.target.value;
                      if (departmentId === '__CREATE__') {
                        setShowDeptModal(true);
                        setDeptError('');
                        return;
                      }
                      setForm(previous => ({
                        ...previous,
                        departmentId,
                        customRoleId: ''
                      }));
                    }}
                    required
                  >
                    <option value="">Select department</option>
                    {departmentOptions.map(department => (
                      <option value={department._id} key={department._id}>
                        {department.name}
                      </option>
                    ))}
                    {user.permissions?.includes('department.create') && (
                      <option value="__CREATE__">➕ Add new department…</option>
                    )}
                  </select>
                </Field>

                <Field label="Role">
                  <select
                    value={form.customRoleId}
                    onChange={event => set('customRoleId', event.target.value)}
                    disabled={!form.departmentId || selectedDepartmentRoles.length === 0}
                  >
                    <option value="">
                      {!form.departmentId
                        ? 'Select a department first'
                        : selectedDepartmentRoles.length === 0
                          ? 'No roles in this department'
                          : 'Employee (no custom role)'}
                    </option>
                    {selectedDepartmentRoles.map(role => (
                      <option value={role._id} key={role._id}>{role.name}</option>
                    ))}
                  </select>
                  <small>
                    {!form.departmentId
                      ? 'Choose a department to see its roles.'
                      : 'Role is the employee\'s job title within this department.'}
                  </small>
                </Field>

                <section className="branch-permissions-section">
                  <h3>Employee permissions</h3>
                  <p>Select the pages and actions this employee needs. Permissions are assigned to this employee, not the role.</p>
                  <div className="permission-bulk-actions">
                    <button type="button" onClick={() => {
                      const available = PERMISSION_OPTIONS
                        .filter(([permission]) => (user.permissions || []).includes(permission))
                        .map(([permission]) => permission);
                      set('permissions', available);
                    }}>Select all</button>
                    <button type="button" onClick={() => set('permissions', [])}>Clear all</button>
                  </div>
                  <div className="branch-permissions-grid">
                    {PERMISSION_OPTIONS.filter(([permission]) =>
                      (user.permissions || []).includes(permission)
                    ).map(([permission, label]) => (
                      <label className="branch-permission-option" key={permission}>
                        <input
                          type="checkbox"
                          checked={form.permissions.includes(permission)}
                          onChange={event => {
                            const nextPermissions = event.target.checked
                              ? [...form.permissions, permission]
                              : form.permissions.filter(item => item !== permission);
                            set('permissions', nextPermissions);
                          }}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </section>

                {/* 🆕 DYNAMIC EMPLOYEE DOCUMENTS — with Add Another button */}
                <div className="form-section-heading" style={{ gridColumn: '1 / -1' }}>
                  <h3>Employee documents</h3>
                  <p>
                    Add one or more documents. Each row has its own title,
                    category and file. Max {MAX_FILES} files, 25 MB each.
                  </p>
                </div>

                <div className="doc-upload-rows" style={{ gridColumn: '1 / -1' }}>
                  {employeeDocRows.map((row, index) => (
                    <div key={row.key} className="doc-upload-row">
                      <div className="doc-upload-row-header">
                        <span>Document #{index + 1}</span>
                        {employeeDocRows.length > 1 && (
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => removeEmployeeDocRow(row.key)}
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
                            onChange={event =>
                              updateEmployeeDocRow(row.key, {
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
                        </Field>

                        <Field label="Category" required>
                          <select
                            value={row.category}
                            onChange={event =>
                              updateEmployeeDocRow(row.key, {
                                category: event.target.value
                              })
                            }
                            required
                          >
                            {['IDENTITY', 'EDUCATION', 'EXPERIENCE', 'CONTRACT', 'OTHER'].map(category => (
                              <option key={category} value={category}>
                                {category}
                              </option>
                            ))}
                          </select>
                        </Field>

                        <Field label="File (max 25 MB)" required wide>
                          <input
                            className="employee-document-file-input"
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx,.xlsx,.zip,.apk"
                            onChange={event =>
                              updateEmployeeDocRow(row.key, {
                                file: event.target.files?.[0] || null
                              })
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

                <div style={{ gridColumn: '1 / -1' }}>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={addEmployeeDocRow}
                    disabled={employeeDocRows.length >= MAX_FILES}
                  >
                    <Plus size={16} /> Add another document
                    {employeeDocRows.length >= MAX_FILES && ` (max ${MAX_FILES})`}
                  </button>
                  {rowsWithFilesCount > 0 && (
                    <small style={{ marginLeft: 8 }}>
                      {rowsWithFilesCount} document(s) ready to upload
                    </small>
                  )}
                </div>

                <Field label="Shift" required>
                  <select
                    value={form.shiftId}
                    onChange={event => set('shiftId', event.target.value)}
                    required
                    disabled={!shiftOptions.length}
                  >
                    <option value="">
                      {shiftOptions.length ? 'Select shift' : 'Create a shift in Calendar first'}
                    </option>
                    {shiftOptions.map(shift => (
                      <option value={shift._id} key={shift._id}>
                        {shift.name} · {shift.startTime}–{shift.endTime}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Phone">
                  <PhoneInput value={form.phone} onChange={event => set('phone', event.target.value)} />
                </Field>
                <Field label="Joining date" required>
                  <input
                    type="date"
                    value={form.joiningDate}
                    onChange={event => set('joiningDate', event.target.value)}
                    required
                  />
                </Field>
                <Field label="Monthly salary (₹)" required>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.salaryAmount}
                    onChange={event => set('salaryAmount', event.target.value)}
                    required
                  />
                </Field>
                <div className="form-section-heading">
                  <h3>Previous experience</h3>
                  <p>Add previous company details if the employee has work experience.</p>
                </div>
                <Field label="Has previous work experience?" required>
                  <select
                    value={form.hasPreviousExperience ? 'yes' : 'no'}
                    onChange={event => {
                      const hasExperience = event.target.value === 'yes';
                      set('hasPreviousExperience', hasExperience);
                      if (!hasExperience) {
                        set('experienceYears', '0');
                        set('previousCompanyName', '');
                        set('previousCompanyLeavingDate', '');
                        set('previousCompanyLeavingReason', '');
                        set('experienceFile', null);
                      }
                    }}
                    required
                  >
                    <option value="no">No previous experience</option>
                    <option value="yes">Yes, has previous experience</option>
                  </select>
                </Field>
                {form.hasPreviousExperience && (
                  <>
                    <Field label="Previous company name" required>
                      <input
                        value={form.previousCompanyName}
                        onChange={event => set('previousCompanyName', event.target.value)}
                        maxLength={120}
                        required
                      />
                    </Field>
                    <Field label="Previous company leaving date" required>
                      <input
                        type="date"
                        value={form.previousCompanyLeavingDate}
                        onChange={event => set('previousCompanyLeavingDate', event.target.value)}
                        max={new Date().toISOString().slice(0, 10)}
                        required
                      />
                    </Field>
                    <Field label="Reason for leaving" required wide>
                      <textarea
                        rows="2"
                        value={form.previousCompanyLeavingReason}
                        onChange={event => set('previousCompanyLeavingReason', event.target.value)}
                        maxLength={1000}
                        required
                      />
                    </Field>
                    <Field label="Total experience (years)" required>
                      <input
                        type="number"
                        min="0.5"
                        max="70"
                        step="0.5"
                        value={form.experienceYears}
                        onChange={event => set('experienceYears', event.target.value)}
                        required
                      />
                    </Field>
                    <Field label="Experience document (optional)" wide>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.docx"
                        onChange={event => set('experienceFile', event.target.files?.[0] || null)}
                      />
                    </Field>
                  </>
                )}
                <PasswordField
                  label="Initial password (12+ characters)"
                  required
                  minLength={12}
                  value={form.password}
                  onChange={event => set('password', event.target.value)}
                  placeholder="At least 12 characters"
                />
              </div>
            )}

            {type === 'leaves' && (
              <div className="form-grid">
                <Field label="Leave type" required>
                  <select value={form.leaveType} onChange={event => set('leaveType', event.target.value)}>
                    <option value="CASUAL">Casual leave</option>
                    <option value="SICK">Sick leave</option>
                    <option value="EARNED">Earned leave</option>
                    <option value="UNPAID">Unpaid leave</option>
                    <option value="OTHER">Other</option>
                  </select>
                </Field>
                <Field label="Start date" required>
                  <input type="date" value={form.startDate} onChange={event => set('startDate', event.target.value)} required />
                </Field>
                <Field label="End date" required>
                  <input
                    type="date"
                    value={form.endDate}
                    min={form.startDate || undefined}
                    onChange={event => set('endDate', event.target.value)}
                    required
                  />
                </Field>
                <Field label="Reason" required wide>
                  <textarea
                    rows="4"
                    value={form.reason}
                    onChange={event => set('reason', event.target.value)}
                    placeholder="A little context for your manager…"
                    required
                    minLength="3"
                    maxLength="1000"
                  />
                </Field>
              </div>
            )}

            {error && (
              <div className="form-error">
                <AlertCircle size={16} /> {error}
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="button button-quiet" onClick={onClose}>
                Cancel
              </button>
              <button
                className="button button-primary"
                disabled={busy || (type === 'branches' && (!branchCode || citiesLoading)) || (type === 'employees' && shiftOptions.length === 0)}
              >
                {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* 🆕 Inline department creation modal — rendered on top of the employee modal */}
      {showDeptModal && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 1100 }}
          onMouseDown={event => {
            if (event.target === event.currentTarget) closeDeptModal();
          }}
        >
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">DEPARTMENT</span>
                <h2>Add new department</h2>
                <p>Create a department without leaving this form</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={closeDeptModal}
                disabled={deptSaving}
              >
                <X size={19} />
              </button>
            </div>

            <form
              className="modal-form"
              onSubmit={event => {
                event.preventDefault();
                createDepartmentInline();
              }}
            >
              {deptError && (
                <div className="form-error">
                  <AlertTriangle size={16} /> {deptError}
                </div>
              )}

              <div className="form-grid">
                <Field label="Department name" required wide>
                  <input
                    value={deptForm.name}
                    onChange={event =>
                      setDeptForm(prev => ({ ...prev, name: event.target.value }))
                    }
                    maxLength={100}
                    minLength={2}
                    required
                    autoFocus
                    placeholder="e.g. Sales, Engineering"
                  />
                </Field>

                <Field label="Description (optional)" wide>
                  <textarea
                    rows={2}
                    value={deptForm.description}
                    onChange={event =>
                      setDeptForm(prev => ({
                        ...prev,
                        description: event.target.value
                      }))
                    }
                    maxLength={500}
                    placeholder="Short description of the department"
                  />
                </Field>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={closeDeptModal}
                  disabled={deptSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={deptSaving}
                >
                  {deptSaving ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}
                  {deptSaving ? 'Creating…' : 'Create department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default Modal;