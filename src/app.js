const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Trust one hop of proxy headers (nginx, Render, Vercel, etc.)
// so req.ip and X-Forwarded-For return the real client IP
app.set('trust proxy', 1);
app.set('etag', false);

app.use(helmet());
const ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/.*\.ngrok-free\.app$/,
  /^https?:\/\/.*\.ngrok\.io$/,
  /^https?:\/\/.*\.vercel\.app$/,
];
// Allow FRONTEND_URL and its www subdomain
if (process.env.FRONTEND_URL) {
  const escaped = process.env.FRONTEND_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  ALLOWED_ORIGINS.push(new RegExp('^' + escaped + '$'));
  // also allow www. variant
  const wwwEscaped = escaped.replace('://', '://www\\.');
  ALLOWED_ORIGINS.push(new RegExp('^' + wwwEscaped + '$'));
}

app.use(cors({
  origin: (origin, cb) => {
    console.log('[CORS] origin:', origin);
    if (!origin || ALLOWED_ORIGINS.some(r => r.test(origin))) {
      cb(null, true);
    } else {
      console.log('[CORS] BLOCKED:', origin);
      cb(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/', (req, res, next) => { res.set('Cache-Control', 'no-store'); next() }, routes);

app.use(errorHandler);

module.exports = app;
