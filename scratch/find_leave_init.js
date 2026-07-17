const fs = require('fs');
const content = fs.readFileSync('App.js', 'utf8');
const lines = content.split('\n');

console.log('--- Occurrences in App.js ---');
lines.forEach((line, index) => {
    if (line.includes('ApplyLeave') || line.includes('leave') || line.includes('Leave')) {
        if (line.includes('const [') || line.includes('useState') || line.includes('setShowApplyLeave')) {
            console.log(`Line ${index + 1}: ${line.trim()}`);
        }
    }
});
