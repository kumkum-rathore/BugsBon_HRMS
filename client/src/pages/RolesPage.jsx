import React, { useState, useEffect } from 'react';
import { Pencil, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { Field, EmptyState, LoadingRows } from '../components/common.jsx';
import FormModal from '../components/FormModal.jsx';

function RolesPage({ rows = [], user, loading, notify, onRefresh, onFilterChange }) {
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [savingRole, setSavingRole] = useState('');
  const [editingRole, setEditingRole] = useState(null);
  const [show, setShow] = useState(false);
  const [filterDepartmentId, setFilterDepartmentId] = useState('');

  // ✅ NEW: multiple roles ke liye rows
  const [roleRows, setRoleRows] = useState([{ name: '', description: '' }]);

  const canManageRoles =
    user?.role === 'BRANCH_ADMIN' && user?.permissions?.includes('role.create');

  useEffect(() => {
    let cancelled = false;
    async function loadDepartments() {
      setDepartmentsLoading(true);
      try {
        const res = await api('/departments');
        const list = Array.isArray(res) ? res : res?.data || [];
        if (!cancelled) setDepartments(list);
      } catch (error) {
        if (!cancelled) {
          notify(error.message || 'Unable to load departments.', 'error');
          setDepartments([]);
        }
      } finally {
        if (!cancelled) setDepartmentsLoading(false);
      }
    }
    loadDepartments();
    return () => { cancelled = true; };
  }, [notify]);

  function resetForm() {
    setRoleRows([{ name: '', description: '' }]);
    setDepartmentId('');
    setEditingRole(null);
  }

  // ✅ Role row handlers
  function updateRow(index, patch) {
    setRoleRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRoleRows((prev) => [...prev, { name: '', description: '' }]);
  }

  function removeRow(index) {
    setRoleRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function saveRole(event) {
    event.preventDefault();
    const currentId = editingRole?._id;

    // ---- EDIT (single role) ----
    if (currentId) {
      const row = roleRows[0];
      if (!row?.name?.trim()) {
        notify('Role name is required.', 'error');
        return;
      }
      setSavingRole(currentId);
      try {
        await api(`/roles/${encodeURIComponent(currentId)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: row.name.trim(),
            description: row.description.trim(),
          }),
        });
        notify('Role updated.');
        resetForm();
        setShow(false);
        await onRefresh();
      } catch (error) {
        notify(error.message, 'error');
      } finally {
        setSavingRole('');
      }
      return;
    }

    // ---- CREATE (bulk) ----
    if (!departmentId) {
      notify('Please select a department.', 'error');
      return;
    }

    const cleaned = roleRows
      .map((r) => ({ name: r.name.trim(), description: r.description.trim() }))
      .filter((r) => r.name.length > 0);

    if (cleaned.length === 0) {
      notify('Please enter at least one role name.', 'error');
      return;
    }

    const invalid = cleaned.find((r) => r.name.length < 2 || r.name.length > 80);
    if (invalid) {
      notify(`Role "${invalid.name}" must be between 2 and 80 characters.`, 'error');
      return;
    }
    const tooLong = cleaned.find((r) => r.description.length > 500);
    if (tooLong) {
      notify(`Description for "${tooLong.name}" cannot exceed 500 characters.`, 'error');
      return;
    }

    setSavingRole('new');
    try {
      const res = await api('/roles/bulk', {
        method: 'POST',
        body: JSON.stringify({ departmentId, roles: cleaned }),
      });
      const count = res?.data?.length || cleaned.length;
      notify(`${count} role(s) created.`);
      resetForm();
      setShow(false);
      await onRefresh();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSavingRole('');
    }
  }

  async function archiveRole(role) {
    if (!window.confirm(`Archive "${role.name}"? Existing employee records will keep their role history.`)) return;
    try {
      await api(`/roles/${encodeURIComponent(role._id)}`, { method: 'DELETE' });
      notify('Role archived.');
      await onRefresh();
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  function startEdit(role) {
    setEditingRole(role);
    setRoleRows([{ name: role.name, description: role.description || '' }]);
    setDepartmentId(role.departmentId?._id || role.departmentId || '');
    setShow(true);
  }

  function cancelEdit() {
    setShow(false);
    resetForm();
  }

  function handleFilterChange(value) {
    setFilterDepartmentId(value);
    if (onFilterChange) onFilterChange(value);
  }

  return (
    <div className="panel data-panel">
      <div className="panel-heading">
        <div>
          <h3>Department roles</h3>
          <p>
            {user.role === 'SUPER_ADMIN'
              ? 'Review roles created for each department.'
              : 'Create job titles inside a department and assign them to employees.'}
          </p>
        </div>
        {canManageRoles && (
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              resetForm();
              if (filterDepartmentId) setDepartmentId(filterDepartmentId);
              setShow(true);
            }}
          >
            <Plus size={16} /> Add roles
          </button>
        )}
      </div>

      {/* Department filter */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', padding: '0 0 12px', margin: '20px' }}>
        <Field label="Filter by department">
          <select
            value={filterDepartmentId}
            onChange={(e) => handleFilterChange(e.target.value)}
            disabled={departmentsLoading}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d._id || d.id} value={d._id || d.id}>{d.name}</option>
            ))}
          </select>
        </Field>
        {filterDepartmentId && (
          <button
            type="button"
            className="button button-quiet"
            onClick={() => handleFilterChange('')}
            style={{ marginBottom: 2 }}
          >
            Clear filter
          </button>
        )}
      </div>

      {canManageRoles && show && (
        <FormModal
          title={editingRole ? 'Edit role' : 'Create department roles'}
          description={
            editingRole
              ? 'Update role details.'
              : 'Add multiple roles at once — they will all belong to the selected department.'
          }
          onClose={cancelEdit}
          onSubmit={saveRole}
          submitLabel={
            editingRole
              ? 'Save changes'
              : `Create ${roleRows.filter((r) => r.name.trim()).length || ''} role(s)`
          }
          busy={!!savingRole}
        >
          <div className="form-grid">
            {!editingRole && (
              <Field label="Department" required wide>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  required
                  disabled={departmentsLoading}
                >
                  <option value="">
                    {departmentsLoading
                      ? 'Loading departments…'
                      : departments.length === 0
                        ? 'No departments found — create one first'
                        : 'Select department'}
                  </option>
                  {departments.map((d) => (
                    <option key={d._id || d.id} value={d._id || d.id}>{d.name}</option>
                  ))}
                </select>
              </Field>
            )}

            {/* ✅ Dynamic role rows */}
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontWeight: 600 }}>
                  {editingRole ? 'Role details' : 'Roles to create'}
                </label>
                {!editingRole && (
                  <button type="button" className="button button-quiet" onClick={addRow} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={14} /> Add another role
                  </button>
                )}
              </div>

              {roleRows.map((row, index) => (
                <div
                  key={index}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1.5fr auto',
                    gap: 10,
                    alignItems: 'end',
                    marginBottom: 10,
                    padding: 10,
                    border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: 8,
                  }}
                >
                  <Field label={`Role ${index + 1} name`} required={index === 0 || !!row.name}>
                    <input
                      value={row.name}
                      onChange={(e) => updateRow(index, { name: e.target.value })}
                      minLength={2}
                      maxLength={80}
                      placeholder="e.g. Manager"
                      required={index === 0}
                    />
                  </Field>
                  <Field label="Description">
                    <input
                      value={row.description}
                      onChange={(e) => updateRow(index, { description: e.target.value })}
                      maxLength={500}
                      placeholder="Optional"
                    />
                  </Field>
                  {!editingRole && (
                    <button
                      type="button"
                      className="icon-button employee-action-icon employee-action-danger"
                      onClick={() => removeRow(index)}
                      disabled={roleRows.length === 1}
                      title="Remove role"
                      style={{ height: 38 }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <p className="table-secondary">
            Role code is generated from its name. Department cannot be changed after creation.
            {!editingRole && ' Blank rows are ignored.'}
          </p>
        </FormModal>
      )}

      {loading ? (
        <LoadingRows />
      ) : rows.length ? (
        <div className="task-list">
          {rows.map((role) => (
            <article className="task-row" key={role._id}>
              <div className="task-main">
                <div className="task-title-line">
                  <strong>{role.name} <span className="mono">{role.code}</span></strong>
                  <span className="count-pill">
                    {role.departmentId?.name || '—'} · {role.branchId?.name || 'Your branch'}
                  </span>
                </div>
                <p>{role.description || 'No description provided.'}</p>
                <p className="table-secondary">
                  Created by:{' '}
                  {role.createdBy
                    ? `${role.createdBy.firstName || ''} ${role.createdBy.lastName || ''}`
                    : 'Branch Admin'}
                </p>
              </div>
              {canManageRoles && (
                <div className="employee-row-actions">
                  <button
                    type="button"
                    className="icon-button employee-action-icon"
                    onClick={() => startEdit(role)}
                    aria-label={`Edit ${role.name}`}
                    title="Edit role"
                  ><Pencil size={16} /></button>
                  <button
                    type="button"
                    className="icon-button employee-action-icon employee-action-danger"
                    onClick={() => archiveRole(role)}
                    aria-label={`Archive ${role.name}`}
                    title="Archive role"
                  ><Trash2 size={16} /></button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ShieldCheck}
          title={filterDepartmentId ? 'No roles in this department' : 'No roles available'}
          description={
            filterDepartmentId
              ? 'Try clearing the filter or create new roles for this department.'
              : user.role === 'SUPER_ADMIN'
                ? 'Department-created roles appear here.'
                : 'Select a department while creating roles to make them available for employees.'
          }
        />
      )}
    </div>
  );
}

export default RolesPage;