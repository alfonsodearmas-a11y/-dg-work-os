/** Centralized API endpoint paths for agency data fetching */

export const API_PATHS = {
  GPL_LATEST: '/api/gpl/latest',
  GPL_DAILY: (date: string) => `/api/gpl/daily/${date}`,
  GPL_ANALYSIS: (uploadId: string) => `/api/gpl/analysis/${uploadId}`,
  GWI_REPORT_LATEST: '/api/gwi/report/latest',
  DELAYED_COUNTS: '/api/projects/delayed-counts',
} as const;
