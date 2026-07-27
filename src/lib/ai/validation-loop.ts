import { z } from 'zod';
import { logger } from '@/lib/logger';

// ─── Bedrock LLM Invocation ───
// Attempts to import from embeddings module; falls back to demo implementation
let invokeBedrockLLM: (prompt: string) => Promise<string>;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const embeddings = require('@/lib/embeddings');
  invokeBedrockLLM = embeddings.invokeBedrockLLM;
} catch {
  /**
   * Demo fallback: Returns a well-structured sample extraction JSON.
   * Used when the Bedrock embeddings module is not yet available.
   */
  invokeBedrockLLM = async (_prompt: string): Promise<string> => {
    logger.warn({ event: 'bedrock_fallback', message: 'Using demo LLM fallback — @/lib/embeddings not available' });
    return JSON.stringify({
      supplier_name: 'Demo Wholesale Distributors',
      document_type: 'INVOICE',
      document_number: 'INV-2024-00123',
      po_reference: 'PO-5678',
      ship_date: '2024-12-01',
      carrier: 'FedEx',
      tracking_number: '7489273649182',
      line_items: [
        {
          sku: 'SKU-001',
          upc: '012345678901',
          product_description: 'Premium Lighter 3-Pack',
          quantity: 100,
          unit_cost: 2.50,
          line_total: 250.00,
        },
        {
          sku: 'SKU-002',
          upc: '012345678902',
          product_description: 'Rolling Papers King Size',
          quantity: 200,
          unit_cost: 1.25,
          line_total: 250.00,
        },
      ],
      subtotal: 500.00,
      tax: 40.00,
      total: 540.00,
      confidence: {
        header: 'HIGH',
        line_items: 'HIGH',
        totals: 'HIGH',
      },
    });
  };
}

// ─── Enums & Zod Schemas ───

/** Confidence levels for extraction field groups */
const ConfidenceLevelEnum = z.enum(['HIGH', 'MEDIUM', 'LOW']);

/** Supported document types */
const DocumentTypeEnum = z.enum(['INVOICE', 'ASN', 'PO_CONFIRMATION']);

/** Schema for a single extracted line item */
const ExtractedLineItemSchema = z.object({
  sku: z.string().optional().nullable(),
  upc: z.string().optional().nullable(),
  product_description: z.string().min(1, 'Product description is required'),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  unit_cost: z.number().nonnegative('Unit cost cannot be negative'),
  line_total: z.number().nonnegative('Line total cannot be negative'),
});

/** Confidence scores for each field group */
const ConfidenceSchema = z.object({
  header: ConfidenceLevelEnum,
  line_items: ConfidenceLevelEnum,
  totals: ConfidenceLevelEnum,
});

/**
 * Complete Zod schema for structured receipt/document extraction output.
 * Every field extracted by the AI must conform to this schema.
 */
export const ReceiptExtractionSchema = z.object({
  supplier_name: z.string().min(1, 'Supplier name is required'),
  document_type: DocumentTypeEnum,
  document_number: z.string().min(1, 'Document number is required'),
  po_reference: z.string().optional().nullable(),
  ship_date: z.string().optional().nullable(),
  carrier: z.string().optional().nullable(),
  tracking_number: z.string().optional().nullable(),
  line_items: z
    .array(ExtractedLineItemSchema)
    .min(1, 'At least one line item is required'),
  subtotal: z.number().nonnegative('Subtotal cannot be negative'),
  tax: z.number().nonnegative('Tax cannot be negative'),
  total: z.number().positive('Total must be positive'),
  confidence: ConfidenceSchema,
});

// ─── TypeScript Types (inferred from Zod) ───

export type ConfidenceLevel = z.infer<typeof ConfidenceLevelEnum>;
export type DocumentType = z.infer<typeof DocumentTypeEnum>;
export type ExtractedLineItem = z.infer<typeof ExtractedLineItemSchema>;
export type ExtractionConfidence = z.infer<typeof ConfidenceSchema>;
export type ReceiptExtraction = z.infer<typeof ReceiptExtractionSchema>;

/** A single correction recorded during the validation loop */
export interface ValidationCorrection {
  attempt: number;
  errors: string[];
  timestamp: string;
}

