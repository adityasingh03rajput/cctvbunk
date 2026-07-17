const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'admin-panel', 'index.html');
const content = fs.readFileSync(filePath, 'utf8');

console.log('=== Sidebar Navigation Items ===');
const sidebarMatches = content.match(/<div[^>]*class="[^"]*nav-item[^"]*"[^>]*>([\s\S]*?)<\/div>/g) || [];
sidebarMatches.forEach(item => {
  console.log(item.replace(/\s+/g, ' ').trim());
});

console.log('\n=== Section Containers ===');
const sectionMatches = content.match(/<div[^>]*id="[^"]*"[^>]*class="[^"]*section[^"]*"[^>]*>/g) || [];
sectionMatches.forEach(sec => {
  console.log(sec.trim());
});
