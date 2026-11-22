const path = require('path');
const fs = require('fs');
const os = require('os');

const isVercel = !!process.env.VERCEL;

// On Vercel serverless environments, only /tmp is writable
const DATA_DIR = isVercel
  ? path.join(os.tmpdir(), 'autoblog_data')
  : path.resolve(__dirname, '..', 'data');

const CHROME_PROFILE_DIR = path.join(DATA_DIR, 'chrome_profile');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure directories exist safely without crashing on read-only systems
[DATA_DIR, CHROME_PROFILE_DIR, UPLOADS_DIR].forEach(dir => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    // Ignore read-only errors in serverless
  }
});

// Default chrome executable locations on Windows
const DEFAULT_CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];

function getDetectedChromePath() {
  if (isVercel) return '';
  for (const p of DEFAULT_CHROME_PATHS) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch (_) {}
  }
  return DEFAULT_CHROME_PATHS[0];
}

module.exports = {
  PORT: process.env.PORT || 3000,
  IS_VERCEL: isVercel,
  DATA_DIR,
  CHROME_PROFILE_DIR,
  UPLOADS_DIR,
  DB_FILE,
  DEFAULT_CHROME_PATH: getDetectedChromePath()
};
