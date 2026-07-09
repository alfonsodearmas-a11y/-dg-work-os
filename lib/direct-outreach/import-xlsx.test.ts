import { describe, expect, test } from 'vitest';
import * as XLSX from 'xlsx';
import { OutreachImportError, parseOutreachWorkbook } from './import-xlsx';

const DATA_HEADERS = [
  'Case ID', 'Agency', 'Status', 'Priority Code', 'Priority Flag', 'Issue Theme',
  'Service Category', 'Issue Description', 'Client Name', 'Contact', 'Locality / Address',
  'Outreach Location', 'Outreach Date', 'Date Logged', 'Days Open', 'Age Bucket', 'Resolution',
];

const COMMENT_HEADERS = ['Case ID', 'Agency', 'Status at Entry', 'Date', 'Author', 'Comment'];

function buildWorkbook({
  dataRows,
  commentRows,
  sheets,
}: {
  dataRows?: unknown[][];
  commentRows?: unknown[][];
  sheets?: Record<string, unknown[][]>;
} = {}): Buffer {
  const wb = XLSX.utils.book_new();
  const content = sheets ?? {
    // Data: header is the FIRST row
    Data: [DATA_HEADERS, ...(dataRows ?? [])],
    // Comments Log: header is row 4 (three preamble rows above it)
    'Comments Log': [
      ['OP Direct — Comments Log'],
      [],
      ['Exported 2026-07-09'],
      COMMENT_HEADERS,
      ...(commentRows ?? []),
    ],
  };
  for (const [name, rows] of Object.entries(content)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows as unknown[][]), name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true }) as Buffer;
}

// Local-constructed Dates: xlsx materialises workbook dates as local wall-clock
// Dates, which the parser interprets as Guyana (UTC-4) wall time — so these
// fixtures and their expected instants hold on any test machine's timezone.
const CASE_101 = [
  101, 'GWI', 'Open', 0, '', '', 'Water Supply', 'No water for two weeks', 'Jane Doe',
  '600-0000', 'Lot 5 Anna Regina', 'Anna Regina Outreach', new Date(2026, 4, 1),
  new Date(2026, 4, 2, 10, 0, 0), 68, '31-90', '',
];
const CASE_102 = [
  102, 'GPL', 'Resolved', 2, 'Elevated', 'Electricity-Supply', 'Power', 'Nightly blackouts',
  'John Roe', '600-1111', 'Better Hope', 'Better Hope Outreach', new Date(2026, 3, 10),
  new Date(2026, 3, 11, 9, 0, 0), 90, '31-90', 'Resolved on site',
];

