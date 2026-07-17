const mongoose=require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI).then(async ()=>{
  const db=mongoose.connection.useDb('attendance_app');
  const s = await db.collection('studentmanagements').findOne({ enrollmentNo: /0246CS231021/i });
  console.log('Found:', s ? s.name : 'No', 'Device ID:', s?.registeredDeviceId);
  mongoose.disconnect();
});
