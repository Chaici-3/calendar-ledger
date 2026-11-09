import { Router } from 'express';
import db from '../db.js';

const router = Router();

const listStmt = db.prepare('SELECT id, name, is_preset FROM tags ORDER BY id ASC');

router.get('/', (req, res) => {
  res.json({
    tags: listStmt.all().map((tag) => ({
      id: tag.id,
      name: tag.name,
      isPreset: Boolean(tag.is_preset),
    })),
  });
});

export default router;
