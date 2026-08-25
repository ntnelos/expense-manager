const { GET } = require('./.next/server/app/api/export/accountant/prepare/route.js');
async function test() {
  const req = { url: 'http://localhost/api/export/accountant/prepare' };
  try {
    const res = await GET(req);
    console.log(res.status);
    console.log(await res.text());
  } catch(e) {
    console.error("CRASH:", e);
  }
}
test();
