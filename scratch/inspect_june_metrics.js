const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.useDb('attendance_app');
  
  const start = new Date('2026-06-01T00:00:00.000Z');
  const end = new Date('2026-06-20T23:59:59.999Z');
  
  console.log(`Querying records from ${start.toISOString()} to ${end.toISOString()}`);
  
  // 1. Period Attendance stats
  const periodAttendances = await db.collection('periodattendances').find({
    date: { $gte: start, $lte: end }
  }).toArray();
  console.log('--- Period Attendance Stats ---');
  console.log('Total period attendances:', periodAttendances.length);
  const present = periodAttendances.filter(x => x.status === 'present');
  const absent = periodAttendances.filter(x => x.status === 'absent');
  console.log('Present:', present.length);
  console.log('Absent:', absent.length);
  
  const wifiVerified = periodAttendances.filter(x => x.wifiVerified === true);
  const faceVerified = periodAttendances.filter(x => x.faceVerified === true);
  console.log('WiFi Verified:', wifiVerified.length);
  console.log('Face Verified:', faceVerified.length);
  
  // 2. Daily Attendance stats
  const dailyAttendances = await db.collection('dailyattendances').find({
    date: { $gte: start, $lte: end }
  }).toArray();
  console.log('\n--- Daily Attendance Stats ---');
  console.log('Total daily records:', dailyAttendances.length);
  console.log('Present daily:', dailyAttendances.filter(x => x.dailyStatus === 'present').length);
  console.log('Absent daily:', dailyAttendances.filter(x => x.dailyStatus === 'absent').length);
  
  // 3. Random Rings stats
  const randomRings = await db.collection('randomrings').find({
    triggeredAt: { $gte: start, $lte: end }
  }).toArray();
  console.log('\n--- Random Ring Stats ---');
  console.log('Total random rings triggered:', randomRings.length);
  let totalSuccessful = 0;
  let totalFailed = 0;
  let totalResponses = 0;
  randomRings.forEach(r => {
    totalSuccessful += (r.successfulVerifications || 0);
    totalFailed += (r.failedVerifications || 0);
    totalResponses += (r.totalResponses || 0);
  });
  console.log('Total Successful Verifications:', totalSuccessful);
  console.log('Total Failed Verifications:', totalFailed);
  console.log('Total Responses:', totalResponses);
  
  // 4. Audit Stats
  const audits = await db.collection('attendanceaudits').find({
    modifiedAt: { $gte: start, $lte: end }
  }).toArray();
  console.log('\n--- Manual Audits (Teacher/Admin Marking) ---');
  console.log('Total audits/manual edits:', audits.length);
  
  // 5. Total Student, Teacher, Classroom counts
  const studentCount = await db.collection('studentmanagements').countDocuments({ isActive: true });
  const totalStudentCount = await db.collection('studentmanagements').countDocuments({});
  const teacherCount = await db.collection('teachers').countDocuments({});
  const classroomCount = await db.collection('classrooms').countDocuments({});
  console.log('\n--- Entity Counts ---');
  console.log('Active Students:', studentCount);
  console.log('Total Students:', totalStudentCount);
  console.log('Teachers:', teacherCount);
  console.log('Classrooms:', classroomCount);
  
  await mongoose.disconnect();
}

run().catch(console.error);
