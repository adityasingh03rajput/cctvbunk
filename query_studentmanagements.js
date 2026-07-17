require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  
  for (const colName of ['studentmanagements']) {
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
