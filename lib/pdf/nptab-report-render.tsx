/* eslint-disable react/no-unknown-property */
// @react-pdf/renderer uses element names React types don't recognize.

import path from 'node:path';
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import { fmtBudgetAmount, fmtGuyanaDate } from '@/lib/format';
import { periodLabel } from '@/lib/nptab/period';
import type { NptabReport, NptabReportTenderSnapshot } from '@/lib/nptab/types';
import { buildAggregates } from '@/lib/nptab/aggregate';

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

const styles = StyleSheet.create({
  page: { padding: 48, fontFamily: 'Inter', fontSize: 10, color: BLACK },
  letterhead: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: GOLD,
    paddingBottom: 12,
  },
  logo: { width: 56, height: 56, marginRight: 16 },
  ministryName: { fontSize: 14, fontWeight: 700, color: NAVY },
  ministryAddress: { fontSize: 9, color: NAVY, marginTop: 2 },
  refBlock: { marginTop: 16, alignItems: 'flex-end' },
  refLine: { fontSize: 10 },
  addressee: { marginTop: 24, fontSize: 11, fontWeight: 700 },
  subject: { marginTop: 12, fontWeight: 700 },
  sectionHeading: { marginTop: 16, marginBottom: 6, fontSize: 12, fontWeight: 700 },
  body: { lineHeight: 1.5, textAlign: 'justify' },
  table: { marginTop: 4 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: NAVY, paddingBottom: 4, marginBottom: 4 },
  th: { fontWeight: 700, fontSize: 9, color: NAVY },
  tableRow: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0' },
  td: { fontSize: 9 },
  signature: { marginTop: 40 },
  sigName: { fontWeight: 700, marginTop: 36 },
  sigTitle: { fontStyle: 'italic' },
});

const COL = {
  title: '38%',
  agency: '12%',
  value: '15%',
  days: '15%',
  contractor: '20%',
};

export interface RenderNptabReportPDFParams {
  report: NptabReport;
  tenders: NptabReportTenderSnapshot[];
  referrerName: string;
  referrerTitle: string;
}

function executiveSummary(report: NptabReport, tenders: NptabReportTenderSnapshot[]): string {
  const agencies = new Set(tenders.map((t) => t.agency).filter(Boolean)).size;
  const total = tenders.reduce((s, t) => s + (t.contract_value ?? 0), 0);
  const totalLabel = total > 0 ? fmtBudgetAmount(total) : 'unspecified';
  const lead = `This report covers ${tenders.length} tender${tenders.length === 1 ? '' : 's'} across ${agencies} agenc${agencies === 1 ? 'y' : 'ies'} with combined contract value of ${totalLabel}.`;
  const narrativeSnippet = report.narrative.trim().slice(0, 200);
  return narrativeSnippet ? `${lead} ${narrativeSnippet}` : lead;
}

