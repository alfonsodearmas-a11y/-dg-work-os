// GPL Grid Health — Configuration & Thresholds
// All scoring thresholds, weights, and grade boundaries live here.
// Business logic in scoring.ts reads from this config — never hardcode thresholds there.

import type { FeederGrade } from './types';

export const GPL_CONFIG = {
  source: {
    baseUrl: 'https://dashboard-two-rust-51.vercel.app',
    endpoints: {
      outages: '/api/outages?limit=500',
      substations: '/api/master/substations',
      feeders: '/api/master/feeders',
      causeCodes: '/api/master/cause-codes',
    },
  },

  sync: {
    staleAfterMinutes: 15,
  },

  // Overall pulse score weights (must sum to 1.0)
  pulse: {
    weights: { frequency: 0.35, restoration: 0.35, impact: 0.30 },
    targets: {
      maxOutagesPerDay: 1,
      maxAvgRestorationMin: 15,
      maxCmiPer1000: 500, // customer-minutes interrupted per 1000 customers
    },
  },

  // Feeder-level health score weights (must sum to 1.0)
  feederHealth: {
    weights: { frequency: 0.40, restoration: 0.30, customerExposure: 0.30 },
  },

  // Grade boundaries (score >= min threshold)
  feederGrades: {
    A: { min: 80, color: '#97C459', label: 'Excellent' },
    B: { min: 65, color: '#5DCAA5', label: 'Good' },
    C: { min: 50, color: '#EF9F27', label: 'Fair' },
    D: { min: 35, color: '#FAC775', label: 'Poor' },
    F: { min: 0, color: '#F09595', label: 'Critical' },
  } as Record<FeederGrade, { min: number; color: string; label: string }>,

  // Outages in 30d → frequency sub-score
  frequencyScoring: { 0: 100, 1: 85, 2: 70, 3: 50, 4: 30 } as Record<number, number>,

  // Average restoration minutes → restoration sub-score
  restorationScoring: { 10: 100, 20: 80, 30: 60, 60: 40 } as Record<number, number>,
} as const;
