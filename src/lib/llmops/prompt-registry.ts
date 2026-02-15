import { logger } from '@/lib/logger';

// ─── Types ───

/** A versioned prompt template with metadata */
export interface PromptTemplate {
  /** Unique identifier (auto-generated if not provided) */
  id: string;
  /** Logical name for the prompt (e.g. DOCUMENT_CLASSIFICATION) */
  name: string;
  /** Semantic version string (e.g. "1.0.0") */
  version: string;
  /** System-level instructions for the LLM */
  systemPrompt: string;
  /** User prompt with {{placeholder}} variables */
  userPromptTemplate: string;
  /** Model identifier to use with this prompt */
  model: string;
  /** Sampling temperature (0-1) */
  temperature: number;
  /** Maximum tokens for the LLM response */
  maxTokens: number;
  /** Searchable tags for categorization */
  tags: string[];
  /** Whether this version is active and available for use */
  isActive: boolean;
  /** Whether this is the default version for its prompt name */
  isDefault: boolean;
  /** ISO timestamp when this version was created */
  createdAt: string;
  /** User or system that registered this version */
  createdBy: string;
}

/** Summary entry returned when listing prompts */
export interface PromptSummary {
  name: string;
  activeVersions: number;
  defaultVersion: string | null;
  latestVersion: string;
  tags: string[];
}

// ─── Registry ───

/**
 * In-memory prompt versioning registry.
 *
 * Stores prompt templates keyed by name, with multiple versions per name.
 * Supports retrieval by name+version, rollback, and listing.
 * Designed so that the in-memory Map can be hydrated from / flushed to
 * a database table (e.g. `prompt_templates`) for persistence.
 */
export class PromptRegistry {
  /** Map of prompt name -> array of versions (newest last) */
  private prompts: Map<string, PromptTemplate[]> = new Map();

  /**
   * Retrieve a prompt template by name, optionally pinned to a specific version.
   * When no version is specified the current default active version is returned.
   * If no default is set, the latest active version is returned.
   *
   * @param name    - Logical prompt name
   * @param version - Optional specific version to retrieve
   * @returns The matching PromptTemplate, or null if not found
   */
  getPrompt(name: string, version?: string): PromptTemplate | null {
    const versions = this.prompts.get(name);
    if (!versions || versions.length === 0) {
      return null;
    }

    if (version) {
      return versions.find((v) => v.version === version && v.isActive) ?? null;
    }

    // Prefer the default version
    const defaultVersion = versions.find((v) => v.isDefault && v.isActive);
    if (defaultVersion) {
      return defaultVersion;
    }

    // Fallback: latest active version
    const activeVersions = versions.filter((v) => v.isActive);
    return activeVersions.length > 0 ? activeVersions[activeVersions.length - 1] : null;
  }

  /**
   * Register a new prompt version.
   * If `isDefault` is true on the incoming template, all other versions
   * of the same prompt name will have their `isDefault` flag cleared.
   *
   * @param template - The prompt template to register
   */
  registerPrompt(template: PromptTemplate): void {
    const existing = this.prompts.get(template.name) ?? [];

    // Ensure no duplicate version string
    const duplicate = existing.find((v) => v.version === template.version);
    if (duplicate) {
      logger.warn({
        event: 'prompt_register_duplicate',
        name: template.name,
        version: template.version,
      });
      throw new Error(
        `Prompt "${template.name}" version "${template.version}" already exists.`,
      );
    }

    // If the new template is the default, clear previous defaults
    if (template.isDefault) {
      for (const v of existing) {
        v.isDefault = false;
      }
    }

    existing.push(template);
    this.prompts.set(template.name, existing);

    logger.info({
      event: 'prompt_registered',
      name: template.name,
      version: template.version,
      isDefault: template.isDefault,
    });
  }

  /**
   * Roll back a prompt to a previous version by setting that version as the
   * new default. The target version must exist and be active.
   *
   * @param name      - Logical prompt name
   * @param toVersion - The version string to roll back to
   */
  rollbackPrompt(name: string, toVersion: string): void {
    const versions = this.prompts.get(name);
    if (!versions || versions.length === 0) {
      throw new Error(`Prompt "${name}" not found.`);
    }

    const target = versions.find((v) => v.version === toVersion);
    if (!target) {
      throw new Error(`Version "${toVersion}" not found for prompt "${name}".`);
    }

    if (!target.isActive) {
      throw new Error(
        `Version "${toVersion}" of prompt "${name}" is not active.`,
      );
    }

    // Clear all defaults, then set the target
    for (const v of versions) {
      v.isDefault = false;
    }
    target.isDefault = true;

    logger.info({
      event: 'prompt_rollback',
      name,
      toVersion,
    });
  }

