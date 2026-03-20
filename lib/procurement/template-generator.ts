import * as XLSX from 'xlsx';

const HEADERS = [
  'Bid Reference',
  'Title',
  'Description',
  'Estimated Value (GYD)',
  'Procurement Method',
  'Opening Date',
  'Tender Board',
  'Expected Delivery Date',
  'Notes',
];

const EXAMPLE_ROW = [
  'ICB No. GWI-W191-2025',
  'Supply and Delivery of DI Pipes',
  'Supply and delivery of ductile iron pipes for Georgetown water main rehabilitation',
  '45000000',
  'Open Tender',
  '15-Mar-2026',
  'NPTAB',
  '30-Sep-2026',
  'Pre-qualified bidders notified',
];

/**
 * Generate a blank .xlsx template with headers and one example row.
 * Returns an ArrayBuffer suitable for download.
 */
export function generateTemplate(): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, EXAMPLE_ROW]);

  // Set column widths for readability
  ws['!cols'] = [
    { wch: 24 }, // Bid Reference
    { wch: 36 }, // Title
    { wch: 48 }, // Description
    { wch: 20 }, // Estimated Value
    { wch: 22 }, // Procurement Method
    { wch: 16 }, // Opening Date
    { wch: 14 }, // Tender Board
    { wch: 22 }, // Expected Delivery Date
    { wch: 36 }, // Notes
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Procurement');

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}
