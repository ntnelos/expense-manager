fetch('http://localhost:3000/api/expense-lines?status=matched')
  .then(r => r.json())
  .then(d => console.log(JSON.stringify(d.expenseLines[0].matches, null, 2)))
  .catch(console.error);
