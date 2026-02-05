'use client';

import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar
} from 'recharts';

interface PassengerDataPoint {
  month: string;
  monthFull: string;
  arrivals: number;
  departures: number;
  total: number;
}

// Historical monthly passenger data - CJIA 2025
const passengerData: PassengerDataPoint[] = [
  { month: 'Jan', monthFull: 'January 2025', arrivals: 37030, departures: 36809, total: 73839 },
  { month: 'Feb', monthFull: 'February 2025', arrivals: 33162, departures: 29725, total: 62887 },
  { month: 'Mar', monthFull: 'March 2025', arrivals: 37296, departures: 34224, total: 71520 },
  { month: 'Apr', monthFull: 'April 2025', arrivals: 43199, departures: 38757, total: 81956 },
  { month: 'May', monthFull: 'May 2025', arrivals: 39078, departures: 37958, total: 77036 },
  { month: 'Jun', monthFull: 'June 2025', arrivals: 37885, departures: 36354, total: 74239 },
  { month: 'Jul', monthFull: 'July 2025', arrivals: 48292, departures: 48278, total: 96570 },
  { month: 'Aug', monthFull: 'August 2025', arrivals: 58550, departures: 51960, total: 110510 },
  { month: 'Sep', monthFull: 'September 2025', arrivals: 43274, departures: 35559, total: 78833 },
  { month: 'Oct', monthFull: 'October 2025', arrivals: 42799, departures: 35081, total: 77880 },
  { month: 'Nov', monthFull: 'November 2025', arrivals: 40896, departures: 33058, total: 73954 },
  { month: 'Dec', monthFull: 'December 2025', arrivals: 54049, departures: 38858, total: 92907 },
];

// Calculate summary stats
const totalArrivals = passengerData.reduce((sum, d) => sum + d.arrivals, 0);
const totalDepartures = passengerData.reduce((sum, d) => sum + d.departures, 0);
const totalPassengers = totalArrivals + totalDepartures;
const avgMonthly = Math.round(totalPassengers / 12);
const peakMonth = passengerData.reduce((max, d) => d.total > max.total ? d : max, passengerData[0]);

const formatNumber = (num: number) => num.toLocaleString();

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as PassengerDataPoint;
    return (
      <div className="bg-[#1a2744] p-3 border border-[#2d3a52] rounded-lg shadow-lg">
        <p className="font-semibold text-white mb-2">{data.monthFull}</p>
        <p className="text-emerald-400">Arrivals: {formatNumber(data.arrivals)}</p>
        <p className="text-blue-400">Departures: {formatNumber(data.departures)}</p>
        <p className="text-white font-medium mt-1 pt-1 border-t border-[#2d3a52]">
          Total: {formatNumber(data.total)}
        </p>
      </div>
    );
  }
  return null;
};

export function CJIAPassengerChart() {
  const [chartType, setChartType] = useState<'area' | 'bar'>('area');

  return (
    <div className="bg-[#1a2744] rounded-xl shadow-sm border border-[#2d3a52] p-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">
            CJIA Passenger Movements
          </h2>
          <p className="text-[#64748b] text-sm mt-1">Monthly arrivals and departures -- 2025</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setChartType('area')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              chartType === 'area'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-[#2d3a52] text-[#94a3b8] hover:bg-[#2d3a52]/80'
            }`}
          >
            Area
          </button>
          <button
            onClick={() => setChartType('bar')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              chartType === 'bar'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-[#2d3a52] text-[#94a3b8] hover:bg-[#2d3a52]/80'
            }`}
          >
            Bar
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
          <p className="text-emerald-400 text-sm font-medium">Total Arrivals</p>
          <p className="text-2xl font-bold text-emerald-300">{formatNumber(totalArrivals)}</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <p className="text-blue-400 text-sm font-medium">Total Departures</p>
          <p className="text-2xl font-bold text-blue-300">{formatNumber(totalDepartures)}</p>
        </div>
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4">
          <p className="text-purple-400 text-sm font-medium">Monthly Average</p>
          <p className="text-2xl font-bold text-purple-300">{formatNumber(avgMonthly)}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <p className="text-amber-400 text-sm font-medium">Peak Month</p>
          <p className="text-2xl font-bold text-amber-300">{peakMonth.month} &apos;25</p>
          <p className="text-amber-400/70 text-xs">{formatNumber(peakMonth.total)} passengers</p>
        </div>
      </div>

      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'area' ? (
            <AreaChart data={passengerData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorArrivals" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorDepartures" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3a52" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="arrivals"
                name="Arrivals"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorArrivals)"
              />
              <Area
                type="monotone"
                dataKey="departures"
                name="Departures"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorDepartures)"
              />
            </AreaChart>
          ) : (
            <BarChart data={passengerData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3a52" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="arrivals" name="Arrivals" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="departures" name="Departures" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Year Total */}
      <div className="mt-4 pt-4 border-t border-[#2d3a52] text-center">
        <p className="text-[#64748b] text-sm">
          2025 Total Passenger Movements: <span className="font-semibold text-white">{formatNumber(totalPassengers)}</span>
        </p>
      </div>
    </div>
  );
}