/** Result returned by extractWithValidation */
export interface ValidationResult {
  success: boolean;
  data?: ReceiptExtraction;
  errors?: string[];
  attempts: number;
  corrections: ValidationCorrection[];
}

// ─── Business Rules Validation ───

/**
 * Validates mathematical consistency of the extraction data.
 *
 * Checks:
 * 1. Each line_total equals quantity x unit_cost (within rounding tolerance)
 * 2. The sum of all line_totals equals the subtotal
 * 3. subtotal + tax equals the document total
 *
 * @param data - The parsed extraction data
 * @returns Array of error messages (empty if all rules pass)
 */
export function validateBusinessRules(data: ReceiptExtraction): string[] {
  const errors: string[] = [];
  const TOLERANCE = 0.02; // rounding tolerance for floating point

  // Rule 1: Each line total must equal qty * unit_cost
  for (let i = 0; i < data.line_items.length; i++) {
    const item = data.line_items[i];
    const expectedLineTotal = item.quantity * item.unit_cost;
    const diff = Math.abs(item.line_total - expectedLineTotal);

    if (diff > TOLERANCE) {
      errors.push(
        `Line item ${i + 1} ("${item.product_description}"): ` +
        `line_total ${item.line_total} does not match quantity (${item.quantity}) × ` +
        `unit_cost (${item.unit_cost}) = ${expectedLineTotal.toFixed(2)}`
      );
    }
  }

  // Rule 2: Sum of line totals must equal subtotal
  const lineSum = data.line_items.reduce((sum, item) => sum + item.line_total, 0);
  const subtotalDiff = Math.abs(lineSum - data.subtotal);

  if (subtotalDiff > TOLERANCE) {
    errors.push(
      `Subtotal mismatch: sum of line totals (${lineSum.toFixed(2)}) ` +
      `does not match subtotal (${data.subtotal.toFixed(2)})`
    );
  }

  // Rule 3: subtotal + tax must equal total
  const expectedTotal = data.subtotal + data.tax;
  const totalDiff = Math.abs(data.total - expectedTotal);

  if (totalDiff > TOLERANCE) {
    errors.push(
      `Total mismatch: subtotal (${data.subtotal.toFixed(2)}) + ` +
      `tax (${data.tax.toFixed(2)}) = ${expectedTotal.toFixed(2)}, ` +
      `but total is ${data.total.toFixed(2)}`
    );
  }

  return errors;
}

// ─── LLM Prompt Builder ───

/**
 * Builds the extraction prompt for the first attempt.
 */
function buildExtractionPrompt(documentText: string): string {
  return `You are a document extraction AI for WholesaleHub, a B2B wholesale marketplace.

Extract structured data from the following wholesale/distribution document (invoice, ASN, or PO confirmation).

Return ONLY valid JSON (no markdown fences, no explanation) matching this exact schema:
{
  "supplier_name": "string",
  "document_type": "INVOICE" | "ASN" | "PO_CONFIRMATION",
  "document_number": "string",
  "po_reference": "string or null",
  "ship_date": "YYYY-MM-DD or null",
  "carrier": "string or null",
  "tracking_number": "string or null",
  "line_items": [
    {
      "sku": "string or null",
      "upc": "string or null",
      "product_description": "string",
      "quantity": integer,
      "unit_cost": number,
      "line_total": number (must equal quantity × unit_cost)
    }
  ],
  "subtotal": number (must equal sum of all line_totals),
  "tax": number,
  "total": number (must equal subtotal + tax),
  "confidence": {
    "header": "HIGH" | "MEDIUM" | "LOW",
    "line_items": "HIGH" | "MEDIUM" | "LOW",
    "totals": "HIGH" | "MEDIUM" | "LOW"
  }
}

Rules:
- line_total MUST equal quantity × unit_cost for each line
- subtotal MUST equal the sum of all line_totals
- total MUST equal subtotal + tax
- Set confidence to LOW for fields you are uncertain about
- Use null for fields not found in the document

DOCUMENT TEXT:
${documentText}`;
}

/**
 * Builds a self-correction prompt that includes previous errors.
 */
