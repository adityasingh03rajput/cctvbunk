const fs = require('fs');
const path = require('path');

const logDir = 'LogFiles';
if (fs.existsSync(logDir)) {
  const files = fs.readdirSync(logDir);
  console.log(`Found log files:`, files);
  
  const userAgents = new Set();
  
  files.forEach(file => {
    const filePath = path.join(logDir, file);
    const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach(line => {
        if (line.includes('User-Agent') || line.includes('Mozilla/') || line.includes('Chrome/') || line.includes('Safari/')) {
          // extract Chrome version or device details
          const match = line.match(/(Mozilla\/5\.0 [^"]+)/);
          if (match) {
            userAgents.add(match[1]);
          } else {
            // grab the line or parts around it
            const start = Math.max(0, line.indexOf('Mozilla/') - 10);
            const end = Math.min(line.length, line.indexOf('Mozilla/') + 120);
            userAgents.add(line.substring(start, end).trim());
          }
        }
      });
    }
  });
  
  console.log('\n=== User Agents found in server logs ===');
  console.log(Array.from(userAgents));
} else {
  console.log('LogFiles directory not found.');
}
