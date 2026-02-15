import { logger } from '@/lib/logger';
import type { DocumentType } from './validation-loop';

// ─── Bedrock LLM Invocation ───

let invokeBedrockLLM: (prompt: string) => Promise<string>;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const embeddings = require('@/lib/embeddings');
  invokeBedrockLLM = embeddings.invokeBedrockLLM;
} catch {
  /**
   * Demo fallback: Uses keyword-based heuristic classification.
   * Returns a JSON response mimicking the LLM output format.
   */
  invokeBedrockLLM = async (prompt: string): Promise<string> => {
    logger.warn({
      event: 'classifier_bedrock_fallback',
      message: 'Using keyword-based fallback — @/lib/embeddings not available',
    });

    const result = classifyByKeywords(prompt);
    return JSON.stringify(result);
  };
}

// ─── Types ───

/** Result from document classification */
export interface ClassificationResult {
  type: DocumentType;
  confidence: number;
}

// ─── Keyword-Based Fallback ───

/**
 * Pattern-matching fallback classifier that uses keyword frequency
 * to determine document type when the LLM is not available.
 *
 * @param text - The document text to classify
 * @returns Classification result with type and confidence score
 */
function classifyByKeywords(text: string): ClassificationResult {
  const lower = text.toLowerCase();

  /** Weighted keyword scores for each document type */
  const scores: Record<string, number> = {
    INVOICE: 0,
    ASN: 0,
    PO_CONFIRMATION: 0,
  };

  // Invoice signals
  const invoiceKeywords: [string, number][] = [
    ['invoice', 3],
    ['inv-', 2],
    ['inv #', 2],
    ['invoice number', 3],
    ['invoice date', 2],
    ['bill to', 2],
    ['remit to', 2],
    ['payment terms', 1],
    ['net 30', 1],
    ['net 60', 1],
    ['amount due', 2],
    ['balance due', 2],
    ['tax', 1],
    ['subtotal', 1],
    ['total due', 2],
  ];

  // ASN (Advance Shipment Notice) signals
  const asnKeywords: [string, number][] = [
    ['advance shipment notice', 4],
    ['asn', 3],
    ['shipment notice', 3],
    ['shipping notice', 3],
    ['ship notice', 2],
    ['shipped via', 2],
    ['tracking number', 2],
    ['tracking #', 2],
    ['carrier', 1],
    ['ship date', 2],
    ['expected delivery', 2],
    ['estimated arrival', 2],
    ['freight', 1],
    ['bill of lading', 3],
    ['bol', 2],
    ['packing list', 2],
    ['packing slip', 2],
  ];

  // PO Confirmation signals
  const poKeywords: [string, number][] = [
    ['purchase order confirmation', 4],
    ['po confirmation', 4],
    ['order confirmation', 3],
    ['order confirmed', 3],
    ['purchase order', 2],
    ['po #', 2],
    ['po number', 2],
    ['order accepted', 3],
    ['order acknowledgement', 3],
    ['order acknowledgment', 3],
    ['confirmation number', 2],
    ['confirmed delivery', 2],
    ['order received', 2],
  ];

  for (const [keyword, weight] of invoiceKeywords) {
    if (lower.includes(keyword)) {
      scores['INVOICE'] += weight;
    }
  }

  for (const [keyword, weight] of asnKeywords) {
    if (lower.includes(keyword)) {
      scores['ASN'] += weight;
    }
  }

  for (const [keyword, weight] of poKeywords) {
    if (lower.includes(keyword)) {
      scores['PO_CONFIRMATION'] += weight;
    }
  }

  // Find the highest-scoring type
  const entries = Object.entries(scores) as [string, number][];
  entries.sort((a, b) => b[1] - a[1]);

  const topScore = entries[0][1];
  const topType = entries[0][0] as DocumentType;
  const totalScore = entries.reduce((sum, entry) => sum + entry[1], 0);

  // If no keywords found at all, return UNKNOWN-like with low confidence
  if (totalScore === 0) {
    return { type: 'INVOICE', confidence: 0.1 };
  }

  // Confidence is the proportion of the top score vs total, scaled
  const rawConfidence = topScore / totalScore;
  const confidence = Math.min(Math.max(rawConfidence, 0.1), 0.99);

  return { type: topType, confidence: Math.round(confidence * 100) / 100 };
}

// ─── LLM-Based Classification ───

/**
 * Classifies a document as INVOICE, ASN, or PO_CONFIRMATION using an LLM.
 *
 * The function sends the document text to AWS Bedrock and expects a JSON
 * response with `type` and `confidence` fields. If the LLM is unavailable
 * or returns invalid output, the function falls back to keyword-based
 * pattern matching.
 *
 * @param text - The raw text content of the document to classify
 * @returns Classification result with document type and confidence score (0-1)
 */
export async function classifyDocument(
  text: string,
): Promise<ClassificationResult> {
  const startTime = Date.now();

  logger.info({
    event: 'document_classification_start',
    textLength: text.length,
  });

  try {
    const prompt = `You are a document classifier for WholesaleHub, a B2B wholesale marketplace.

Classify the following document into one of these types:
- INVOICE: A bill for goods shipped or services rendered
- ASN: Advance Shipment Notice / shipping notification / packing slip
- PO_CONFIRMATION: Purchase Order confirmation / order acknowledgment

Return ONLY valid JSON (no markdown fences, no explanation):
{
  "type": "INVOICE" | "ASN" | "PO_CONFIRMATION",
  "confidence": number between 0 and 1
}

DOCUMENT TEXT:
${text.substring(0, 4000)}`;

    const rawResponse = await invokeBedrockLLM(prompt);

    // Strip markdown fences if present
    let jsonString = rawResponse.trim();
    const fenceMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonString = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonString) as Record<string, unknown>;

    // Validate the response structure
    const validTypes: string[] = ['INVOICE', 'ASN', 'PO_CONFIRMATION'];
    const parsedType = String(parsed.type || '');
    const parsedConfidence = Number(parsed.confidence || 0);

    if (!validTypes.includes(parsedType)) {
      logger.warn({
        event: 'classifier_invalid_type',
        parsedType,
        fallbackToKeywords: true,
      });
      return classifyByKeywords(text);
    }

    const confidence = Math.min(Math.max(parsedConfidence, 0), 1);

    const duration = Date.now() - startTime;
    logger.info({
      event: 'document_classification_complete',
      type: parsedType,
      confidence,
      durationMs: duration,
      method: 'llm',
    });

    return {
      type: parsedType as DocumentType,
      confidence: Math.round(confidence * 100) / 100,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.warn({
      event: 'classifier_llm_failed',
      error: (error as Error).message,
      durationMs: duration,
      fallbackToKeywords: true,
    });

    // Graceful degradation: fall back to keyword-based classification
    const result = classifyByKeywords(text);

    logger.info({
      event: 'document_classification_complete',
      type: result.type,
      confidence: result.confidence,
      method: 'keyword_fallback',
    });

    return result;
  }
}
