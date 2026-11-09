import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env 放在项目根目录，用绝对路径加载，不受启动时工作目录影响
dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

export const llmConfig = {
  apiKey: (process.env.LLM_API_KEY ?? '').trim(),
  apiUrl: (process.env.LLM_API_URL ?? '').trim(),
  model: (process.env.LLM_MODEL ?? '').trim() || 'deepseek-chat',
};

export const isLlmConfigured = Boolean(llmConfig.apiKey && llmConfig.apiUrl);
