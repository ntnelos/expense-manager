async function test() {
  console.log("Fetching API...");
  try {
    const res = await fetch('http://localhost:3000/api/export/accountant/prepare');
    console.log("Status:", res.status);
    console.log(await res.text());
  } catch(e) {
    console.error("Fetch failed:", e);
  }
}
test();
