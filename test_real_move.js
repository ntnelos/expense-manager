require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');
const { getDriveClient, moveInvoiceToDateFolder } = require('./lib/google/drive'); // we can't require TS easily. I will write it.

async function test() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const drive = google.drive({ version: 'v3', auth });

  const fileId = '1NmqU5Ijedo1uMno8-7VCtLcnI6e33T6Y'; // The adobe file
  
  // We'll move it to August just to see if it moves
  const newDate = new Date('2026-08-05');
  
  // Get Target Folder
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
  
  console.log("Target folder for August:", targetFolderId);
  
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
    
    // move back to July
    const julyId = file.data.parents[0];
    const back = await drive.files.update({
      fileId,
      addParents: julyId,
      removeParents: targetFolderId,
      enforceSingleParent: true,
      fields: 'id, parents',
      supportsAllDrives: true,
    });
    console.log("Moved back to parents:", back.data.parents);
    
  } catch (err) {
    console.error("Error during move:", err.message);
  }
}
test().catch(console.error);
