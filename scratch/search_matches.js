const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

console.log('--- matchesTeacher occurrences in server.js ---');
lines.forEach((line, index) => {
    if (line.includes('matchesTeacher') || line.includes('slot.teacher') || line.includes('slotTeacherId')) {
        console.log(`Line ${index + 1}: ${line.trim()}`);
    }
});
