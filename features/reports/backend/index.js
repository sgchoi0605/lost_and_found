import { Router } from 'express';

const router = Router();

// Connection check only; this does not validate DB or authentication.
router.get('/health', (_req, res) => {
  res.json({ feature: 'reports', status: 'ok', stage: 'routing-only' });
});

export default router;
