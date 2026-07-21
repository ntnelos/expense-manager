require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');

async function test() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const drive = google.drive({ version: 'v3', auth });

  const file = await drive.files.get({ fileId: '1aenegUvUkq1YW8di8tSM6dQdM0sVBCRM', fields: 'id, name, parents', supportsAllDrives: true });
  console.log("File saela:", file.data);
  
  // Also let's list the folders it's currently in to get their names!
  for (const pid of file.data.parents || []) {
    const p = await drive.files.get({ fileId: pid, fields: 'name', supportsAllDrives: true });
    console.log("Parent:", p.data.name);
  }
}
test().catch(console.error);
