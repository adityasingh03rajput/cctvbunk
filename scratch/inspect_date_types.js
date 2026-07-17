const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.useDb('attendance_app');
  
  const samplePA = await db.collection('periodattendances').findOne({});
  console.log('Sample Period Attendance Document:');
  console.log(JSON.stringify(samplePA, null, 2));
  console.log('date type:', typeof samplePA.date, samplePA.date instanceof Date ? 'Date object' : 'Not Date object');
  if (samplePA.createdAt) {
    console.log('createdAt type:', typeof samplePA.createdAt, samplePA.createdAt instanceof Date ? 'Date object' : 'Not Date object');
  }

  const sampleRR = await db.collection('randomrings').findOne({});
  if (sampleRR) {
    console.log('\nSample Random Ring Document:');
    console.log(JSON.stringify(sampleRR, null, 2));
    console.log('triggeredAt type:', typeof sampleRR.triggeredAt, sampleRR.triggeredAt instanceof Date ? 'Date object' : 'Not Date object');
  } else {
    console.log('\nNo random rings found in collection.');
  }

  const sampleDA = await db.collection('dailyattendances').findOne({});
  if (sampleDA) {
    console.log('\nSample Daily Attendance Document:');
    console.log(JSON.stringify(sampleDA, null, 2));
    console.log('date type:', typeof sampleDA.date, sampleDA.date instanceof Date ? 'Date object' : 'Not Date object');
  } else {
    console.log('\nNo daily attendances found.');
  }

  // Let's query all period attendances where date matches 2026-06 string or date object
  const allPA = await db.collection('periodattendances').find({}).toArray();
  console.log('\nTotal period attendances in DB:', allPA.length);
  
  // Count how many have dates in June 2026
  let junePACount = 0;
  let junePADetails = [];
  allPA.forEach(x => {
    let d = new Date(x.date);
    if (d.getFullYear() === 2026 && d.getMonth() === 5) { // Month is 0-indexed, so 5 is June
      junePACount++;
      if (junePADetails.length < 5) junePADetails.push(x);
    }
  });
  console.log('Total period attendances in June 2026:', junePACount);
  
  // Let's also check random rings for June 2026
  const allRR = await db.collection('randomrings').find({}).toArray();
  console.log('Total random rings in DB:', allRR.length);
  let juneRRCount = 0;
  allRR.forEach(x => {
    let d = new Date(x.triggeredAt || x.createdAt);
    if (d.getFullYear() === 2026 && d.getMonth() === 5) {
      juneRRCount++;
    }
  });
  console.log('Total random rings in June 2026:', juneRRCount);

  // Let's check dailyattendances for June 2026
  const allDA = await db.collection('dailyattendances').find({}).toArray();
  console.log('Total daily attendances in DB:', allDA.length);
  let juneDACount = 0;
  allDA.forEach(x => {
    let d = new Date(x.date);
    if (d.getFullYear() === 2026 && d.getMonth() === 5) {
      juneDACount++;
    }
  });
  console.log('Total daily attendances in June 2026:', juneDACount);

  await mongoose.disconnect();
}

run().catch(console.error);
