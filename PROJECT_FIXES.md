# HRMS project fixes

This package includes the following changes:

- Employee details now show employment status and assigned permissions alongside the existing profile fields.
- Employee document rows provide Preview and Download actions. File downloads now use the authenticated backend proxy rather than opening a stored Cloudinary URL directly.
- The shared download helper keeps its temporary object URL alive long enough for the browser to begin downloading.
- Uploads are restricted on both the frontend and backend to PDF, DOC and DOCX files (maximum 25 MB each; existing 10-file batch limit retained).
- Project documents can be uploaded with a project and viewed from the project card's Documents action; PDF preview and authenticated downloads are available there.
- Private Cloudinary file retrieval uses the authenticated delivery type in its signed download URL.
- Shift setup has a separate Shifts sidebar page, while Calendar remains focused on holidays and meetings.
- Scrollbars use a consistent, subtle style across the app.

## Run locally

1. Copy `server/.env.example` to `server/.env` and fill in your own database, JWT/session and Cloudinary settings. The original local `.env` is intentionally not included in this archive.
2. Install backend dependencies: `cd server && npm install`.
3. Start backend: `npm run dev`.
4. In a second terminal, install frontend dependencies: `cd client && npm install`.
5. Start frontend: `npm run dev`.

Note: JavaScript/JSX syntax checks passed for the edited client source and backend source. A full Vite production build could not be run in this environment because dependency installation did not complete before timeout.


## Additional fixes in this revision

- Renamed the application soft-delete field from `isArchived` to `isDelete` across schemas, controllers and UI queries. Existing MongoDB documents need the one-time migration below before deployment.
- Made session restoration single-flight so React StrictMode cannot race two rotating refresh-token requests.
- Meeting creation now validates and saves the end time, online/offline mode, Google Meet URL or location, and sends calendar email invitations when SMTP is configured. A mail failure no longer discards a successfully created meeting.
- Salary entry pre-fills Basic Salary from the selected employee's onboarding salary and consistently shows the employee name in the salary table.
- Refined login card spacing, focus states, responsiveness, notification popover and general panel/form spacing.

### One-time MongoDB migration

Back up your database first, then run from `server`:

```bash
npm run migrate:delete-field
```

This copies each existing `isArchived` value to `isDelete` and removes the old field. Do not run it until `MONGODB_URI` points at the intended database.


## Requested fixes (2026-10-29)
- Task create/edit now requires at least one non-empty checklist item in the UI and API validation.
- Archived/deleted employees are excluded from salary and employee-document listings; new salary records cannot be created for archived/inactive employees. Stored historical records remain in the database.
- Project code is required and unique per branch; project creation requires at least one PDF/DOC/DOCX attachment in the form.
- Meeting end time is optional; when omitted, the backend uses a one-hour meeting duration.
- Branch contact name is stored and displayed separately from branch contact email; branch admin name/email remain in their own column/detail. Contact name/email and branch-admin phone/email are validated as required.

Note: the frontend production build could not be run in this environment because dependency installation timed out; server JavaScript syntax checks passed.