  /**
   * List all registered prompts with summary metadata.
   *
   * @returns Array of prompt summaries (one entry per logical prompt name)
   */
  listPrompts(): PromptSummary[] {
    const summaries: PromptSummary[] = [];

    for (const [name, versions] of this.prompts.entries()) {
      const activeVersions = versions.filter((v) => v.isActive);
      const defaultVersion = versions.find((v) => v.isDefault && v.isActive);
      const latest = versions[versions.length - 1];

      // Merge tags from all versions
      const tagSet = new Set<string>();
      for (const v of versions) {
        for (const t of v.tags) {
          tagSet.add(t);
        }
      }

      summaries.push({
        name,
        activeVersions: activeVersions.length,
        defaultVersion: defaultVersion?.version ?? null,
        latestVersion: latest.version,
        tags: Array.from(tagSet),
      });
    }

    return summaries;
  }

  /**
   * Get the full version history for a specific prompt name.
   *
   * @param name - Logical prompt name
   * @returns Array of all PromptTemplates registered under this name
   */
  getPromptHistory(name: string): PromptTemplate[] {
    return this.prompts.get(name) ?? [];
  }
}

// ─── Pre-configured Prompt Templates ───

/** Unique ID generator for pre-registered prompts */
function promptId(name: string, version: string): string {
  return `prompt_${name.toLowerCase()}_v${version.replace(/\./g, '_')}`;
}

const BEDROCK_CLAUDE_MODEL = 'anthropic.claude-3-sonnet-20240229-v1:0';
const BEDROCK_TITAN_MODEL = 'amazon.titan-embed-text-v2:0';

/**
 * Pre-registered prompt templates shipped with WholesaleHub.
 * Each prompt has a clear system instruction and a user template with
 * {{placeholders}} that are interpolated at invocation time.
 */
