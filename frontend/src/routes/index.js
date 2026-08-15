import { Router } from 'express';

const router = Router();

// Health check sub-route (accessible at /api/routes/health if needed)
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', module: 'routes' });
});

// Mount examination routes if available
try {
  const examinationModule = await import('../api/examination.routes.js');
  const examinationRouter = examinationModule.default ?? examinationModule;
  if (examinationRouter && typeof examinationRouter === 'function') {
    router.use(examinationRouter);
    console.log('[Routes] Examination routes mounted');
  }
} catch (err) {
  console.warn('[Routes] Examination routes not loaded:', err.message);
}

export default router;