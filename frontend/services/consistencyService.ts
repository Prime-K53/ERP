import { RenderModel, RenderPage } from '../../contracts/RenderModel';
import { ValidationResult, ConsistencyConfig } from '../../contracts/ConsistencyLock';
const crypto: any = globalThis.crypto || (typeof window !== 'undefined' ? window.crypto : undefined);

/**
 * ConsistencyService is responsible for ensuring that a RenderModel is structurally
 * sound and hasn't drifted between the preview and output stages.
 */
export class ConsistencyService {
  private config: ConsistencyConfig;

  constructor(config: Partial<ConsistencyConfig> = {}) {
    this.config = {
      strictMode: config.strictMode ?? true,
      checkOverlaps: config.checkOverlaps ?? true,
      checkPageBoundaries: config.checkPageBoundaries ?? true,
      ...config
    };
  }

  /**
   * Generates a unique fingerprint for the RenderModel and validates its structure.
   */
  public validate(model: RenderModel): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Generate Fingerprint (Deterministic Hash)
    const fingerprint = this.generateFingerprint(model);

    // 2. Structural Validation
    model.pages.forEach((page, index) => {
      this.validatePage(page, index + 1, errors, warnings);
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      fingerprint
    };
  }

  /**
   * Validates that a fingerprint matches a model.
   * Prevents "Snapshot Drift" where the data might change after the user clicks 'Print'.
   */
  public verifyLock(model: RenderModel, expectedFingerprint: string): boolean {
    return this.generateFingerprint(model) === expectedFingerprint;
  }

  private generateFingerprint(model: RenderModel): string {
    // We stringify the core content of the pages to generate a hash
    const dataToHash = JSON.stringify(model.pages.map(p => ({
      num: p.pageNumber,
      elements: p.elements.map(e => ({
        t: e.type,
        b: e.box,
        c: (e as { content?: string }).content 
      }))
    })));

    // Portable hashing (works in Node and Browser)
    // If we're in Node, use crypto. If in browser, use a simple but robust hash
    const nodeCrypto = crypto as { createHash: (algo: string) => { update: (data: string) => { digest: (enc: string) => string } } };
    if (typeof crypto !== 'undefined' && typeof nodeCrypto.createHash === 'function') {
      return nodeCrypto.createHash('sha256')
        .update(dataToHash)
        .digest('hex');
    } else {
      // Fallback for browser if Node crypto is not polyfilled
      let hash = 0;
      for (let i = 0; i < dataToHash.length; i++) {
        const char = dataToHash.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
      }
      return 'b-' + Math.abs(hash).toString(16);
    }
  }

  private validatePage(page: RenderPage, pageNum: number, errors: string[], warnings: string[]) {
    page.elements.forEach((node, nodeIdx) => {
      // Check Page Boundaries
      if (this.config.checkPageBoundaries) {
        if (
          node.box.x < 0 || 
          node.box.y < 0 || 
          (node.box.x + node.box.width) > page.width || 
          (node.box.y + node.box.height) > page.height
        ) {
          const error = `Page ${pageNum}: Element ${node.type} at index ${nodeIdx} is outside page boundaries.`;
          if (this.config.strictMode) errors.push(error);
          else warnings.push(error);
        }
      }

      // Check for zero-size elements
      if (node.box.width <= 0 || node.box.height <= 0) {
        errors.push(`Page ${pageNum}: Element ${node.type} has invalid dimensions (${node.box.width}x${node.box.height}).`);
      }
    });

    // Check for extreme element counts (possible infinite loop in layout engine)
    if (page.elements.length > 1000) {
      errors.push(`Page ${pageNum}: Abnormal element count (${page.elements.length}). Possible layout overflow.`);
    }
  }
}
