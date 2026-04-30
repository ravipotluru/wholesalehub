import { Button, Section, Text } from '@react-email/components';
import {
  Layout,
  ctaButtonStyle,
  headingStyle,
  labelStyle,
  paragraphStyle,
  valueStyle,
} from './Layout';

/**
 * Sent by `scripts/cron/license-expiry-check.ts` at 30/14/7 days before a
 * wholesaler's `licenseExpiry`. Once the license actually expires, the
 * wholesaler is auto-flipped to PENDING_APPROVAL — this email is the chance
 * to renew before that happens.
 */
export interface LicenseExpiringWarningProps {
  wholesalerName: string;
  daysUntilExpiry: number;
  /** Pre-formatted expiry date string, e.g. "May 15, 2026". */
  expiresOn: string;
  renewLicenseUrl: string;
}

export function LicenseExpiringWarning(props: LicenseExpiringWarningProps): JSX.Element {
  const { wholesalerName, daysUntilExpiry, expiresOn, renewLicenseUrl } = props;
  const previewText = `Your license expires in ${daysUntilExpiry} days.`;

  // Direct, plainspoken urgency — no exclamation marks.
  const urgencyCopy =
    daysUntilExpiry <= 7
      ? `Your license expires in ${daysUntilExpiry} days. After it expires, your account is suspended and your products go offline until you upload the new license.`
      : daysUntilExpiry <= 14
      ? `Your license expires in ${daysUntilExpiry} days. We need the renewed copy uploaded before then or your account will be suspended.`
      : `Your license expires in ${daysUntilExpiry} days. Renew it now and we'll keep your products live without a gap.`;

  return (
    <Layout previewText={previewText}>
      <Text style={headingStyle}>License renewal needed.</Text>
      <Text style={paragraphStyle}>{urgencyCopy}</Text>

      <Section>
        <Text style={labelStyle}>ACCOUNT</Text>
        <Text style={valueStyle}>{wholesalerName}</Text>

        <Text style={labelStyle}>EXPIRES</Text>
        <Text style={valueStyle}>{expiresOn}</Text>

        <Text style={labelStyle}>DAYS REMAINING</Text>
        <Text style={valueStyle}>{daysUntilExpiry}</Text>
      </Section>

      <Section style={{ marginTop: '8px' }}>
        <Button href={renewLicenseUrl} style={ctaButtonStyle}>
          Upload renewed license
        </Button>
      </Section>

      <Text style={{ ...paragraphStyle, marginTop: '24px', fontSize: '13px' }}>
        Already renewed? Reply with a copy of the new license and we&apos;ll
        update your account by hand.
      </Text>
    </Layout>
  );
}

export default LicenseExpiringWarning;
