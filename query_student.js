const mongoose=require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI).then(async ()=>{
  const db=mongoose.connection.useDb('attendance_app');
  const all = await db.collection('periodattendances').find({ studentId: '0246Cs231021' }).toArray();
  const future = all.filter(x => new Date(x.date) > new Date('2026-05-26'));
  console.log('Total records:', all.length);
  console.log('Future records:', future.length);
  future.forEach(x => console.log(x.date, x.period, x.durationSeconds));
  mongoose.disconnect();
});
