const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.includes('async function generateSwapsForLeave')) {
        console.log(`generateSwapsForLeave defined at line ${index + 1}: ${line.trim()}`);
    }
});
