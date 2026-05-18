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
import { fmtGuyanaDate } from '@/lib/format';
import type { Referral } from '@/lib/referrals/types';
import { REQUESTED_ACTION_LABELS } from '@/lib/referrals/types';

// ---------------------------------------------------------------------------
// Font registration. Runs once per cold start. Inter TTFs bundled in
// public/fonts/ so no network at render time. Mirrors
// lib/pdf/intel-brief-render.tsx.
// ---------------------------------------------------------------------------
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

const styles = StyleSheet.create({
  page: { padding: 56, fontFamily: 'Inter', fontSize: 11, color: BLACK },
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
  refBlock: { marginTop: 18, alignItems: 'flex-end' },
  refLine: { fontSize: 10, color: BLACK },
  addressee: { marginTop: 28, fontSize: 11, fontWeight: 700 },
  subject: { marginTop: 14, fontWeight: 700 },
  sectionHeading: { marginTop: 16, marginBottom: 4, fontSize: 12, fontWeight: 700 },
  body: { lineHeight: 1.5, textAlign: 'justify' },
  signature: { marginTop: 48 },
  sigName: { fontWeight: 700, marginTop: 36 },
  sigTitle: { fontWeight: 400, fontStyle: 'italic' },
});

export interface RenderReferralPDFParams {
  referral: Referral;
  referrerName: string;
  referrerTitle: string;
}

export async function renderReferralPDF(params: RenderReferralPDFParams): Promise<Buffer> {
  const { referral, referrerName, referrerTitle } = params;
  const logoPath = path.join(process.cwd(), 'public', 'ministry-logo.png');
  const submittedDate = fmtGuyanaDate(referral.submitted_at ?? new Date().toISOString(), 'long');

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
          <Text style={styles.refLine}>Ref: {referral.reference_number ?? 'DRAFT'}</Text>
          <Text style={styles.refLine}>Date: {submittedDate}</Text>
        </View>

        <Text style={styles.addressee}>
          The Honourable Minister of Public Utilities and Aviation
        </Text>
        <Text style={styles.subject}>Subject: {referral.title}</Text>

        <Text style={styles.sectionHeading}>Background</Text>
        <Text style={styles.body}>{referral.background || 'Not provided.'}</Text>

        <Text style={styles.sectionHeading}>Current Status</Text>
        <Text style={styles.body}>{referral.current_status || 'Not provided.'}</Text>

        <Text style={styles.sectionHeading}>Recommendation</Text>
        <Text style={styles.body}>{referral.recommendation}</Text>

        <Text style={styles.sectionHeading}>Requested Action</Text>
        <Text style={styles.body}>{REQUESTED_ACTION_LABELS[referral.requested_action]}</Text>

        <View style={styles.signature}>
          <Text>Respectfully submitted,</Text>
          <Text style={styles.sigName}>{referrerName}</Text>
          <Text style={styles.sigTitle}>{referrerTitle}</Text>
        </View>
      </Page>
    </Document>,
  );
}
