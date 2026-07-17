const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

console.log('--- Database connection lines in server.js ---');
lines.forEach((line, index) => {
    if (line.includes('mongoose.connect') || line.includes('MONGO') || line.includes('process.env.DB') || line.includes('process.env.MONGO')) {
        console.log(`Line ${index + 1}: ${line.trim()}`);
    }
});
