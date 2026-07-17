const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

console.log('--- LeaveRequest Endpoints ---');
lines.forEach((line, index) => {
    if (line.includes('/api/leaves') && (line.includes('post') || line.includes('put') || line.includes('patch'))) {
        console.log(`Line ${index + 1}: ${line.trim()}`);
    }
});
