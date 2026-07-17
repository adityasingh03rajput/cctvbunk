const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.useDb('attendance_app');
  
  // 1. Details of June 2026 Period Attendances
  const allPA = await db.collection('periodattendances').find({}).toArray();
  const junePA = allPA.filter(x => {
    let d = new Date(x.date);
    return d.getFullYear() === 2026 && d.getMonth() === 5; // June is 5
  });
  
  console.log(`=== June 2026 Period Attendances (Total: ${junePA.length}) ===`);
  
  // Date distribution
  const dateCounts = {};
  junePA.forEach(x => {
    const dStr = new Date(x.date).toISOString().split('T')[0];
    dateCounts[dStr] = (dateCounts[dStr] || 0) + 1;
  });
  console.log('Date distribution:', dateCounts);

  // Status distribution
  const statuses = {};
  junePA.forEach(x => {
    statuses[x.status] = (statuses[x.status] || 0) + 1;
  });
  console.log('Status distribution:', statuses);

  // Verification types
  let wifiVerifiedCount = 0;
  let faceVerifiedCount = 0;
  let bothVerifiedCount = 0;
  let neitherVerifiedCount = 0;
  junePA.forEach(x => {
    if (x.wifiVerified && x.faceVerified) bothVerifiedCount++;
    else if (x.wifiVerified) wifiVerifiedCount++;
    else if (x.faceVerified) faceVerifiedCount++;
    else neitherVerifiedCount++;
  });
  console.log(`WiFi Only Verified: ${wifiVerifiedCount}`);
  console.log(`Face Only Verified: ${faceVerifiedCount}`);
  console.log(`Both (WiFi + Face) Verified: ${bothVerifiedCount}`);
  console.log(`Neither Verified: ${neitherVerifiedCount}`);

  // 2. Daily Attendances info
  const allDA = await db.collection('dailyattendances').find({}).toArray();
  console.log(`\n=== Daily Attendances (Total: ${allDA.length}) ===`);
  const daDates = allDA.map(x => new Date(x.date).toISOString().split('T')[0]);
  const uniqueDADates = [...new Set(daDates)].sort().reverse();
  console.log('Top 10 most recent daily attendance dates in DB:', uniqueDADates.slice(0, 10));

  // 3. Random Rings info
  const allRR = await db.collection('randomrings').find({}).toArray();
  console.log(`\n=== Random Rings (Total: ${allRR.length}) ===`);
  const rrDates = allRR.map(x => new Date(x.triggeredAt || x.createdAt).toISOString().split('T')[0]);
  const uniqueRRDates = [...new Set(rrDates)].sort().reverse();
  console.log('All random ring dates in DB:', uniqueRRDates);

  // 4. Audit log details (marked by teacher or admin)
  const allAudits = await db.collection('attendanceaudits').find({}).toArray();
  const juneAudits = allAudits.filter(x => {
    let d = new Date(x.modifiedAt || x.createdAt);
    return d.getFullYear() === 2026 && d.getMonth() === 5;
  });
  console.log(`\n=== June 2026 Audits/Edits (Total: ${juneAudits.length}) ===`);
  juneAudits.forEach(a => {
    console.log(`- Date: ${new Date(a.modifiedAt).toISOString().split('T')[0]}, Old Status: ${a.oldStatus}, New Status: ${a.newStatus}, Reason: ${a.reason}, Modified By: ${a.modifiedBy} (${a.modifierRole})`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
