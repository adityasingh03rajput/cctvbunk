const mongoose=require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI).then(async ()=>{
  const db=mongoose.connection.useDb('attendance_app');
  const r = await db.collection('periodattendances').find({ date: { $gt: new Date('2026-05-26') } }).toArray();
  console.log('Future records:', r.length);
  r.forEach(x => console.log(x.date, x.studentId, x.period, x.durationSeconds));
  mongoose.disconnect();
});
