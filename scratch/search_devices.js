const fs = require('fs');
const path = require('path');

const brands = ['Redmi', 'Samsung', 'Realme', 'OnePlus', 'Pixel', 'Vivo', 'Oppo', 'Motorola', 'Xiaomi', 'Poco', 'Infinix', 'Tecno', 'IQOO', 'Nothing'];
const lowerBrands = brands.map(b => b.toLowerCase());

function checkFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`File ${filePath} does not exist.`);
    return;
  }
  console.log(`Scanning ${filePath}...`);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  const foundModels = new Set();
  const androidVersions = new Set();
  const manufacturers = new Set();
  
  lines.forEach(line => {
    // Look for device info patterns
    if (line.includes('Release:') || line.includes('SDK:') || line.includes('Android Version') || line.includes('OS version') || line.includes('Android OS')) {
      if (foundModels.size < 20) {
        console.log(`Matching line: ${line.trim()}`);
      }
    }
    
    // Look for brand matches
    const lowerLine = line.toLowerCase();
    brands.forEach((brand, idx) => {
      if (lowerLine.includes(lowerBrands[idx])) {
        // extract some context
        if (foundModels.size < 20) {
          const index = lowerLine.indexOf(lowerBrands[idx]);
          const start = Math.max(0, index - 20);
          const end = Math.min(line.length, index + brand.length + 20);
          foundModels.add(line.substring(start, end).trim());
        }
      }
    });

    if (line.includes('model=') || line.includes('device=') || line.includes('product.model') || line.includes('ro.product.model')) {
      console.log(`Model line: ${line.trim()}`);
    }
  });

  console.log(`\nSample brand contexts found in ${filePath}:`);
  console.log(Array.from(foundModels).slice(0, 10));
}

checkFile('current_logcat.txt');
checkFile('logcat_dump.txt');
