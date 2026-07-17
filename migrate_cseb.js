require('dotenv').config();
const { MongoClient } = require('mongodb');

const excludedStudents = [
"0246CS241001","0246CS241002","0246CS241003","0246CS241004","0246CS241005",
"0246CS241006","0246CS241007","0246CS241008","0246CS241009","0246CS241010",
"0246CS241011","0246CS241012","0246CS241013","0246CS241014","0246CS241015",
"0246CS241016","0246CS241017","0246CS241018","0246CS241019","0246CS241020",
"0246CS241021","0246CS241022","0246CS241023","0246CS241024","0246CS241025",
"0246CS241026","0246CS241027","0246CS241028","0246CS241029","0246CS241030",
"0246CS241031","0246CS241032","0246CS241033","0246CS241034","0246CS241035",
"0246CS241036","0246CS241037","0246CS241038","0246CS241039","0246CS241040",
"0246CS241041","0246CS241042","0246CS241043","0246CS241044","0246CS241045",
"0246CS241046","0246CS241047","0246CS241048","0246CS241049","0246CS241050",
"0246CS241051","0246CS241052","0246CS241053","0246CS241054","0246CS241055",
"0246CS241056","0246CS241057","0246CS241058","0246CS241059","0246CS241060",
"0246CS241061","0246CS241062","0246CS241063","0246CS241064","0246CS241065",
"0246CS241066","0246CS241067","0246CS241068","0246CS241069","0246CS241070",
"0246CS241071","0246CS241072","0246CS241073","0246CS241074","0246CS241075",
"0246CS241076","0246CS241077","0246CS241078","0246CS241079","0246CS241080",
"0246CS241081","0246CS241082","0246CS241083","0246CS241084","0246CS241085",
"0246CS241086","0246CS241087","0246CS241088","0246CS241089","0246CS241090",
"0246CS241091","0246CS241092","0246CS241093","0246CS241094","0246CS241095",
"0246CS241096","0246CS241097","0246CS241098","0246CS241099","0246CS241100",
"0246CS241101","0246CS241102","0246CS241103","0246CS241104","0246CS241105",
"0246CS241106","0246CS241107","0246CS241108","0246CS241110","0246CS241111",
"0246CS241112","0246CS241113","0246CS241115","0246CS241116","0246CS241117",
"0246CS241118","0246CS241119","0246CS241120","0246CS241121","0246CS241122",
"0246CS241123","0246CS241124","0246CS241125","0246CS241126","0246CS241127",
"0246CS241128","0246CS241129","0246CS241131","0246CS241132","0246CS241133",
"0246CS241134","0246CS241135","0246CS241136","0246CS241138","0246CS241139",
"0246CS241140","0246CS241141","0246CS241142","0246CS241143","0246CS241144",
"0246CS241145","0246CS241146","0246CS241147","0246CS241148","0246CS241149",
"0246CS241150","0246CS241151","0246CS241152","0246CS241153","0246CS241154",
"0246CS241155","0246CS241156","0246CS241157","0246CS241158","0246CS241159",
"0246CS241160","0246CS241161","0246CS241162","0246CS241163","0246CS241164",
"0246CS241165","0246CS241166","0246CS241167","0246CS241168","0246CS241169",
"0246CS241170","0246CS241171","0246CS241172","0246CS241173","0246CS241174",
"0246CS241175","0246CS241176","0246CS241177","0246CS241178","0246CS241179",
"0246CS241180","0246CS241181","0246CS241182","0246CS241183","0246CS241184",
"0246CS241185","0246CS241186","0246CS241187","0246CS241188","0246CS241189",
"0246CS241190","0246CS241191","0246CS241192","0246CS241193","0246CS241194",
"0246CS241196","0246CS241197","0246CS241211","0246CS241224","0246CS241229",
"0246CS241241","0246CS241251","0246CS241259","0246CS241295","0246CS241220",
"0246CS241259","0246CS241272","0246CS241278","0246CS241302","0246CS241310",
"0246CS241273","0246CS241323","0246CS241329","0246CS241336","0246CS241339",
"0246CS241347","0246CS241357","0246CS241372","0246CS241373","0246CS241386"
];

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance_app';

(async function() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    
    const filter = {
      branch: "Computer Science",
      semester: "4",
      enrollmentNo: { $nin: excludedStudents }
    };
    
    const studentManagementsColl = db.collection('studentmanagements');
    
    // First let's see how many will be migrated
    const studentsToMigrate = await studentManagementsColl.find(filter).toArray();
    console.log(`Found ${studentsToMigrate.length} students to migrate to CseB.`);
    
    if (studentsToMigrate.length > 0) {
        console.log("Migrating students in 'studentmanagements' collection...");
        const updateResult = await studentManagementsColl.updateMany(filter, {
            $set: { branch: "CseB" }
        });
        console.log(`Updated ${updateResult.modifiedCount} records in studentmanagements.`);
        
        // Let's also migrate their attendance records just in case they have history
        // so it stays linked correctly if they search by CseB
        const enrollmentNos = studentsToMigrate.map(s => s.enrollmentNo);
        const historyFilter = {
            branch: "Computer Science",
            semester: "4",
            enrollmentNo: { $in: enrollmentNos }
        };
        
        const attendanceRecordsColl = db.collection('attendancerecords');
        const updateAR = await attendanceRecordsColl.updateMany(historyFilter, { $set: { branch: "CseB" } });
        console.log(`Updated ${updateAR.modifiedCount} records in attendancerecords.`);
        
        const dailyAttendancesColl = db.collection('dailyattendances');
        const updateDA = await dailyAttendancesColl.updateMany(historyFilter, { $set: { branch: "CseB" } });
        console.log(`Updated ${updateDA.modifiedCount} records in dailyattendances.`);
        
        const periodAttendancesColl = db.collection('periodattendances');
        const updatePA = await periodAttendancesColl.updateMany(historyFilter, { $set: { branch: "CseB" } });
        console.log(`Updated ${updatePA.modifiedCount} records in periodattendances.`);
    }

  } catch (e) {
    console.error('Error during migration:', e);
  } finally {
    await client.close();
    console.log('Migration completed.');
  }
})();
