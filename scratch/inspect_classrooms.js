const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.useDb('attendance_app');
  
  const classrooms = await db.collection('classrooms').find({}).toArray();
  console.log('=== Classrooms in DB ===');
  classrooms.forEach(c => {
    console.log(`Room: ${c.roomNumber || c.name}, Building: ${c.building}, Capacity: ${c.capacity}, Active: ${c.isActive || c.active}`);
    console.log(`Allowed BSSIDs:`, c.wifiBSSIDs || c.allowedBSSIDs);
  });
  
  await mongoose.disconnect();
}

run().catch(console.error);