describe('parseOutreachWorkbook — Data sheet mapping', () => {
  test('maps columns by header name and derives fallbacks', () => {
    const { cases } = parseOutreachWorkbook(buildWorkbook({ dataRows: [CASE_101, CASE_102] }));
    expect(cases).toHaveLength(2);

    const c101 = cases.find((c) => c.case_id === 101)!;
    expect(c101.agency).toBe('GWI');
    expect(c101.status).toBe('Open');
    expect(c101.priority).toBe(0);
    expect(c101.priority_flag).toBe('Normal'); // blank flag → priorityFlag(0)
    expect(c101.theme).toBe('Water-Supply'); // blank theme → classifyTheme()
    expect(c101.category_name).toBe('Water Supply');
    expect(c101.description).toBe('No water for two weeks');
    expect(c101.client_name).toBe('Jane Doe');
    expect(c101.client_phone).toBe('600-0000');
    expect(c101.client_address).toBe('Lot 5 Anna Regina');
    expect(c101.outreach_location).toBe('Anna Regina Outreach');
    expect(c101.outreach_date).toBe('2026-05-01');
    // Guyana wall clock 2026-05-02 10:00 → instant 14:00 UTC
    expect(c101.created_at).toBe('2026-05-02T14:00:00.000Z');

    const c102 = cases.find((c) => c.case_id === 102)!;
    expect(c102.priority).toBe(2);
    expect(c102.priority_flag).toBe('Elevated'); // explicit flag wins
    expect(c102.theme).toBe('Electricity-Supply'); // explicit theme wins
  });

  test('ignores the derived Days Open / Age Bucket / Resolution columns', () => {
    const { cases } = parseOutreachWorkbook(buildWorkbook({ dataRows: [CASE_101] }));
    const keys = Object.keys(cases[0]);
    expect(keys).not.toContain('days_open');
    expect(keys).not.toContain('age_bucket');
    expect(keys).not.toContain('resolution');
  });

  test('survives column reorder (mapping is by header, not index)', () => {
    const reordered = [...DATA_HEADERS].reverse();
    const row = [...CASE_101].reverse();
    const { cases } = parseOutreachWorkbook(
      buildWorkbook({
        sheets: {
          Data: [reordered, row],
          'Comments Log': [COMMENT_HEADERS],
        },
      }),
    );
    expect(cases[0].case_id).toBe(101);
    expect(cases[0].client_name).toBe('Jane Doe');
    expect(cases[0].outreach_date).toBe('2026-05-01');
  });

  test('skips blank rows and counts duplicate Case IDs', () => {
    const dup = [...CASE_101];
    const parsed = parseOutreachWorkbook(
      buildWorkbook({ dataRows: [CASE_101, [null, '', ''], dup, CASE_102] }),
    );
    expect(parsed.cases).toHaveLength(2);
    expect(parsed.duplicate_cases).toBe(1);
    expect(parsed.invalid_case_rows).toBe(0);
  });

  test('rejects malformed Case ID cells instead of mis-parsing them', () => {
    const bad1 = [...CASE_101]; bad1[0] = '1,234'; // parseInt would read this as 1
    const bad2 = [...CASE_101]; bad2[0] = '12abc';
    const parsed = parseOutreachWorkbook(buildWorkbook({ dataRows: [bad1, bad2, CASE_102] }));
    expect(parsed.cases.map((c) => c.case_id)).toEqual([102]);
    expect(parsed.invalid_case_rows).toBe(2);
  });

  test('date-only cells stay on the Guyana calendar day (no UTC shift)', () => {
    const { cases } = parseOutreachWorkbook(buildWorkbook({ dataRows: [CASE_101] }));
    // Date Logged as a date-only cell in CASE_102's shape: verify via a dedicated row
    const dateOnly = [...CASE_101];
    dateOnly[13] = new Date(2026, 4, 1); // Date Logged: wall 2026-05-01 00:00 Guyana
    const parsed = parseOutreachWorkbook(buildWorkbook({ dataRows: [dateOnly] }));
    // Stored instant is Guyana midnight (04:00 UTC) — converting back at UTC-4
    // lands on 2026-05-01, not the previous day.
    expect(parsed.cases[0].created_at).toBe('2026-05-01T04:00:00.000Z');
    expect(cases[0].outreach_date).toBe('2026-05-01');
  });
});

