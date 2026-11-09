import { Router } from 'express';
import { buildSummary } from '../overview.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(buildSummary());
});

export default router;
