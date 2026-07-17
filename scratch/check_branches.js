require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const studentBranches = await db.collection('students').distinct('branch');
  const timetableBranches = await db.collection('timetables').distinct('branch');

  console.log('=== Student Branches ===');
  console.log(studentBranches);

  console.log('\n=== Timetable Branches ===');
  console.log(timetableBranches);

  process.exit(0);
}
check().catch(console.error);
