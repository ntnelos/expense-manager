const getBotToken = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not defined in environment variables');
  }
  return token;
};

const TELEGRAM_API = 'https://api.telegram.org';

/**
 * Sends a message back to a specific chat (user).
 */
export async function sendMessage(chatId: number, text: string) {
  const token = getBotToken();
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    }),
  });

  if (!res.ok) {
    const errorData = await res.json();
    console.error('Failed to send Telegram message:', errorData);
  }
}

/**
 * Gets file metadata from Telegram.
 */
export async function getFile(fileId: string): Promise<{ file_id: string; file_size: number; file_path: string } | null> {
  const token = getBotToken();
  const res = await fetch(`${TELEGRAM_API}/bot${token}/getFile?file_id=${fileId}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.ok ? data.result : null;
}

/**
 * Downloads the actual file buffer from Telegram.
 */
export async function downloadFile(filePath: string): Promise<Buffer> {
  const token = getBotToken();
  const fileUrl = `${TELEGRAM_API}/file/bot${token}/${filePath}`;
  
  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`Failed to download file from Telegram. Status: ${res.status}`);
  }
  
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
