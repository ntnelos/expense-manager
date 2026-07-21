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

  const fileId = '1aenegUvUkq1YW8di8tSM6dQdM0sVBCRM'; 
  const newDate = new Date('2026-04-27');
  
  async function getOrCreateFolder(name, parentId) {
    const q = parentId 
      ? `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
      : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    
    const res = await drive.files.list({ q, fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true });
    if (res.data.files.length > 0) return res.data.files[0].id;
    
    const folder = await drive.files.create({ requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : undefined }, fields: 'id', supportsAllDrives: true });
    return folder.data.id;
  }

  let parentId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!parentId) parentId = await getOrCreateFolder('Expense Manager');
  const yearStr = newDate.getFullYear().toString();
  const yearFolderId = await getOrCreateFolder(yearStr, parentId);
  const monthStr = (newDate.getMonth() + 1).toString().padStart(2, '0');
  const targetFolderId = await getOrCreateFolder(monthStr, yearFolderId);
  
  console.log("Target folder:", targetFolderId);
  
  const file = await drive.files.get({ fileId, fields: 'parents', supportsAllDrives: true });
  console.log("Current parents:", file.data.parents);
  
  try {
    const res = await drive.files.update({
      fileId,
      addParents: targetFolderId,
      removeParents: file.data.parents ? file.data.parents.join(',') : '',
      enforceSingleParent: true,
      fields: 'id, parents',
      supportsAllDrives: true,
    });
    console.log("Moved to parents:", res.data.parents);
    
    // Also try rename
    const rn = await drive.files.update({ fileId, requestBody: { name: 'saela_2026-04-27.jpg' } });
    console.log("Renamed to saela_2026-04-27.jpg");
  } catch (err) {
    console.error("Error during move/rename:", err.message);
  }
}
test().catch(console.error);
