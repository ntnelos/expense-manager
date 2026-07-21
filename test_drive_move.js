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

  const rootRes = await drive.files.list({
    q: "name='Expense Manager' and mimeType='application/vnd.google-apps.folder'",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 1
  });
  const rootFolderId = rootRes.data.files[0].id;
  
  // Create a folder "TestSource"
  const src = await drive.files.create({
    requestBody: { name: 'TestSource', mimeType: 'application/vnd.google-apps.folder', parents: [rootFolderId] },
    supportsAllDrives: true,
    fields: 'id'
  });
  
  // Create a folder "TestDest"
  const dst = await drive.files.create({
    requestBody: { name: 'TestDest', mimeType: 'application/vnd.google-apps.folder', parents: [rootFolderId] },
    supportsAllDrives: true,
    fields: 'id'
  });

  // Create file in TestSource
  const file = await drive.files.create({
    requestBody: { name: 'TestFile.pdf', parents: [src.data.id] },
    supportsAllDrives: true,
    fields: 'id, parents'
  });
  
  console.log("File created in source. Parents:", file.data.parents);
  
  // Move it using enforceSingleParent
  const moved = await drive.files.update({
    fileId: file.data.id,
    addParents: dst.data.id,
    removeParents: file.data.parents.join(','),
    enforceSingleParent: true,
    fields: 'id, parents',
    supportsAllDrives: true,
  });
  
  console.log("File moved. Parents:", moved.data.parents);
  
  // Cleanup
  await drive.files.update({ fileId: src.data.id, requestBody: { trashed: true }, supportsAllDrives: true });
  await drive.files.update({ fileId: dst.data.id, requestBody: { trashed: true }, supportsAllDrives: true });
}

test().catch(console.error);
