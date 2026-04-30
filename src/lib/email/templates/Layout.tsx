import type { ReactNode } from 'react';
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

/**
 * Shared shell for every transactional template. Owns the header (wordmark),
 * footer (support + unsubscribe), and the surrounding light-grey page
 * background that mirrors the dashboard.
 *
 * Brand tokens are intentionally inlined as hex literals here — `react-email`
 * components don't read Tailwind classes. The values come from `DESIGN.md`
 * and `tailwind.config.ts`; if those drift, update this file in the same PR.
 */
export interface LayoutProps {
  /** Plain-text preview shown in inbox list. Keep under ~90 chars. */
  previewText: string;
  children: ReactNode;
  /** Optional unsubscribe URL — when omitted, footer renders a settings link. */
  unsubscribeUrl?: string;
}

const COLORS = {
  brandBlue: '#1E4D8C',
  dark: '#2D3436',
  light: '#F5F6FA',
  surface: '#FFFFFF',
  gray200: '#E5E7EB',
  gray500: '#6B7280',
} as const;

const SUPPORT_EMAIL = 'support@wholesalehub.example.com';

const main = {
  backgroundColor: COLORS.light,
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  color: COLORS.dark,
  margin: 0,
  padding: 0,
};

const container = {
  margin: '0 auto',
  padding: '24px 0',
  maxWidth: '560px',
};

const headerSection = {
  padding: '0 24px 16px 24px',
};

const wordmark = {
  fontSize: '20px',
  fontWeight: 700,
  letterSpacing: '-0.01em',
  color: COLORS.brandBlue,
  margin: 0,
};

const card = {
  backgroundColor: COLORS.surface,
  border: `1px solid ${COLORS.gray200}`,
  borderRadius: '8px',
  padding: '32px',
};

const footerSection = {
  padding: '24px',
  textAlign: 'center' as const,
};

const footerHr = {
  borderColor: COLORS.gray200,
  margin: '32px 0 16px 0',
};

const footerText = {
  color: COLORS.gray500,
  fontSize: '12px',
  lineHeight: 1.5,
  margin: 0,
};

const footerLink = {
  color: COLORS.gray500,
  textDecoration: 'underline',
};

export function Layout({ previewText, children, unsubscribeUrl }: LayoutProps): JSX.Element {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={headerSection}>
            <Text style={wordmark}>WholesaleHub</Text>
          </Section>

          <Section style={card}>{children}</Section>

          <Section style={footerSection}>
            <Hr style={footerHr} />
            <Text style={footerText}>
              WholesaleHub &middot;{' '}
              <Link href={`mailto:${SUPPORT_EMAIL}`} style={footerLink}>
                {SUPPORT_EMAIL}
              </Link>{' '}
              &middot;{' '}
              {unsubscribeUrl ? (
                <Link href={unsubscribeUrl} style={footerLink}>
                  Unsubscribe
                </Link>
              ) : (
                <Link href={`mailto:${SUPPORT_EMAIL}?subject=Unsubscribe`} style={footerLink}>
                  Unsubscribe
                </Link>
              )}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/**
 * Shared button style used by every template's CTA. Brand-blue background,
 * white text, generous tap area. Use as inline style on `<Button>` from
 * `@react-email/components`.
 */
export const ctaButtonStyle = {
  backgroundColor: COLORS.brandBlue,
  color: '#FFFFFF',
  fontSize: '15px',
  fontWeight: 600,
  textDecoration: 'none',
  textAlign: 'center' as const,
  padding: '12px 20px',
  borderRadius: '6px',
  display: 'inline-block',
};

/** Shared paragraph style — body text in `--dark` on `--surface`. */
export const paragraphStyle = {
  color: COLORS.dark,
  fontSize: '15px',
  lineHeight: 1.55,
  margin: '0 0 16px 0',
};

/** Shared heading style for the email H1 (one per email max). */
export const headingStyle = {
  color: COLORS.dark,
  fontSize: '20px',
  fontWeight: 600,
  lineHeight: 1.3,
  margin: '0 0 16px 0',
};

/** Shared label style for tabular fields ("ORDER NUMBER", "TRACKING", etc.). */
export const labelStyle = {
  color: COLORS.gray500,
  fontSize: '11px',
  fontWeight: 500,
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as const,
  margin: '0 0 4px 0',
};

/** Shared value style sitting under a label. */
export const valueStyle = {
  color: COLORS.dark,
  fontSize: '14px',
  fontWeight: 500,
  margin: '0 0 16px 0',
};

export const SUPPORT_EMAIL_ADDRESS = SUPPORT_EMAIL;
