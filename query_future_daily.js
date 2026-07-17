const mongoose=require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI).then(async ()=>{
  const db=mongoose.connection.useDb('attendance_app');
  const r = await db.collection('dailyattendances').find({ date: { $gt: new Date('2026-05-26') } }).toArray();
  console.log('Future daily:', r.length);
  mongoose.disconnect();
});
