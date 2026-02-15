import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { logger } from '@/lib/logger';

// ─── Configuration ───

const EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v2:0';
const LLM_MODEL_ID = 'anthropic.claude-3-sonnet-20240229-v1:0';
const EMBEDDING_DIMENSION = 1024;
const AWS_REGION = process.env.AWS_BEDROCK_REGION || 'us-east-1';

/**
 * Whether AWS Bedrock is available (credentials configured).
 * When false, the module operates in demo/fallback mode with mock embeddings.
 */
const isBedrockConfigured =
  !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;

// ─── Types ───

/** Product fields used to build the embedding input text */
interface ProductEmbeddingInput {
  name: string;
  brand: string | null;
  category: string | null;
  description: string | null;
  searchKeywords: string | null;
}

/** Options for the Bedrock LLM invocation */
interface BedrockLLMOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}

/** Shape of the Titan Embeddings V2 response body */
interface TitanEmbeddingResponse {
  embedding: number[];
  inputTextTokenCount: number;
}

/** Shape of the Anthropic Claude Messages API response body */
interface ClaudeMessageResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text: string }>;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

// ─── Bedrock Client (lazy singleton) ───

let bedrockClient: BedrockRuntimeClient | null = null;

/**
 * Returns the shared BedrockRuntimeClient instance.
 * Creates one on first call. Returns null if AWS credentials are not configured.
 */
function getBedrockClient(): BedrockRuntimeClient | null {
  if (!isBedrockConfigured) {
    return null;
  }
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({ region: AWS_REGION });
  }
  return bedrockClient;
}

// ─── Mock / Fallback Helpers ───

/**
 * Generates a deterministic mock embedding vector for demo mode.
 * Uses a simple hash-based approach so the same text always produces
 * the same vector, which preserves relative similarity ordering.
 */
function generateMockEmbedding(text: string): number[] {
  const embedding = new Array<number>(EMBEDDING_DIMENSION);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    // Deterministic pseudo-random based on hash + position
    hash = ((hash << 5) - hash + i) | 0;
    embedding[i] = (hash & 0xffff) / 0xffff - 0.5;
  }
  // L2-normalise so cosine similarity works correctly
  const magnitude = Math.sqrt(
    embedding.reduce((sum, val) => sum + val * val, 0),
  );
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    embedding[i] = embedding[i] / (magnitude || 1);
  }
  return embedding;
}

// ─── Public API ───

/**
 * Generate an embedding vector for the given text using AWS Bedrock Titan
 * Embeddings V2. Returns a 1024-dimension float array.
 *
 * Falls back to a deterministic mock embedding when AWS credentials are
 * not configured, allowing local development and demos without Bedrock.
 *
 * @param text - The input text to embed (max ~8,000 tokens for Titan V2)
 * @returns A 1024-dimension embedding vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const startMs = Date.now();
  const client = getBedrockClient();

  if (!client) {
    logger.warn({
      event: 'embedding_fallback',
      reason: 'aws_credentials_not_configured',
      textLength: text.length,
    });
    return generateMockEmbedding(text);
  }

  try {
    const command = new InvokeModelCommand({
      modelId: EMBEDDING_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        inputText: text,
        dimensions: EMBEDDING_DIMENSION,
        normalize: true,
      }),
    });

    const response = await client.send(command);
    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body),
    ) as TitanEmbeddingResponse;

    const durationMs = Date.now() - startMs;

    logger.info({
      event: 'embedding_generated',
      model: EMBEDDING_MODEL_ID,
      inputTokens: responseBody.inputTextTokenCount,
      dimensions: EMBEDDING_DIMENSION,
      durationMs,
    });

    return responseBody.embedding;
  } catch (error) {
    const durationMs = Date.now() - startMs;
    logger.error({
      event: 'embedding_error',
      model: EMBEDDING_MODEL_ID,
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    });

    // Fallback to mock embedding so callers can still function
    logger.warn({
      event: 'embedding_fallback',
      reason: 'bedrock_invocation_failed',
    });
    return generateMockEmbedding(text);
  }
}

/**
 * Invoke AWS Bedrock Claude 3 Sonnet with a system prompt and user message.
 *
 * Falls back to a placeholder response string when AWS credentials are
 * not configured, allowing local development and demos.
 *
 * @param systemPrompt - The system/instructions prompt
 * @param userMessage  - The user message / query
 * @param options      - Optional generation parameters
 * @returns The assistant response text
 */
export async function invokeBedrockLLM(
  systemPrompt: string,
  userMessage: string,
  options?: BedrockLLMOptions,
): Promise<string> {
  const startMs = Date.now();
  const client = getBedrockClient();

  const maxTokens = options?.maxTokens ?? 4096;
  const temperature = options?.temperature ?? 0.1;
  const topP = options?.topP ?? 0.9;

  if (!client) {
    logger.warn({
      event: 'llm_fallback',
      reason: 'aws_credentials_not_configured',
      systemPromptLength: systemPrompt.length,
      userMessageLength: userMessage.length,
    });
    return `[Demo Mode] LLM response for: "${userMessage.slice(0, 100)}..."`;
  }

  try {
    const command = new InvokeModelCommand({
      modelId: LLM_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens,
        temperature,
        top_p: topP,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    const response = await client.send(command);
    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body),
    ) as ClaudeMessageResponse;

    const durationMs = Date.now() - startMs;
    const text =
      responseBody.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('') || '';

    logger.info({
      event: 'llm_invoked',
      model: LLM_MODEL_ID,
      inputTokens: responseBody.usage.input_tokens,
      outputTokens: responseBody.usage.output_tokens,
      stopReason: responseBody.stop_reason,
      durationMs,
    });

    return text;
  } catch (error) {
    const durationMs = Date.now() - startMs;
    logger.error({
      event: 'llm_error',
      model: LLM_MODEL_ID,
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    });

    return `[Demo Mode] LLM unavailable. Query: "${userMessage.slice(0, 100)}..."`;
  }
}

/**
 * Build the text string used to generate a product embedding.
 * Combines key product fields into a single coherent string that
 * captures the product's semantic meaning.
 *
 * @param product - The product fields to combine
 * @returns A single text string suitable for embedding generation
 */
export function buildProductEmbeddingText(product: ProductEmbeddingInput): string {
  const parts: string[] = [];

  if (product.name) {
    parts.push(product.name);
  }
  if (product.brand) {
    parts.push(`Brand: ${product.brand}`);
  }
  if (product.category) {
    parts.push(`Category: ${product.category}`);
  }
  if (product.description) {
    parts.push(product.description);
  }
  if (product.searchKeywords) {
    parts.push(`Keywords: ${product.searchKeywords}`);
  }

  return parts.join(' | ');
}

/**
 * The dimension of embedding vectors produced by generateEmbedding().
 * Useful for schema/migration validation.
 */
export const VECTOR_DIMENSION = EMBEDDING_DIMENSION;
