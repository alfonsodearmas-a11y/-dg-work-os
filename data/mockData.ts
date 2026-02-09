// Mock data generators for the Ministry Dashboard
// GPL data sourced from DBIS Availability Report

export interface CJIAData {
  mtdPeriod: string;
  mtdArrivals: number;
  mtdDepartures: number;
  mtdTotal: number;
  mtdYoyChange: number;
  annual2025Arrivals: number;
  annual2025Departures: number;
  annual2025Total: number;
  historicalComparison: { year: string; arrivals: number; departures: number; total: number }[];
  historicalMonthlyData: Record<string, { month: string; arrivals: number; departures: number; partial?: boolean; period?: string }[]>;
  monthlyData: { month: string; arrivals: number; departures: number; cargoArrived: number; cargoDeparted: number }[];
  ytdCargoArrived: number;
  ytdCargoDeparted: number;
  onTimePercent: number;
  safetyIncidents: number;
  dailyFlights: number;
  internationalPercent: number;
}

export interface GWIData {
  nrwPercent: number;
  nrwTarget: number;
  activeDisruptions: number;
  avgResponseTime: number;
  responseTimeTrend: number;
  avgRepairTime: number;
  repairTimeTrend: number;
  productionMgd: number;
  coveragePercent: number;
  disruptionAreas: string[];
  productionVsBilled: {
    produced: number;
    billed: number;
  };
  disruptionTrend: Array<{
    day: string;
    count: number;
  }>;
}

export interface GPLStation {
  name: string;
  units: number;
  derated: number;
  available: number;
}

export interface GPLSolarStation {
  name: string;
  capacity: number;
}

export interface GPLPeakDemandDay {
  date: string;
  eveningOnBars: number;
  eveningSuppressed: number;
  dayOnBars: number;
  daySuppressed: number;
}

export interface GPLData {
  source: string;
  capacityDate: string;
  peakDemandDate: string;
  actualEveningPeak: { onBars: number; suppressed: number };
  actualDayPeak: { onBars: number; suppressed: number };
  expectedPeakDemand: number;
  forcedOutageRate: number;
  generationAvailAtSuppressed: null;
  approximateSuppressedPeak: null;
  powerStations: GPLStation[];
  solarStations: GPLSolarStation[];
  totalRenewableCapacity: number;
  peakDemandHistory: GPLPeakDemandDay[];
  // Optional fields from API
  reportDate?: string;
  aiAnalysis?: any;
}

export interface GCAAData {
  activeRegistrations: number;
  inspectionsMTD: number;
  inspectionsTarget: number;
  complianceRate: number;
  pendingCertifications: number;
  safetyAudits: number;
}

export interface AgencyRawData {
  cjia: CJIAData;
  gwi: GWIData;
  gpl: GPLData;
  gcaa: GCAAData;
}

