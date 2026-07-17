require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB successfully!");

        const timetableSchema = new mongoose.Schema({}, { strict: false });
        const Timetable = mongoose.model('Timetable', timetableSchema, 'timetables');

        const tts = await Timetable.find({});
        console.log(`\nFound ${tts.length} timetables in database:`);
        tts.forEach(tt => {
            console.log({
                _id: tt._id,
                branch: tt.branch,
                course: tt.course,
                semester: tt.semester
            });
        });

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
