const mongoose=require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI).then(async ()=>{
  const db=mongoose.connection.useDb('attendance_app');
  const StudentManagement = mongoose.model('StudentManagement', new mongoose.Schema({
    enrollmentNo: String, registeredDeviceId: String
  }), 'studentmanagements');
  
  const s = await StudentManagement.findOne({ enrollmentNo: /0246CS231021/i });
  console.log('User:', s.name, s._id, typeof s._id);
  
  const strId = s._id.toString();
  const res = await StudentManagement.updateOne({ _id: strId }, { registeredDeviceId: 'test_dev_123' });
  console.log('Update result:', res);
  
  const s2 = await StudentManagement.findOne({ _id: strId });
  console.log('Device ID after update:', s2.registeredDeviceId);
  
  // reset
  await StudentManagement.updateOne({ _id: strId }, { $unset: { registeredDeviceId: 1 } });
  
  mongoose.disconnect();
});
