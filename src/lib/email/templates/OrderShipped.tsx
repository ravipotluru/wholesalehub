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
 * Sent when a wholesaler PATCHes an order to status=SHIPPED. Includes the
 * carrier-supplied tracking number so the retailer can follow the delivery.
 */
export interface OrderShippedProps {
  orderNumber: string;
  carrier: string;
  trackingNumber: string;
  /** Carrier tracking page URL — pre-built, we don't construct it here. */
  trackingUrl: string;
  /** Free-form expected delivery date string, e.g. "Mon, Apr 28". */
  expectedDelivery: string;
}

export function OrderShipped(props: OrderShippedProps): JSX.Element {
  const { orderNumber, carrier, trackingNumber, trackingUrl, expectedDelivery } = props;
  const previewText = `Order ${orderNumber} shipped via ${carrier}.`;

  return (
    <Layout previewText={previewText}>
      <Text style={headingStyle}>Your order shipped.</Text>
      <Text style={paragraphStyle}>
        Order {orderNumber} is on its way. Track the delivery below.
      </Text>

      <Section>
        <Text style={labelStyle}>CARRIER</Text>
        <Text style={valueStyle}>{carrier}</Text>

        <Text style={labelStyle}>TRACKING NUMBER</Text>
        <Text style={{ ...valueStyle, fontFamily: 'monospace' }}>
          <Link href={trackingUrl} style={{ color: '#1E4D8C', textDecoration: 'none' }}>
            {trackingNumber}
          </Link>
        </Text>

        <Text style={labelStyle}>EXPECTED DELIVERY</Text>
        <Text style={valueStyle}>{expectedDelivery}</Text>
      </Section>

      <Section style={{ marginTop: '8px' }}>
        <Button href={trackingUrl} style={ctaButtonStyle}>
          Track shipment
        </Button>
      </Section>

      <Text style={{ ...paragraphStyle, marginTop: '24px', fontSize: '13px' }}>
        We&apos;ll send another email when it&apos;s delivered. If the package looks
        damaged on arrival, photograph it before you open it.
      </Text>
    </Layout>
  );
}

export default OrderShipped;
