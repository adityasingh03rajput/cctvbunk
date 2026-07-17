const mongoose=require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI).then(async ()=>{
  const db=mongoose.connection.useDb('attendance_app');
  const tt = await db.collection('timetables').findOne({ semester: '6', branch: 'CSE' });
  if (tt && tt.days) {
    const sat = tt.days.find(d => d.day === 'Saturday');
    if (sat) console.log(JSON.stringify(sat.periods, null, 2));
    else console.log('No saturday');
  }
  mongoose.disconnect();
});
