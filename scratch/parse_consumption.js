const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'consumption_raw.json');
if (!fs.existsSync(jsonPath)) {
  console.error('File not found:', jsonPath);
  process.exit(1);
}

try {
  let rawData = fs.readFileSync(jsonPath, 'utf8');
  if (rawData.startsWith('\uFEFF') || rawData.startsWith('\uFFFE') || rawData.includes('\u0000')) {
    rawData = fs.readFileSync(jsonPath, 'utf16le');
  }
  
  // Remove BOM if present
  if (rawData.charCodeAt(0) === 0xFEFF || rawData.charCodeAt(0) === 0xFFFE) {
    rawData = rawData.substring(1);
  }

  const items = JSON.parse(rawData);

  console.log(`Total records: ${items.length}`);
  
  let totalCost = 0;
  const serviceCosts = {};
  const instanceCosts = {};
  let currency = 'USD'; // default fallback

  items.forEach(item => {
    // Azure API returns cost under different fields depending on billing type.
    // Standard properties: pretaxCost, cost, billableQuantity, etc.
    let cost = 0;
    if (item.pretaxCost !== undefined && item.pretaxCost !== null && item.pretaxCost !== 'None') {
      cost = parseFloat(item.pretaxCost);
    } else if (item.cost !== undefined && item.cost !== null && item.cost !== 'None') {
      cost = parseFloat(item.cost);
    }

    if (item.currency) {
      currency = item.currency;
    }

    if (cost > 0) {
      totalCost += cost;
      
      const service = item.consumedService || 'unknown';
      serviceCosts[service] = (serviceCosts[service] || 0) + cost;

      const instance = item.instanceName ? item.instanceName.split('/').pop() : 'unknown';
      instanceCosts[instance] = (instanceCosts[instance] || 0) + cost;
    }
  });

  console.log('\n--- Financial Summary (June 1 to June 20) ---');
  console.log(`Total Computed Cost: ${totalCost.toFixed(4)} ${currency}`);

  // Exchange rate fallback (June 2026 average: 1 USD = 83.50 INR)
  const exchangeRate = 83.50;
  let totalINR = 0;
  let totalUSD = 0;

  if (currency === 'INR') {
    totalINR = totalCost;
    totalUSD = totalCost / exchangeRate;
  } else {
    totalUSD = totalCost;
    totalINR = totalCost * exchangeRate;
  }

  console.log(`USD: $${totalUSD.toFixed(2)}`);
  console.log(`INR: ₹${totalINR.toFixed(2)} (Estimated at 1 USD = ₹${exchangeRate})`);

  console.log('\n--- Service Breakdown ---');
  Object.keys(serviceCosts).forEach(s => {
    const sCost = serviceCosts[s];
    const sINR = currency === 'INR' ? sCost : sCost * exchangeRate;
    const sUSD = currency === 'INR' ? sCost / exchangeRate : sCost;
    console.log(`- ${s}: $${sUSD.toFixed(3)} / ₹${sINR.toFixed(2)}`);
  });

  console.log('\n--- Top Resource Instances ---');
  const sortedInstances = Object.keys(instanceCosts).sort((a,b) => instanceCosts[b] - instanceCosts[a]);
  sortedInstances.forEach(inst => {
    const iCost = instanceCosts[inst];
    const iINR = currency === 'INR' ? iCost : iCost * exchangeRate;
    const iUSD = currency === 'INR' ? iCost / exchangeRate : iCost;
    console.log(`- ${inst}: $${iUSD.toFixed(3)} / ₹${iINR.toFixed(2)}`);
  });

} catch (err) {
  console.error('Error parsing JSON:', err);
}
