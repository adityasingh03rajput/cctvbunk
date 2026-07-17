const fs = require('fs');

const content = fs.readFileSync('current_logcat.txt', 'utf16le');
const lines = content.split('\n');

console.log('=== Fingerprints and Build Info in logcat ===');
lines.forEach(line => {
  if (line.includes('Build fingerprint') || line.includes('fingerprint') || line.includes('Brand:') || line.includes('Hardware:') || line.includes('Revision:')) {
    console.log(line.trim());
  }
});
