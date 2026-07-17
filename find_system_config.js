require('dotenv').config();
const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance_app';

(async function() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    
    console.log('Searching in systemsettings and configs...');
    
    for (let collName of ['systemsettings', 'configs']) {
      try {
        const collection = db.collection(collName);
        const docs = await collection.find({}).toArray();
        if (docs.length > 0) {
          console.log(`\n--- Collection: ${collName} ---`);
          console.log(`Found ${docs.length} documents:`);
          // Let's print the entire document to see where branches are stored
          console.dir(docs, { depth: null });
        }
      } catch (e) {
        console.log(`Collection ${collName} could not be queried.`);
      }
    }
    
  } catch (e) {
    console.error('Error connecting to or querying MongoDB:', e);
  } finally {
    await client.close();
  }
})();
