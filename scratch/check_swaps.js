require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const swaps = await db.collection('scheduleswaps').find({}).sort({ date: 1, period: 1 }).toArray();
  console.log(`=== ALL DB SWAPS (${swaps.length} found) ===`);
  swaps.forEach(s => {
    console.log(`Date: ${new Date(s.date).toISOString().split('T')[0]} | Period: ${s.period} | Branch: ${s.branch} | Subject: ${s.subject} | Original: ${s.originalTeacher} | Substitute: ${s.substituteTeacher}`);
  });

  const leaves = await db.collection('leaverequests').find({}).toArray();
  console.log(`\n=== ALL LEAVE REQUESTS (${leaves.length} found) ===`);
  leaves.forEach(l => {
    console.log(`Teacher: ${l.teacherName} | Status: ${l.status} | Start: ${new Date(l.startDate).toISOString().split('T')[0]} | End: ${new Date(l.endDate).toISOString().split('T')[0]}`);
  });

  process.exit(0);
}
check().catch(console.error);
