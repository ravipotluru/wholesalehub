import { Button, Section, Text } from '@react-email/components';
import {
  Layout,
  ctaButtonStyle,
  headingStyle,
  paragraphStyle,
} from './Layout';

/**
 * Sent on POST /api/auth/register (when wired). The recipient confirms
 * they own the email address by clicking the verify link — until then,
 * gated actions (e.g. age-restricted checkout) stay locked.
 */
export interface EmailVerificationProps {
  firstName: string;
  verifyUrl: string;
  /** Human-readable lifetime, e.g. "24 hours", "1 day". */
  expiresIn: string;
}

export function EmailVerification(props: EmailVerificationProps): JSX.Element {
  const { firstName, verifyUrl, expiresIn } = props;
  const previewText = 'Verify your WholesaleHub email address.';

  return (
    <Layout previewText={previewText}>
      <Text style={headingStyle}>Confirm your email.</Text>
      <Text style={paragraphStyle}>
        Welcome, {firstName}. Click the button below to verify the email on
        your account so you can start placing orders. The link expires in{' '}
        {expiresIn}.
      </Text>

      <Section style={{ marginTop: '8px' }}>
        <Button href={verifyUrl} style={ctaButtonStyle}>
          Verify email
        </Button>
      </Section>

      <Text style={{ ...paragraphStyle, marginTop: '24px', fontSize: '13px' }}>
        If you didn&apos;t create a WholesaleHub account, you can ignore this
        email — no further action will be taken.
      </Text>
    </Layout>
  );
}

export default EmailVerification;
