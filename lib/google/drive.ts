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
async function getTargetFolderId(drive: any, date: Date, status?: 'matched' | 'not_matched' | 'error'): Promise<string> {
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

  // We no longer organize by status (matched/not_matched), everything stays in the month folder.
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
 * Deletes a file from Google Drive by moving it to the trash.
 * (Permanent deletion by Service Account on Shared folders throws 'File not found' error).
 */
export async function deleteFromGoogleDrive(fileId: string): Promise<void> {
  const drive = getDriveClient();
  try {
    await drive.files.update({ 
      fileId, 
      requestBody: { trashed: true },
      supportsAllDrives: true 
    });
    console.log(`Successfully trashed file ${fileId} in Google Drive.`);
  } catch (err: any) {
    console.error(`Failed to trash file in Drive (ID: ${fileId}):`, err);
  }
}

/**
 * Moves an existing Drive file to the correct Year/Month folder for its date.
 */
export async function moveInvoiceToDateFolder(fileId: string, newDate: Date): Promise<void> {
  const drive = getDriveClient();
  try {
    // 1. Get the target folder for the new date
    const targetFolderId = await getTargetFolderId(drive, newDate);

    // 2. Retrieve the existing parents to remove
    const file = await drive.files.get({
      fileId,
      fields: 'parents',
      supportsAllDrives: true,
    });
    
    // Move the file to the new folder
    const previousParents = file.data.parents ? file.data.parents.join(',') : '';
    await drive.files.update({
      fileId,
      addParents: targetFolderId,
      removeParents: previousParents,
      fields: 'id, parents',
      supportsAllDrives: true,
    });
    
    console.log(`Successfully moved file ${fileId} to target folder for date ${newDate.toISOString()}`);
  } catch (err: any) {
    console.error(`Failed to move Drive file ${fileId} to new folder:`, err);
    throw err;
  }
}

/**
 * Moves an existing Drive file to the target status folder for its date.
 * Deprecated: We no longer use status folders. Use moveInvoiceToDateFolder instead if date changes.
 */
export async function moveInvoiceDriveStatus(
  fileId: string, 
  date: Date, 
  newStatus: 'matched' | 'not_matched' | 'error'
): Promise<void> {
  console.log(`moveInvoiceDriveStatus called for ${fileId}, ignoring status and moving to date folder instead.`);
  await moveInvoiceToDateFolder(fileId, date);
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

