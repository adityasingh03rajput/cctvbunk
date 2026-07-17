const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.useDb('attendance_app');
  
  // Fetch all period attendances
  const allPA = await db.collection('periodattendances').find({}).toArray();
  
  // We will convert date to YYYY-MM-DD in IST (GMT+5:30)
  const toISTDateString = (dateInput) => {
    if (!dateInput) return 'N/A';
    const d = new Date(dateInput);
    // Add 5 hours and 30 minutes
    const istTime = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
    return istTime.toISOString().split('T')[0];
  };

  const recordsInPeriod = [];
  
  allPA.forEach(x => {
    const istDate = toISTDateString(x.date);
    if (istDate >= '2026-06-01' && istDate <= '2026-06-20') {
      recordsInPeriod.push({
        ...x,
        istDate
      });
    }
  });

  console.log(`=== IST June 1 - June 20, 2026 Period Attendances (Total: ${recordsInPeriod.length}) ===`);
  
  // Date distribution
  const dateCounts = {};
  recordsInPeriod.forEach(x => {
    dateCounts[x.istDate] = (dateCounts[x.istDate] || 0) + 1;
  });
  console.log('Date distribution (IST):');
  Object.keys(dateCounts).sort().forEach(d => {
    console.log(`  ${d}: ${dateCounts[d]} records`);
  });

  // Status distribution
  const statuses = {};
  recordsInPeriod.forEach(x => {
    statuses[x.status] = (statuses[x.status] || 0) + 1;
  });
  console.log('\nStatus distribution:', statuses);

  // Verification types
  let wifiVerifiedCount = 0;
  let faceVerifiedCount = 0;
  let bothVerifiedCount = 0;
  let neitherVerifiedCount = 0;
  
  recordsInPeriod.forEach(x => {
    if (x.wifiVerified && x.faceVerified) bothVerifiedCount++;
    else if (x.wifiVerified) wifiVerifiedCount++;
    else if (x.faceVerified) faceVerifiedCount++;
    else neitherVerifiedCount++;
  });
  console.log(`\nVerification breakdown:`);
  console.log(`  WiFi Only Verified: ${wifiVerifiedCount}`);
  console.log(`  Face Only Verified: ${faceVerifiedCount}`);
  console.log(`  Both (WiFi + Face) Verified: ${bothVerifiedCount}`);
  console.log(`  Neither Verified: ${neitherVerifiedCount}`);

  // Calculate pass/fail rate for check-ins
  // Here, status is present or absent
  const total = recordsInPeriod.length;
  const present = recordsInPeriod.filter(x => x.status === 'present').length;
  const absent = recordsInPeriod.filter(x => x.status === 'absent').length;
  const active = recordsInPeriod.filter(x => x.status === 'active').length;
  console.log(`\nAttendance rates:`);
  console.log(`  Present: ${present} (${((present/total)*100).toFixed(1)}%)`);
  console.log(`  Absent: ${absent} (${((absent/total)*100).toFixed(1)}%)`);
  console.log(`  Active (In-progress): ${active} (${((active/total)*100).toFixed(1)}%)`);

  // Let's check Daily Attendances in IST
  const allDA = await db.collection('dailyattendances').find({}).toArray();
  const daInPeriod = allDA.filter(x => {
    const istDate = toISTDateString(x.date);
    return istDate >= '2026-06-01' && istDate <= '2026-06-20';
  });
  console.log(`\nDaily Attendances in IST June 1-20: ${daInPeriod.length}`);

  // Let's check Random Rings in IST
  const allRR = await db.collection('randomrings').find({}).toArray();
  const rrInPeriod = allRR.filter(x => {
    const istDate = toISTDateString(x.triggeredAt || x.createdAt);
    return istDate >= '2026-06-01' && istDate <= '2026-06-20';
  });
  console.log(`Random Rings in IST June 1-20: ${rrInPeriod.length}`);
  
  // Let's print out all unique users
  const users = await db.collection('users').find({}).toArray();
  console.log(`\nTotal users in DB: ${users.length}`);
  users.forEach(u => {
    console.log(`  - Username/Email: ${u.email || u.userId || 'N/A'}, Role: ${u.role}, Name: ${u.name}`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
