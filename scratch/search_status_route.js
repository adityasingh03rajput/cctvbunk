const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

console.log('--- Occurrences in server.js ---');
lines.forEach((line, index) => {
    if (line.includes('teachers/status') || line.includes('/status')) {
        if (line.includes('app.get') || line.includes('status')) {
            console.log(`Line ${index + 1}: ${line.trim()}`);
        }
    }
});
