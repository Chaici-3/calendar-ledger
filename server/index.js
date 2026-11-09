import './env.js';
import express from 'express';
import agentRouter from './routes/agent.js';
import impulseRouter from './routes/impulse.js';
import recordsRouter from './routes/records.js';
import settingsRouter from './routes/settings.js';
import summaryRouter from './routes/summary.js';
import tagsRouter from './routes/tags.js';

const app = express();
const PORT = 3001;

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/records', recordsRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/impulse', impulseRouter);
app.use('/api/agent', agentRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

app.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`);
});
