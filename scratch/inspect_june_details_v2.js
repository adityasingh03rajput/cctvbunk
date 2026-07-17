const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.useDb('attendance_app');
  
  const toISTDateString = (dateInput) => {
    if (!dateInput) return 'N/A';
    const d = new Date(dateInput);
    const istTime = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
    return istTime.toISOString().split('T')[0];
  };

  const allPA = await db.collection('periodattendances').find({}).toArray();
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

  console.log(`Total June 1-20 period records: ${recordsInPeriod.length}`);
  
  // Branches and Semesters
  const branches = {};
  const semesters = {};
  recordsInPeriod.forEach(x => {
    branches[x.branch] = (branches[x.branch] || 0) + 1;
    semesters[x.semester] = (semesters[x.semester] || 0) + 1;
  });
  console.log('Branches:', branches);
  console.log('Semesters:', semesters);

  // Distinct students count
  const studentIds = new Set(recordsInPeriod.map(x => x.enrollmentNo));
  console.log('Distinct students who have check-ins:', studentIds.size);
  
  // Let's get some student details
  const sampleStudents = Array.from(studentIds).slice(0, 10);
  console.log('Sample student enrollment numbers:', sampleStudents);

  // Distinct subjects and teachers
  const subjects = {};
  const teachers = {};
  recordsInPeriod.forEach(x => {
    subjects[x.subject] = (subjects[x.subject] || 0) + 1;
    teachers[x.teacherName || x.teacher] = (teachers[x.teacherName || x.teacher] || 0) + 1;
  });
  console.log('Subjects taught:', subjects);
  console.log('Teachers teaching:', teachers);

  // Face Verification vs WiFi verification
  // Let's check how many check-ins had face verification pass
  const facePassed = recordsInPeriod.filter(x => x.faceVerified === true).length;
  const faceFailed = recordsInPeriod.filter(x => x.faceVerified === false && x.status === 'present').length; // Present without face?
  const wifiPassed = recordsInPeriod.filter(x => x.wifiVerified === true).length;
  
  console.log('\nVerification analysis:');
  console.log('  Face Verified:', facePassed);
  console.log('  WiFi Verified:', wifiPassed);

  // Let's print leave requests
  const leaves = await db.collection('leaverequests').find({}).toArray();
  console.log('\n=== Leave Requests ===');
  console.log(JSON.stringify(leaves, null, 2));

  // Let's query recent period attendance audits (marked by teachers/admins)
  const audits = await db.collection('attendanceaudits').find({}).toArray();
  const juneAudits = audits.filter(x => {
    const d = toISTDateString(x.modifiedAt || x.createdAt);
    return d >= '2026-06-01' && d <= '2026-06-20';
  });
  console.log('\n=== June Audits ===');
  console.log(JSON.stringify(juneAudits, null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);
