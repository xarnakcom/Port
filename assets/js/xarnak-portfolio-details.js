/**
 * Наполняет portfolio-details.html реальными файлами проекта из media.json
 * (тот же файл, что собирает scripts/sync-media.mjs). Проект определяется
 * по параметру ?project=Имя в адресе страницы — на него ведут ссылки
 * "Подробнее" с главной страницы.
 */
(function () {
  "use strict";

  const MEDIA_JSON_PATH = "media.json";

  const statusEl = document.getElementById("pdStatus");
  const contentEl = document.getElementById("pdContent");
  const titleEl = document.getElementById("pdTitle");
  const breadcrumbEl = document.getElementById("pdBreadcrumb");
  const wrapperEl = document.getElementById("pdSwiperWrapper");
  const infoListEl = document.getElementById("pdInfoList");

  if (!contentEl) return; // не на этой странице

  function encodeMediaPath(p) {
    return p.split("/").map(encodeURIComponent).join("/");
  }

  const DOC_ICONS = {
    pdf: '<path d="M6 2H14L19 7V22H6V2Z" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M14 2V7H19" stroke="currentColor" stroke-width="1.3" fill="none"/><text x="7.5" y="17" font-size="6" fill="currentColor" font-family="sans-serif">PDF</text>',
    text: '<path d="M6 2H14L19 7V22H6V2Z" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M14 2V7H19" stroke="currentColor" stroke-width="1.3" fill="none"/><line x1="8.5" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="1" opacity="0.7"/><line x1="8.5" y1="15" x2="16" y2="15" stroke="currentColor" stroke-width="1" opacity="0.7"/>',
    rtf: '<path d="M6 2H14L19 7V22H6V2Z" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M14 2V7H19" stroke="currentColor" stroke-width="1.3" fill="none"/><text x="8" y="17" font-size="6" fill="currentColor" font-family="sans-serif">RTF</text>',
  };

  function buildSlide(item) {
    const slide = document.createElement("div");
    slide.className = "swiper-slide";
    const src = encodeMediaPath(item.path);

    if (item.kind === "image") {
      const img = document.createElement("img");
      img.src = src;
      img.alt = item.name;
      img.loading = "lazy";
      img.className = "img-fluid";
      slide.appendChild(img);
    } else if (item.kind === "video") {
      const video = document.createElement("video");
      video.src = src;
      video.controls = true;
      video.style.width = "100%";
      video.style.aspectRatio = "16/9";
      video.style.objectFit = "cover";
      slide.appendChild(video);
    } else {
      // pdf / text / rtf — плитка с иконкой и ссылкой "Открыть"
      const box = document.createElement("div");
      box.style.aspectRatio = "16/9";
      box.style.display = "flex";
      box.style.flexDirection = "column";
      box.style.alignItems = "center";
      box.style.justifyContent = "center";
      box.style.gap = "14px";
      box.style.background = "color-mix(in srgb, var(--surface-color), var(--default-color) 5%)";
      box.style.width = "100%";
      box.innerHTML = `
        <svg width="52" height="52" viewBox="0 0 24 24" style="color:var(--accent-color)">${DOC_ICONS[item.kind] || DOC_ICONS.text}</svg>
        <div style="font-weight:600;">${item.name}</div>
        <a href="${src}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Открыть файл</a>
      `;
      slide.appendChild(box);
    }
    return slide;
  }

  function buildInfoLine(label, value) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${label}</strong>: `;
    li.appendChild(document.createTextNode(value));
    return li;
  }

  async function init() {
    const projectName = new URLSearchParams(location.search).get("project");
    if (!projectName) {
      statusEl.textContent = "Проект не указан — открой эту страницу по ссылке с карточки проекта.";
      return;
    }

    try {
      const res = await fetch(MEDIA_JSON_PATH, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`не удалось загрузить media.json (${res.status})`);
      }
      const allMedia = await res.json();
      const items = allMedia.filter((m) => m.project === projectName);

      if (items.length === 0) {
        statusEl.textContent = `Файлы проекта «${projectName}» не найдены.`;
        return;
      }

      titleEl.textContent = projectName;
      breadcrumbEl.textContent = projectName;
      document.title = `${projectName} — Portfolio Details`;

      items.forEach((item) => wrapperEl.appendChild(buildSlide(item)));

      const latest = items.reduce((a, b) => (new Date(a.created) > new Date(b.created) ? a : b));
      infoListEl.appendChild(buildInfoLine("Проект", projectName));
      infoListEl.appendChild(buildInfoLine("Файлов", String(items.length)));
      infoListEl.appendChild(
        buildInfoLine("Обновлено", new Date(latest.created).toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" }))
      );

      statusEl.remove();
      contentEl.style.display = "";

      new Swiper(".portfolio-details-slider", {
        loop: items.length > 1,
        speed: 600,
        autoplay: items.length > 1 ? { delay: 5000 } : false,
        slidesPerView: "auto",
        pagination: {
          el: ".swiper-pagination",
          type: "bullets",
          clickable: true,
        },
      });

      if (typeof AOS !== "undefined") AOS.refresh();
    } catch (err) {
      console.error(err);
      statusEl.textContent = "Не удалось загрузить проект: " + err.message;
    }
  }

  init();
})();
