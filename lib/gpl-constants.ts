/**
 * Shared constants for GPL / DBIS modules.
 */

/** Stations excluded from health scoring, alerts, and AI analysis.
 *  Onverwagt is deliberately empty (abandoned station, all zeros). */
export const GPL_EXCLUDED_STATIONS = ['onverwagt'];

/** Columns selected from gpl_daily_summary for API responses. */
export const GPL_SUMMARY_SELECT = 'report_date, total_fossil_capacity_mw, expected_peak_demand_mw, reserve_capacity_mw, average_for, expected_capacity_mw, expected_reserve_mw, hampshire_solar_mwp, prospect_solar_mwp, trafalgar_solar_mwp, total_renewable_mwp, total_dbis_capacity_mw, evening_peak_on_bars_mw, evening_peak_suppressed_mw, day_peak_on_bars_mw, day_peak_suppressed_mw, gen_availability_at_suppressed_peak, approx_suppressed_peak, system_utilization_pct, reserve_margin_pct';
