import { Button, Link, Section, Text } from '@react-email/components';
import {
  Layout,
  ctaButtonStyle,
  headingStyle,
  labelStyle,
  paragraphStyle,
  valueStyle,
} from './Layout';

/**
 * Sent when an order's status flips to DELIVERED. Asks the retailer to
 * leave a review of the supplier — the secondary "view order" link gives
 * them a way to file a discrepancy if anything's wrong.
 */
export interface OrderDeliveredProps {
  orderNumber: string;
  /** Free-form delivery timestamp string, e.g. "Apr 28, 2026 at 3:42pm EST". */
  deliveredAt: string;
  viewOrderUrl: string;
  leaveReviewUrl: string;
}

export function OrderDelivered(props: OrderDeliveredProps): JSX.Element {
  const { orderNumber, deliveredAt, viewOrderUrl, leaveReviewUrl } = props;
  const previewText = `Order ${orderNumber} delivered.`;

  return (
    <Layout previewText={previewText}>
      <Text style={headingStyle}>Delivered.</Text>
      <Text style={paragraphStyle}>
        Order {orderNumber} arrived. Open the box, scan the line items, and file
        any discrepancies inside the app — sooner is better than later.
      </Text>

      <Section>
        <Text style={labelStyle}>ORDER NUMBER</Text>
        <Text style={valueStyle}>{orderNumber}</Text>

        <Text style={labelStyle}>DELIVERED</Text>
        <Text style={valueStyle}>{deliveredAt}</Text>
      </Section>

      <Section style={{ marginTop: '8px' }}>
        <Button href={leaveReviewUrl} style={ctaButtonStyle}>
          Rate this supplier
        </Button>
      </Section>

      <Text style={{ ...paragraphStyle, marginTop: '24px', fontSize: '13px' }}>
        Need to flag missing or damaged units?{' '}
        <Link href={viewOrderUrl} style={{ color: '#20A39E' }}>
          View the order and file a discrepancy
        </Link>
        .
      </Text>
    </Layout>
  );
}

export default OrderDelivered;
