const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

console.log('--- Config Schema/Route definitions in server.js ---');
lines.forEach((line, index) => {
    if (line.includes('const') && (line.includes('Schema') || line.includes('model(')) && (line.includes('Config') || line.includes('Branch') || line.includes('Setting'))) {
        console.log(`Line ${index + 1}: ${line.trim()}`);
    }
    if (line.includes('app.get(\'/api/config/')) {
        console.log(`Line ${index + 1}: ${line.trim()}`);
    }
});
