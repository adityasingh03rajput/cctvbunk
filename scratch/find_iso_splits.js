const fs = require('fs');
const content = fs.readFileSync('App.js', 'utf8');
const lines = content.split('\n');

console.log('--- Occurrences of toISOString().split(\'T\')[0] in App.js ---');
lines.forEach((line, index) => {
    if (line.includes('toISOString().split')) {
        console.log(`Line ${index + 1}: ${line.trim()}`);
    }
});
