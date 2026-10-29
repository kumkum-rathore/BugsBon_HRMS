import React, { useState, useEffect } from 'react';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { Field, EmptyState, LoadingRows } from '../components/common.jsx';
import FormModal from '../components/FormModal.jsx';

function RolesPage({ rows = [], user, loading, notify, onRefresh, onFilterChange }) {
  const [roleName, setRoleName] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [savingRole, setSavingRole] = useState('');
  const [editingRole, setEditingRole] = useState(null);
  const [show, setShow] = useState(false);
  const [filterDepartmentId, setFilterDepartmentId] = useState('');

  const canManageRoles =
    user?.role === 'BRANCH_ADMIN' && user?.permissions?.includes('role.create');

  // Departments mount pe load karo — filter dropdown + form dono ke liye
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
    setRoleName('');
    setDescription('');
    setDepartmentId('');
    setEditingRole(null);
  }

  async function saveRole(event) {
    event.preventDefault();
    const currentId = editingRole?._id;
    if (!currentId && !departmentId) {
      notify('Please select a department.', 'error');
      return;
    }
    setSavingRole(currentId || 'new');
    try {
      await api(currentId ? `/roles/${encodeURIComponent(currentId)}` : '/roles', {
        method: currentId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: roleName.trim(),
          description: description.trim(),
          ...(currentId ? {} : { departmentId }),
        }),
      });
      notify(currentId ? 'Role updated.' : 'Department role created.');
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
    setRoleName(role.name);
    setDescription(role.description || '');
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
            <Plus size={16} /> Add role
          </button>
        )}
      </div>

      {/* Department filter */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', padding: '0 0 12px',margin:'20px' }}>
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
          title={editingRole ? 'Edit role' : 'Create a department role'}
          description="Role will be created inside the selected department."
          onClose={cancelEdit}
          onSubmit={saveRole}
          submitLabel={editingRole ? 'Save changes' : 'Create role'}
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
            <Field label="Role name" required>
              <input
                value={roleName}
                onChange={(event) => setRoleName(event.target.value)}
                minLength={2}
                maxLength={80}
                required
              />
            </Field>
            <Field label="Description">
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
              />
            </Field>
          </div>
          <p className="table-secondary">
            Role code is generated from its name. Department cannot be changed after creation.
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
              ? 'Try clearing the filter or create a new role for this department.'
              : user.role === 'SUPER_ADMIN'
                ? 'Department-created roles appear here.'
                : 'Select a department while creating a role to make it available for employees.'
          }
        />
      )}
    </div>
  );
}

export default RolesPage;