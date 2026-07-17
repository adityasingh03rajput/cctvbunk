require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const leaves = await db.collection('leaverequests').find({ teacherName: 'Aditya Sir' }).toArray();
  console.log('=== Aditya Sir Leave Requests ===');
  leaves.forEach(l => {
    console.log({
      _id: l._id,
      startDate: l.startDate,
      endDate: l.endDate,
      startDateType: typeof l.startDate,
      endDateType: typeof l.endDate,
      status: l.status
    });
  });

  process.exit(0);
}
check().catch(console.error);
