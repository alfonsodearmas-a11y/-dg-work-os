import * as XLSX from 'xlsx';

const HEADERS = [
  'No.',
  'Airstrip',
  'Region',
  'Engineered Structure',
  'Runway Geometry',
  'Existing Surface Layer',
  'Surface Condition at Last Inspection',
  'Date of Last Inspection',
  'Frequency of Flight Operations',
  'Airside Infrastructure Buildings',
  'Remarks',
];

const EXAMPLE_ROW = [
  1,
  'Kamarang',
  7,
  'Yes',
  'Length: 800m \nWidth: 23m',
  'Laterite',
  'Good',
  '15-Jan-2026',
  'High',
  'Terminal building, fuel storage',
  'Main regional hub',
];

/**
 * Generate a blank .xlsx template for airstrip bulk upload.
 * Returns an ArrayBuffer suitable for download.
 */
export function generateAirstripTemplate(): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, EXAMPLE_ROW]);

  ws['!cols'] = [
    { wch: 5 },   // No.
    { wch: 24 },  // Airstrip
    { wch: 8 },   // Region
    { wch: 22 },  // Engineered Structure
    { wch: 28 },  // Runway Geometry
    { wch: 28 },  // Existing Surface Layer
    { wch: 36 },  // Surface Condition
    { wch: 22 },  // Date of Last Inspection
    { wch: 30 },  // Frequency of Flight Operations
    { wch: 36 },  // Airside Infrastructure Buildings
    { wch: 30 },  // Remarks
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Airstrips');

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}
