import { Router } from 'express';
import { getSettings, saveSettings, validateSettings } from '../settings.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({ settings: getSettings() });
});

router.put('/', (req, res) => {
  const result = validateSettings(req.body);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  res.json({ settings: saveSettings(result.settings) });
});

export default router;
