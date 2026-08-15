const express = require('express');
const router = express.Router();
const { sendSafeError } = require('../utils/errors.cjs');

const GangRunOptimizer = require('../services/ai/gangRunOptimizer.cjs');
const CashFlowForecaster = require('../services/ai/cashFlowForecaster.cjs');
const AnomalyDetector = require('../services/ai/anomalyDetector.cjs');
const ChurnPredictor = require('../services/ai/churnPredictor.cjs');
const ReorderOptimizer = require('../services/ai/reorderOptimizer.cjs');
const POMatcher = require('../services/ai/poMatcher.cjs');
const SmartScheduler = require('../services/ai/smartScheduler.cjs');
const ConversationalAnalyzer = require('../services/ai/conversationalAnalyzer.cjs');
const AuditInvestigator = require('../services/ai/auditInvestigator.cjs');
const BOMGenerator = require('../services/ai/bomGenerator.cjs');

const gangRun = new GangRunOptimizer();
const cashFlow = new CashFlowForecaster();
const anomalies = new AnomalyDetector();
const churn = new ChurnPredictor();
const reorder = new ReorderOptimizer();
const poMatch = new POMatcher();
const scheduler = new SmartScheduler();
const analyzer = new ConversationalAnalyzer();
const auditor = new AuditInvestigator();
const bomGen = new BOMGenerator();

// Gang Run Optimizer
router.post('/gang-run/optimize', async (req, res) => {
  try {
    const result = await gangRun.optimize(req.body);
    res.json(result);
  } catch (err) {
    console.error('[AI] GangRun error:', err.message);
    sendSafeError(res, 500, 'AI_SERVICE_ERROR');
  }
});

// Cash Flow Forecaster
router.post('/cash-flow/forecast', async (req, res) => {
  try {
    const result = await cashFlow.forecast(req.body);
    res.json(result);
  } catch (err) {
    console.error('[AI] CashFlow error:', err.message);
    sendSafeError(res, 500, 'AI_SERVICE_ERROR');
  }
});

// Anomaly Detector
router.post('/anomalies/detect', async (req, res) => {
  try {
    const result = await anomalies.detect(req.body);
    res.json(result);
  } catch (err) {
    console.error('[AI] AnomalyDetect error:', err.message);
    sendSafeError(res, 500, 'AI_SERVICE_ERROR');
  }
});

// Churn Predictor
router.post('/churn/predict', async (req, res) => {
  try {
    const result = await churn.predict();
    res.json(result);
  } catch (err) {
    console.error('[AI] Churn error:', err.message);
    sendSafeError(res, 500, 'AI_SERVICE_ERROR');
  }
});

// Reorder Point Optimizer
router.post('/reorder-points', async (req, res) => {
  try {
    const result = await reorder.optimize();
    res.json(result);
  } catch (err) {
    console.error('[AI] Reorder error:', err.message);
    sendSafeError(res, 500, 'AI_SERVICE_ERROR');
  }
});

// PO Matcher
router.post('/po-match', async (req, res) => {
  try {
    const result = await poMatch.matchAll();
    res.json(result);
  } catch (err) {
    console.error('[AI] POMatch error:', err.message);
    sendSafeError(res, 500, 'AI_SERVICE_ERROR');
  }
});

// Production Schedule Optimizer
router.post('/schedule/optimize', async (req, res) => {
  try {
    const result = await scheduler.optimize(req.body);
    res.json(result);
  } catch (err) {
    console.error('[AI] Schedule error:', err.message);
    sendSafeError(res, 500, 'AI_SERVICE_ERROR');
  }
});

// Conversational Query
router.post('/query', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return sendSafeError(res, 400, 'VALIDATION_ERROR');
    const result = await analyzer.query(question, req.body);
    res.json(result);
  } catch (err) {
    console.error('[AI] Query error:', err.message);
    sendSafeError(res, 500, 'AI_SERVICE_ERROR');
  }
});

// Audit Investigator
router.post('/audit/investigate', async (req, res) => {
  try {
    const result = await auditor.investigate(req.body.query, req.body);
    res.json(result);
  } catch (err) {
    console.error('[AI] AuditInvestigate error:', err.message);
    sendSafeError(res, 500, 'AI_SERVICE_ERROR');
  }
});

// BOM Generator
router.post('/bom/generate', async (req, res) => {
  try {
    const result = await bomGen.generate(req.body);
    res.json(result);
  } catch (err) {
    console.error('[AI] BOMGen error:', err.message);
    sendSafeError(res, 500, 'AI_SERVICE_ERROR');
  }
});

// Health / status
router.get('/status', (req, res) => {
  res.json({
    status: 'operational',
    features: [
      'gang-run-optimizer',
      'cash-flow-forecaster',
      'anomaly-detector',
      'churn-predictor',
      'reorder-optimizer',
      'po-matcher',
      'smart-scheduler',
      'conversational-query',
      'audit-investigator',
      'bom-generator'
    ],
    llmConfigured: !!process.env.AI_API_KEY
  });
});

module.exports = router;
