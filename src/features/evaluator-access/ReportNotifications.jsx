import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { accessApi } from './api.js';

export function ReportNotifications() {
  const [items, setItems] = useState([]); const [error, setError] = useState('');
  useEffect(() => { let active = true; const load = () => accessApi('/notifications', { admin: true }).then((rows) => { if (active) { setItems(rows); setError(''); } }).catch(() => { if (active) setError('Report notifications are temporarily unavailable.'); }); load(); const interval = setInterval(load, 60000); return () => { active = false; clearInterval(interval); }; }, []);
  const unread = items.filter((n) => !n.read_at);
  if (error) return <p role="status">{error}</p>;
  if (!unread.length) return null;
  return <section className="notice" aria-label="Report updates">{unread.map((n) => <p key={n.id}><Link to={n.destination} onClick={() => accessApi(`/notifications/${n.id}/read`, { method: 'POST', admin: true }).then(() => setItems((rows) => rows.map((r) => r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r))).catch(() => setError('Could not mark the notification as read.'))}>{n.message}</Link></p>)}</section>;
}
