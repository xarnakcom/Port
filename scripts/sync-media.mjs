// Запускается на стороне GitHub Actions (Node.js).
// Скачивает файлы из публичной папки на Яндекс.Диске и кладёт их
// в папку media/ прямо в репозитории. Так сайт отдаёт настоящие файлы
// со своего домена — без временных, протухающих ссылок Яндекса.

const YANDEX_PUBLIC_FOLDER_URL = process.env.YANDEX_PUBLIC_FOLDER_URL;
const PAGE_SIZE = 100;
const API_BASE = "https://cloud-api.yandex.net/v1/disk/public/resources";
const MEDIA_DIR = "media";

if (!YANDEX_PUBLIC_FOLDER_URL) {
  console.error("Переменная окружения YANDEX_PUBLIC_FOLDER_URL не задана.");
  process.exit(1);
}

const fs = await import("node:fs/promises");
const path = await import("node:path");

function isImage(mime) { return mime && mime.startsWith("image/"); }
function isVideo(mime) { return mime && mime.startsWith("video/"); }

function sanitizeFilename(name) {
  return name.replace(/[/\\?%*:|"<>]/g, "_");
}

async function fetchAllItems(publicKey) {
  let items = [];
  let offset = 0;
  while (true) {
    const url = `${API_BASE}?public_key=${encodeURIComponent(publicKey)}&limit=${PAGE_SIZE}&offset=${offset}`;
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

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось скачать файл: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buffer);
}

await fs.mkdir(MEDIA_DIR, { recursive: true });

const raw = await fetchAllItems(YANDEX_PUBLIC_FOLDER_URL);
const mediaSource = raw.filter(
  (i) => i.type === "file" && (isImage(i.mime_type) || isVideo(i.mime_type))
);

const existingLocalFiles = new Set(await fs.readdir(MEDIA_DIR).catch(() => []));
const expectedLocalFiles = new Set();
const media = [];

for (const item of mediaSource) {
  const safeName = sanitizeFilename(item.name);
  expectedLocalFiles.add(safeName);
  const destPath = path.join(MEDIA_DIR, safeName);

  if (!existingLocalFiles.has(safeName)) {
    console.log(`Скачиваю: ${item.name}`);
    try {
      await downloadFile(item.file, destPath);
    } catch (err) {
      console.error(`Пропускаю ${item.name}: ${err.message}`);
      continue;
    }
  }

  media.push({
    name: item.name,
    mime_type: item.mime_type,
    path: `${MEDIA_DIR}/${safeName}`,
    created: item.created,
  });
}

for (const localFile of existingLocalFiles) {
  if (!expectedLocalFiles.has(localFile)) {
    console.log(`Удаляю (файл убрали из облака): ${localFile}`);
    await fs.rm(path.join(MEDIA_DIR, localFile));
  }
}

media.sort((a, b) => new Date(b.created) - new Date(a.created));

await fs.writeFile("media.json", JSON.stringify(media, null, 2) + "\n", "utf-8");

console.log(`Готово: ${media.length} медиафайлов в media.json / папке media/`);
