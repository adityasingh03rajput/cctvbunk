require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance_app';

const allowedBranches = ['AiMl', 'Computer Science', 'cloud', 'CseB'];

(async function() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    
    const configsColl = db.collection('configs');
    
    // Find branches to delete
    const filter = {
      type: "branch",
      value: { $nin: allowedBranches }
    };
    
    const branchesToDelete = await configsColl.find(filter).toArray();
    console.log(`Found ${branchesToDelete.length} branches to delete:`, branchesToDelete.map(b => b.value));
    
    if (branchesToDelete.length > 0) {
        const deleteResult = await configsColl.deleteMany(filter);
        console.log(`Successfully deleted ${deleteResult.deletedCount} branches from the system configuration.`);
    } else {
        console.log('No extra branches found to delete.');
    }

  } catch (e) {
    console.error('Error during deletion:', e);
  } finally {
    await client.close();
  }
})();
