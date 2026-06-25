/* eslint-disable jsx-a11y/alt-text */
// @react-pdf/renderer's <Image> is a PDF primitive, not an HTML <img> — the
// alt-text a11y rule does not apply to it.

import path from 'node:path';
import {
  Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer,
} from '@react-pdf/renderer';
import { fmtGuyanaDate } from '@/lib/format';
import { STATUS_CONFIG, ACTIVITY_CONFIG } from '@/lib/airstrip-types';
import type { AirstripReportData } from '@/lib/airstrips/report/prepare-airstrip-report';

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: 'Inter',
  fonts: [
    { src: path.join(FONT_DIR, 'Inter-Light.ttf'), fontWeight: 300 },
    { src: path.join(FONT_DIR, 'Inter-Regular.ttf'), fontWeight: 400 },
    { src: path.join(FONT_DIR, 'Inter-Italic.ttf'), fontWeight: 400, fontStyle: 'italic' },
    { src: path.join(FONT_DIR, 'Inter-Bold.ttf'), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const NAVY = '#0a1628';
const GOLD = '#d4af37';
const BLACK = '#000000';
const GREY = '#666666';
const RED = '#b91c1c';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Inter', fontSize: 10, color: BLACK },
  letterhead: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: GOLD, paddingBottom: 12 },
  logo: { width: 52, height: 52, marginRight: 14 },
  ministryName: { fontSize: 13, fontWeight: 700, color: NAVY },
  ministryAddress: { fontSize: 9, color: NAVY, marginTop: 2 },
  title: { marginTop: 16, fontSize: 16, fontWeight: 700, color: NAVY },
  subtitle: { fontSize: 10, color: GREY, marginTop: 2 },
  sectionHeading: { marginTop: 16, marginBottom: 6, fontSize: 12, fontWeight: 700, color: NAVY },
  row: { flexDirection: 'row', marginBottom: 2 },
  label: { width: '32%', color: GREY, fontSize: 9 },
  value: { width: '68%', fontSize: 9 },
  warn: { color: RED, fontWeight: 700 },
  ok: { color: '#047857', fontWeight: 700 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: NAVY, paddingBottom: 4, marginBottom: 4, marginTop: 4 },
  th: { fontWeight: 700, fontSize: 9, color: NAVY },
  entry: { borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0', paddingVertical: 5 },
  entryHead: { flexDirection: 'row', justifyContent: 'space-between' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, gap: 4 },
  photo: { width: 90, height: 68, objectFit: 'cover', borderRadius: 2 },
  muted: { color: GREY, fontSize: 9, marginTop: 2 },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, fontSize: 8, color: GREY, textAlign: 'center' },
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{children}</Text>
    </View>
  );
}

const fmt = (d: string | null) => (d ? fmtGuyanaDate(d, 'short') : '—');

