/**
 * Подключает раздел "Portfolio" шаблона SnapFolio к данным, которые
 * собирает GitHub Action (scripts/sync-media.mjs) из папки на Яндекс.Диске:
 *   - projects.json — список проектов с обложками (для этой страницы)
 *   - media.json     — полный список файлов по проектам (для portfolio-details.html)
 *
 * Дизайн/CSS/разметка шаблона не меняются — скрипт только генерирует
 * те же самые классы (portfolio-item, portfolio-wrap, isotope-item и т.д.),
 * что и в оригинальном статичном варианте, и сам инициализирует
 * Isotope/GLightbox для сгенерированных элементов (вместо main.js,
 * который для пустого контейнера при загрузке страницы ничего бы не нашёл).
 */
(function () {
  "use strict";

  const PROJECTS_JSON_PATH = "projects.json";

  const statusEl = document.getElementById("portfolioStatus");
  const filtersEl = document.getElementById("portfolioFilters");
  const containerEl = document.getElementById("portfolioContainer");

  if (!containerEl) return; // не на этой странице

  const TRANSLIT_MAP = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };

  // Транслитерация + слаг — нужен CSS-безопасный класс для Isotope-фильтра
  function slugify(name) {
    const translit = name
      .toLowerCase()
      .split("")
      .map((ch) => (TRANSLIT_MAP[ch] !== undefined ? TRANSLIT_MAP[ch] : ch))
      .join("");
    return translit.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  }

  function encodeMediaPath(p) {
    return p.split("/").map(encodeURIComponent).join("/");
  }

  function buildFilterItem(label, filterValue, isActive) {
    const li = document.createElement("li");
    li.setAttribute("data-filter", filterValue);
    if (isActive) li.classList.add("filter-active");
    li.textContent = label;
    return li;
  }

  function buildPortfolioItem(project, filterClass) {
    const col = document.createElement("div");
    col.className = `col-lg-6 col-md-6 portfolio-item isotope-item filter-${filterClass}`;

    const wrap = document.createElement("div");
    wrap.className = "portfolio-wrap";

    const img = document.createElement("img");
    img.className = "img-fluid";
    img.alt = project.name;
    img.loading = "lazy";
    if (project.cover) img.src = encodeMediaPath(project.cover);
    wrap.appendChild(img);

    const info = document.createElement("div");
    info.className = "portfolio-info";
    info.innerHTML = `
      <div class="content">
        <span class="category">Проект</span>
        <h4></h4>
        <div class="portfolio-links">
          <a href="${project.cover ? encodeMediaPath(project.cover) : "#"}" class="glightbox" title=""><i class="bi bi-plus-lg"></i></a>
          <a href="portfolio-details.html?project=${encodeURIComponent(project.name)}" title="Подробнее"><i class="bi bi-arrow-right"></i></a>
        </div>
      </div>
    `;
    info.querySelector("h4").textContent = project.name;
    info.querySelector(".glightbox").title = project.name;

    wrap.appendChild(info);
    col.appendChild(wrap);
    return col;
  }

  async function init() {
    try {
      const res = await fetch(PROJECTS_JSON_PATH, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(
          `не удалось загрузить projects.json (${res.status}). Возможно, GitHub Action ещё не запускался — запусти его вручную на вкладке Actions.`
        );
      }
      const projects = await res.json();

      if (!projects || projects.length === 0) {
        if (statusEl) statusEl.textContent = "Проектов пока нет — добавь папку с файлами на Яндекс.Диске.";
        return;
      }

      // Фильтры: "Все работы" + один пункт на каждый проект
      if (filtersEl) {
        filtersEl.appendChild(buildFilterItem("Все работы", "*", true));
        projects.forEach((p) => {
          filtersEl.appendChild(buildFilterItem(p.name, `.filter-${slugify(p.name)}`, false));
        });
      }

      // Карточки проектов
      projects.forEach((p) => {
        containerEl.appendChild(buildPortfolioItem(p, slugify(p.name)));
      });

      if (statusEl) statusEl.remove();

      // Инициализация Isotope + GLightbox для только что добавленных элементов
      // (main.js это сделать не мог — при загрузке страницы контейнер был пуст)
      const startIsotope = () => {
        const iso = new Isotope(containerEl, {
          itemSelector: ".isotope-item",
          layoutMode: "masonry",
          filter: "*",
          sortBy: "original-order",
        });

        if (filtersEl) {
          filtersEl.querySelectorAll("li").forEach((li) => {
            li.addEventListener("click", function () {
              const current = filtersEl.querySelector(".filter-active");
              if (current) current.classList.remove("filter-active");
              this.classList.add("filter-active");
              iso.arrange({ filter: this.getAttribute("data-filter") });
              if (typeof AOS !== "undefined") AOS.refresh();
            });
          });
        }
      };

      if (typeof imagesLoaded !== "undefined") {
        imagesLoaded(containerEl, startIsotope);
      } else {
        startIsotope();
      }

      if (typeof GLightbox !== "undefined") {
        GLightbox({ selector: ".portfolio .glightbox" });
      }
      if (typeof AOS !== "undefined") AOS.refresh();
    } catch (err) {
      console.error(err);
      if (statusEl) {
        statusEl.textContent = "Не удалось загрузить работы: " + err.message;
      }
    }
  }

  init();
})();