const DEFAULT_PROMPTS: PromptTemplate[] = [
  // ── Document Classification ──
  {
    id: promptId('DOCUMENT_CLASSIFICATION', '1.0.0'),
    name: 'DOCUMENT_CLASSIFICATION',
    version: '1.0.0',
    systemPrompt: [
      'You are a document classification assistant for WholesaleHub, a B2B wholesale marketplace.',
      'Classify the given document into exactly one of these categories:',
      '- INVOICE: A billing document from a supplier',
      '- PURCHASE_ORDER: An order placed by a retailer',
      '- PACKING_SLIP: A slip describing package contents',
      '- RECEIPT: A proof of delivery / receiving document',
      '- UNKNOWN: Cannot be classified into the above',
      '',
      'Respond with valid JSON: { "category": "<CATEGORY>", "confidence": <0.0-1.0>, "reasoning": "<brief explanation>" }',
    ].join('\n'),
    userPromptTemplate: [
      'Classify the following document:',
      '',
      '---',
      '{{documentText}}',
      '---',
    ].join('\n'),
    model: BEDROCK_CLAUDE_MODEL,
    temperature: 0.0,
    maxTokens: 256,
    tags: ['classification', 'documents', 'extraction'],
    isActive: true,
    isDefault: true,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
  },

  // ── Receipt / Invoice Extraction ──
  {
    id: promptId('RECEIPT_EXTRACTION', '1.0.0'),
    name: 'RECEIPT_EXTRACTION',
    version: '1.0.0',
    systemPrompt: [
      'You are a data extraction assistant for WholesaleHub.',
      'Extract structured data from wholesale receipts and invoices.',
      'Return valid JSON matching this schema:',
      '{',
      '  "supplierName": string,',
      '  "invoiceNumber": string | null,',
      '  "date": "YYYY-MM-DD" | null,',
      '  "lineItems": [{ "sku": string | null, "name": string, "quantity": number, "unitPrice": number }],',
      '  "subtotal": number | null,',
      '  "tax": number | null,',
      '  "total": number | null,',
      '  "confidence": number (0.0-1.0)',
      '}',
      '',
      'If a field cannot be determined, use null. Ensure all monetary values are numbers (not strings).',
    ].join('\n'),
    userPromptTemplate: [
      'Extract structured data from this receipt/invoice:',
      '',
      '---',
      '{{documentText}}',
      '---',
      '',
      '{{fewShotExamples}}',
    ].join('\n'),
    model: BEDROCK_CLAUDE_MODEL,
    temperature: 0.0,
    maxTokens: 2048,
    tags: ['extraction', 'receipts', 'invoices'],
    isActive: true,
    isDefault: true,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
  },

  // ── Search Query Rewrite ──
  {
    id: promptId('SEARCH_REWRITE', '1.0.0'),
    name: 'SEARCH_REWRITE',
    version: '1.0.0',
    systemPrompt: [
      'You are a search query optimizer for WholesaleHub, a B2B wholesale marketplace for smoke shops and gas stations.',
      'Rewrite the user search query to improve recall and precision.',
      'Consider:',
      '- Expand abbreviations (e.g. "cig" -> "cigarettes")',
      '- Add relevant synonyms',
      '- Correct obvious typos',
      '- Keep the original intent',
      '',
      'Respond with valid JSON: { "rewrittenQuery": string, "expandedTerms": string[], "reasoning": string }',
    ].join('\n'),
    userPromptTemplate: [
      'Rewrite this search query for a wholesale marketplace:',
      '',
      'Original query: "{{query}}"',
      'Category context: {{categoryContext}}',
    ].join('\n'),
    model: BEDROCK_CLAUDE_MODEL,
    temperature: 0.1,
    maxTokens: 512,
    tags: ['search', 'rewrite', 'nlp'],
    isActive: true,
    isDefault: true,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
  },

  // ── Anomaly Explanation ──
  {
    id: promptId('ANOMALY_EXPLANATION', '1.0.0'),
    name: 'ANOMALY_EXPLANATION',
    version: '1.0.0',
    systemPrompt: [
      'You are an anomaly analysis assistant for WholesaleHub.',
      'When given an anomaly detection event, provide a brief human-readable explanation',
      'of what was detected and suggest possible root causes.',
      '',
      'Respond with valid JSON:',
      '{',
      '  "summary": string (1-2 sentences),',
      '  "possibleCauses": string[] (2-4 items),',
      '  "suggestedActions": string[] (1-3 items),',
      '  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"',
      '}',
    ].join('\n'),
    userPromptTemplate: [
      'Explain the following anomaly:',
      '',
      'Type: {{anomalyType}}',
      'Entity: {{entityType}} ({{entityId}})',
      'Metric: {{metricName}}',
      'Expected value: {{expectedValue}}',
      'Actual value: {{actualValue}}',
      'Z-score: {{zScore}}',
      'Historical context: {{historicalContext}}',
    ].join('\n'),
    model: BEDROCK_CLAUDE_MODEL,
    temperature: 0.2,
    maxTokens: 1024,
    tags: ['anomaly', 'explanation', 'analysis'],
    isActive: true,
    isDefault: true,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
  },
];

// ─── Singleton ───

let _registryInstance: PromptRegistry | null = null;

/**
 * Returns the singleton PromptRegistry instance, pre-loaded with
 * WholesaleHub's default prompt templates.
 *
 * The registry is initialized lazily on first access and persists for
 * the lifetime of the process.
 */
export function getPromptRegistry(): PromptRegistry {
  if (!_registryInstance) {
    _registryInstance = new PromptRegistry();

    for (const prompt of DEFAULT_PROMPTS) {
      _registryInstance.registerPrompt(prompt);
    }

    logger.info({
      event: 'prompt_registry_initialized',
      promptCount: DEFAULT_PROMPTS.length,
    });
  }

  return _registryInstance;
}

/**
 * Interpolate a prompt template's user prompt by replacing {{placeholders}}
 * with values from the provided context map.
 *
 * @param template - The prompt template containing the userPromptTemplate
 * @param context  - Key-value pairs where keys match placeholder names
 * @returns The interpolated user prompt string
 */
export function interpolatePrompt(
  template: PromptTemplate,
  context: Record<string, string>,
): string {
  let result = template.userPromptTemplate;

  for (const [key, value] of Object.entries(context)) {
    const placeholder = `{{${key}}}`;
    result = result.split(placeholder).join(value);
  }

  return result;
}
