const fs = require('fs');

const brands = ['Redmi', 'Samsung', 'Realme', 'OnePlus', 'Pixel', 'Vivo', 'Oppo', 'Motorola', 'Xiaomi', 'Poco', 'Infinix', 'Tecno', 'IQOO', 'Nothing', 'Xiaomi', 'Sony', 'Huawei'];
const lowerBrands = brands.map(b => b.toLowerCase());

function checkFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`File ${filePath} does not exist.`);
    return;
  }
  console.log(`Scanning ${filePath} (UTF-16LE)...`);
  
  // Read file as buffer and decode as utf16le
  const buffer = fs.readFileSync(filePath);
  const content = buffer.toString('utf16le');
  
  const lines = content.split('\n');
  console.log(`Total lines: ${lines.length}`);
  
  const foundModels = new Set();
  
  lines.forEach(line => {
    const lowerLine = line.toLowerCase();
    
    // Look for indicators of model
    if (lowerLine.includes('model=') || lowerLine.includes('brand=') || lowerLine.includes('device=') || lowerLine.includes('product.model') || lowerLine.includes('ro.product')) {
      console.log(`Model/Product line: ${line.trim()}`);
    }
    
    // Scan for brand names
    brands.forEach((brand, idx) => {
      if (lowerLine.includes(lowerBrands[idx])) {
        const index = lowerLine.indexOf(lowerBrands[idx]);
        const start = Math.max(0, index - 30);
        const end = Math.min(line.length, index + brand.length + 30);
        foundModels.add(`${brand} context: ... ${line.substring(start, end).trim()} ...`);
      }
    });
  });

  console.log(`\nSample brand contexts found:`);
  const arr = Array.from(foundModels);
  console.log(`Total brand contexts found: ${arr.length}`);
  arr.slice(0, 15).forEach(c => console.log(c));
}

// Check first 1000 characters of current_logcat.txt to see if it's indeed UTF-16LE
const buf = fs.readFileSync('current_logcat.txt');
console.log('File head bytes:', buf.slice(0, 20));
console.log('UTF-8 decode attempt:', buf.slice(0, 100).toString('utf8'));
console.log('UTF-16LE decode attempt:', buf.slice(0, 100).toString('utf16le'));

checkFile('current_logcat.txt');
