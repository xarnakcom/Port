// Запускается на стороне GitHub Actions (Node.js), не в браузере —
// поэтому здесь нет ограничений CORS, в отличие от fetch() из index.html.

const YANDEX_PUBLIC_FOLDER_URL = process.env.YANDEX_PUBLIC_FOLDER_URL;
const PAGE_SIZE = 100;
const API_BASE = "https://cloud-api.yandex.net/v1/disk/public/resources";

if (!YANDEX_PUBLIC_FOLDER_URL) {
  console.error("Переменная окружения YANDEX_PUBLIC_FOLDER_URL не задана.");
  process.exit(1);
}

function isImage(mime) { return mime && mime.startsWith("image/"); }
function isVideo(mime) { return mime && mime.startsWith("video/"); }

async function fetchAllItems(publicKey) {
  let items = [];
  let offset = 0;
  while (true) {
    const url = `${API_BASE}?public_key=${encodeURIComponent(publicKey)}&limit=${PAGE_SIZE}&offset=${offset}&preview_size=M`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Яндекс API вернул ${res.status}: ${body}`);
    }
    const data = await res.json();
    const embedded = data._embedded;
    if (!embedded || !embedded.items) break;
    items = items.concat(embedded.items);
    if (embedded.items.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return items;
}

const raw = await fetchAllItems(YANDEX_PUBLIC_FOLDER_URL);

const media = raw
  .filter((i) => i.type === "file" && (isImage(i.mime_type) || isVideo(i.mime_type)))
  .map((i) => ({
    name: i.name,
    mime_type: i.mime_type,
    file: i.file,
    preview: i.preview || null,
    created: i.created,
  }))
  .sort((a, b) => new Date(b.created) - new Date(a.created));

const fs = await import("node:fs/promises");
await fs.writeFile("media.json", JSON.stringify(media, null, 2) + "\n", "utf-8");

console.log(`Готово: ${media.length} медиафайлов записано в media.json`);
