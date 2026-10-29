import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarClock, Check, X } from 'lucide-react';
import { api } from '../lib/api';

function NotificationBell({ userId, notify }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const unreadCount = useMemo(
    () => notifications.filter(item => !item.readAt).length,
    [notifications]
  );

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    let initialized = false;
    const seenIds = new Set();

    async function refresh() {
      try {
        const response = await api('/notifications');
        if (!active) return;
        const rows = response.data || [];
        if (initialized) {
          const fresh = rows.filter(item => !seenIds.has(item._id));
          for (const item of fresh) {
            notify(`${item.title}: ${item.message}`, 'success');
          }
        }
        rows.forEach(item => seenIds.add(item._id));
        setNotifications(rows);
        initialized = true;
      } catch (error) {
        if (active && !initialized) notify(error.message, 'error');
      }
    }

    refresh();
    const timer = window.setInterval(refresh, 30 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [userId, notify]);

  async function markRead(item) {
    if (item.readAt) return;
    try {
      const response = await api(`/notifications/${encodeURIComponent(item._id)}/read`, {
        method: 'PATCH'
      });
      setNotifications(current => current.map(row =>
        row._id === item._id ? response.data : row
      ));
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  return (
    <div className="notification-menu">
      <button
        type="button"
        className="icon-button notification-bell"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {open && (
        <section className="notification-popover" aria-label="Notifications">
          <header className="notification-popover-header">
            <div>
              <strong>Notifications</strong>
              <span>{unreadCount ? `${unreadCount} unread` : 'You’re all caught up'}</span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close notifications"
              onClick={() => setOpen(false)}
            >
              <X size={17} />
            </button>
          </header>
          <div className="notification-list">
            {notifications.length ? notifications.map(item => (
              <button
                type="button"
                className={`notification-item${item.readAt ? '' : ' notification-item-unread'}`}
                key={item._id}
                onClick={() => markRead(item)}
              >
                <span className="notification-item-icon"><CalendarClock size={17} /></span>
                <span className="notification-item-copy">
                  <strong>{item.title}</strong>
                  <span>{item.message}</span>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </span>
                {!item.readAt && <span className="notification-unread-dot" aria-label="Unread" />}
                {item.readAt && <Check size={15} className="notification-read-check" aria-label="Read" />}
              </button>
            )) : (
              <p className="notification-empty">Meeting reminders will appear here.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default NotificationBell;
