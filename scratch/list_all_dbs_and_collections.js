const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const defaultDb = mongoose.connection.db;
  console.log('=== Default Connection DB Name:', mongoose.connection.name);
  
  const cols = await defaultDb.listCollections().toArray();
  console.log('Default DB Collections and counts:');
  for (const c of cols) {
    const count = await defaultDb.collection(c.name).countDocuments({});
    console.log(`  - ${c.name}: ${count} docs`);
  }

  // Check if we useDb another database
  console.log('\n=== Checking attendance_app DB ===');
  const appDb = mongoose.connection.useDb('attendance_app').db;
  const appCols = await appDb.listCollections().toArray();
  console.log('attendance_app Collections and counts:');
  for (const c of appCols) {
    const count = await appDb.collection(c.name).countDocuments({});
    console.log(`  - ${c.name}: ${count} docs`);
  }
  
  await mongoose.disconnect();
}

run().catch(console.error);
