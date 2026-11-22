const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const apiRoutes = require('./routes/api');
const scheduler = require('./services/scheduler');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static frontend dashboard
app.use(express.static(path.join(__dirname, '..', 'public')));

// Uploaded images directory
app.use('/uploads', express.static(config.UPLOADS_DIR));

// API Router
app.use('/api', apiRoutes);

// High-Speed Tracking Link Redirect
app.get('/t/:trackingId', async (req, res) => {
  try {
    const { trafficTracker } = require('./services/trafficTracker');
    const result = await trafficTracker.recordClick(req.params.trackingId, req);
    if (result && result.destinationUrl) {
      return res.redirect(302, result.destinationUrl);
    }
    res.status(404).send('Tracking link was not found or has expired.');
  } catch (err) {
    res.status(500).send('Tracking redirect error: ' + err.message);
  }
});

// Catch-all route to serve SPA frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Run server & scheduler when launched directly
if (require.main === module) {
  scheduler.start();

  const server = app.listen(config.PORT, () => {
    const url = `http://localhost:${config.PORT}`;
    console.log('====================================================');
    console.log(`🚀 FB AutoBlog Master Dashboard is LIVE: ${url}`);
    console.log('====================================================');

    // Auto-open browser if not in production or disabled
    if (process.env.AUTO_OPEN !== 'false' && process.env.NODE_ENV !== 'production') {
      try {
        const open = require('open');
        open(url).catch(() => {});
      } catch (_) {}
    }
  });

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    scheduler.stop();
    server.close(() => process.exit(0));
  });

  process.on('SIGINT', () => {
    scheduler.stop();
    server.close(() => process.exit(0));
  });
}

module.exports = app;
