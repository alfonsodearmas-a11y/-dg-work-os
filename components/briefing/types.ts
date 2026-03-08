export interface Action {
  id: string;
  title: string;
  agency: string | null;
  assignee: string | null;
  dueDate: string | null;
  priority: string | null;
  status: string | null;
  sourceMeeting: string | null;
  notes: string | null;
  url: string;
  overdueDays: number;
  staleDays: number;
  urgencyScore: number;
}

export interface AgencyPulse {
  agency: string;
  openCount: number;
  overdueCount: number;
  staleCount: number;
  healthRatio: number;
}

export interface ActionsData {
  overdue: Action[];
  dueToday: Action[];
  dueThisWeek: Action[];
  stale: Action[];
  agencyPulse: AgencyPulse[];
  summary: {
    totalOpen: number;
    totalOverdue: number;
    totalStale: number;
    criticalAgencies: string[];
  };
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  attendees: string[];
  agency: string | null;
}

export interface CalendarData {
  today: CalendarEvent[];
  upcoming: CalendarEvent[];
  authRequired?: boolean;
}

export interface MeetingNote {
  id: string;
  title: string;
  date: string | null;
  category: string | null;
  summary: string | null;
  relatedAgency: string | null;
  url: string;
}

export interface MeetingsData {
  meetings: MeetingNote[];
}

export interface MeetingSummaryAction {
  id: string;
  task: string;
  due_date: string | null;
  meeting_title: string | null;
}

export interface MeetingNeedsReview {
  meeting_id: string;
  meeting_title: string;
  count: number;
}

export interface MeetingSummaryData {
  meetingsThisWeek: number;
  actions: MeetingSummaryAction[];
  needsReview?: {
    total: number;
    byMeeting: MeetingNeedsReview[];
  };
}

export interface BriefingData {
  briefing: string;
  generatedAt: string;
  model: string;
}