export const generateAgencyData = (): AgencyRawData => ({
  cjia: {
    mtdPeriod: 'January 1-26, 2026',
    mtdArrivals: 12850,
    mtdDepartures: 12000,
    mtdTotal: 24850,
    mtdYoyChange: 12.3,

    annual2025Arrivals: 515510,
    annual2025Departures: 456621,
    annual2025Total: 972131,

    historicalComparison: [
      { year: '2022', arrivals: 8500, departures: 7800, total: 16300 },
      { year: '2023', arrivals: 10200, departures: 9500, total: 19700 },
      { year: '2024', arrivals: 11400, departures: 10700, total: 22100 },
      { year: '2025', arrivals: 12100, departures: 11200, total: 23300 },
      { year: '2026', arrivals: 12850, departures: 12000, total: 24850 },
    ],

    historicalMonthlyData: {
      '2025': [
        { month: 'Jan', arrivals: 37030, departures: 36809 },
        { month: 'Feb', arrivals: 33162, departures: 29725 },
        { month: 'Mar', arrivals: 37296, departures: 34224 },
        { month: 'Apr', arrivals: 43199, departures: 38757 },
        { month: 'May', arrivals: 39078, departures: 37958 },
        { month: 'Jun', arrivals: 37885, departures: 36354 },
        { month: 'Jul', arrivals: 48292, departures: 48278 },
        { month: 'Aug', arrivals: 58550, departures: 51960 },
        { month: 'Sep', arrivals: 43274, departures: 35559 },
        { month: 'Oct', arrivals: 42799, departures: 35081 },
        { month: 'Nov', arrivals: 40896, departures: 33058 },
        { month: 'Dec', arrivals: 54049, departures: 38858 },
      ],
      '2024': [
        { month: 'Jan', arrivals: 34500, departures: 33200 },
        { month: 'Feb', arrivals: 30800, departures: 27500 },
        { month: 'Mar', arrivals: 35100, departures: 32100 },
        { month: 'Apr', arrivals: 40200, departures: 36200 },
        { month: 'May', arrivals: 36500, departures: 35400 },
        { month: 'Jun', arrivals: 35200, departures: 33800 },
        { month: 'Jul', arrivals: 45100, departures: 44800 },
        { month: 'Aug', arrivals: 54200, departures: 48100 },
        { month: 'Sep', arrivals: 40100, departures: 33000 },
        { month: 'Oct', arrivals: 39800, departures: 32500 },
        { month: 'Nov', arrivals: 38000, departures: 30700 },
        { month: 'Dec', arrivals: 50200, departures: 36100 },
      ],
      '2023': [
        { month: 'Jan', arrivals: 31200, departures: 30100 },
        { month: 'Feb', arrivals: 27900, departures: 24800 },
        { month: 'Mar', arrivals: 31800, departures: 29100 },
        { month: 'Apr', arrivals: 36400, departures: 32800 },
        { month: 'May', arrivals: 33100, departures: 32000 },
        { month: 'Jun', arrivals: 31900, departures: 30600 },
        { month: 'Jul', arrivals: 40800, departures: 40500 },
        { month: 'Aug', arrivals: 49100, departures: 43500 },
        { month: 'Sep', arrivals: 36300, departures: 29900 },
        { month: 'Oct', arrivals: 36000, departures: 29400 },
        { month: 'Nov', arrivals: 34400, departures: 27800 },
        { month: 'Dec', arrivals: 45400, departures: 32700 },
      ],
      '2026': [
        { month: 'Jan', arrivals: 12850, departures: 12000, partial: true, period: '1-26' },
      ],
    },

    monthlyData: [
      { month: 'Jan', arrivals: 37030, departures: 36809, cargoArrived: 285000, cargoDeparted: 142000 },
      { month: 'Feb', arrivals: 33162, departures: 29725, cargoArrived: 268000, cargoDeparted: 135000 },
      { month: 'Mar', arrivals: 37296, departures: 34224, cargoArrived: 295000, cargoDeparted: 148000 },
      { month: 'Apr', arrivals: 43199, departures: 38757, cargoArrived: 312000, cargoDeparted: 156000 },
      { month: 'May', arrivals: 39078, departures: 37958, cargoArrived: 298000, cargoDeparted: 149000 },
      { month: 'Jun', arrivals: 37885, departures: 36354, cargoArrived: 289000, cargoDeparted: 145000 },
      { month: 'Jul', arrivals: 48292, departures: 48278, cargoArrived: 342000, cargoDeparted: 171000 },
      { month: 'Aug', arrivals: 58550, departures: 51960, cargoArrived: 385000, cargoDeparted: 193000 },
      { month: 'Sep', arrivals: 43274, departures: 35559, cargoArrived: 305000, cargoDeparted: 153000 },
      { month: 'Oct', arrivals: 42799, departures: 35081, cargoArrived: 298000, cargoDeparted: 149000 },
      { month: 'Nov', arrivals: 40896, departures: 33058, cargoArrived: 285000, cargoDeparted: 143000 },
      { month: 'Dec', arrivals: 54049, departures: 38858, cargoArrived: 365000, cargoDeparted: 183000 },
    ],

    ytdCargoArrived: 3727000,
    ytdCargoDeparted: 1867000,

    onTimePercent: 87,
    safetyIncidents: 0,
    dailyFlights: 42,
    internationalPercent: 68,
  },
  gwi: {
    nrwPercent: 54,
    nrwTarget: 45,
    activeDisruptions: 2,
    avgResponseTime: 4.2,
    responseTimeTrend: -8,
    avgRepairTime: 6.8,
    repairTimeTrend: -3.5,
    productionMgd: 142,
    coveragePercent: 78,
    disruptionAreas: ['Georgetown North', 'East Coast Demerara'],
    productionVsBilled: {
      produced: 142000,
      billed: 65320,
    },
    disruptionTrend: [
      { day: 'Mon', count: 4 },
      { day: 'Tue', count: 3 },
      { day: 'Wed', count: 5 },
      { day: 'Thu', count: 2 },
      { day: 'Fri', count: 3 },
      { day: 'Sat', count: 1 },
      { day: 'Sun', count: 2 },
    ],
  },
  gpl: {
    source: 'DBIS Availability Report',
    capacityDate: '28-Jan-26',
    peakDemandDate: '27-Jan-26',

    actualEveningPeak: { onBars: 189.44, suppressed: 212.24 },
    actualDayPeak: { onBars: 168.40, suppressed: 193.00 },

    expectedPeakDemand: 200.0,
    forcedOutageRate: 7.5,

    generationAvailAtSuppressed: null,
    approximateSuppressedPeak: null,

    powerStations: [
      { name: 'SEI', units: 3, derated: 10.00, available: 7.20 },
      { name: 'Canefield', units: 6, derated: 17.40, available: 3.80 },
      { name: 'DP1', units: 4, derated: 22.00, available: 3.80 },
      { name: 'DP2', units: 4, derated: 22.00, available: 10.00 },
      { name: 'DP3', units: 5, derated: 36.30, available: 28.70 },
      { name: 'DP4', units: 3, derated: 26.10, available: 26.10 },
      { name: 'DP5', units: 5, derated: 46.50, available: 37.20 },
      { name: 'COL', units: 17, derated: 28.90, available: 21.76 },
      { name: 'GOE', units: 1, derated: 5.70, available: 3.00 },
      { name: 'PS1', units: 2, derated: 36.00, available: 36.00 },
      { name: 'PS2', units: 4, derated: 72.00, available: 51.00 },
    ],

    solarStations: [
      { name: 'Hampshire', capacity: 3.0 },
      { name: 'Prospect', capacity: 3.0 },
      { name: 'Trafalgar', capacity: 4.0 },
    ],
    totalRenewableCapacity: 10.0,

    peakDemandHistory: [
      { date: '22-Jan', eveningOnBars: 198.90, eveningSuppressed: 223.00, dayOnBars: 183.14, daySuppressed: 205.64 },
      { date: '23-Jan', eveningOnBars: 197.16, eveningSuppressed: 221.16, dayOnBars: 167.50, daySuppressed: 189.50 },
      { date: '24-Jan', eveningOnBars: 196.44, eveningSuppressed: 216.54, dayOnBars: 175.70, daySuppressed: 197.30 },
      { date: '25-Jan', eveningOnBars: 195.50, eveningSuppressed: 213.60, dayOnBars: 171.50, daySuppressed: 188.00 },
      { date: '26-Jan', eveningOnBars: 192.10, eveningSuppressed: 216.10, dayOnBars: 178.64, daySuppressed: 192.14 },
      { date: '27-Jan', eveningOnBars: 189.44, eveningSuppressed: 212.24, dayOnBars: 168.40, daySuppressed: 193.00 },
    ],
  },
  gcaa: {
    activeRegistrations: 156,
    inspectionsMTD: 23,
    inspectionsTarget: 30,
    complianceRate: 94,
    pendingCertifications: 8,
    safetyAudits: 12,
  },
});

export const getSparklineData = (agencyId: string, data?: any): number[] => {
  switch (agencyId) {
    case 'cjia':
      return [65, 72, 68, 75, 82, 78, 85, 89, 84, 92, 88, 95];
    case 'gwi':
      return [58, 56, 54, 52, 55, 53, 51, 54, 52, 50, 53, 54];
    case 'gpl':
      return data?.peakDemandHistory?.map((d: any) => d.eveningOnBars) || [185, 188, 192, 190, 195, 189];
    case 'gcaa':
      return [88, 90, 89, 92, 91, 93, 92, 94, 93, 95, 94, 94];
    default:
      return [50, 52, 51, 53, 52, 54, 53, 55, 54, 56, 55, 57];
  }
};
