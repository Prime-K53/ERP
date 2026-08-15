import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON parsing
app.use(express.json());
app.use(cors());

// Health check route
app.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is healthy' });
});

// Load all routes under /api
try {
  const { default: routes } = await import('./routes/index.js');
  app.use('/api', routes);
  console.log('[Server] API routes mounted at /api');
} catch (err) {
  console.warn('[Server] Could not load routes:', err.message);
}

// Catch-all for undefined /api routes
app.use('/api', (_req, res) => {
  res.status(404).json({
    status: 'error',
    error: 'Endpoint not found',
    code: 'ENDPOINT_NOT_FOUND'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;