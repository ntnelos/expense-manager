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

  // Format key: Vercel stores env vars with literal \n instead of real newlines.
  // Also strip surrounding quotes if present.
  let formattedKey = privateKey;
  // Remove surrounding quotes (single or double)
  if ((formattedKey.startsWith('"') && formattedKey.endsWith('"')) ||
      (formattedKey.startsWith("'") && formattedKey.endsWith("'"))) {
    formattedKey = formattedKey.slice(1, -1);
  }
  // Replace literal \n with real newlines
  formattedKey = formattedKey.replace(/\\n/g, '\n');

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
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
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
    supportsAllDrives: true,
  });

  return folder.data.id!;
}

/**
 * Returns the target folder ID for a given date and status in "Expense Manager/YYYY/MM/status" format.
 */
async function getTargetFolderId(drive: any, date: Date, status: 'matched' | 'not_matched' | 'error'): Promise<string> {
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

  // 4. Get or create status folder ("matched" or "not_matched")
  const statusFolderId = await getOrCreateFolder(drive, status, monthFolderId);

  return statusFolderId;
}

/**
 * Uploads a file buffer to Google Drive.
 * Organizes it by Year/Month and returns the file ID and shareable URL.
 */
export async function uploadToGoogleDrive(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  date: Date = new Date(),
  status: 'matched' | 'not_matched' | 'error' = 'not_matched'
): Promise<{ fileId: string; fileUrl: string }> {
  const drive = getDriveClient();

  // Get or create Year/Month/status folder path
  const targetFolderId = await getTargetFolderId(drive, date, status);

  // Convert buffer to stream for the API
  const stream = new Readable();
  stream.push(fileBuffer);
  stream.push(null);

  const fileMetadata = {
    name: filename,
    parents: [targetFolderId],
  };

  const media = {
    mimeType,
    body: stream,
  };

  const file = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, webViewLink',
    supportsAllDrives: true,
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
      supportsAllDrives: true,
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
  try {
    await drive.files.delete({ fileId });
  } catch (err: any) {
    console.error(`Failed to delete file from Drive (ID: ${fileId}):`, err);
  }
}

/**
 * Moves an existing Drive file to the target status folder for its date.
 */
export async function moveInvoiceDriveStatus(
  fileId: string, 
  date: Date, 
  newStatus: 'matched' | 'not_matched' | 'error'
): Promise<void> {
  const drive = getDriveClient();
  try {
    // 1. Get the current parents of the file
    const file = await drive.files.get({
      fileId: fileId,
      fields: 'parents'
    });
    const previousParents = file.data.parents?.join(',') || '';

    // 2. Get target folder for the new status
    const targetFolderId = await getTargetFolderId(drive, date, newStatus);

    // 3. Move the file
    await drive.files.update({
      fileId: fileId,
      addParents: targetFolderId,
      removeParents: previousParents,
      fields: 'id, parents'
    });
    console.log(`Successfully moved Drive file ${fileId} to ${newStatus}`);
  } catch (err: any) {
    console.error(`Failed to move Drive file ${fileId} to ${newStatus}:`, err);
    throw err;
  }
}

/**
 * Renames an existing file in Google Drive.
 */
export async function renameGoogleDriveFile(fileId: string, newName: string): Promise<void> {
  const drive = getDriveClient();
  try {
    await drive.files.update({
      fileId,
      requestBody: {
        name: newName,
      },
    });
    console.log(`Successfully renamed Drive file ${fileId} to ${newName}`);
  } catch (err: any) {
    console.error(`Failed to rename Drive file ${fileId} to ${newName}:`, err);
    throw err;
  }
}

