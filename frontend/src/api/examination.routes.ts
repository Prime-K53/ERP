import { Router, type Request } from 'express';
import { examinationService } from '../services/examination.service';

class HttpInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HttpInputError';
  }
}

const asObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpInputError('Request body must be an object');
  }
  return value as Record<string, unknown>;
};

const parseUserId = (req: Request) => {
  const rawHeader = req.headers['x-user-id'];
  const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const body = asObject(req.body ?? {});
  const bodyUserId = body.userId;
  const candidate = String(headerValue ?? bodyUserId ?? '').trim();
  return candidate || undefined;
};

const parseBatchId = (req: Request) => {
  const batchId = String(req.params?.id || '').trim();
  if (!batchId) {
    throw new HttpInputError('Path parameter "id" is required');
  }
  return batchId;
};

const parseCreatePayload = (req: Request) => {
  return asObject(req.body ?? {});
};

const parseCalculatePayload = (req: Request) => {
  const body = asObject(req.body ?? {});
  if (!Object.prototype.hasOwnProperty.call(body, 'settings')) {
    throw new HttpInputError('Body field "settings" is required');
  }
  const rawAdjustments = body.activeAdjustments ?? body.adjustments;
  if (rawAdjustments !== undefined && !Array.isArray(rawAdjustments)) {
    throw new HttpInputError('"activeAdjustments" must be an array when provided');
  }
  return {
    settings: (body.settings as unknown) ?? null,
    activeAdjustments: Array.isArray(rawAdjustments) ? rawAdjustments : []
  };
};

const parseApprovePayload = (req: Request) => {
  const body = asObject(req.body ?? {});
  return {
    paperItem: body.paperItem,
    tonerItem: body.tonerItem,
    paperConversionRate: body.paperConversionRate as number | undefined,
    tonerPagesPerUnit: body.tonerPagesPerUnit as number | undefined,
    paperUnitCost: body.paperUnitCost as number | undefined,
    tonerUnitCost: body.tonerUnitCost as number | undefined,
    schoolName: body.schoolName as string | undefined,
    priority: body.priority as 'Low' | 'Medium' | 'High' | 'Critical' | undefined,
    dueDate: body.dueDate as string | undefined
  };
};

const parseInvoicePayload = (req: Request) => {
  const body = asObject(req.body ?? {});
  const idempotencyKey = body.idempotencyKey;
  if (idempotencyKey !== undefined && typeof idempotencyKey !== 'string') {
    throw new HttpInputError('"idempotencyKey" must be a string when provided');
  }
  return { idempotencyKey: idempotencyKey as string | undefined };
};

const resolveWorkflowStatus = (error: unknown) => {
  if (error instanceof HttpInputError) return 400;
  const code = String((error as { workflowCode?: string })?.workflowCode || '');
  if (code === 'BATCH_IMMUTABLE') return 409;
  if (code === 'INVALID_TRANSITION') return 409;
  if (code === 'APPROVAL_NOT_ALLOWED') return 409;
  if (code === 'INVOICE_NOT_ALLOWED') return 409;
  return 500;
};

const router = Router();

router.post('/api/examinations', async (req, res) => {
  try {
    const userId = parseUserId(req);
    const payload = parseCreatePayload(req);
    const batch = await examinationService.createBatch(payload, userId);
    res.status(201).json(batch);
  } catch (error) {
    res.status(resolveWorkflowStatus(error)).json({
      error: String((error as Error)?.message || 'Failed to create examination batch')
    });
  }
});

router.post('/api/examinations/:id/calculate', async (req, res) => {
  try {
    const batchId = parseBatchId(req);
    const userId = parseUserId(req);
    const payload = parseCalculatePayload(req);
    const batch = await examinationService.calculateBatch({
      batchId,
      settings: payload.settings,
      activeAdjustments: payload.activeAdjustments,
      userId
    });
    res.json(batch);
  } catch (error) {
    res.status(resolveWorkflowStatus(error)).json({
      error: String((error as Error)?.message || 'Failed to calculate examination batch')
    });
  }
});

router.post('/api/examinations/:id/approve', async (req, res) => {
  try {
    const batchId = parseBatchId(req);
    const userId = parseUserId(req);
    const payload = parseApprovePayload(req);
    const result = await examinationService.approveBatch({
      batchId,
      userId,
      paperItem: payload.paperItem as { id?: string; name?: string; material?: string } | undefined,
      tonerItem: payload.tonerItem as { id?: string; name?: string; material?: string } | undefined,
      paperConversionRate: payload.paperConversionRate,
      tonerPagesPerUnit: payload.tonerPagesPerUnit,
      paperUnitCost: payload.paperUnitCost,
      tonerUnitCost: payload.tonerUnitCost,
      schoolName: payload.schoolName,
      priority: payload.priority,
      dueDate: payload.dueDate
    });
    res.json(result);
  } catch (error) {
    res.status(resolveWorkflowStatus(error)).json({
      error: String((error as Error)?.message || 'Failed to approve examination batch')
    });
  }
});

router.post('/api/examinations/:id/invoice', async (req, res) => {
  try {
    const batchId = parseBatchId(req);
    const payload = parseInvoicePayload(req);
    const result = await examinationService.generateInvoice({
      batchId,
      idempotencyKey: payload.idempotencyKey
    });
    res.json(result);
  } catch (error) {
    res.status(resolveWorkflowStatus(error)).json({
      error: String((error as Error)?.message || 'Failed to generate examination invoice')
    });
  }
});

export default router;