describe('parseOutreachWorkbook — Comments Log + rollups', () => {
  const comments = [
    [101, 'GWI', 'Open', new Date(2026, 4, 3, 8, 0, 0), 'GWI/asmith', 'Case Created'],
    [101, 'GWI', 'Follow Up', new Date(2026, 5, 10, 14, 30, 0), 'GWI/bjones',
      'Crew scheduled; completion expected June 30, 2026'],
    [999, 'GPL', 'Open', new Date(2026, 5, 1), 'GPL/nobody', 'Orphan comment'],
  ];

  test('maps entries, splits Author, skips orphans, synthesizes entry_ref', () => {
    const parsed = parseOutreachWorkbook(
      buildWorkbook({ dataRows: [CASE_101, CASE_102], commentRows: comments }),
    );
    expect(parsed.updates).toHaveLength(2); // orphan case 999 dropped (FK safety)
    expect(parsed.skipped_updates).toBe(1);

    const first = parsed.updates[0];
    expect(first.case_id).toBe(101);
    expect(first.agency).toBe('GWI');
    expect(first.status).toBe('Open');
    expect(first.creator_agency).toBe('GWI');
    expect(first.username).toBe('asmith');
    expect(first.author).toBe('GWI/asmith');
    expect(first.created_at).toBe('2026-05-03T12:00:00.000Z'); // Guyana 08:00 → 12:00 UTC

    const refs = parsed.updates.map((u) => u.entry_ref);
    expect(new Set(refs).size).toBe(refs.length); // unique (column is NOT NULL UNIQUE)
    expect(refs.every((r) => Number.isInteger(r) && r > 0)).toBe(true);
  });

  test('computes rollups exactly like the retired sync', () => {
    const parsed = parseOutreachWorkbook(
      buildWorkbook({ dataRows: [CASE_101, CASE_102], commentRows: comments }),
    );
    const c101 = parsed.cases.find((c) => c.case_id === 101)!;

    // 'Case Created' is not substantive → count 1, latest = the crew comment
    expect(c101.comment_count).toBe(1);
    expect(c101.latest_update).toBe('Crew scheduled; completion expected June 30, 2026');
    expect(c101.latest_update_date).toBe('2026-06-10T18:30:00.000Z');
    expect(c101.latest_update_by).toBe('GWI/bjones'); // full AGENCY/username string
    expect(c101.last_activity_at).toBe('2026-06-10T18:30:00.000Z');
    expect(c101.committed_date).toBe('2026-06-30');
    expect(c101.committed_source).toBe('Crew scheduled; completion expected June 30, 2026');
    expect(c101.committed_by).toBe('GWI/bjones');

    // No comments → defaults; last_activity falls back to created_at
    const c102 = parsed.cases.find((c) => c.case_id === 102)!;
    expect(c102.comment_count).toBe(0);
    expect(c102.latest_update).toBeNull();
    expect(c102.last_activity_at).toBe(c102.created_at);
    expect(c102.committed_date).toBeNull();
  });

  test('same-day date-only comments: the later sheet row wins the rollup', () => {
    // Date-only cells all tie at midnight — the entry_ref tiebreak must pick
    // the later sheet row as "latest", matching the detail panel's ordering
    // (ORDER BY created_at DESC, entry_ref DESC).
    const sameDay = [
      [101, 'GWI', 'Referred', new Date(2026, 5, 10), 'GWI/asmith', 'Referred to GPL'],
      [101, 'GWI', 'Follow Up', new Date(2026, 5, 10), 'GWI/bjones', 'Crew completed works, resolved'],
    ];
    const parsed = parseOutreachWorkbook(
      buildWorkbook({ dataRows: [CASE_101], commentRows: sameDay }),
    );
    const c101 = parsed.cases.find((c) => c.case_id === 101)!;
    expect(c101.latest_update).toBe('Crew completed works, resolved');
    expect(c101.latest_update_by).toBe('GWI/bjones');
  });
});

describe('parseOutreachWorkbook — malformed workbooks', () => {
  test('missing sheet names the sheet', () => {
    const buf = buildWorkbook({ sheets: { Data: [DATA_HEADERS, CASE_101] } });
    expect(() => parseOutreachWorkbook(buf)).toThrowError(OutreachImportError);
    expect(() => parseOutreachWorkbook(buf)).toThrowError(/Comments Log/);
  });

  test('missing required column names the column', () => {
    const headers = DATA_HEADERS.filter((h) => h !== 'Issue Description');
    const buf = buildWorkbook({
      sheets: { Data: [headers, CASE_101.slice(0, headers.length)], 'Comments Log': [COMMENT_HEADERS] },
    });
    expect(() => parseOutreachWorkbook(buf)).toThrowError(/Issue Description/);
  });

  test('sheet without a Case ID header row is rejected', () => {
    const buf = buildWorkbook({
      sheets: { Data: [['nothing', 'useful'], [1, 2]], 'Comments Log': [COMMENT_HEADERS] },
    });
    expect(() => parseOutreachWorkbook(buf)).toThrowError(/header row containing "Case ID"/);
  });

  test('non-Excel bytes are rejected with a clear message', () => {
    // SheetJS parses plain text as a single CSV-ish sheet, so garbage bytes
    // surface as the missing-"Data"-sheet error (still a clear 400).
    expect(() => parseOutreachWorkbook(Buffer.from('not a workbook'))).toThrowError(
      OutreachImportError,
    );
    expect(() => parseOutreachWorkbook(Buffer.from('not a workbook'))).toThrowError(
      /missing the "Data" sheet/,
    );
  });
});
