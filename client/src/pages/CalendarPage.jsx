import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CalendarDays, Check, ChevronLeft, ChevronRight, MapPin, Plus, Trash2, Users, Video } from 'lucide-react';
import { api } from '../lib/api';
import { Field, LoadingRows } from '../components/common.jsx';
import FormModal from '../components/FormModal.jsx';
import { niceDate } from '../utils/labels.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function timeKey(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function addMinutesToTime(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function CalendarPage({ user, employees = [], notify, view = 'calendar' }) {
  const admin = user.permissions?.includes('calendar.manage');
  const now = new Date();
  const todayKey = dateKey(now);
  const suggestedMeetingStart = new Date(Date.now() + 60 * 60 * 1000);
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [month, setMonth] = useState(currentMonth);
  const [holidays, setHolidays] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [myShift, setMyShift] = useState(null);
  const [staff, setStaff] = useState(employees);
  const [loading, setLoading] = useState(true);
  const [holidayStart, setHolidayStart] = useState(`${currentMonth}-01`);
  const [holidayEnd, setHolidayEnd] = useState(`${currentMonth}-01`);
  const [holidayTitle, setHolidayTitle] = useState('');

  // Meeting form state
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingDescription, setMeetingDescription] = useState('');
  const [meetingDate, setMeetingDate] = useState(() => dateKey(suggestedMeetingStart));
  const [meetingTime, setMeetingTime] = useState(() => timeKey(suggestedMeetingStart));
  const [meetingEndTime, setMeetingEndTime] = useState(() => timeKey(new Date(suggestedMeetingStart.getTime() + 60 * 60 * 1000)));
  const [meetingMode, setMeetingMode] = useState('OFFLINE');
  const [meetingMeetLink, setMeetingMeetLink] = useState('');
  const [meetingLocation, setMeetingLocation] = useState('');
  const [meetingAttendeeIds, setMeetingAttendeeIds] = useState([]);

  const [shiftForm, setShiftForm] = useState({ name: '', startTime: '09:00', endTime: '17:00' });
  const [employeeId, setEmployeeId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHolidayForm, setShowHolidayForm] = useState(false);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);

  async function loadCalendar() {
    setLoading(true);
    try {
      const response = await api(`/calendar?month=${encodeURIComponent(month)}`);
      setHolidays(response.data?.holidays || []);
      setMeetings(response.data?.meetings || []);
      setShifts(response.data?.shifts || []);
      setMyShift(response.data?.myShift || null);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCalendar(); }, [month]);
  useEffect(() => { setStaff(employees); }, [employees]);
  useEffect(() => {
    if (!employeeId && employees.length) {
      setEmployeeId(String(employees[0].id || employees[0]._id));
    }
  }, [employees, employeeId]);

  const holidayByDate = useMemo(
    () => new Map(holidays.map(holiday => [holiday.date, holiday])),
    [holidays]
  );
  const meetingsByDate = useMemo(
    () => meetings.reduce((grouped, meeting) => {
      grouped[meeting.date] ||= [];
      grouped[meeting.date].push(meeting);
      return grouped;
    }, {}),
    [meetings]
  );

  const holidayGroups = useMemo(() => {
    const map = new Map();
    for (const holiday of holidays) {
      const key = holiday.groupId || holiday._id;
      if (!map.has(key)) {
        map.set(key, {
          key,
          id: holiday._id,
          title: holiday.title,
          start: holiday.startDate || holiday.date,
          end: holiday.endDate || holiday.date
        });
      }
      const group = map.get(key);
      if (holiday.date < group.start) group.start = holiday.date;
      if (holiday.date > group.end) group.end = holiday.date;
    }
    return [...map.values()].sort((a, b) => a.start.localeCompare(b.start));
  }, [holidays]);

  const monthDate = new Date(`${month}-01T00:00:00`);
  const year = monthDate.getFullYear();
  const monthIndex = monthDate.getMonth();
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const calendarCells = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: dayCount }, (_, index) => index + 1)
  ];

  function changeMonth(amount) {
    const next = new Date(year, monthIndex + amount, 1);
    const nextMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    setMonth(nextMonth);
    setHolidayStart(`${nextMonth}-01`);
    setHolidayEnd(`${nextMonth}-01`);
  }

  async function addHoliday(event) {
    event.preventDefault();
    if (holidayEnd < holidayStart) {
      notify('End date must be on or after start date.', 'error');
      return;
    }
    setBusy(true);
    try {
      await api('/calendar/holidays', {
        method: 'POST',
        body: JSON.stringify({ startDate: holidayStart, endDate: holidayEnd, title: holidayTitle })
      });
      setHolidayTitle('');
      setShowHolidayForm(false);
      await loadCalendar();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeHoliday(id) {
    setBusy(true);
    try {
      await api(`/calendar/holidays/${id}`, { method: 'DELETE' });
      await loadCalendar();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const activeEmployees = employees.filter(employee =>
    employee.status === 'ACTIVE' && employee.role === 'EMPLOYEE'
  );
  const earliestMeetingTime = new Date(Math.ceil((Date.now() + 10 * 60 * 1000) / 60000) * 60000);
  const meetingTimeMin = meetingDate === todayKey
    ? `${String(earliestMeetingTime.getHours()).padStart(2, '0')}:${String(earliestMeetingTime.getMinutes()).padStart(2, '0')}`
    : '00:00';

  function resetMeetingForm() {
    const suggestedStart = new Date(Date.now() + 60 * 60 * 1000);
    setMeetingTitle('');
    setMeetingDescription('');
    setMeetingDate(dateKey(suggestedStart));
    setMeetingTime(timeKey(suggestedStart));
    setMeetingEndTime(timeKey(new Date(suggestedStart.getTime() + 60 * 60 * 1000)));
    setMeetingMode('OFFLINE');
    setMeetingMeetLink('');
    setMeetingLocation('');
    setMeetingAttendeeIds([]);
  }

  async function createMeeting(event) {
    event.preventDefault();
    if (busy) return;
    if (!meetingAttendeeIds.length) {
      notify('Select at least one employee to invite.', 'error');
      return;
    }
    if (meetingMode === 'ONLINE') {
      if (!meetingMeetLink.trim()) {
        notify('Paste a Google Meet link for online meetings.', 'error');
        return;
      }
      if (!/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\?.*)?$/i.test(meetingMeetLink.trim())) {
        notify('Invalid Google Meet link. Expected format: https://meet.google.com/abc-defg-hij', 'error');
        return;
      }
    }
    if (meetingMode === 'OFFLINE' && meetingLocation.trim().length < 2) {
      notify('Enter a location for offline meetings.', 'error');
      return;
    }

    const startsAt = new Date(`${meetingDate}T${meetingTime}:00`);
    const endsAt = meetingEndTime ? new Date(`${meetingDate}T${meetingEndTime}:00`) : new Date(startsAt.getTime() + 60 * 60 * 1000);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now() + 10 * 60 * 1000) {
      notify('Schedule the meeting at least 10 minutes from now.', 'error');
      return;
    }
    if (meetingEndTime && endsAt.getTime() <= startsAt.getTime()) {
      notify('End time must be after start time.', 'error');
      return;
    }

    setBusy(true);
    try {
      await api('/calendar/meetings', {
        method: 'POST',
        body: JSON.stringify({
          title: meetingTitle,
          description: meetingDescription,
          date: meetingDate,
          time: meetingTime,
          startsAt: startsAt.toISOString(),
          endsAt: meetingEndTime ? endsAt.toISOString() : null,
          attendeeIds: meetingAttendeeIds,
          mode: meetingMode,
          meetLink: meetingMode === 'ONLINE' ? meetingMeetLink.trim() : '',
          location: meetingMode === 'OFFLINE' ? meetingLocation.trim() : ''
        })
      });
      notify('Meeting scheduled. Attendees will get an in-app reminder and an email invitation.');
      resetMeetingForm();
      setShowMeetingForm(false);
      const meetingMonth = meetingDate.slice(0, 7);
      if (meetingMonth !== month) setMonth(meetingMonth);
      else await loadCalendar();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function openMeetingForm() {
    resetMeetingForm();
    setShowMeetingForm(true);
  }

  async function cancelMeeting(meeting) {
    if (!window.confirm(`Cancel "${meeting.title}"? Its pending reminders will also be removed.`)) return;
    try {
      await api(`/calendar/meetings/${encodeURIComponent(meeting._id)}`, { method: 'DELETE' });
      notify('Meeting cancelled.');
      await loadCalendar();
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function createShift(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/calendar/shifts', { method: 'POST', body: JSON.stringify(shiftForm) });
      setShiftForm({ name: '', startTime: '09:00', endTime: '17:00' });
      setShowShiftForm(false);
      await loadCalendar();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function assignShift(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/calendar/shifts/assign', {
        method: 'PATCH',
        body: JSON.stringify({ userId: employeeId, shiftId: shiftId || null })
      });
      const employeeResponse = await api('/employees?limit=100');
      setStaff(employeeResponse.data || []);
      setEmployeeId('');
      setShiftId('');
      setShowAssignmentForm(false);
      await loadCalendar();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`calendar-layout ${view === 'shifts' ? 'shift-page-layout' : ''}`}>
      {view !== 'shifts' && <>
      <section className="panel data-panel">
        <div className="panel-heading">
          <div>
            <h3>Branch holiday calendar</h3>
            <p>Weekends and holidays are excluded from working-day salary calculations.</p>
          </div>
          <div className="heading-actions">
            {admin && (
              <button type="button" className="button button-primary" onClick={() => setShowHolidayForm(true)}>
                <Plus size={15} /> Add holiday
              </button>
            )}
            <div className="calendar-month-controls">
              <button type="button" className="icon-button" onClick={() => changeMonth(-1)} aria-label="Previous month">
                <ChevronLeft size={18} />
              </button>
              <strong>{monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</strong>
              <button type="button" className="icon-button" onClick={() => changeMonth(1)} aria-label="Next month">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <LoadingRows />
        ) : (
          <div className="branch-calendar">
            {WEEKDAYS.map(day => (<strong className="calendar-weekday" key={day}>{day}</strong>))}
            {calendarCells.map((day, index) => {
              if (!day) return <div className="calendar-day calendar-day-empty" key={`empty-${index}`} />;
              const date = `${month}-${String(day).padStart(2, '0')}`;
              const holiday = holidayByDate.get(date);
              const dayMeetings = meetingsByDate[date] || [];
              const weekend = [0, 6].includes(new Date(year, monthIndex, day).getDay());
              return (
                <div
                  className={`calendar-day${holiday ? ' calendar-day-holiday' : ''}${weekend ? ' calendar-day-weekend' : ''}`}
                  key={date}
                >
                  <span>{day}</span>
                  {holiday && <small>{holiday.title}</small>}
                  {!holiday && weekend && <small>Weekend</small>}
                  {dayMeetings.slice(0, 2).map(meeting => (
                    <small className="calendar-day-meeting" key={meeting._id}>
                      {meeting.mode === 'ONLINE' ? '🎥' : '📍'} {meeting.time} {meeting.title}
                    </small>
                  ))}
                  {dayMeetings.length > 2 && (
                    <small className="calendar-day-more">+{dayMeetings.length - 2} more</small>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {holidayGroups.length > 0 && (
          <div className="calendar-holiday-list">
            {holidayGroups.map(group => (
              <div className="calendar-holiday-item" key={group.key}>
                <span>
                  <CalendarDays size={15} />{' '}
                  {group.start === group.end
                    ? niceDate(`${group.start}T00:00:00`)
                    : `${niceDate(`${group.start}T00:00:00`)} – ${niceDate(`${group.end}T00:00:00`)}`}{' '}
                  · {group.title}
                </span>
                {admin && (
                  <button type="button" className="text-button" aria-label={`Remove ${group.title}`} disabled={busy} onClick={() => removeHoliday(group.id)}>
                    <Trash2 size={15} /> Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel data-panel">
        <div className="panel-heading">
          <div>
            <h3>Meetings</h3>
            <p>Invited employees receive an in-app reminder 10 minutes before the meeting and an email invitation.</p>
          </div>
          {admin && (
            <button type="button" className="button button-primary" onClick={openMeetingForm}>
              <Plus size={15} /> Schedule meeting
            </button>
          )}
        </div>
        {meetings.length ? (
          <div className="calendar-meeting-list">
            {meetings.map(meeting => (
              <article className="calendar-meeting-item" key={meeting._id}>
                <span className="calendar-meeting-icon"><CalendarClock size={18} /></span>
                <div className="calendar-meeting-main">
                  <strong>{meeting.title}</strong>
                  <span>
                    {niceDate(`${meeting.date}T00:00:00`)} · {meeting.time}
                    {meeting.mode === 'ONLINE' ? ' · Online' : meeting.location ? ` · ${meeting.location}` : ''}
                  </span>
                  {meeting.description && <p>{meeting.description}</p>}
                  {meeting.mode === 'ONLINE' && meeting.meetLink && (
                    <p style={{ margin: '4px 0' }}>
                      <a href={meeting.meetLink} target="_blank" rel="noopener noreferrer">
                        <Video size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                        Join Google Meet
                      </a>
                    </p>
                  )}
                  {meeting.mode === 'OFFLINE' && meeting.location && (
                    <p style={{ margin: '4px 0' }}>
                      <MapPin size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      {meeting.location}
                    </p>
                  )}
                  <small>
                    <Users size={13} />
                    {(meeting.attendees || []).map(attendee =>
                      `${attendee.firstName || ''} ${attendee.lastName || ''}`.trim()
                    ).filter(Boolean).join(', ')}
                  </small>
                </div>
                {admin && (
                  <button type="button" className="icon-button employee-action-danger" aria-label={`Cancel ${meeting.title}`} title="Cancel meeting" onClick={() => cancelMeeting(meeting)}>
                    <Trash2 size={16} />
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="calendar-meetings-empty">
            {admin ? 'No meetings scheduled for this month.' : 'No meetings are scheduled for you this month.'}
          </p>
        )}
      </section>
      </>}

      {view === 'shifts' ?<section className="panel data-panel">
        <div className="panel-heading">
          <div>
            <h3>{admin ? 'Shift setup' : 'Your shift'}</h3>
            <p>
              {admin
                ? 'Employees arriving more than 2 hours after shift start are marked half-day.'
                : myShift
                  ? `${myShift.name}: ${myShift.startTime}–${myShift.endTime}. Arriving more than 2 hours late counts as half-day.`
                  : 'Your shift has not been assigned yet.'}
            </p>
          </div>
          {admin && (
            <div className="heading-actions">
              <button type="button" className="button button-quiet" onClick={() => setShowAssignmentForm(true)} disabled={!shifts.length}>
                Assign employee
              </button>
              <button type="button" className="button button-primary" onClick={() => setShowShiftForm(true)}>
                <Plus size={15} /> Create shift
              </button>
            </div>
          )}
        </div>

        {admin ? (
          <>
            <div className="calendar-shift-list">
              {shifts.map(shift => (
                <div className="calendar-holiday-item" key={shift._id}>
                  <span><strong>{shift.name}</strong> · {shift.startTime}–{shift.endTime}</span>
                  <small>2-hour grace</small>
                </div>
              ))}
              {!shifts.length && <p className="table-secondary">No shifts created yet.</p>}
            </div>
            <div className="calendar-shift-actions">
              <p className="table-secondary">Manage shifts or assign one to a branch employee.</p>
            </div>
          </>
        ) : (
          <div className="calendar-shift-list">
            {myShift && (
              <div className="calendar-holiday-item">
                <span><strong>{myShift.name}</strong> · {myShift.startTime}–{myShift.endTime}</span>
                
              </div>
            )}
          </div>
        )}
      </section> : null}

      {view !== 'shifts' && admin && showHolidayForm && (
        <FormModal
          title="Add branch holiday"
          description="Choose a start and end date. Every day in the range becomes a holiday."
          onClose={() => setShowHolidayForm(false)}
          onSubmit={addHoliday}
          submitLabel="Add holiday"
          busy={busy}
        >
          <div className="form-grid">
            <Field label="Start date" required>
              <input type="date" value={holidayStart} onChange={e => {
                const value = e.target.value;
                setHolidayStart(value);
                if (holidayEnd < value) setHolidayEnd(value);
              }} required />
            </Field>
            <Field label="End date" required>
              <input type="date" value={holidayEnd} min={holidayStart} onChange={e => setHolidayEnd(e.target.value)} required />
            </Field>
            <Field label="Holiday name" required wide>
              <input value={holidayTitle} onChange={e => setHolidayTitle(e.target.value)} maxLength="120" minLength="2" placeholder="e.g. Diwali" required />
            </Field>
          </div>
        </FormModal>
      )}

      {view !== 'shifts' && admin && showMeetingForm && (
        <FormModal
          title="Schedule a meeting"
          description="Choose a mode, date, time and the employees to invite. An in-app reminder and email invitation go out automatically."
          onClose={() => setShowMeetingForm(false)}
          onSubmit={createMeeting}
          submitLabel="Schedule meeting"
          busy={busy}
        >
          <div className="form-grid">
            <Field label="Meeting title" required wide>
              <input value={meetingTitle} onChange={event => setMeetingTitle(event.target.value)} minLength={3} maxLength={160} placeholder="e.g. Weekly team planning" required />
            </Field>

            <Field label="Mode" required wide>
              <div style={{ display: 'flex', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="radio" name="meetingMode" value="OFFLINE" checked={meetingMode === 'OFFLINE'} onChange={() => setMeetingMode('OFFLINE')} />
                  <MapPin size={14} /> Offline
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="radio" name="meetingMode" value="ONLINE" checked={meetingMode === 'ONLINE'} onChange={() => setMeetingMode('ONLINE')} />
                  <Video size={14} /> Online (Google Meet)
                </label>
              </div>
            </Field>

            {meetingMode === 'ONLINE' && (
              <Field label="Google Meet link" required wide>
                <input
                  value={meetingMeetLink}
                  onChange={event => setMeetingMeetLink(event.target.value)}
                  placeholder="https://meet.google.com/abc-defg-hij"
                  required
                />
                <small style={{ display: 'block', marginTop: 4, color: '#666' }}>
                  Open <a href="https://meet.google.com" target="_blank" rel="noopener noreferrer">meet.google.com</a> → "Create a meeting for later" → copy the link and paste here.
                </small>
              </Field>
            )}

            {meetingMode === 'OFFLINE' && (
              <Field label="Location" required wide>
                <input
                  value={meetingLocation}
                  onChange={event => setMeetingLocation(event.target.value)}
                  placeholder="e.g. 2nd floor conference room"
                  maxLength={300}
                  required
                />
              </Field>
            )}

            <Field label="Date" required>
              <input type="date" value={meetingDate} onChange={event => setMeetingDate(event.target.value)} min={todayKey} required />
            </Field>
            <Field label="Start time" required>
              <input type="time" value={meetingTime} onChange={event => setMeetingTime(event.target.value)} min={meetingTimeMin} required />
            </Field>
            <Field label="End time (optional)">
              <input type="time" value={meetingEndTime} min={addMinutesToTime(meetingTime, 1)} onChange={event => setMeetingEndTime(event.target.value)} />
            </Field>
            <Field label="Description" wide>
              <textarea rows={3} value={meetingDescription} onChange={event => setMeetingDescription(event.target.value)} maxLength={2000} placeholder="Add the meeting agenda or context" />
            </Field>
            <Field label={`Invite employees (${meetingAttendeeIds.length} selected)`} wide required>
              <div className="meeting-attendee-picker">
                <div className="meeting-attendee-toolbar">
                  <span>Only active employees in your branch are listed. You are included automatically.</span>
                  <div>
                    <button type="button" onClick={() => setMeetingAttendeeIds(activeEmployees.map(employee => String(employee.id || employee._id)))} disabled={!activeEmployees.length}>
                      <Check size={14} /> Select all
                    </button>
                    <button type="button" onClick={() => setMeetingAttendeeIds([])} disabled={!meetingAttendeeIds.length}>
                      Clear
                    </button>
                  </div>
                </div>
                <div className="meeting-attendee-list">
                  {activeEmployees.length ? activeEmployees.map(employee => {
                    const id = String(employee.id || employee._id);
                    return (
                      <label key={id} className="meeting-attendee-option">
                        <input type="checkbox" checked={meetingAttendeeIds.includes(id)} onChange={event => setMeetingAttendeeIds(current =>
                          event.target.checked ? [...new Set([...current, id])] : current.filter(attendeeId => attendeeId !== id)
                        )} />
                        <span>{employee.firstName} {employee.lastName}</span>
                        <small>{employee.email}</small>
                      </label>
                    );
                  }) : <p>No active employees available to invite.</p>}
                </div>
              </div>
            </Field>
          </div>
        </FormModal>
      )}

      {admin && showShiftForm && (
        <FormModal
          title="Create shift"
          description="Set the work hours for a reusable branch shift."
          onClose={() => setShowShiftForm(false)}
          onSubmit={createShift}
          submitLabel="Create shift"
          busy={busy}
        >
          <div className="form-grid">
            <Field label="Shift name" required>
              <input value={shiftForm.name} onChange={event => setShiftForm(current => ({ ...current, name: event.target.value }))} minLength="2" maxLength="100" placeholder="Morning shift" required />
            </Field>
            <Field label="Start time" required>
              <input type="time" value={shiftForm.startTime} onChange={event => setShiftForm(current => ({ ...current, startTime: event.target.value }))} required />
            </Field>
            <Field label="End time" required>
              <input type="time" value={shiftForm.endTime} onChange={event => setShiftForm(current => ({ ...current, endTime: event.target.value }))} required />
            </Field>
          </div>
        </FormModal>
      )}

      {admin && showAssignmentForm && (
        <FormModal
          title="Assign shift to employee"
          description="Select an employee and the branch shift they will follow."
          onClose={() => setShowAssignmentForm(false)}
          onSubmit={assignShift}
          submitLabel="Save assignment"
          busy={busy}
        >
          <div className="form-grid">
            <Field label="Employee" required>
              <select value={employeeId} onChange={event => setEmployeeId(event.target.value)} required>
                <option value="">Select employee</option>
                {staff.filter(employee => employee.role === 'EMPLOYEE').map(employee => (
                  <option key={employee.id || employee._id} value={employee.id || employee._id}>
                    {employee.firstName} {employee.lastName}
                    {employee.shiftId?.name ? ` · ${employee.shiftId.name}` : ' · No shift'}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Shift" required>
              <select value={shiftId} onChange={event => setShiftId(event.target.value)} required>
                <option value="">Select shift</option>
                {shifts.map(shift => (
                  <option key={shift._id} value={shift._id}>
                    {shift.name} · {shift.startTime}–{shift.endTime}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </FormModal>
      )}
    </div>
  );
}

export default CalendarPage;