function buildCorrectionPrompt(
  documentText: string,
  previousResponse: string,
  errors: string[],
): string {
  return `You are a document extraction AI for WholesaleHub. Your previous extraction had errors.

PREVIOUS EXTRACTION (with errors):
${previousResponse}

ERRORS FOUND:
${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Please fix ALL the errors above and return corrected JSON.
Remember:
- line_total MUST equal quantity × unit_cost for every line item
- subtotal MUST equal sum of all line_totals
- total MUST equal subtotal + tax
- Return ONLY valid JSON, no markdown fences

ORIGINAL DOCUMENT TEXT:
${documentText}`;
}

// ─── Core Extraction with Validation Loop ───

/**
 * Extracts structured data from a document using an LLM with iterative
 * self-correction via a validation loop.
 *
 * The loop works as follows:
 * 1. Attempt 1: Send the document text to the LLM with an extraction prompt.
 * 2. Parse the JSON response (stripping markdown code fences if present).
 * 3. Validate the parsed data against the Zod schema.
 * 4. Run business rules validation (math consistency checks).
 * 5. If validation fails: retry with error feedback for self-correction.
 * 6. Repeat up to `maxAttempts` times.
 * 7. Return success/failure with the extraction data and correction history.
 *
 * @param documentText - The raw text content of the document to extract from
 * @param maxAttempts - Maximum number of extraction attempts (default: 3)
 * @returns ValidationResult with success status, data, errors, attempt count, and corrections
 */
export async function extractWithValidation(
  documentText: string,
  maxAttempts: number = 3,
): Promise<ValidationResult> {
  const corrections: ValidationCorrection[] = [];
  let lastResponse = '';
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.info({
      event: 'extraction_attempt',
      attempt,
      maxAttempts,
      documentLength: documentText.length,
    });

    try {
      // Step 1: Invoke the LLM
      const prompt =
        attempt === 1
          ? buildExtractionPrompt(documentText)
          : buildCorrectionPrompt(documentText, lastResponse, lastErrors);

      const rawResponse = await invokeBedrockLLM(prompt);
      lastResponse = rawResponse;

      // Step 2: Strip markdown code fences if present
      let jsonString = rawResponse.trim();
      const fenceMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        jsonString = fenceMatch[1].trim();
      }

      // Step 3: Parse JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonString);
      } catch (parseError) {
        const parseErrors = [
          `JSON parse error: ${(parseError as Error).message}`,
        ];
        corrections.push({
          attempt,
          errors: parseErrors,
          timestamp: new Date().toISOString(),
        });
        lastErrors = parseErrors;
        logger.warn({
          event: 'extraction_json_parse_error',
          attempt,
          error: (parseError as Error).message,
        });
        continue;
      }

      // Step 4: Validate against Zod schema
      const zodResult = ReceiptExtractionSchema.safeParse(parsed);
      if (!zodResult.success) {
        const zodErrors = zodResult.error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.message}`,
        );
        corrections.push({
          attempt,
          errors: zodErrors,
          timestamp: new Date().toISOString(),
        });
        lastErrors = zodErrors;
        logger.warn({
          event: 'extraction_schema_validation_failed',
          attempt,
          errors: zodErrors,
        });
        continue;
      }

      // Step 5: Validate business rules
      const businessErrors = validateBusinessRules(zodResult.data);
      if (businessErrors.length > 0) {
        corrections.push({
          attempt,
          errors: businessErrors,
          timestamp: new Date().toISOString(),
        });
        lastErrors = businessErrors;
        logger.warn({
          event: 'extraction_business_rules_failed',
          attempt,
          errors: businessErrors,
        });
        continue;
      }

      // All validations passed
      logger.info({
        event: 'extraction_success',
        attempt,
        lineItemCount: zodResult.data.line_items.length,
        total: zodResult.data.total,
      });

      return {
        success: true,
        data: zodResult.data,
        attempts: attempt,
        corrections,
      };
    } catch (error) {
      const errorMsg = `LLM invocation error: ${(error as Error).message}`;
      corrections.push({
        attempt,
        errors: [errorMsg],
        timestamp: new Date().toISOString(),
      });
      lastErrors = [errorMsg];
      logger.error({
        event: 'extraction_llm_error',
        attempt,
        error: (error as Error).message,
      });
    }
  }

  // All attempts exhausted
  logger.error({
    event: 'extraction_all_attempts_failed',
    attempts: maxAttempts,
    lastErrors,
  });

  return {
    success: false,
    errors: lastErrors,
    attempts: maxAttempts,
    corrections,
  };
}
