/**
 * GPL Forecasting Service
 *
 * Computes demand forecasts, capacity timelines, station reliability,
 * unit risk scores, and load shedding trends from historical data.
 */

import { supabaseAdmin } from './db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinearRegressionResult {
  slope: number;
  intercept: number;
  r2: number;
}

export interface DemandForecast {
  grid: string;
  projected_month: string;
  projected_peak_mw: number;
  confidence_low_mw: number;
  confidence_high_mw: number;
  growth_rate_pct: number;
  data_source: string;
}

export interface CapacityTimeline {
  grid: string;
  current_capacity_mw: number;
  projected_capacity_mw: number;
  shortfall_date: string | null;
  reserve_margin_pct: number;
  months_until_shortfall: number | null;
  risk_level: string;
}

export interface LoadSheddingAnalysis {
  period_days: number;
  avg_shed_mw: number;
  max_shed_mw: number;
  shed_days_count: number;
  trend: string;
  projected_avg_6mo: number;
}

export interface StationReliability {
  station: string;
  period_days: number;
  uptime_pct: number;
  avg_utilization_pct: number;
  total_units: number;
  online_units: number;
  offline_units: number;
  failure_count: number;
  mtbf_days: number;
  trend: string;
  risk_level: string;
}

export interface UnitRisk {
  station: string;
  engine: string;
  unit_number: string;
  derated_mw: number;
  uptime_pct_90d: number;
  failure_count_90d: number;
  mtbf_days: number;
  days_since_last_failure: number;
  predicted_failure_days: number;
  risk_level: string;
  risk_score: number;
}

export interface KpiForecast {
  kpi_name: string;
  projected_month: string;
  projected_value: number;
  confidence_low: number;
  confidence_high: number;
  trend: string;
}

export interface AllForecasts {
  demandForecasts: DemandForecast[];
  capacityTimeline: CapacityTimeline[];
  loadShedding: LoadSheddingAnalysis;
  stationReliability: StationReliability[];
  unitRisk: UnitRisk[];
  kpiForecasts: KpiForecast[];
}

interface DailySummaryRow {
  report_date: string;
  total_fossil_fuel_capacity_mw: string | null;
  expected_peak_demand_mw: string | null;
  reserve_capacity_mw: string | null;
  evening_peak_on_bars_mw: string | null;
  evening_peak_suppressed_mw: string | null;
  day_peak_on_bars_mw: string | null;
  day_peak_suppressed_mw: string | null;
  system_utilization_pct: string | null;
  reserve_margin_pct: string | null;
  total_dbis_capacity_mw: string | null;
  total_renewable_mwp: string | null;
}

interface StationRow {
  report_date: string;
  station: string;
  total_units: number;
  units_online: number;
  units_offline: number;
  units_no_data: number;
  total_derated_capacity_mw: string | null;
  total_available_mw: string | null;
  station_utilization_pct: string | null;
}

interface UnitRow {
  report_date: string;
  station: string;
  engine: string;
  unit_number: string;
  derated_capacity_mw: string | null;
  available_mw: string | null;
  status: string;
  utilization_pct: string | null;
}

interface MonthlyKpiMap {
  [month: string]: { [kpiName: string]: number };
}

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------

/**
 * Simple linear regression
 * Returns slope, intercept, and r-squared
 */
