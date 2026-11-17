import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { webhookRouter } from './routes/webhookRoutes.js';
import { apiRouter } from './routes/apiRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir frontend do Painel Administrativo
const publicPath = path.resolve(__dirname, '../public');
app.use(express.static(publicPath));

// Rotas da API e Webhooks
app.use('/api/webhooks', webhookRouter);
app.use('/api', apiRouter);

// Fallback para SPA
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Inicialização do servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`⚡ B2 Energia Solar | Automação Trello -> WhatsApp`);
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌐 Painel Administrativo: http://localhost:${PORT}`);
  console.log(`🔗 Endpoint Webhook Trello: http://localhost:${PORT}/api/webhooks/trello`);
  console.log(`=======================================================`);
});
