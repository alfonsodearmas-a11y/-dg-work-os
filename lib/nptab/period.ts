// Quarter math in Guyana local time (America/Guyana, UTC-4, no DST).

export type Quarter = 1 | 2 | 3 | 4;

function guyanaParts(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guyana',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

export function quarterOf(d: Date): { year: number; quarter: Quarter } {
  const { year, month } = guyanaParts(d);
  const q = Math.ceil(month / 3) as Quarter;
  return { year, quarter: q };
}

export function periodToDates(year: number, quarter: Quarter): { start: string; end: string } {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const start = `${year}-${String(startMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  const end = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export function nextQuarterEnd(now: Date): { year: number; quarter: Quarter; start: string; end: string } {
  const { year, quarter } = quarterOf(now);
  return { year, quarter, ...periodToDates(year, quarter) };
}

export function periodLabel(start: string, end: string): string {
  const startYear = Number(start.slice(0, 4));
  const startMonth = Number(start.slice(5, 7));
  const endYear = Number(end.slice(0, 4));
  const q = Math.ceil(startMonth / 3) as Quarter;
  return startYear === endYear ? `Q${q} ${startYear}` : `${start} to ${end}`;
}
