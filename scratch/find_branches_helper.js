const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.includes('function getBranchesFromConfig')) {
        console.log(`getBranchesFromConfig defined at line ${index + 1}: ${line.trim()}`);
    }
});
