import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDelayedProjectsFile } from '@/lib/delayed-projects/upload-parser';

const FIXTURE = resolve(__dirname, '../../../tests/fixtures/oversight-project-list-2026.xlsx');
const buffer = readFileSync(FIXTURE);

describe('parseDelayedProjectsFile — oversight-project-list-2026 fixture', () => {
  const result = parseDelayedProjectsFile(buffer);

  it('parses 27 rows', () => {
    expect(result.rows.length).toBe(27);
  });

  it('emits no warnings', () => {
    expect(result.warnings).toEqual([]);
  });

  it('reports no missing required fields', () => {
    expect(result.missingRequiredFields).toEqual([]);
  });

  it('does not default executing_agency (Agency Short Name maps successfully)', () => {
    expect(result.executingAgencyDefaulted).toBe(false);
    expect(result.executingAgencyDefaultedCount).toBe(0);
  });

  it('maps Project Title -> project_name on the first row', () => {
    const first = result.rows[0];
    expect(first.project_name).toBe('Construction of GWI Corporate Complex - Region 4');
  });

  it('maps Project Reference / Sub Agency Short Name / Agency Short Name on the first row', () => {
    const first = result.rows[0];
    expect(first.project_reference.startsWith('GWIXXX202603X30068')).toBe(true);
    expect(first.sub_agency).toBe('GWI');
    expect(first.executing_agency).toBe('MOPUA');
  });

  it('captures View Project as a numeric source_id', () => {
    expect(result.headerMapping['View Project']).toBe('source_id');
    expect(result.rows[0].source_id).toBe(30068);
    expect(result.rows.every((r) => typeof r.source_id === 'number')).toBe(true);
    expect(new Set(result.rows.map((r) => r.source_id)).size).toBe(result.rows.length); // unique
  });
});
