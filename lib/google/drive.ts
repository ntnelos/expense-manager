import { google } from 'googleapis';
import { Readable } from 'stream';

// Initialize the Google Drive Client using a Service Account
function getDriveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !privateKey) {
    throw new Error(
      'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY environment variables.'
    );
  }

  // Format key if it was parsed with literal \n characters
  const formattedKey = privateKey.replace(/\\n/g, '\n');

  const auth = new google.auth.JWT({
    email,
    key: formattedKey,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  return google.drive({ version: 'v3', auth });
}

/**
 * Finds or creates a folder with a specific name under a parent folder.
 */
async function getOrCreateFolder(drive: any, folderName: string, parentId?: string): Promise<string> {
  let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const response = await drive.files.list({
    q: query,
    fields: 'files(id)',
    spaces: 'drive',
  });

  const files = response.data.files || [];
  if (files.length > 0) {
    return files[0].id!;
  }

  // Create new folder
  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : undefined,
  };

  const folder = await drive.files.create({
    requestBody: folderMetadata,
    fields: 'id',
  });

  return folder.data.id!;
}

/**
 * Returns the target folder ID for a given date in "Expense Manager/YYYY/MM" format.
 */
async function getTargetFolderId(drive: any, date: Date): Promise<string> {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID; // Optional root folder
  
  // 1. Get or create "Expense Manager" root if rootFolderId is not specified
  let parentId = rootFolderId;
  if (!parentId) {
    parentId = await getOrCreateFolder(drive, 'Expense Manager');
  }

  // 2. Get or create Year folder (e.g. "2026")
  const yearStr = date.getFullYear().toString();
  const yearFolderId = await getOrCreateFolder(drive, yearStr, parentId);

  // 3. Get or create Month folder (e.g. "07")
  const monthStr = (date.getMonth() + 1).toString().padStart(2, '0');
  const monthFolderId = await getOrCreateFolder(drive, monthStr, yearFolderId);

  return monthFolderId;
}

/**
 * Uploads a file buffer to Google Drive.
 * Organizes it by Year/Month and returns the file ID and shareable URL.
 */
export async function uploadToGoogleDrive(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  date: Date = new Date()
): Promise<{ fileId: string; fileUrl: string }> {
  const drive = getDriveClient();

  // Get or create Year/Month folder path
  const folderId = await getTargetFolderId(drive, date);

  // Convert buffer to stream for the API
  const stream = new Readable();
  stream.push(fileBuffer);
  stream.push(null);

  const fileMetadata = {
    name: filename,
    parents: [folderId],
  };

  const media = {
    mimeType,
    body: stream,
  };

  const file = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, webViewLink',
  });

  const fileId = file.data.id!;
  
  // Make the file readable by anyone with the link (read-only) so they can view it in the app iframe
  try {
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });
  } catch (err) {
    console.warn('Failed to set public read permissions on uploaded file. It may not be previewable in the UI.', err);
  }

  // Fetch file metadata again to make sure we have the updated webViewLink if needed
  const fileUrl = file.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;

  return {
    fileId,
    fileUrl,
  };
}

/**
 * Deletes a file from Google Drive.
 */
export async function deleteFromGoogleDrive(fileId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.files.delete({ fileId });
}
