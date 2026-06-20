// Load .env.development khi chạy local dev, .env khi production
const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
require('dotenv').config({ path: require('path').resolve(__dirname, '..', envFile) });
// Fallback sang .env nếu .env.development chưa tạo
if (!process.env.MONGODB_URI) require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/database');

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} [${process.env.NODE_ENV}]`);
  });
});
