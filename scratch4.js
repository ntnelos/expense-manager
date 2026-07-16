require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');

async function run() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let formattedKey = process.env.GOOGLE_PRIVATE_KEY;
  if ((formattedKey.startsWith('"') && formattedKey.endsWith('"')) ||
      (formattedKey.startsWith("'") && formattedKey.endsWith("'"))) {
    formattedKey = formattedKey.slice(1, -1);
  }
  formattedKey = formattedKey.replace(/\\n/g, '\n');

  const auth = new google.auth.JWT({
    email,
    key: formattedKey,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const drive = google.drive({ version: 'v3', auth });

  try {
    const parentId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    // 1. Create a dummy file
    const file = await drive.files.create({
      requestBody: { name: 'test_trash_me.txt', mimeType: 'text/plain', parents: [parentId] },
      media: { mimeType: 'text/plain', body: 'hello world' },
      fields: 'id',
      supportsAllDrives: true,
    });
    const fileId = file.data.id;
    console.log("Created test file with ID:", fileId);

    // 2. Trash the file
    await drive.files.update({ fileId, requestBody: { trashed: true }, supportsAllDrives: true });
    console.log("Trashed test file successfully!");
    
  } catch (err) {
    console.error("Error:", err.message);
  }
}
run();
