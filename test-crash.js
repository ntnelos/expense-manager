async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/test-crash', {
      headers: { 'Cookie': 'test=1' } // Avoid middleware redirect if possible
    });
    console.log("Status:", res.status);
    console.log(await res.text());
  } catch(e) {
    console.error("Fetch failed:", e);
  }
}
test();
