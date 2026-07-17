const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

console.log('--- Occurrences of .getDay() ---');
lines.forEach((line, index) => {
    if (line.includes('.getDay()')) {
        console.log(`Line ${index + 1}: ${line.trim()}`);
    }
});
