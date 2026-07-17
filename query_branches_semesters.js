require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');
  const db = mongoose.connection.db;
  
  const collections = await db.listCollections().toArray();
  console.log('Collections:', collections.map(c => c.name));
  
  for (const colName of ['students', 'users', 'timetables']) {
    try {
      const col = db.collection(colName);
      const branches = await col.distinct('branch');
      const semesters = await col.distinct('semester');
      console.log(`\n--- Collection: ${colName} ---`);
      console.log('Branches:', branches);
      console.log('Semesters:', semesters);
    } catch (e) {
      console.error(`Error querying ${colName}:`, e.message);
    }
  }

  process.exit(0);
}
check().catch(console.error);
