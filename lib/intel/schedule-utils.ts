// Pure scheduling math for agency_scheduled_reports.
//
// Guyana is fixed UTC-4 with no DST. We compute next_run_at by treating
// the configured local-clock hour as UTC-4. If we ever support other
// zones, swap to Intl.DateTimeFormat at the boundary; the rest of the
// function stays the same.

const GUYANA_OFFSET_HOURS = -4;

export type Frequency = 'weekly' | 'fortnightly' | 'monthly';

export type ScheduleSpec = {
  frequency: Frequency;
  day_of_week?: number | null;   // 0=Sun..6=Sat, required for weekly/fortnightly
  day_of_month?: number | null;  // 1..28, required for monthly
  send_hour: number;             // 0..23, local
  timezone: string;              // 'America/Guyana'
};

function offsetForTimezone(tz: string): number {
  if (tz === 'America/Guyana') return GUYANA_OFFSET_HOURS;
  return GUYANA_OFFSET_HOURS;
}

function utcForLocalDate(
  year: number,
  month0: number,
  day: number,
  sendHour: number,
  tz: string,
): Date {
  const offset = offsetForTimezone(tz);
  // local = utc + offset, so utc = local - offset.
  return new Date(Date.UTC(year, month0, day, sendHour - offset, 0, 0, 0));
}

function localComponents(d: Date, tz: string): {
  year: number;
  month0: number;
  day: number;
  dow: number;
} {
  const offset = offsetForTimezone(tz);
  const shifted = new Date(d.getTime() + offset * 3600 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month0: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    dow: shifted.getUTCDay(),
  };
}

export function computeNextRunAt(spec: ScheduleSpec, from: Date = new Date()): Date {
  if (spec.frequency === 'weekly' || spec.frequency === 'fortnightly') {
    if (spec.day_of_week == null) {
      throw new Error('day_of_week is required for weekly or fortnightly schedules');
    }
    const local = localComponents(from, spec.timezone);
    let target = utcForLocalDate(
      local.year,
      local.month0,
      local.day,
      spec.send_hour,
      spec.timezone,
    );
    let daysAhead = (spec.day_of_week - local.dow + 7) % 7;
    if (daysAhead === 0 && target.getTime() <= from.getTime()) daysAhead = 7;
    if (daysAhead > 0) {
      target = new Date(target.getTime() + daysAhead * 86400 * 1000);
    }
    if (spec.frequency === 'fortnightly' && daysAhead === 7) {
      // Advancing from a previously-fired run lands exactly 7 days ahead
      // under weekly logic. Fortnightly needs another 7 to double the gap.
      // The first run (daysAhead < 7) stays soon so a brand-new schedule
      // does not silently wait two weeks before its first send.
      target = new Date(target.getTime() + 7 * 86400 * 1000);
    }
    return target;
  }

  if (spec.frequency === 'monthly') {
    if (spec.day_of_month == null) {
      throw new Error('day_of_month is required for monthly schedules');
    }
    const local = localComponents(from, spec.timezone);
    let target = utcForLocalDate(
      local.year,
      local.month0,
      spec.day_of_month,
      spec.send_hour,
      spec.timezone,
    );
    if (target.getTime() <= from.getTime()) {
      target = utcForLocalDate(
        local.year,
        local.month0 + 1,
        spec.day_of_month,
        spec.send_hour,
        spec.timezone,
      );
    }
    return target;
  }

  throw new Error(`Unknown frequency: ${spec.frequency}`);
}