export async function renderNptabReportPDF(params: RenderNptabReportPDFParams): Promise<Buffer> {
  const { report, tenders, referrerName, referrerTitle } = params;
  const logoPath = path.join(process.cwd(), 'public', 'ministry-logo.png');
  const dateLabel = fmtGuyanaDate(report.submitted_at ?? report.generated_at, 'long');
  const subject = `Procurement Performance Report, ${periodLabel(report.period_start, report.period_end)}`;
  const aggregates = buildAggregates(tenders);
  const sortedTenders = [...tenders].sort((a, b) => (b.days_past_sla ?? 0) - (a.days_past_sla ?? 0));

  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.letterhead}>
          <Image src={logoPath} style={styles.logo} />
          <View>
            <Text style={styles.ministryName}>Ministry of Public Utilities and Aviation</Text>
            <Text style={styles.ministryAddress}>Cooperative Republic of Guyana</Text>
            <Text style={styles.ministryAddress}>Brickdam, Stabroek, Georgetown</Text>
          </View>
        </View>

        <View style={styles.refBlock}>
          <Text style={styles.refLine}>Ref: {report.reference_number ?? 'DRAFT'}</Text>
          <Text style={styles.refLine}>Date: {dateLabel}</Text>
        </View>

        <Text style={styles.addressee}>
          The Chairperson, National Procurement and Tender Administration Board
        </Text>
        <Text style={styles.subject}>Subject: {subject}</Text>

        <Text style={styles.sectionHeading}>Executive Summary</Text>
        <Text style={styles.body}>{executiveSummary(report, tenders)}</Text>

        <Text style={styles.sectionHeading}>Tender Details</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: COL.title }]}>Title</Text>
            <Text style={[styles.th, { width: COL.agency }]}>Agency</Text>
            <Text style={[styles.th, { width: COL.value }]}>Value</Text>
            <Text style={[styles.th, { width: COL.days }]}>Days Past SLA</Text>
            <Text style={[styles.th, { width: COL.contractor }]}>Contractor</Text>
          </View>
          {sortedTenders.length === 0 ? (
            <Text style={[styles.td, { color: GREY, marginTop: 4 }]}>No tenders included.</Text>
          ) : (
            sortedTenders.map((t) => (
              <View key={t.tender_id} style={styles.tableRow} wrap={false}>
                <Text style={[styles.td, { width: COL.title }]}>{t.title || t.tender_id}</Text>
                <Text style={[styles.td, { width: COL.agency }]}>{t.agency || '-'}</Text>
                <Text style={[styles.td, { width: COL.value }]}>
                  {t.contract_value != null ? fmtBudgetAmount(t.contract_value) : '-'}
                </Text>
                <Text style={[styles.td, { width: COL.days }]}>{t.days_past_sla ?? '-'}</Text>
                <Text style={[styles.td, { width: COL.contractor }]}>{t.contractor || '-'}</Text>
              </View>
            ))
          )}
        </View>

        <Text style={styles.sectionHeading}>Aggregate Analysis</Text>

        <Text style={[styles.body, { fontWeight: 700, marginTop: 4 }]}>Breaches by Agency</Text>
        {aggregates.byAgency.length === 0 ? (
          <Text style={[styles.body, { color: GREY }]}>None.</Text>
        ) : (
          aggregates.byAgency.map((a) => (
            <Text key={a.agency} style={styles.body}>
              {a.agency}: {a.count} tender{a.count === 1 ? '' : 's'}
              {a.total_value > 0 ? `, ${fmtBudgetAmount(a.total_value)}` : ''}
            </Text>
          ))
        )}

        <Text style={[styles.body, { fontWeight: 700, marginTop: 6 }]}>Breaches by Value Bracket</Text>
        {aggregates.byValueBracket.map((b) => (
          <Text key={b.label} style={styles.body}>
            {b.label}: {b.count} tender{b.count === 1 ? '' : 's'}
            {b.total_value > 0 ? `, ${fmtBudgetAmount(b.total_value)}` : ''}
          </Text>
        ))}

        <Text style={[styles.body, { fontWeight: 700, marginTop: 6 }]}>Contractors with 2 or More Tenders</Text>
        {aggregates.byContractor.length === 0 ? (
          <Text style={[styles.body, { color: GREY }]}>None.</Text>
        ) : (
          aggregates.byContractor.map((c) => (
            <Text key={c.contractor} style={styles.body}>
              {c.contractor}: {c.count} tenders
              {c.total_value > 0 ? `, ${fmtBudgetAmount(c.total_value)}` : ''}
            </Text>
          ))
        )}

        <Text style={styles.sectionHeading}>Findings and Narrative</Text>
        <Text style={styles.body}>{report.narrative || 'Not provided.'}</Text>

        <View style={styles.signature}>
          <Text>Respectfully submitted,</Text>
          <Text style={styles.sigName}>{referrerName}</Text>
          <Text style={styles.sigTitle}>{referrerTitle}</Text>
        </View>
      </Page>
    </Document>,
  );
}