export function linearRegression(data: [number, number][]): LinearRegressionResult {
  if (!data || data.length < 2) {
    return { slope: 0, intercept: 0, r2: 0 };
  }

  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

  data.forEach(([x, y]) => {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const yMean = sumY / n;
  let ssTot = 0, ssRes = 0;
  data.forEach(([x, y]) => {
    const yPred = slope * x + intercept;
    ssTot += (y - yMean) ** 2;
    ssRes += (y - yPred) ** 2;
  });
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, r2 };
}

/**
 * Calculate moving average
 */
export function movingAverage(data: number[], window: number): number[] {
  if (data.length < window) return data;
  const result: number[] = [];
  for (let i = window - 1; i < data.length; i++) {
    const slice = data.slice(i - window + 1, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / window;
    result.push(avg);
  }
  return result;
}

/**
 * Calculate standard deviation
 */
export function stdDev(data: number[]): number {
  if (data.length < 2) return 0;
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const variance = data.reduce((sum, val) => sum + (val - mean) ** 2, 0) / data.length;
  return Math.sqrt(variance);
}

/**
 * Calculate Year-over-Year growth rate
 */
function yoyGrowthRate(currentValue: number, previousYearValue: number): number | null {
  if (!previousYearValue || previousYearValue === 0) return null;
  return ((currentValue - previousYearValue) / previousYearValue) * 100;
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

/**
 * Get daily summary data for forecasting
 */
async function getDailySummaryData(daysBack: number = 365): Promise<DailySummaryRow[]> {
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data, error } = await supabaseAdmin
    .from('gpl_daily_summary')
    .select('report_date, total_fossil_fuel_capacity_mw, expected_peak_demand_mw, reserve_capacity_mw, evening_peak_on_bars_mw, evening_peak_suppressed_mw, day_peak_on_bars_mw, day_peak_suppressed_mw, system_utilization_pct, reserve_margin_pct, total_dbis_capacity_mw, total_renewable_mwp')
    .gte('report_date', cutoffDate)
    .order('report_date', { ascending: true });

  if (error) throw error;
  return data as DailySummaryRow[];
}

/**
 * Get monthly KPI data
 */
async function getMonthlyKpiData(): Promise<MonthlyKpiMap> {
  const { data, error } = await supabaseAdmin
    .from('gpl_monthly_kpis')
    .select('report_month, kpi_name, value')
    .order('report_month', { ascending: true });

  if (error) throw error;

  // Group by month
  const byMonth: MonthlyKpiMap = {};
  (data || []).forEach((row: { report_month: string; kpi_name: string; value: string }) => {
    const month = new Date(row.report_month).toISOString().split('T')[0];
    if (!byMonth[month]) byMonth[month] = {};
    byMonth[month][row.kpi_name] = parseFloat(row.value);
  });

  return byMonth;
}

/**
 * Get station data for reliability analysis
 */
async function getStationData(daysBack: number = 90): Promise<StationRow[]> {
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // First get confirmed upload IDs
  const { data: uploads, error: uploadsError } = await supabaseAdmin
    .from('gpl_uploads')
    .select('id')
    .eq('status', 'confirmed');

  if (uploadsError) throw uploadsError;

  const confirmedIds = (uploads || []).map((u: { id: number }) => u.id);
  if (confirmedIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from('gpl_daily_stations')
    .select('report_date, station, total_units, units_online, units_offline, units_no_data, total_derated_capacity_mw, total_available_mw, station_utilization_pct')
    .in('upload_id', confirmedIds)
    .gte('report_date', cutoffDate)
    .order('report_date', { ascending: true })
    .order('station', { ascending: true });

  if (error) throw error;
  return data as StationRow[];
}

/**
 * Get unit data for failure prediction
 */
async function getUnitData(daysBack: number = 90): Promise<UnitRow[]> {
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // First get confirmed upload IDs
  const { data: uploads, error: uploadsError } = await supabaseAdmin
    .from('gpl_uploads')
    .select('id')
    .eq('status', 'confirmed');

  if (uploadsError) throw uploadsError;

  const confirmedIds = (uploads || []).map((u: { id: number }) => u.id);
  if (confirmedIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from('gpl_daily_units')
    .select('report_date, station, engine, unit_number, derated_capacity_mw, available_mw, status, utilization_pct')
    .in('upload_id', confirmedIds)
    .gte('report_date', cutoffDate)
    .order('report_date', { ascending: true })
    .order('station', { ascending: true })
    .order('unit_number', { ascending: true });

  if (error) throw error;
  return data as UnitRow[];
}

// ---------------------------------------------------------------------------
// Core forecast computations
// ---------------------------------------------------------------------------

/**
 * Compute demand forecast
 */
export async function computeDemandForecast(): Promise<DemandForecast[]> {
  const dailyData = await getDailySummaryData(730); // 2 years
  const monthlyData = await getMonthlyKpiData();

  const forecasts: DemandForecast[] = [];
  const today = new Date();

  // DBIS Grid - from daily data
  if (dailyData.length >= 7) {
    // Extract peak demand values with dates
    const demandSeries: [number, number][] = dailyData
      .filter(d => d.evening_peak_on_bars_mw)
      .map((d, i) => [i, parseFloat(d.evening_peak_on_bars_mw!)]);

    if (demandSeries.length >= 7) {
      const regression = linearRegression(demandSeries);

      // Calculate current and YoY growth
      const recentDemand = demandSeries.slice(-30).map(d => d[1]);
      const avgRecentDemand = recentDemand.reduce((a, b) => a + b, 0) / recentDemand.length;
      const std = stdDev(recentDemand);

      // Project 24 months forward
      for (let m = 1; m <= 24; m++) {
        const futureIndex = demandSeries.length + (m * 30); // ~30 days per month
        const projected = regression.slope * futureIndex + regression.intercept;

        const projectedMonth = new Date(today);
        projectedMonth.setMonth(projectedMonth.getMonth() + m);
        projectedMonth.setDate(1);

        // Growth rate based on slope
        const monthlyGrowth = (regression.slope * 30) / avgRecentDemand * 100;

        forecasts.push({
          grid: 'DBIS',
          projected_month: projectedMonth.toISOString().split('T')[0],
          projected_peak_mw: Math.round(projected * 10) / 10,
          confidence_low_mw: Math.round((projected - 2 * std) * 10) / 10,
          confidence_high_mw: Math.round((projected + 2 * std) * 10) / 10,
          growth_rate_pct: Math.round(monthlyGrowth * 100) / 100,
          data_source: 'daily'
        });
      }
    }
  }

  // Essequibo Grid - from monthly KPI data only
  const essequiboMonths = Object.entries(monthlyData)
    .filter(([_, kpis]) => kpis['Peak Demand Essequibo'])
    .map(([month, kpis], i) => ({
      month,
      index: i,
      demand: kpis['Peak Demand Essequibo']
    }));

  if (essequiboMonths.length >= 3) {
    const esqSeries: [number, number][] = essequiboMonths.map(d => [d.index, d.demand]);
    const regression = linearRegression(esqSeries);
    const recentDemand = essequiboMonths.slice(-6).map(d => d.demand);
    const std = stdDev(recentDemand);
    const avgRecent = recentDemand.reduce((a, b) => a + b, 0) / recentDemand.length;

    for (let m = 1; m <= 24; m++) {
      const futureIndex = essequiboMonths.length + m - 1;
      const projected = regression.slope * futureIndex + regression.intercept;

      const projectedMonth = new Date(today);
      projectedMonth.setMonth(projectedMonth.getMonth() + m);
      projectedMonth.setDate(1);

      const monthlyGrowth = avgRecent > 0 ? (regression.slope / avgRecent * 100) : 0;

      forecasts.push({
        grid: 'Essequibo',
        projected_month: projectedMonth.toISOString().split('T')[0],
        projected_peak_mw: Math.round(projected * 10) / 10,
        confidence_low_mw: Math.round((projected - 2 * std) * 10) / 10,
        confidence_high_mw: Math.round((projected + 2 * std) * 10) / 10,
        growth_rate_pct: Math.round(monthlyGrowth * 100) / 100,
        data_source: 'monthly'
      });
    }
  }

  return forecasts;
}

/**
 * Compute capacity adequacy and shortfall timeline
 */
export async function computeCapacityTimeline(): Promise<CapacityTimeline[]> {
  const dailyData = await getDailySummaryData(365);
  const monthlyData = await getMonthlyKpiData();
  const demandForecasts = await computeDemandForecast();

  const results: CapacityTimeline[] = [];
  const today = new Date();

  // DBIS Grid
  const dbisForecasts = demandForecasts.filter(f => f.grid === 'DBIS');
  const latestCapacity = dailyData.length > 0
    ? parseFloat(dailyData[dailyData.length - 1].total_dbis_capacity_mw || '0') || 0
    : 0;

  // Find when demand exceeds capacity
  let shortfallDate: string | null = null;
  let monthsUntilShortfall: number | null = null;

  for (const forecast of dbisForecasts) {
    if (forecast.projected_peak_mw > latestCapacity) {
      shortfallDate = forecast.projected_month;
      const forecastDate = new Date(forecast.projected_month);
      monthsUntilShortfall = Math.round((forecastDate.getTime() - today.getTime()) / (30 * 24 * 60 * 60 * 1000));
      break;
    }
  }

  // Current reserve margin
  const latestDemand = dailyData.length > 0
    ? parseFloat(dailyData[dailyData.length - 1].evening_peak_on_bars_mw || '0') || 0
    : 0;
  const reserveMargin = latestCapacity > 0
    ? ((latestCapacity - latestDemand) / latestCapacity) * 100
    : 0;

  let riskLevel = 'safe';
  if (reserveMargin < 5) riskLevel = 'critical';
  else if (reserveMargin < 15) riskLevel = 'warning';

  results.push({
    grid: 'DBIS',
    current_capacity_mw: Math.round(latestCapacity * 10) / 10,
    projected_capacity_mw: Math.round(latestCapacity * 10) / 10, // Assume flat unless new capacity added
    shortfall_date: shortfallDate,
    reserve_margin_pct: Math.round(reserveMargin * 10) / 10,
    months_until_shortfall: monthsUntilShortfall,
    risk_level: riskLevel
  });

  // Essequibo Grid (from monthly data)
  const esqCapacity = Object.values(monthlyData)
    .map(kpis => kpis['Installed Capacity Essequibo'])
    .filter(v => v)
    .pop() || 0;

  const esqForecasts = demandForecasts.filter(f => f.grid === 'Essequibo');
  let esqShortfall: string | null = null;
  let esqMonths: number | null = null;

  for (const forecast of esqForecasts) {
    if (forecast.projected_peak_mw > esqCapacity) {
      esqShortfall = forecast.projected_month;
      const forecastDate = new Date(forecast.projected_month);
      esqMonths = Math.round((forecastDate.getTime() - today.getTime()) / (30 * 24 * 60 * 60 * 1000));
      break;
    }
  }

  const esqDemand = Object.values(monthlyData)
    .map(kpis => kpis['Peak Demand Essequibo'])
    .filter(v => v)
    .pop() || 0;

  const esqReserve = esqCapacity > 0 ? ((esqCapacity - esqDemand) / esqCapacity) * 100 : 0;

  results.push({
    grid: 'Essequibo',
    current_capacity_mw: Math.round(esqCapacity * 10) / 10,
    projected_capacity_mw: Math.round(esqCapacity * 10) / 10,
    shortfall_date: esqShortfall,
    reserve_margin_pct: Math.round(esqReserve * 10) / 10,
    months_until_shortfall: esqMonths,
    risk_level: esqReserve < 5 ? 'critical' : esqReserve < 15 ? 'warning' : 'safe'
  });

  return results;
}

/**
 * Compute load shedding analysis
 */
export async function computeLoadSheddingAnalysis(): Promise<LoadSheddingAnalysis> {
  const dailyData = await getDailySummaryData(365);

  if (dailyData.length === 0) {
    return {
      period_days: 0,
      avg_shed_mw: 0,
      max_shed_mw: 0,
      shed_days_count: 0,
      trend: 'unknown',
      projected_avg_6mo: 0
    };
  }

  // Calculate daily load shedding (suppressed - on_bars)
  const sheddingData = dailyData
    .filter(d => d.evening_peak_suppressed_mw && d.evening_peak_on_bars_mw)
    .map((d, i) => ({
      index: i,
      date: d.report_date,
      shed: Math.max(0, parseFloat(d.evening_peak_suppressed_mw!) - parseFloat(d.evening_peak_on_bars_mw!))
    }));

  if (sheddingData.length === 0) {
    return {
      period_days: dailyData.length,
      avg_shed_mw: 0,
      max_shed_mw: 0,
      shed_days_count: 0,
      trend: 'stable',
      projected_avg_6mo: 0
    };
  }

  const shedValues = sheddingData.map(d => d.shed);
  const avgShed = shedValues.reduce((a, b) => a + b, 0) / shedValues.length;
  const maxShed = Math.max(...shedValues);
  const daysWithShedding = shedValues.filter(s => s > 0).length;

  // Trend analysis (compare first half vs second half)
  const mid = Math.floor(shedValues.length / 2);
  const firstHalf = shedValues.slice(0, mid);
  const secondHalf = shedValues.slice(mid);
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  let trend = 'stable';
  if (secondAvg > firstAvg * 1.1) trend = 'increasing';
  else if (secondAvg < firstAvg * 0.9) trend = 'decreasing';

  // Project 6 months using regression
  const series: [number, number][] = sheddingData.map(d => [d.index, d.shed]);
  const regression = linearRegression(series);
  const futureIndex = sheddingData.length + 180; // ~6 months
  const projected6mo = Math.max(0, regression.slope * futureIndex + regression.intercept);

  return {
    period_days: dailyData.length,
    avg_shed_mw: Math.round(avgShed * 10) / 10,
    max_shed_mw: Math.round(maxShed * 10) / 10,
    shed_days_count: daysWithShedding,
    trend,
    projected_avg_6mo: Math.round(projected6mo * 10) / 10
  };
}

/**
 * Compute station reliability metrics
 */
export async function computeStationReliability(periodDays: number = 90): Promise<StationReliability[]> {
  const stationData = await getStationData(periodDays);

  if (stationData.length === 0) {
    return [];
  }

  // Group by station
  const byStation: { [station: string]: StationRow[] } = {};
  stationData.forEach(row => {
    if (!byStation[row.station]) {
      byStation[row.station] = [];
    }
    byStation[row.station].push(row);
  });

  const results: StationReliability[] = [];

  for (const [station, days] of Object.entries(byStation)) {
    const totalDays = days.length;
    if (totalDays === 0) continue;

    // Uptime: % of days with at least 1 unit online
    const daysOnline = days.filter(d => d.units_online > 0).length;
    const uptimePct = (daysOnline / totalDays) * 100;

    // Average utilization
    const utilizations = days
      .filter(d => d.station_utilization_pct)
      .map(d => parseFloat(d.station_utilization_pct!));
    const avgUtilization = utilizations.length > 0
      ? utilizations.reduce((a, b) => a + b, 0) / utilizations.length
      : 0;

    // Count failures (transitions from online to offline)
    let failureCount = 0;
    for (let i = 1; i < days.length; i++) {
      if (days[i - 1].units_online > 0 && days[i].units_online === 0) {
        failureCount++;
      }
    }

    // MTBF
    const mtbf = failureCount > 0 ? totalDays / failureCount : totalDays;

    // Trend: compare first half vs second half uptime
    const mid = Math.floor(days.length / 2);
    const firstHalf = days.slice(0, mid);
    const secondHalf = days.slice(mid);
    const firstUptime = firstHalf.filter(d => d.units_online > 0).length / firstHalf.length;
    const secondUptime = secondHalf.filter(d => d.units_online > 0).length / secondHalf.length;

    let trend = 'stable';
    if (secondUptime > firstUptime * 1.05) trend = 'improving';
    else if (secondUptime < firstUptime * 0.95) trend = 'declining';

    // Risk level
    let riskLevel = 'good';
    if (uptimePct < 50) riskLevel = 'critical';
    else if (uptimePct < 80) riskLevel = 'warning';

    const latestDay = days[days.length - 1];

    results.push({
      station,
      period_days: totalDays,
      uptime_pct: Math.round(uptimePct * 10) / 10,
      avg_utilization_pct: Math.round(avgUtilization * 10) / 10,
      total_units: latestDay?.total_units || 0,
      online_units: latestDay?.units_online || 0,
      offline_units: latestDay?.units_offline || 0,
      failure_count: failureCount,
      mtbf_days: Math.round(mtbf * 10) / 10,
      trend,
      risk_level: riskLevel
    });
  }

  // Sort by risk (critical first)
  const riskOrder: { [key: string]: number } = { critical: 0, warning: 1, good: 2 };
  results.sort((a, b) => riskOrder[a.risk_level] - riskOrder[b.risk_level]);

  return results;
}

/**
 * Compute unit failure risk
 */
export async function computeUnitRisk(periodDays: number = 90): Promise<UnitRisk[]> {
  const unitData = await getUnitData(periodDays);

  if (unitData.length === 0) {
    return [];
  }

  // Group by unit (station + unit_number)
  const byUnit: {
    [key: string]: {
      station: string;
      engine: string;
      unit_number: string;
      derated_mw: number;
      days: { date: string; status: string; available: number }[];
    };
  } = {};

  unitData.forEach(row => {
    const key = `${row.station}|${row.unit_number}`;
    if (!byUnit[key]) {
      byUnit[key] = {
        station: row.station,
        engine: row.engine,
        unit_number: row.unit_number,
        derated_mw: parseFloat(row.derated_capacity_mw || '0') || 0,
        days: []
      };
    }
    byUnit[key].days.push({
      date: row.report_date,
      status: row.status,
      available: parseFloat(row.available_mw || '0') || 0
    });
  });

  const results: UnitRisk[] = [];

  for (const unit of Object.values(byUnit)) {
    const totalDays = unit.days.length;
    if (totalDays === 0) continue;

    // Uptime: % of days online
    const daysOnline = unit.days.filter(d => d.status === 'online').length;
    const uptimePct = (daysOnline / totalDays) * 100;

    // Count failures
    let failureCount = 0;
    let lastFailureIndex = -1;
    for (let i = 1; i < unit.days.length; i++) {
      if (unit.days[i - 1].status === 'online' && unit.days[i].status === 'offline') {
        failureCount++;
        lastFailureIndex = i;
      }
    }

    // MTBF
    const mtbf = failureCount > 0 ? totalDays / failureCount : totalDays;

    // Days since last failure
    const daysSinceFailure = lastFailureIndex >= 0
      ? totalDays - lastFailureIndex
      : totalDays;

    // Predict days until next failure
    const predictedFailureDays = Math.max(0, Math.round(mtbf - daysSinceFailure));

    // Risk score (0-100, higher = more risk)
    let riskScore = 0;
    if (uptimePct < 30) riskScore += 40;
    else if (uptimePct < 60) riskScore += 25;
    else if (uptimePct < 80) riskScore += 10;

    if (failureCount >= 5) riskScore += 30;
    else if (failureCount >= 3) riskScore += 20;
    else if (failureCount >= 1) riskScore += 10;

    if (mtbf < 15) riskScore += 30;
    else if (mtbf < 30) riskScore += 15;

    // Risk level
    let riskLevel = 'low';
    if (riskScore >= 60) riskLevel = 'high';
    else if (riskScore >= 30) riskLevel = 'medium';

    results.push({
      station: unit.station,
      engine: unit.engine,
      unit_number: unit.unit_number,
      derated_mw: unit.derated_mw,
      uptime_pct_90d: Math.round(uptimePct * 10) / 10,
      failure_count_90d: failureCount,
      mtbf_days: Math.round(mtbf * 10) / 10,
      days_since_last_failure: daysSinceFailure,
      predicted_failure_days: predictedFailureDays,
      risk_level: riskLevel,
      risk_score: riskScore
    });
  }

  // Sort by risk score descending
  results.sort((a, b) => b.risk_score - a.risk_score);

  return results;
}

/**
 * Compute KPI forecasts for all monthly metrics
 */
export async function computeKpiForecasts(): Promise<KpiForecast[]> {
  const monthlyData = await getMonthlyKpiData();
  const months = Object.keys(monthlyData).sort();

  if (months.length < 3) {
    return [];
  }

  const kpis = [
    'Peak Demand DBIS', 'Peak Demand Essequibo',
    'Installed Capacity DBIS', 'Installed Capacity Essequibo',
    'Affected Customers', 'Collection Rate %',
    'HFO Generation Mix %', 'LFO Generation Mix %'
  ];

  const forecasts: KpiForecast[] = [];
  const today = new Date();

  for (const kpi of kpis) {
    // Get historical values
    const series = months
      .map((month, i) => ({ month, index: i, value: monthlyData[month][kpi] }))
      .filter(d => d.value !== undefined && d.value !== null);

    if (series.length < 3) continue;

    const points: [number, number][] = series.map(d => [d.index, d.value]);
    const regression = linearRegression(points);
    const recentValues = series.slice(-6).map(d => d.value);
    const std_val = stdDev(recentValues);

    // Determine trend
    let trend = 'stable';
    if (regression.slope > 0.1) trend = 'increasing';
    else if (regression.slope < -0.1) trend = 'decreasing';

    // Project 12 months
    for (let m = 1; m <= 12; m++) {
      const futureIndex = series.length + m - 1;
      let projected = regression.slope * futureIndex + regression.intercept;

      // Clamp percentages to 0-100
      if (kpi.includes('%')) {
        projected = Math.max(0, Math.min(100, projected));
      }
      // Clamp counts to non-negative
      if (kpi.includes('Customers') || kpi.includes('Capacity') || kpi.includes('Demand')) {
        projected = Math.max(0, projected);
      }

      const projectedMonth = new Date(today);
      projectedMonth.setMonth(projectedMonth.getMonth() + m);
      projectedMonth.setDate(1);

      forecasts.push({
        kpi_name: kpi,
        projected_month: projectedMonth.toISOString().split('T')[0],
        projected_value: Math.round(projected * 100) / 100,
        confidence_low: Math.round((projected - 2 * std_val) * 100) / 100,
        confidence_high: Math.round((projected + 2 * std_val) * 100) / 100,
        trend
      });
    }
  }

  return forecasts;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Save all forecasts to database
 */
async function saveForecastsToDb(
  forecasts: DemandForecast[],
  capacityTimeline: CapacityTimeline[],
  loadShedding: LoadSheddingAnalysis,
  stationReliability: StationReliability[],
  unitRisk: UnitRisk[],
  kpiForecasts: KpiForecast[]
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  try {
    // Clear old forecasts for today (sequential deletes)
    const { error: e1 } = await supabaseAdmin.from('gpl_forecast_demand').delete().eq('forecast_date', today);
    if (e1) throw e1;
    const { error: e2 } = await supabaseAdmin.from('gpl_forecast_capacity').delete().eq('forecast_date', today);
    if (e2) throw e2;
    const { error: e3 } = await supabaseAdmin.from('gpl_forecast_load_shedding').delete().eq('forecast_date', today);
    if (e3) throw e3;
    const { error: e4 } = await supabaseAdmin.from('gpl_forecast_station_reliability').delete().eq('forecast_date', today);
    if (e4) throw e4;
    const { error: e5 } = await supabaseAdmin.from('gpl_forecast_unit_risk').delete().eq('forecast_date', today);
    if (e5) throw e5;
    const { error: e6 } = await supabaseAdmin.from('gpl_forecast_kpi').delete().eq('forecast_date', today);
    if (e6) throw e6;

    // Save demand forecasts
    if (forecasts.length > 0) {
      const demandRows = forecasts.map(f => ({
        forecast_date: today,
        projected_month: f.projected_month,
        grid: f.grid,
        projected_peak_mw: f.projected_peak_mw,
        confidence_low_mw: f.confidence_low_mw,
        confidence_high_mw: f.confidence_high_mw,
        growth_rate_pct: f.growth_rate_pct,
        data_source: f.data_source,
      }));
      const { error } = await supabaseAdmin.from('gpl_forecast_demand').insert(demandRows);
      if (error) throw error;
    }

    // Save capacity timeline
    if (capacityTimeline.length > 0) {
      const capacityRows = capacityTimeline.map(c => ({
        forecast_date: today,
        grid: c.grid,
        current_capacity_mw: c.current_capacity_mw,
        projected_capacity_mw: c.projected_capacity_mw,
        shortfall_date: c.shortfall_date,
        reserve_margin_pct: c.reserve_margin_pct,
        months_until_shortfall: c.months_until_shortfall,
        risk_level: c.risk_level,
      }));
      const { error } = await supabaseAdmin.from('gpl_forecast_capacity').insert(capacityRows);
      if (error) throw error;
    }

    // Save load shedding
    {
      const { error } = await supabaseAdmin.from('gpl_forecast_load_shedding').insert({
        forecast_date: today,
        period_days: loadShedding.period_days,
        avg_shed_mw: loadShedding.avg_shed_mw,
        max_shed_mw: loadShedding.max_shed_mw,
        shed_days_count: loadShedding.shed_days_count,
        trend: loadShedding.trend,
        projected_avg_6mo: loadShedding.projected_avg_6mo,
      });
      if (error) throw error;
    }

    // Save station reliability
    if (stationReliability.length > 0) {
      const reliabilityRows = stationReliability.map(s => ({
        forecast_date: today,
        station: s.station,
        period_days: s.period_days,
        uptime_pct: s.uptime_pct,
        avg_utilization_pct: s.avg_utilization_pct,
        total_units: s.total_units,
        online_units: s.online_units,
        offline_units: s.offline_units,
        failure_count: s.failure_count,
        mtbf_days: s.mtbf_days,
        trend: s.trend,
        risk_level: s.risk_level,
      }));
      const { error } = await supabaseAdmin.from('gpl_forecast_station_reliability').insert(reliabilityRows);
      if (error) throw error;
    }

    // Save unit risk (only medium and high)
    const riskyUnits = unitRisk.filter(u => u.risk_level !== 'low');
    if (riskyUnits.length > 0) {
      const unitRiskRows = riskyUnits.map(u => ({
        forecast_date: today,
        station: u.station,
        engine: u.engine,
        unit_number: u.unit_number,
        derated_mw: u.derated_mw,
        uptime_pct_90d: u.uptime_pct_90d,
        failure_count_90d: u.failure_count_90d,
        mtbf_days: u.mtbf_days,
        days_since_last_failure: u.days_since_last_failure,
        predicted_failure_days: u.predicted_failure_days,
        risk_level: u.risk_level,
        risk_score: u.risk_score,
      }));
      const { error } = await supabaseAdmin.from('gpl_forecast_unit_risk').insert(unitRiskRows);
      if (error) throw error;
    }

    // Save KPI forecasts
    if (kpiForecasts.length > 0) {
      const kpiRows = kpiForecasts.map(k => ({
        forecast_date: today,
        kpi_name: k.kpi_name,
        projected_month: k.projected_month,
        projected_value: k.projected_value,
        confidence_low: k.confidence_low,
        confidence_high: k.confidence_high,
        trend: k.trend,
      }));
      const { error } = await supabaseAdmin.from('gpl_forecast_kpi').insert(kpiRows);
      if (error) throw error;
    }

    console.log('[gpl-forecast] Saved all forecasts to database');

  } catch (err) {
    console.error('[gpl-forecast] Failed to save forecasts:', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Run all forecasting computations
 */
export async function runAllForecasts(): Promise<AllForecasts> {
  console.log('[gpl-forecast] Starting forecast computation...');

  const demandForecasts = await computeDemandForecast();
  console.log(`[gpl-forecast] Computed ${demandForecasts.length} demand forecasts`);

  const capacityTimeline = await computeCapacityTimeline();
  console.log(`[gpl-forecast] Computed capacity timeline for ${capacityTimeline.length} grids`);

  const loadShedding = await computeLoadSheddingAnalysis();
  console.log('[gpl-forecast] Computed load shedding analysis');

  const stationReliability = await computeStationReliability(90);
  console.log(`[gpl-forecast] Computed reliability for ${stationReliability.length} stations`);

  const unitRisk = await computeUnitRisk(90);
  console.log(`[gpl-forecast] Computed risk for ${unitRisk.length} units`);

  const kpiForecasts = await computeKpiForecasts();
  console.log(`[gpl-forecast] Computed ${kpiForecasts.length} KPI forecasts`);

  // Save to database
  await saveForecastsToDb(demandForecasts, capacityTimeline, loadShedding, stationReliability, unitRisk, kpiForecasts);

  return {
    demandForecasts,
    capacityTimeline,
    loadShedding,
    stationReliability,
    unitRisk,
    kpiForecasts
  };
}
