require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');

async function test() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Pick one invoice
  const { data: invoice } = await supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(1).single();
  console.log("Testing invoice ID:", invoice.id, "Drive file ID:", invoice.drive_file_id);

  // We will call the google drive move directly
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const drive = google.drive({ version: 'v3', auth });

  try {
    const newDate = new Date();
    // Simulate getTargetFolderId
    async function getOrCreateFolder(driveClient, name, parentId) {
      const q = parentId 
        ? `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
        : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      
      const res = await driveClient.files.list({
        q,
        fields: 'files(id)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      if (res.data.files.length > 0) return res.data.files[0].id;
      
      const folder = await driveClient.files.create({
        requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : undefined },
        fields: 'id',
        supportsAllDrives: true,
      });
      return folder.data.id;
    }

    let parentId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!parentId) parentId = await getOrCreateFolder(drive, 'Expense Manager');
    const yearStr = newDate.getFullYear().toString();
    const yearFolderId = await getOrCreateFolder(drive, yearStr, parentId);
    const monthStr = (newDate.getMonth() + 1).toString().padStart(2, '0');
    const targetFolderId = await getOrCreateFolder(drive, monthStr, yearFolderId);

    console.log("Target folder:", targetFolderId);

    const file = await drive.files.get({
      fileId: invoice.drive_file_id,
      fields: 'parents',
      supportsAllDrives: true,
    });
    
    const previousParents = file.data.parents ? file.data.parents.join(',') : '';
    console.log("Previous parents:", previousParents);

    const res = await drive.files.update({
      fileId: invoice.drive_file_id,
      addParents: targetFolderId,
      removeParents: previousParents,
      enforceSingleParent: true,
      fields: 'id, parents',
      supportsAllDrives: true,
    });
    
    console.log("Move result parents:", res.data.parents);
  } catch (err) {
    console.error("Move error:", err);
  }
}
test().catch(console.error);
