import { fetchTasks } from './notion';
import { fetchTodayEvents, fetchWeekEvents, fetchTomorrowEvents, CalendarEvent } from './google-calendar';
import { calculateDayStats } from './calendar-utils';
import { isToday, isPast, isWithinInterval, addDays } from 'date-fns';

interface Task {
  notion_id: string;
  title: string;
  status: string | null;
  due_date: string | null;
  assignee: string | null;
  agency: string | null;
  role: string | null;
  priority: string | null;
  created_at: string;
}

interface Briefing {
  summary: {
    total_tasks: number;
    overdue_count: number;
    due_today_count: number;
    due_this_week_count: number;
    meetings_today: number;
  };
  overdue: Task[];
  due_today: Task[];
  due_this_week: Task[];
  no_due_date: Task[];
  by_role: Record<string, Task[]>;
  by_agency: Record<string, Task[]>;
  calendar: {
    today: CalendarEvent[];
    this_week: CalendarEvent[];
    tomorrow: CalendarEvent[];
    stats: {
      total_events: number;
      total_hours: number;
      free_hours: number;
    };
  };
  generated_at: string;
}

export async function generateBriefing(): Promise<Briefing> {
  const [tasks, todayEvents, weekEvents, tomorrowEvents] = await Promise.all([
    fetchTasks(),
    fetchTodayEvents(),
    fetchWeekEvents(),
    fetchTomorrowEvents()
  ]);

  const now = new Date();
  const weekFromNow = addDays(now, 7);

  // Categorize tasks
  const overdue = tasks.filter(t =>
    t.due_date && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date))
  ).sort((a, b) =>
    new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime()
  );

  const dueToday = tasks.filter(t =>
    t.due_date && isToday(new Date(t.due_date))
  );

  const dueThisWeek = tasks.filter(t =>
    t.due_date &&
    !isToday(new Date(t.due_date)) &&
    !isPast(new Date(t.due_date)) &&
    isWithinInterval(new Date(t.due_date), { start: now, end: weekFromNow })
  );

  const noDueDate = tasks.filter(t => !t.due_date);

  // Group by role
  const byRole = groupBy(tasks, 'role');

  // Group by agency
  const byAgency = groupBy(tasks, 'agency');

  // Calculate day stats
  const dayStats = calculateDayStats(todayEvents);

  return {
    summary: {
      total_tasks: tasks.length,
      overdue_count: overdue.length,
      due_today_count: dueToday.length,
      due_this_week_count: dueThisWeek.length,
      meetings_today: todayEvents.length
    },
    overdue,
    due_today: dueToday,
    due_this_week: dueThisWeek,
    no_due_date: noDueDate,
    by_role: byRole,
    by_agency: byAgency,
    calendar: {
      today: todayEvents,
      this_week: weekEvents,
      tomorrow: tomorrowEvents,
      stats: {
        total_events: dayStats.total_events,
        total_hours: dayStats.total_hours,
        free_hours: dayStats.free_hours,
      },
    },
    generated_at: new Date().toISOString()
  };
}

function groupBy<T extends Record<string, any>>(items: T[], key: string): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const group = item[key] || 'Unassigned';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
