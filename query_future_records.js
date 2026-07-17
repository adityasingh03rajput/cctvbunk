const mongoose=require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI).then(async ()=>{
  const db=mongoose.connection.useDb('attendance_app');
  const r = await db.collection('attendancerecords').find({ studentId: '0246Cs231021' }).toArray();
  const future = r.filter(x => new Date(x.date) > new Date('2026-05-26'));
  console.log('Future records in attendancerecords:', future.length);
  future.forEach(x => console.log(x.date, x.lectures));
  mongoose.disconnect();
});
