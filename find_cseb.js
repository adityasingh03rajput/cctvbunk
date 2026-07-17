require('dotenv').config();
const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance_app';

(async function() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    
    // Check what collections exist
    const collections = await db.listCollections().toArray();
    console.log("Collections:", collections.map(c => c.name).join(', '));
    
    console.log('\nSearching for cse b (case insensitive, ignoring spaces) in all collections...');
    
    let foundAny = false;
    for (let collectionInfo of collections) {
      const collection = db.collection(collectionInfo.name);
      // cse followed by optional space/dash, followed by b
      const regex = /cse[\s\-]*b/i;
      
      const results = await collection.find({ 
        $or: [
          { branch: regex }, 
          { course: regex }
        ] 
      }).limit(5).toArray();
      
      if (results.length > 0) {
        foundAny = true;
        console.log(`\n--- Collection: ${collectionInfo.name} ---`);
        console.log(`Found ${results.length} documents (showing up to 5):`);
        console.dir(results, { depth: null });
      }
    }
    
    if (!foundAny) {
      console.log('No documents found matching "cse b". Let us list all unique branches in some collections.');
      const collectionsToCheck = ['students', 'timetables', 'studentmanagements', 'attendancerecords'];
      for (const collName of collectionsToCheck) {
        const coll = db.collection(collName);
        try {
          const uniqueBranches = await coll.distinct('branch');
          if (uniqueBranches && uniqueBranches.length > 0) {
            console.log(`\nUnique branches in ${collName}:`, uniqueBranches);
          }
          const uniqueCourses = await coll.distinct('course');
          if (uniqueCourses && uniqueCourses.length > 0) {
            console.log(`Unique courses in ${collName}:`, uniqueCourses);
          }
        } catch(e) {}
      }
    }
  } catch (e) {
    console.error('Error connecting to or querying MongoDB:', e);
  } finally {
    await client.close();
  }
})();
