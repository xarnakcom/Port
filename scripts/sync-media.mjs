// Запускается на стороне GitHub Actions (Node.js).
// Рекурсивно обходит папку портфолио на Яндекс.Диске (включая вложенные
// папки проектов) и скачивает найденные фото/видео в media/ в репозитории,
// сохраняя структуру папок. Так сайт отдаёт настоящие файлы со своего
// домена — без временных, протухающих ссылок Яндекса.

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

function sanitizeSegment(name) {
  return name.replace(/[/\\?%*:|"<>]/g, "_");
}

// Список содержимого одной "директории" внутри опубликованного ресурса.
// subPath — путь относительно корня опубликованной папки ("" для корня,
// "/Название проекта" для вложенной папки).
async function listFolder(publicKey, subPath) {
  let items = [];
  let offset = 0;
  while (true) {
    let url = `${API_BASE}?public_key=${encodeURIComponent(publicKey)}&limit=${PAGE_SIZE}&offset=${offset}`;
    if (subPath) url += `&path=${encodeURIComponent(subPath)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Яндекс API вернул ${res.status} для "${subPath || '/'}": ${body}`);
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

// Рекурсивно обходит все вложенные папки и собирает файлы.
// projectPath — массив сегментов пути от корня (для сохранения структуры).
async function walkFolder(publicKey, subPath, projectPath, out) {
  const items = await listFolder(publicKey, subPath);
  for (const item of items) {
    if (item.type === "dir") {
      const nestedSubPath = subPath ? `${subPath}/${item.name}` : `/${item.name}`;
      await walkFolder(publicKey, nestedSubPath, [...projectPath, item.name], out);
    } else if (item.type === "file" && (isImage(item.mime_type) || isVideo(item.mime_type))) {
      out.push({ item, projectPath });
    }
  }
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось скачать файл: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buffer);
}

// Рекурсивно собирает список всех файлов, уже лежащих в media/
// (относительные пути вида "ПроектA/фото.jpg" или "фото.jpg" для корня).
async function listLocalFiles(dir, base = "") {
  let out = [];
  let entries;
  try {
    entries = await fs.readdir(path.join(MEDIA_DIR, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out = out.concat(await listLocalFiles(path.join(dir, entry.name), rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

async function removeEmptyDirs(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await removeEmptyDirs(path.join(dir, entry.name));
    }
  }
  entries = await fs.readdir(dir).catch(() => null);
  if (entries && entries.length === 0 && dir !== MEDIA_DIR) {
    await fs.rmdir(dir);
  }
}

await fs.mkdir(MEDIA_DIR, { recursive: true });

const collected = [];
await walkFolder(YANDEX_PUBLIC_FOLDER_URL, "", [], collected);

const existingLocalFiles = new Set(await listLocalFiles(""));
const expectedLocalFiles = new Set();
const media = [];

for (const { item, projectPath } of collected) {
  const safeSegments = projectPath.map(sanitizeSegment);
  const safeName = sanitizeSegment(item.name);
  const relPath = [...safeSegments, safeName].join("/");
  expectedLocalFiles.add(relPath);

  const destPath = path.join(MEDIA_DIR, ...safeSegments, safeName);

  if (!existingLocalFiles.has(relPath)) {
    console.log(`Скачиваю: ${projectPath.join("/")}/${item.name}`.replace(/^\//, ""));
    await fs.mkdir(path.join(MEDIA_DIR, ...safeSegments), { recursive: true });
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
    path: `${MEDIA_DIR}/${relPath}`,
    // null = файл лежит прямо в корневой папке портфолио, не привязан к проекту
    project: projectPath.length > 0 ? projectPath[projectPath.length - 1] : null,
    created: item.created,
  });
}

for (const localFile of existingLocalFiles) {
  if (!expectedLocalFiles.has(localFile)) {
    console.log(`Удаляю (файл убрали из облака): ${localFile}`);
    await fs.rm(path.join(MEDIA_DIR, localFile));
  }
}

await removeEmptyDirs(MEDIA_DIR);

media.sort((a, b) => new Date(b.created) - new Date(a.created));

await fs.writeFile("media.json", JSON.stringify(media, null, 2) + "\n", "utf-8");

console.log(`Готово: ${media.length} медиафайлов в media.json / папке media/`);