export async function renderAirstripReportPDF(data: AirstripReportData): Promise<Buffer> {
  const logoPath = path.join(process.cwd(), 'public', 'ministry-logo.png');
  const a = data.airstrip;
  const overdue = data.cadence.attentionLevel === 'overdue';

  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.letterhead}>
          <Image src={logoPath} style={styles.logo} />
          <View>
            <Text style={styles.ministryName}>Ministry of Public Utilities and Aviation</Text>
            <Text style={styles.ministryAddress}>Hinterland Airstrips — Maintenance Report</Text>
            <Text style={styles.ministryAddress}>Cooperative Republic of Guyana</Text>
          </View>
        </View>

        <Text style={styles.title}>{a.name}</Text>
        <Text style={styles.subtitle}>
          Region {a.region} · {fmt(data.range.from)} – {fmt(data.range.to)} · generated {fmt(data.generatedAt)}
        </Text>

        {/* Profile */}
        <Text style={styles.sectionHeading}>Profile</Text>
        <Field label="Status">{STATUS_CONFIG[a.status as keyof typeof STATUS_CONFIG]?.label ?? a.status}</Field>
        <Field label="Surface">{[a.surface_type, a.surface_condition].filter(Boolean).join(' · ') || '—'}</Field>
        <Field label="Runway">{a.runway_length_m ? `${a.runway_length_m}m × ${a.runway_width_m ?? '—'}m` : '—'}</Field>
        <Field label="Coordinates">{a.coordinates_lat && a.coordinates_lon ? `${a.coordinates_lat}, ${a.coordinates_lon}` : '—'}</Field>
        <Field label="Responsible contractor">{data.responsibility.contractorName || 'Unassigned'}</Field>
        <Field label="Responsible manager">{data.responsibility.managerName || 'Unassigned'}</Field>

        {/* Health */}
        <Text style={styles.sectionHeading}>Maintenance Health</Text>
        <Field label="Cadence">{data.intervalDays} days</Field>
        <Field label="Next due">{fmt(data.cadence.nextDueOn)}</Field>
        <Field label="Status">
          {overdue
            ? `${data.cadence.daysOverdue ?? 0} day(s) overdue`
            : data.cadence.warnings.length > 0 ? data.cadence.warnings.map(w => w.message).join('; ') : 'On cadence'}
        </Field>
        {data.cadence.warnings.length > 0 && (
          <Text style={[styles.muted, overdue ? styles.warn : {}]}>
            {data.cadence.warnings.map(w => w.message).join(' · ')}
          </Text>
        )}

        {/* Maintenance timeline */}
        <Text style={styles.sectionHeading}>Maintenance Timeline</Text>
        {data.maintenance.length === 0 ? (
          <Text style={styles.muted}>No maintenance recorded in this period.</Text>
        ) : (
          data.maintenance.map((m, i) => (
            <View key={i} style={styles.entry} wrap={false}>
              <View style={styles.entryHead}>
                <Text style={{ fontWeight: 700, fontSize: 9 }}>
                  {fmt(m.performed_date)} · {ACTIVITY_CONFIG[m.activity_type]?.label ?? m.activity_type}
                </Text>
                <Text style={[styles.muted, m.verified ? styles.ok : {}]}>
                  {m.verified ? `Verified ${fmt(m.verified_at)}` : 'Unverified'} · {m.verification_method}
                </Text>
              </View>
              {m.contractor_name && <Text style={styles.muted}>Contractor: {m.contractor_name}</Text>}
              {m.activity_description && <Text style={styles.muted}>{m.activity_description}</Text>}
              {m.notes && <Text style={styles.muted}>{m.notes}</Text>}
              {m.photos.length > 0 && (
                <View style={styles.photoRow}>
                  {m.photos.map((p, j) => (
                    // Data URI (not the {data,format} form) — @react-pdf's data-URI loader
                    // handles downloaded image bytes reliably across PNG/JPEG.
                    <Image
                      key={j}
                      src={`data:image/${p.format === 'jpg' ? 'jpeg' : 'png'};base64,${p.data.toString('base64')}`}
                      style={styles.photo}
                    />
                  ))}
                </View>
              )}
            </View>
          ))
        )}

        {/* Inspection history */}
        <Text style={styles.sectionHeading}>Inspection History</Text>
        {data.inspections.length === 0 ? (
          <Text style={styles.muted}>No inspections recorded in this period.</Text>
        ) : (
          <>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { width: '20%' }]}>Date</Text>
              <Text style={[styles.th, { width: '25%' }]}>Inspector</Text>
              <Text style={[styles.th, { width: '20%' }]}>Surface</Text>
              <Text style={[styles.th, { width: '35%' }]}>Findings</Text>
            </View>
            {data.inspections.map((ins, i) => (
              <View key={i} style={{ flexDirection: 'row', paddingVertical: 2 }} wrap={false}>
                <Text style={{ width: '20%', fontSize: 9 }}>{fmt(ins.inspection_date as string)}</Text>
                <Text style={{ width: '25%', fontSize: 9 }}>{(ins.inspector_name as string) || '—'}</Text>
                <Text style={{ width: '20%', fontSize: 9 }}>{(ins.surface_condition as string) || '—'}</Text>
                <Text style={{ width: '35%', fontSize: 9 }}>{(ins.findings as string) || '—'}</Text>
              </View>
            ))}
          </>
        )}

        {/* Quarterly trend */}
        <Text style={styles.sectionHeading}>Activity Trend</Text>
        {data.trend.length === 0 ? (
          <Text style={styles.muted}>No activity in this period.</Text>
        ) : (
          data.trend.map(t => (
            <Field key={t.quarter} label={t.quarter}>{t.activities} activities · {t.verified} verified</Field>
          ))
        )}

        {/* Payment section is intentionally omitted until a payment model exists. */}

        <Text style={styles.footer} fixed>
          {a.name} · Hinterland Airstrips · Ministry of Public Utilities and Aviation · Confidential
        </Text>
      </Page>
    </Document>,
  );
}
