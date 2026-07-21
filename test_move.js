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

  // Get recent files to find one to test
  const filesRes = await drive.files.list({
    q: "mimeType='application/pdf'",
    fields: 'files(id, name, parents)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    orderBy: 'modifiedTime desc',
    pageSize: 1
  });
  
  if (filesRes.data.files.length === 0) return;
  const file = filesRes.data.files[0];
  console.log("File:", file.name, "Parents:", file.parents);
  
  // Now try to update it using the same API params we use in code
  try {
    const res = await drive.files.update({
      fileId: file.id,
      addParents: file.parents[0], // same parent just to test syntax
      removeParents: file.parents.join(','),
      enforceSingleParent: true,
      fields: 'id, parents',
      supportsAllDrives: true,
    });
    console.log("Move success:", res.data.parents);
  } catch(err) {
    console.error("Move error:", err);
  }
}
test().catch(console.error);
