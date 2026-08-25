async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/test-crash');
    console.log("Status:", res.status);
    console.log("ContentType:", res.headers.get('content-type'));
    const text = await res.text();
    console.log("Includes __next_error__?", text.includes('__next_error__'));
  } catch(e) {
    console.error("Fetch failed:", e);
  }
}
test();
