require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB successfully!");

        const timetableSchema = new mongoose.Schema({}, { strict: false });
        const Timetable = mongoose.model('Timetable', timetableSchema, 'timetables');

        // Find Timetable for CseB Sem '4' (string)
        const tt = await Timetable.findOne({ branch: 'CseB', semester: '4' });
        if (tt) {
            console.log("\n--- Timetable for CseB Sem 4 ---");
            console.log("Branch:", tt.branch);
            console.log("Semester:", tt.semester);
            
            const Friday = tt.timetable?.friday || [];
            console.log("\nFriday timetable slots:");
            Friday.forEach((slot, index) => {
                console.log(`Slot P${index + 1}:`, {
                    subject: slot.subject,
                    teacher: slot.teacher,
                    teacherName: slot.teacherName,
                    isBreak: slot.isBreak
                });
            });
        } else {
            console.log("\nTimetable not found for CseB Sem 4!");
        }

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
