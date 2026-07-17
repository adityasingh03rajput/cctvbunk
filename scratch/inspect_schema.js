require('dotenv').config();
const mongoose = require('mongoose');

async function inspect() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const student = await db.collection('students').findOne({});
  if (student) {
    console.log('=== Student Fields ===');
    console.log('semester value:', student.semester, 'type:', typeof student.semester);
    console.log('branch value:', student.branch, 'type:', typeof student.branch);
    console.log('course value:', student.course, 'type:', typeof student.course);
  }

  const timetable = await db.collection('timetables').findOne({});
  if (timetable) {
    console.log('=== Timetable Fields ===');
    console.log('semester value:', timetable.semester, 'type:', typeof timetable.semester);
    console.log('branch value:', timetable.branch, 'type:', typeof timetable.branch);
    console.log('timetable days of week keys:', Object.keys(timetable.timetable || {}));
    
    // inspect a typical day schedule (e.g. monday)
    const monday = timetable.timetable?.monday || [];
    console.log('Monday schedule slots length:', monday.length);
    if (monday.length > 0) {
      console.log('First slot:', JSON.stringify(monday[0], null, 2));
      console.log('First slot teacher field type:', typeof monday[0].teacher);
    }
  }

  process.exit(0);
}
inspect().catch(console.error);
