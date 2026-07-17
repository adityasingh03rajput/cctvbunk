require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const ENROLL = '0246cs231021';
const MONGO_URI = process.env.MONGODB_URI;

async function run() {
  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  console.log('✅ Connected to DB:', db.databaseName, '\n');

  // ── 1. Student Management profile ─────────────────────────────────────────
  console.log('═══════════════════════════════════════════');
  console.log('📋  studentmanagements  →  profile');
  console.log('═══════════════════════════════════════════');
  const student = await db.collection('studentmanagements').findOne(
    { enrollmentNo: { $regex: new RegExp('^' + ENROLL + '$', 'i') } },
    { projection: { faceDescriptor: 0, irisDescriptor: 0 } }   // skip large blobs
  );
  if (student) {
    console.log(JSON.stringify(student, null, 2));
  } else {
    console.log('❌  Not found in studentmanagements');
  }

  // ── 2. AttendanceRecords ───────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log('📅  attendancerecords  →  history');
  console.log('═══════════════════════════════════════════');
  const records = await db.collection('attendancerecords')
    .find({ enrollmentNo: { $regex: new RegExp('^' + ENROLL + '$', 'i') } })
    .sort({ date: -1 })
    .limit(10)
    .toArray();
  console.log(`Found ${records.length} records (latest 10):`);
  records.forEach(r => {
    console.log(`  📆 ${r.date?.toISOString?.()?.slice(0,10) ?? r.date}  |  Status: ${r.status}  |  Lectures: ${r.lectures?.length ?? 0}  |  Day%: ${r.dayPercentage ?? 0}`);
  });

  // ── 3. PeriodAttendances ───────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log('🕐  periodattendances  →  per-period');
  console.log('═══════════════════════════════════════════');
  const periods = await db.collection('periodattendances')
    .find({ enrollmentNo: { $regex: new RegExp('^' + ENROLL + '$', 'i') } })
    .sort({ date: -1 })
    .limit(15)
    .toArray();
  console.log(`Found ${periods.length} period records (latest 15):`);
  periods.forEach(p => {
    const d = p.date?.toISOString?.()?.slice(0,10) ?? p.date;
    console.log(`  📆 ${d}  |  Period: ${p.period}  |  Subject: ${p.subject}  |  Status: ${p.status}  |  Timer: ${p.timerSeconds ?? p.actualTimerSeconds ?? '-'}s`);
  });

  // ── 4. DailyAttendance ─────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log('📊  dailyattendances  →  daily stats');
  console.log('═══════════════════════════════════════════');
  const daily = await db.collection('dailyattendances')
    .find({ enrollmentNo: { $regex: new RegExp('^' + ENROLL + '$', 'i') } })
    .sort({ date: -1 })
    .limit(10)
    .toArray();
  console.log(`Found ${daily.length} daily records:`);
  daily.forEach(d => {
    const date = d.date?.toISOString?.()?.slice(0,10) ?? d.date;
    console.log(`  📆 ${date}  |  Present: ${d.presentPeriods}/${d.totalPeriods}  |  %: ${d.attendancePercentage?.toFixed(1)}  |  Status: ${d.dailyStatus}`);
  });

  await mongoose.disconnect();
  console.log('\n✅ Done.');
}

run().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
