import { Button, Section, Text } from '@react-email/components';
import {
  Layout,
  ctaButtonStyle,
  headingStyle,
  paragraphStyle,
} from './Layout';

/**
 * Sent on POST /api/auth/password-reset (when wired). Single CTA — the
 * recipient clicks it within `expiresIn` and is taken to a
 * password-reset form.
 *
 * NEVER include the temp token or password in the URL display text — only
 * inside the `href`. If we ever forward this email, we don't want the
 * token visible in the body of a quoted reply.
 */
export interface PasswordResetProps {
  firstName: string;
  resetUrl: string;
  /** Human-readable lifetime, e.g. "1 hour", "30 minutes". */
  expiresIn: string;
}

export function PasswordReset(props: PasswordResetProps): JSX.Element {
  const { firstName, resetUrl, expiresIn } = props;
  const previewText = 'Reset your WholesaleHub password.';

  return (
    <Layout previewText={previewText}>
      <Text style={headingStyle}>Reset your password.</Text>
      <Text style={paragraphStyle}>
        Hi {firstName}, click the button below to set a new password. The link
        expires in {expiresIn}.
      </Text>

      <Section style={{ marginTop: '8px' }}>
        <Button href={resetUrl} style={ctaButtonStyle}>
          Set new password
        </Button>
      </Section>

      <Text style={{ ...paragraphStyle, marginTop: '24px', fontSize: '13px' }}>
        If you didn&apos;t ask for a password reset, you can ignore this email
        — your password stays the same.
      </Text>
    </Layout>
  );
}

export default PasswordReset;
