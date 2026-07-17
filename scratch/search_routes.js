const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'server.js');
const fileContent = fs.readFileSync(filePath, 'utf8');
const lines = fileContent.split('\n');

console.log('Searching for routes in server.js...');
lines.forEach((line, index) => {
  if (line.includes('app.get(') || line.includes('app.post(') || line.includes('app.put(') || line.includes('app.delete(')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
