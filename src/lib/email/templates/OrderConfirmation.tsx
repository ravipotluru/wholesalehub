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
 * Sent on successful POST /api/orders, once per created order.
 * Confirms a single per-supplier order — the parent checkout creates one
 * email per supplier (orders are split per-supplier on the platform).
 */
export interface OrderConfirmationProps {
  orderNumber: string;
  retailerBusinessName: string;
  supplierName: string;
  /** Number of distinct line items on the order. */
  lineCount: number;
  /** Order grand total as a number (USD). Format-only — pre-rounded by caller. */
  total: number;
  shipToAddress: string;
  viewOrderUrl: string;
}

const formatUsd = (n: number): string =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function OrderConfirmation(props: OrderConfirmationProps): JSX.Element {
  const { orderNumber, retailerBusinessName, supplierName, lineCount, total, shipToAddress, viewOrderUrl } = props;
  const previewText = `Order ${orderNumber} placed with ${supplierName}.`;

  return (
    <Layout previewText={previewText}>
      <Text style={headingStyle}>Order placed.</Text>
      <Text style={paragraphStyle}>
        Thanks, {retailerBusinessName}. We sent your order to {supplierName}. They&apos;ll
        confirm and ship it from their warehouse.
      </Text>

      <Section>
        <Text style={labelStyle}>ORDER NUMBER</Text>
        <Text style={valueStyle}>{orderNumber}</Text>

        <Text style={labelStyle}>SUPPLIER</Text>
        <Text style={valueStyle}>{supplierName}</Text>

        <Text style={labelStyle}>ITEMS</Text>
        <Text style={valueStyle}>
          {lineCount} {lineCount === 1 ? 'line item' : 'line items'}
        </Text>

        <Text style={labelStyle}>TOTAL</Text>
        <Text style={valueStyle}>{formatUsd(total)} USD</Text>

        <Text style={labelStyle}>SHIP TO</Text>
        <Text style={valueStyle}>{shipToAddress}</Text>
      </Section>

      <Section style={{ marginTop: '8px' }}>
        <Button href={viewOrderUrl} style={ctaButtonStyle}>
          View order
        </Button>
      </Section>

      <Text style={{ ...paragraphStyle, marginTop: '24px', fontSize: '13px' }}>
        We&apos;ll email you again when {supplierName} ships. Reply to this message
        if anything looks wrong.
      </Text>
    </Layout>
  );
}

export default OrderConfirmation;
