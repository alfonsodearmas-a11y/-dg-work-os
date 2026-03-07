'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, CheckSquare, Bell, Clock, ExternalLink } from 'lucide-react';
import { usePathname } from 'next/navigation';

interface PanelTask {
  id: string;
  title: string;
  priority: string | null;
  due_date: string | null;
  status: string;
  agency: string | null;
}

interface PanelEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location: string | null;
}

interface PanelNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  category: string;
  created_at: string;
  reference_url: string | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#fb9d3b',
  medium: '#d4af37',
  low: '#64748b',
};

const CATEGORY_COLORS: Record<string, string> = {
  tasks: '#d4af37',
  meetings: '#4a82f5',
  kpi: '#059669',
  projects: '#a25ddc',
  system: '#64748b',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

export function ActivityPanel() {
  const pathname = usePathname();
  const [tasks, setTasks] = useState<PanelTask[]>([]);
  const [events, setEvents] = useState<PanelEvent[]>([]);
  const [notifications, setNotifications] = useState<PanelNotification[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const res = await fetch('/api/activity-panel');
        if (res.ok && !cancelled) {
          const data = await res.json();
          setTasks(data.tasks || []);
          setEvents(data.events || []);
          setNotifications(data.notifications || []);
        }
      } catch {
        // Silently fail — panel is supplementary
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pathname]);

  // Don't render on login/upload pages (AppShell handles this, but just in case)
  if (pathname === '/login' || pathname.startsWith('/upload')) return null;

  return (
    <aside className="hidden xl:flex flex-col w-[272px] shrink-0 border-l border-[#2d3a52]/50 bg-[#0d1a2d] overflow-y-auto max-h-screen sticky top-0">
      <div className="p-4 space-y-4">
        {/* Today's Schedule */}
        <PanelSection
          label="Today's Schedule"
          icon={<Calendar size={14} />}
          href="/calendar"
        >
          {!loaded ? (
            <SkeletonLines count={3} />
          ) : events.length > 0 ? (
            <div className="space-y-2.5">
              {events.map(event => (
                <div key={event.id} className="flex gap-2">
                  <div className="text-[10px] text-[#64748b] w-[52px] shrink-0 pt-0.5 font-mono">
                    {formatTime(event.start)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-white font-medium truncate">{event.title}</p>
                    {event.location && (
                      <p className="text-[10px] text-[#64748b] truncate">{event.location}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#64748b] italic">No events today.</p>
          )}
        </PanelSection>

        {/* My Tasks */}
        <PanelSection
          label="My Tasks"
          icon={<CheckSquare size={14} />}
          href="/tasks"
        >
          {!loaded ? (
            <SkeletonLines count={4} />
          ) : tasks.length > 0 ? (
            <div className="space-y-2">
              {tasks.map(task => {
                const dotColor = PRIORITY_COLORS[task.priority || 'medium'] || '#64748b';
                const overdue = isOverdue(task.due_date);
                const dueLabel = task.due_date
                  ? new Date(task.due_date + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })
                  : null;

                return (
                  <div key={task.id} className="flex items-start gap-2">
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                      style={{ backgroundColor: dotColor }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-white truncate">{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {task.agency && (
                          <span className="text-[10px] text-[#64748b]">{task.agency}</span>
                        )}
                        {dueLabel && (
                          <span className={`text-[10px] flex items-center gap-0.5 ${overdue ? 'text-red-400' : 'text-[#64748b]'}`}>
                            <Clock size={8} />
                            {dueLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-[#64748b] italic">No open tasks.</p>
          )}
        </PanelSection>

        {/* Notifications */}
        <PanelSection
          label="Notifications"
          icon={<Bell size={14} />}
        >
          {!loaded ? (
            <SkeletonLines count={3} />
          ) : notifications.length > 0 ? (
            <div className="space-y-2">
              {notifications.map(n => {
                const accent = CATEGORY_COLORS[n.category] || '#64748b';
                return (
                  <div key={n.id} className="flex items-start gap-2">
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5"
                      style={{ backgroundColor: `${accent}20` }}
                    >
                      <Bell size={9} style={{ color: accent }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-white truncate">{n.title}</p>
                      <p className="text-[10px] text-[#64748b]">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-[#64748b] italic">All caught up.</p>
          )}
        </PanelSection>
      </div>
    </aside>
  );
}

function PanelSection({ label, icon, href, children }: {
  label: string;
  icon: React.ReactNode;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card p-3.5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[#64748b]">{icon}</span>
        <span className="text-[10px] uppercase tracking-wider text-[#64748b] font-semibold">{label}</span>
        {href && (
          <Link href={href} className="ml-auto text-[#64748b] hover:text-[#d4af37] transition-colors">
            <ExternalLink size={11} />
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function SkeletonLines({ count }: { count: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-2 animate-pulse">
          <div className="w-10 h-3 bg-[#2d3a52] rounded" />
          <div className="flex-1 h-3 bg-[#2d3a52] rounded" />
        </div>
      ))}
    </div>
  );
}
