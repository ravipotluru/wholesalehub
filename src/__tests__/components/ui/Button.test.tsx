/**
 * Button Component Tests
 *
 * Tests for src/components/ui/Button.tsx — the primary CTA button used
 * across the WholesaleHub marketplace.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/Button';

// Mock lucide-react Loader2 icon
jest.mock('lucide-react', () => ({
  Loader2: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="loader-icon" {...props} />
  ),
}));

describe('Button component', () => {
  // ─── Basic Rendering ───

  it('should render children text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('should render as a <button> element', () => {
    render(<Button>Test</Button>);
    const btn = screen.getByRole('button');
    expect(btn.tagName).toBe('BUTTON');
  });

  // ─── Variants ───

  it('should apply primary variant classes by default', () => {
    render(<Button>Primary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-brand-orange');
  });

  it('should apply secondary variant classes', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-brand-blue');
  });

  it('should apply outline variant classes', () => {
    render(<Button variant="outline">Outline</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('border-brand-blue');
  });

  it('should apply ghost variant classes', () => {
    render(<Button variant="ghost">Ghost</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('text-brand-teal');
  });

  it('should apply danger variant classes', () => {
    render(<Button variant="danger">Danger</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-status-error');
  });

  // ─── Sizes ───

  it('should apply md size classes by default', () => {
    render(<Button>Default Size</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('px-6');
    expect(btn.className).toContain('py-3');
  });

  it('should apply sm size classes', () => {
    render(<Button size="sm">Small</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('px-3');
    expect(btn.className).toContain('py-1.5');
  });

  it('should apply lg size classes', () => {
    render(<Button size="lg">Large</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('px-8');
    expect(btn.className).toContain('py-4');
  });

  // ─── Loading State ───

  it('should show loader icon when isLoading is true', () => {
    render(<Button isLoading>Loading</Button>);
    expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
  });

  it('should disable the button when isLoading is true', () => {
    render(<Button isLoading>Loading</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should not show loader icon when isLoading is false', () => {
    render(<Button isLoading={false}>Not Loading</Button>);
    expect(screen.queryByTestId('loader-icon')).not.toBeInTheDocument();
  });

  // ─── Disabled State ───

  it('should be disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should include disabled styling', () => {
    render(<Button disabled>Disabled</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('disabled:opacity-50');
  });

  // ─── Icons ───

  it('should render leftIcon', () => {
    render(
      <Button leftIcon={<span data-testid="left-icon">L</span>}>
        With Left
      </Button>
    );
    expect(screen.getByTestId('left-icon')).toBeInTheDocument();
  });

  it('should render rightIcon', () => {
    render(
      <Button rightIcon={<span data-testid="right-icon">R</span>}>
        With Right
      </Button>
    );
    expect(screen.getByTestId('right-icon')).toBeInTheDocument();
  });

  it('should replace leftIcon with loader when isLoading', () => {
    render(
      <Button
        isLoading
        leftIcon={<span data-testid="left-icon">L</span>}
      >
        Loading
      </Button>
    );
    expect(screen.queryByTestId('left-icon')).not.toBeInTheDocument();
    expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
  });

  // ─── Event Handling ───

  it('should call onClick handler when clicked', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click</Button>);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should not fire onClick when disabled', () => {
    const handleClick = jest.fn();
    render(
      <Button onClick={handleClick} disabled>
        Disabled
      </Button>
    );

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should not fire onClick when isLoading', () => {
    const handleClick = jest.fn();
    render(
      <Button onClick={handleClick} isLoading>
        Loading
      </Button>
    );

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  // ─── Custom className ───

  it('should merge custom className with default classes', () => {
    render(<Button className="my-custom-class">Custom</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('my-custom-class');
    // Should still have base classes
    expect(btn.className).toContain('inline-flex');
  });

  // ─── Ref forwarding ───

  it('should forward ref to the button element', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref Test</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.textContent).toBe('Ref Test');
  });

  // ─── HTML attributes passthrough ───

  it('should pass through native button attributes', () => {
    render(<Button type="submit" aria-label="Submit form">Submit</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('type', 'submit');
    expect(btn).toHaveAttribute('aria-label', 'Submit form');
  });

  it('should have displayName set to Button', () => {
    expect(Button.displayName).toBe('Button');
  });
});
