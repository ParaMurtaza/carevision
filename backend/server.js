// Entry point: loads config, connects DB, starts the HTTP server.
require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 5000;

(async () => {
  await connectDB();
  app.listen(PORT, () => console.log(`CareVision AI running on http://localhost:${PORT}`));
})();
