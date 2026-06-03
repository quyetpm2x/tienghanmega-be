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
];
if (process.env.FRONTEND_URL) {
  ALLOWED_ORIGINS.push(new RegExp('^' + process.env.FRONTEND_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
}

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.some(r => r.test(origin))) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1', (req, res, next) => { res.set('Cache-Control', 'no-store'); next() }, routes);

app.use(errorHandler);

module.exports = app;
