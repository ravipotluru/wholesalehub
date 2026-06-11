/**
 * Bare layout for the full-viewport auth screens (verify-email, reset-password).
 * These pages render AuthShell, which owns its own min-h-[100dvh] split-canvas
 * grid — the (auth) group's centered flex wrapper would fight it, which is why
 * these routes live in their own group. URLs are unchanged (groups don't nest
 * into the path).
 */
export default function AuthScreensLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
