const path = require('path');
const fs = require('fs');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const CHROME_PROFILE_DIR = path.join(DATA_DIR, 'chrome_profile');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure necessary directories exist
[DATA_DIR, CHROME_PROFILE_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
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
  for (const p of DEFAULT_CHROME_PATHS) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return DEFAULT_CHROME_PATHS[0];
}

module.exports = {
  PORT: process.env.PORT || 3000,
  DATA_DIR,
  CHROME_PROFILE_DIR,
  UPLOADS_DIR,
  DB_FILE,
  DEFAULT_CHROME_PATH: getDetectedChromePath()
};
