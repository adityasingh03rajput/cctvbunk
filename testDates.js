const fetch = require('node-fetch');
async function test() {
  const res = await fetch('https://letsbunk-uw7g.onrender.com/api/attendance/student/0246Cs231021/dates');
  const text = await res.text();
  console.log(text.substring(0, 500));
}
test();
