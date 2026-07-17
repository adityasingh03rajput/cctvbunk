const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const collections = await mongoose.connection.db.listCollections().toArray();
  
  const startDate = new Date('2026-06-01T00:00:00.000Z');
  const endDate = new Date('2026-06-20T23:59:59.999Z');

  const PeriodAttendance = mongoose.connection.db.collection('periodattendances');
  const totalRecords = await PeriodAttendance.countDocuments({ date: { $gte: startDate, $lte: endDate } });
  
  const presentCount = await PeriodAttendance.countDocuments({ date: { $gte: startDate, $lte: endDate }, status: 'present' });
  const faceVerifiedCount = await PeriodAttendance.countDocuments({ date: { $gte: startDate, $lte: endDate }, faceVerified: true });
  const wifiVerifiedCount = await PeriodAttendance.countDocuments({ date: { $gte: startDate, $lte: endDate }, wifiVerified: true });

  console.log('--- METRICS ---');
  console.log('Total PeriodAttendance records:', totalRecords);
  console.log('Present records:', presentCount);
  console.log('Face verified:', faceVerifiedCount);
  console.log('WiFi verified:', wifiVerifiedCount);

  let randomRingCount = 0;
  if (collections.some(c => c.name.toLowerCase().includes('randomring'))) {
      const ringColl = mongoose.connection.db.collection(collections.find(c => c.name.toLowerCase().includes('randomring')).name);
      randomRingCount = await ringColl.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } });
      console.log('Random Rings:', randomRingCount);
  }

  mongoose.disconnect();
}
run().catch(console.error);
