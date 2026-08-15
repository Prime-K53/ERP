const path = require('path');
const fs = require('fs');
const repo = require('./supabaseRepository.cjs');
const { detectIdentifierType, ResolutionError } = require('./resolverUtils.cjs');
const { LayoutEngine } = require('../../frontend/services/layoutEngine.cjs');
const { ConsistencyService } = require('../../frontend/services/consistencyService.cjs');

let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (err) {
  console.warn('[DocumentService] Puppeteer not available:', err.message);
}

class DocumentService {
  constructor() {
    this.layoutEngine = new LayoutEngine();
    this.consistencyService = new ConsistencyService();
    this.memoryRepository = new Map();
    this._memKey = (id) => `${id}`;
  }

  async resolveDocument(id, options = {}) {
    const defaultOptions = { includeInMemory: true, allowLogicalFallback: true, purpose: 'general' };
    const mergedOptions = { ...defaultOptions, ...options };
    const identifierType = detectIdentifierType(id);
    console.log(`[DocumentService] Resolving document ${id}...`, { identifierType, options: mergedOptions });

    const memKey = this._memKey(id);

    if (mergedOptions.includeInMemory && this.memoryRepository.has(memKey)) {
      const doc = this.memoryRepository.get(memKey);
      if (doc.status === 'voided') {
        const diag = `[ID: ${id}] [Stage: Resolution] [Lifecycle: voided] Cannot resolve a voided document.`;
        throw new ResolutionError(`Document ${id} is voided and cannot be resolved.`, id, identifierType, diag, 'ACCESS_DENIED');
      }
      console.log(`[DocumentService] Document ${id} resolved from in-memory repository.`);
      return doc;
    }

    let rows;
    if (identifierType === 'internalId') {
      rows = await repo.getById('documents', id) ? [await repo.getById('documents', id)] : [];
    } else if (identifierType === 'logicalNumber' && mergedOptions.allowLogicalFallback) {
      rows = await repo.getAll('documents', { 'data->>logical_number': `eq.${id}` });
    } else {
      console.warn(`[DocumentService] Invalid identifier format or fallback disabled: ${id}`);
      return null;
    }

    const doc = rows[0];
    if (!doc) {
      console.warn(`[DocumentService] Document ${id} not found in persistent store.`);
      return null;
    }

    if (doc.data?.status === 'voided') {
      const diag = `[ID: ${id}] [Stage: DB_Resolution] [Lifecycle: voided] Persistent resolution failed. The document has been voided and is no longer accessible via standard resolution pipelines.`;
      throw new ResolutionError(`Document ${id} is voided and cannot be resolved.`, id, identifierType, diag, 'ACCESS_DENIED');
    }

    if (identifierType === 'logicalNumber' && doc.data?.status === 'draft' && mergedOptions.purpose !== 'preview') {
      const diag = `[ID: ${id}] [Stage: DB_Resolution] [Lifecycle: draft] Access Denied: Logical number '${id}' refers to a DRAFT document. DRAFTs can only be resolved via logical number when explicitly requested with 'preview' purpose to prevent accidental use of non-finalized data.`;
      throw new ResolutionError(`Access Denied: Cannot resolve DRAFT document via logical number without preview context.`, id, identifierType, diag, 'CONTEXT_REQUIRED');
    }

    console.log(`[DocumentService] Document ${id} resolved via ${identifierType} (Status: ${doc.data?.status}).`);
    return {
      id: doc.id,
      logical_number: doc.data?.logical_number,
      type: doc.data?.type,
      status: doc.data?.status,
      payload: typeof doc.data?.payload === 'string' ? JSON.parse(doc.data.payload) : (doc.data?.payload || {}),
      render_model: doc.data?.render_model ? (typeof doc.data.render_model === 'string' ? JSON.parse(doc.data.render_model) : doc.data.render_model) : null,
      source: 'persistent',
      created_by: doc.data?.created_by,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }

  async registerDocument(type, payload, userId, existingId = null) {
    if (existingId) {
      const identifierType = detectIdentifierType(existingId);
      let internalId = existingId;
      if (identifierType === 'logicalNumber') {
        const doc = await this.resolveDocument(existingId, { allowLogicalFallback: true, purpose: 'general' });
        if (doc) {
          internalId = doc.id;
        } else {
          return this.createDocument(type, payload, userId);
        }
      }

      try {
        await this.updateDocument(internalId, payload, userId);
        const doc = await this.resolveDocument(internalId);
        return {
          id: doc.id,
          logicalNumber: doc.logical_number,
          type: doc.type,
          status: doc.status,
          isNew: false,
        };
      } catch (err) {
        if (err.message === 'Document not found') {
          return this.createDocument(type, payload, userId);
        }
        throw err;
      }
    } else {
      const result = await this.createDocument(type, payload, userId);
      return { ...result, isNew: true };
    }
  }

  async createDocument(type, payload, userId) {
    const uuid = require('crypto').randomUUID();
    const displayId = `${type.toUpperCase()}-${Date.now()}`;
    const record = {
      id: uuid,
      data: {
        logical_number: displayId,
        type,
        status: 'draft',
        payload,
        created_by: userId,
      },
    };
    await repo.upsert('documents', record);
    return { id: uuid, logicalNumber: displayId, type, status: 'draft' };
  }

  async updateDocument(id, payload, userId) {
    const old = await repo.getById('documents', id);
    if (!old) throw new Error('Document not found');
    if (old.data?.status !== 'draft') {
      throw new Error(`Cannot edit document in ${old.data?.status} status`);
    }
    await repo.upsert('documents', {
      ...old,
      data: {
        ...old.data,
        payload,
      },
      updated_at: new Date().toISOString(),
    });
  }

  async finalizeDocument(id, layoutBlueprint, userId) {
    const doc = await repo.getById('documents', id);
    if (!doc) throw new Error('Document not found');
    if (doc.data?.status !== 'draft') {
      throw new Error(`Document is already ${doc.data?.status}`);
    }

    const payload = typeof doc.data?.payload === 'string' ? JSON.parse(doc.data.payload) : (doc.data?.payload || {});

    const boundBlueprint = this.layoutEngine.calculate(payload, layoutBlueprint);
    const renderModel = this.layoutEngine.generate(boundBlueprint);

    renderModel.security = {
      ...renderModel.security,
      isFinalized: true,
      signature: {
        signerName: userId,
        signedAt: new Date().toISOString(),
        hash: this.consistencyService.generateFingerprint(renderModel),
      },
    };

    const validation = this.consistencyService.validate(renderModel);
    if (!validation.isValid) {
      throw new Error(`Layout validation failed: ${validation.errors.join(', ')}`);
    }

    await repo.upsert('documents', {
      ...doc,
      data: {
        ...doc.data,
        status: 'finalized',
        render_model: renderModel,
        fingerprint: validation.fingerprint,
        finalized_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    });

    return { id, status: 'finalized', fingerprint: validation.fingerprint };
  }

  async batchFinalize(ids, blueprint, userId) {
    const results = [];
    for (const id of ids) {
      try {
        const result = await this.finalizeDocument(id, blueprint, userId);
        results.push({ id, success: true, fingerprint: result.fingerprint });
      } catch (err) {
        results.push({ id, success: false, error: err.message });
      }
    }
    return results;
  }

  async batchExport(ids) {
    const results = [];
    for (const id of ids) {
      try {
        const exportResult = await this.exportPdf(id);
        results.push({ id, success: true, data: exportResult });
      } catch (err) {
        results.push({ id, success: false, error: err.message });
      }
    }
    return results;
  }

  async verifySignature(id) {
    const doc = await repo.getById('documents', id);
    if (!doc) throw new Error('Document not found');
    if (!doc.data?.fingerprint) throw new Error('Document is not finalized/signed');

    const renderModel = typeof doc.data?.render_model === 'string' ? JSON.parse(doc.data.render_model) : doc.data?.render_model;
    const currentFingerprint = this.consistencyService.generateFingerprint(renderModel);

    const isValid = currentFingerprint === doc.data?.fingerprint;
    const signature = renderModel?.security?.signature;

    return {
      isValid,
      signer: signature?.signerName,
      signedAt: signature?.signedAt,
      fingerprint: doc.data?.fingerprint,
    };
  }

  async voidDocument(id, userId) {
    const old = await repo.getById('documents', id);
    if (!old) throw new Error('Document not found');
    await repo.upsert('documents', {
      ...old,
      data: { ...old.data, status: 'voided' },
      updated_at: new Date().toISOString(),
    });
    return { id, status: 'voided' };
  }

  async getPreview(id, options = { purpose: 'preview', templateId: null }) {
    const identifierType = detectIdentifierType(id);
    try {
      const doc = await this.resolveDocument(id, {
        includeInMemory: true,
        allowLogicalFallback: true,
        purpose: options.purpose,
      });

      if (!doc) {
        const diag = `[ID: ${id}] [Stage: Resolution] [Lifecycle: unknown] The identifier '${id}' could not be matched against any registered document. Ensure the document was successfully registered before attempting to preview.`;
        throw new ResolutionError(`Document not found.`, id, identifierType, diag);
      }

      const isAllowedDraftPreview = doc.status === 'draft' && options.purpose === 'preview';
      if (doc.status !== 'finalized' && !isAllowedDraftPreview) {
        const diag = `[ID: ${id}] [Stage: Validation] [Lifecycle: ${doc.status}] Preview Blocked. Document is in '${doc.status}' state. Only 'finalized' documents or DRAFTs with an active 'preview' purpose session are eligible for rendering.`;
        throw new ResolutionError(`Preview Blocked: Document status is '${doc.status}'.`, id, identifierType, diag, 'ACCESS_DENIED');
      }

      const blueprint = await this.getBlueprintForType(doc.type, options.templateId);
      if (!blueprint) {
        const diag = `[ID: ${id}] [Stage: Blueprint_Lookup] [Lifecycle: ${doc.status}] No layout blueprint found for document type '${doc.type}'. Every document type must have a corresponding blueprint to define its visual structure.`;
        throw new Error(diag);
      }

      const payload = doc.payload;
      const validation = this.validatePayloadBindings(payload, blueprint);
      if (!validation.isValid) {
        const diag = `[ID: ${id}] [Stage: Payload_Validation] [Lifecycle: ${doc.status}] Payload validation failed. The document data is missing required fields defined in the blueprint: ${validation.missing.join(', ')}. Populate these fields in the source record before previewing.`;
        throw new Error(diag);
      }

      let renderModel = doc.render_model;
      if (!renderModel) {
        console.log(`Generating missing render model for document ${id}...`);
        const boundBlueprint = this.layoutEngine.calculate(payload, blueprint);
        renderModel = this.layoutEngine.generate(boundBlueprint);
      }

      if (doc.status === 'draft') {
        renderModel.security = {
          ...renderModel.security,
          watermark: {
            text: 'DRAFT',
            color: 'rgba(255, 0, 0, 0.2)',
            fontSize: 60,
            angle: -45,
          },
        };
        console.log(`[DocumentService] Watermarking applied to DRAFT document ${id}.`);
      }

      return renderModel;
    } catch (e) {
      console.error(`[DocumentService] Preview Pipeline Failure for ${id}:`, e.message);
      if (e instanceof ResolutionError) {
        throw e;
      }
      const diag = e.message.startsWith('[ID:') ? e.message : `[ID: ${id}] [Stage: Preview_Pipeline] [Lifecycle: unknown] Pipeline Failure: ${e.message}`;
      const error = new Error(`Preview Pipeline Failure: ${e.message}`);
      error.diagnostic = diag;
      throw error;
    }
  }

  async getBlueprintForType(type, templateId = null) {
    if (templateId) {
      const blueprintPath = path.resolve(__dirname, `../../contracts/blueprints/${templateId}.json`);
      if (fs.existsSync(blueprintPath)) {
        return JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
      }
    }

    const blueprintPath = path.resolve(__dirname, `../../contracts/examples/${type.toLowerCase()}-layout.json`);
    if (fs.existsSync(blueprintPath)) {
      return JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
    }
    return null;
  }

  validatePayloadBindings(payload, blueprint) {
    const missing = [];
    const placeholders = new Set();

    const collectPlaceholders = (node) => {
      if (!node) return;
      if (node.type === 'text' && node.content) {
        const matches = node.content.matchAll(/\{\{([\w\.]+)\}\}/g);
        for (const match of matches) {
          placeholders.add(match[1]);
        }
      } else if (node.type === 'container' && node.children) {
        node.children.forEach(collectPlaceholders);
      } else if (node.type === 'table') {
        if (node.dataSource) {
          placeholders.add(node.dataSource);
        }
        if (node.rows && node.rows[0]) {
          Object.values(node.rows[0].cells).forEach(collectPlaceholders);
        }
      }
    };

    blueprint.fixedSections.forEach(s => collectPlaceholders(s.content));
    blueprint.flowSections.forEach(s => s.elements.forEach(collectPlaceholders));

    placeholders.forEach((path) => {
      if (path.startsWith('item.') || path === 'item') return;
      const value = path.split('.').reduce((acc, part) => acc && acc[part], payload);
      if (value === undefined || value === null) {
        missing.push(path);
      }
    });

    return { isValid: missing.length === 0, missing };
  }

  async exportPdf(id) {
    const doc = await this.resolveDocument(id);
    if (!doc) {
      throw new Error('Document not found');
    }

    let renderModel = doc.render_model;
    if (!renderModel && doc.payload) {
      const blueprint = await this.getBlueprintForType(doc.type);
      if (blueprint) {
        const boundBlueprint = this.layoutEngine.calculate(doc.payload, blueprint);
        renderModel = this.layoutEngine.generate(boundBlueprint);
      }
    }

    if (!renderModel) {
      throw new Error('Cannot generate PDF: no render model available');
    }

    if (typeof renderModel === 'string') {
      renderModel = JSON.parse(renderModel);
    }

    if (!puppeteer) {
      console.warn('[DocumentService] PDF export requested but Puppeteer not installed. Returning render model.');
      return {
        success: false,
        message: 'PDF generation library not configured',
        renderModel,
        docType: doc.type,
        docId: doc.id,
      };
    }

    const html = this.renderModelToHtml(renderModel);
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px',
        },
      });

      await browser.close();

      return {
        success: true,
        pdfBuffer,
        docType: doc.type,
        docId: doc.id,
      };
    } catch (err) {
      await browser.close();
      throw err;
    }
  }

  renderModelToHtml(renderModel) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${renderModel.type || 'Document'}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .content { margin: 20px 0; }
          .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f5f5f5; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${renderModel.type || 'Document'}</h1>
        </div>
        <div class="content">
          <pre>${JSON.stringify(renderModel, null, 2)}</pre>
        </div>
        <div class="footer">
          <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
      </body>
      </html>
    `;

    return html;
  }

  async logAudit(userId, action, entityType, entityId, details) {
    const record = {
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
    };
    await repo.upsert('audit_logs', record);
  }
}

module.exports = new DocumentService();
