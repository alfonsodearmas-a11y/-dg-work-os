// All times resolved in America/Guyana (UTC-4, no DST).

const TRIGGER_PHRASES = ['when ready', 'in due course', 'when complete', 'when done'];

export interface ResolveDueResult {
  due_at: Date | null;
  due_trigger: string | null;
  flagged: boolean;
}

function atGuyana(date: Date, hours: number): Date {
  // Construct a Date at the given hours in UTC-4.
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours + 4, 0, 0));
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function nextFriday(d: Date, atHours = 17): Date {
  // Day-of-week in Guyana time
  const guyanaHour = (d.getUTCHours() - 4 + 24) % 24;
  const guyanaDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    guyanaHour, d.getUTCMinutes(), 0));
  const dow = guyanaDate.getUTCDay();   // 0=Sun, 5=Fri
  let delta = (5 - dow + 7) % 7;
  // If meeting is Friday afternoon (after 12:00 Guyana), roll to following Friday.
  if (dow === 5 && guyanaHour >= 12) delta = 7;
  if (delta === 0 && dow !== 5) delta = 7;
  return atGuyana(addDays(guyanaDate, delta), atHours);
}

function addWeekdays(d: Date, n: number): Date {
  let out = new Date(d);
  let added = 0;
  while (added < n) {
    out = addDays(out, 1);
    const dow = out.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return out;
}

export function resolveDueDate(phrase: string | null, meetingDate: Date): ResolveDueResult {
  if (phrase === null) {
    return { due_at: null, due_trigger: null, flagged: true };
  }
  const p = phrase.trim().toLowerCase();
  if (TRIGGER_PHRASES.some(t => p.includes(t))) {
    return { due_at: null, due_trigger: phrase, flagged: false };
  }
  if (p.includes('today') || p.includes('eod')) {
    return { due_at: atGuyana(meetingDate, 18), due_trigger: null, flagged: false };
  }
  if (p.includes('tomorrow') || p.includes('by morning')) {
    return { due_at: atGuyana(addDays(meetingDate, 1), 9), due_trigger: null, flagged: false };
  }
  if (p.includes('next week')) {
    const fri = nextFriday(meetingDate, 17);
    return { due_at: addDays(fri, 7), due_trigger: null, flagged: false };
  }
  if (p.includes('this week')) {
    return { due_at: nextFriday(meetingDate, 17), due_trigger: null, flagged: false };
  }
  if (p.includes('asap')) {
    return { due_at: addWeekdays(meetingDate, 3), due_trigger: null, flagged: true };
  }
  // No temporal language we recognize — flag for review.
  return { due_at: null, due_trigger: null, flagged: true };
}
