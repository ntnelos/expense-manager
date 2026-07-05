import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env.local
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const LOCAL_WEBHOOK_URL = 'http://localhost:3000/api/webhooks/telegram';

if (!TOKEN) {
  console.error('❌ Missing TELEGRAM_BOT_TOKEN in .env.local');
  process.exit(1);
}

console.log(`🤖 Starting Telegram Local Polling for bot token: ${TOKEN.substring(0, 5)}...`);
console.log(`🚀 Forwarding updates to: ${LOCAL_WEBHOOK_URL}\n`);

let lastUpdateId = 0;

async function poll() {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
    
    if (!res.ok) {
      console.error(`Telegram API Error: ${res.status} ${res.statusText}`);
      setTimeout(poll, 5000);
      return;
    }

    const data = await res.json();

    if (data.ok && data.result.length > 0) {
      for (const update of data.result) {
        lastUpdateId = update.update_id;
        
        console.log(`\n📩 Received update ${update.update_id}. Forwarding to local Next.js...`);
        
        try {
          const localRes = await fetch(LOCAL_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(update)
          });
          
          if (localRes.ok) {
            console.log(`✅ Update ${update.update_id} processed by Next.js`);
          } else {
            console.error(`❌ Local webhook returned status ${localRes.status}`);
            const errorText = await localRes.text();
            console.error(errorText);
          }
        } catch (localErr) {
          console.error(`❌ Failed to reach local Next.js server. Is it running on port 3000?`);
        }
      }
    }
  } catch (err) {
    console.error('Polling error:', err);
  }

  // Loop immediately (timeout=30 handles the long-polling delay)
  setImmediate(poll);
}

// Start polling
poll();
