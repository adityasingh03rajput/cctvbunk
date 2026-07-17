const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.includes('app.get(\'/api/teachers/status\'')) {
        console.log(`GET status route defined starting at line ${index + 1}: ${line.trim()}`);
    }
    if (line.includes('// GET /api/teachers/:identifier')) {
        console.log(`GET identifier route defined starting at line ${index + 1}: ${line.trim()}`);
    }
});
