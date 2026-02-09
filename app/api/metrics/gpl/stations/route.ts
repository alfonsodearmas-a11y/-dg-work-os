import { NextResponse } from 'next/server';

const GPL_STATIONS = [
  { code: 'SEI', name: 'Skeldon Energy Inc', type: 'fossil' },
  { code: 'CANEFIELD', name: 'Canefield', type: 'fossil' },
  { code: 'DP1', name: 'Demerara Power 1', type: 'fossil' },
  { code: 'DP2', name: 'Demerara Power 2', type: 'fossil' },
  { code: 'DP3', name: 'Demerara Power 3', type: 'fossil' },
  { code: 'DP4', name: 'Demerara Power 4', type: 'fossil' },
  { code: 'DP5', name: 'Demerara Power 5', type: 'fossil' },
  { code: 'COL', name: 'Columbia', type: 'fossil' },
  { code: 'GOE', name: 'Garden of Eden', type: 'fossil' },
  { code: 'PS1', name: 'Power Station 1', type: 'fossil' },
  { code: 'PS2', name: 'Power Station 2', type: 'fossil' },
];

const GPL_SOLAR_SITES = [
  { code: 'HAMPSHIRE', name: 'Hampshire Solar', capacity: 3 },
  { code: 'PROSPECT', name: 'Prospect Solar', capacity: 3 },
  { code: 'TRAFALGAR', name: 'Trafalgar Solar', capacity: 4 },
];

export async function GET() {
  return NextResponse.json({ success: true, data: { stations: GPL_STATIONS, solarSites: GPL_SOLAR_SITES } });
}
