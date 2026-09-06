
/* WikiTok Design Lab
 * UI only. All six entries below come from data.js, not from a live API.
 * Integration contract and migration notes: adapter.ts / CODEX_TASK.md.
 */
(() => {
  "use strict";
  const theme = document.body.dataset.theme;
  const editorial = theme === "editorial";
  const all = [...window.DEMO_ARTICLES];
  if (!editorial) all.unshift(all.splice(all.findIndex(a => a.id === "hubble"), 1)[0]);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = name => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${window.ICONS[name] || ""}</svg>`;
  const pad = n => String(n).padStart(editorial ? 3 : 2, "0");
  const byId = id => all.find(a => a.id === id);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const STORAGE_KEY = "wikitok-designlab:saved:v1";
  let saved = new Set();
  let storageOK = true;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(stored)) saved = new Set(stored.filter(x => typeof x === "string"));
  } catch (_) { storageOK = false; }
  let list = all, category = "全部", active = 0, observer, toastTimer, libraryMode = "all";
  let restoreFocus = null;
  const button = (action, name, label, extra = "") => `<button type="button" class="icon-btn" data-action="${action}" aria-label="${esc(label)}" title="${esc(label)}"${extra}>${icon(name)}</button>`;
  const filters = () => `<div class="filter ${editorial ? "" : "immersive-filter"}" role="group" aria-label="筛选示例词条">${["全部", "宇宙", "自然", "日常", "思考"].map(t => `<button type="button" data-action="filter" data-category="${t}" aria-pressed="${t === "全部"}">${t === "全部" ? (editorial ? "偶然发现" : "随处漫游") : t}</button>`).join("")}</div>`;
  const dialogs = `
    <dialog id="reader" class="read-dialog" aria-labelledby="reader-title"></dialog>
    <dialog id="library" class="library-dialog" aria-labelledby="library-title"></dialog>
    <dialog id="about" class="library-dialog" aria-labelledby="about-title"></dialog>
    <dialog id="lightbox" class="lightbox" aria-label="查看完整图片"></dialog>
    <dialog id="sharebox" class="library-dialog" aria-labelledby="share-title"></dialog>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
    <div class="sr-only" id="live-position" aria-live="polite"></div>`;
  if (editorial) {
    $("#app").innerHTML = `<div class="editorial-shell">
      <aside class="editorial-rail" aria-label="辅助导航">
        <button class="rail-mark" data-action="home" aria-label="回到第一条">${icon("star")}</button>
        <div class="rail-rule"></div><div class="rail-type">A SIDE OF CURIOSITY · EST. NOW</div>
        <div class="rail-bottom">${button("library", "grid", "词条索引")}${button("about", "info", "关于 Demo 与快捷键")}</div>
      </aside>
      <div class="editorial-main">
        <header class="editorial-header">
          <button class="editorial-brand" data-action="home" aria-label="页外，回到第一条"><strong>页外</strong><span>MARGIN</span></button>
          <nav class="editorial-nav" aria-label="主导航"><button class="current" data-action="home">发现</button><button data-action="saved">我的收藏<span class="saved-count">00</span></button></nav>
          <div class="editorial-tools"><button class="mobile-only" data-action="saved" aria-label="查看我的收藏">${icon("bookmark")}</button><button class="search-trigger" data-action="search" aria-label="搜索示例词条">${icon("search")}<span class="kbd">/</span></button><button class="text-button" data-action="shuffle" aria-label="随机一条">${icon("shuffle")}<span>随便看看</span></button></div>
        </header>
        <div class="editorial-subhead">${filters()}<div class="issue-label">A JOURNAL OF <strong>SMALL DISCOVERIES</strong></div></div>
        <main id="feed" class="feed editorial-feed" tabindex="-1" aria-label="知识卡片，向下滚动浏览"></main>
        <footer class="editorial-footer">
          <div class="footer-motto">${icon("star")}<span>保持好奇，不必赶路。</span><em>Stay a little curious.</em></div>
          <div class="editorial-pagination"><div class="page-numbers"><span class="now">001</span><span class="page-line"></span><span class="total">006</span></div><div id="dots" class="page-dots" role="group" aria-label="跳转到词条"></div><div class="page-arrows">${button("prev", "up", "上一条（↑ / K）")}${button("next", "down", "下一条（↓ / J）")}</div></div>
        </footer>
      </div>
    </div>${dialogs}`;
  } else {
    $("#app").innerHTML = `<div class="immersive-shell">
      <header class="immersive-header">
        <button class="immersive-brand" data-action="home" aria-label="游离，回到第一条">${icon("orbit")}<span class="brand-text"><strong>游离</strong><span>DRIFT / WIKI</span></span></button>
        <nav class="immersive-nav" aria-label="主导航"><button class="current" data-action="home">漫游</button><button data-action="saved">收藏<span class="saved-count">00</span></button><button data-action="about">关于</button></nav>
        <div class="immersive-tools"><button class="mobile-only" data-action="saved" aria-label="查看我的收藏">${icon("bookmark")}</button><button class="text-button" data-action="library">${icon("grid")}<span>词条索引</span></button>${button("search", "search", "搜索示例词条（/）")}</div>
      </header>
      ${filters()}
      <main id="feed" class="feed immersive-feed" tabindex="-1" aria-label="沉浸知识流，向下滚动浏览"></main>
      <aside class="immersive-rail" aria-label="词条操作">${button("save", "bookmark", "收藏当前词条（B）", ' data-current="true"')}${button("share", "share", "分享当前词条")}${button("focus", "focus", "专注看图（F）", ' data-role="focus"')}<div class="rail-divider"></div><div id="dots" class="vertical-progress" role="group" aria-label="跳转到词条"></div></aside>
      <footer class="immersive-footer">
        <div class="wander-hint">${icon("down")}<div>向下滚动，世界继续。<br><span class="mono">SCROLL TO WANDER · 6 DEMO ENTRIES</span></div></div>
        <div id="filmstrip" class="filmstrip" aria-label="漫游轨迹"></div>
        <div class="immersive-pagination"><div class="page-numbers"><span class="now">01</span><span>/</span><span class="total">06</span></div><button class="icon-btn next-round" data-action="next" aria-label="下一条（↓ / J）">${icon("down")}</button></div>
      </footer>
      <button class="focus-exit" data-action="focus">退出专注 <span class="kbd">Esc</span></button>
    </div>${dialogs}`;
    $('[data-role="focus"]').classList.add("focus-rail");
  }
  const feed = $("#feed");
  function image(a, className, i) {
    if (!a.image) return "";
    return `<img class="${className}" src="${esc(a.image)}" alt="${esc(a.imageAlt || a.title)}" loading="${i < 2 ? "eager" : "lazy"}" decoding="async"${i === 0 ? ' fetchpriority="high"' : ""}>`;
  }
  function slide(a, i) {
    const type = a.image ? a.imageType : "no-image";
    const title = a.headline?.length ? a.headline : [a.title];
    const longTitle = title.some(l => [...l].length > 7) ? " long-title" : "";
    const titleHTML = title.map(l => `<span>${esc(l)}</span>`).join("");
    const mediaTypeLabel = a.imageType === "diagram" ? "PARAMETRIC STUDY" : a.image ? "A CLOSER LOOK" : "A QUESTION WORTH KEEPING";
    if (editorial) return `<article class="slide editorial-slide" data-id="${esc(a.id)}" aria-label="${esc(a.title)}" style="--plate-bg:${a.color};--plate-ink:${a.accent}">
      <div class="spread"><div class="story-copy">
        <div class="story-label">${esc(a.tag)}<span class="mono">NO. ${pad(i + 1)}</span></div>
        <h1 class="story-title">${titleHTML}</h1>
        <p class="story-english">${esc(a.english)}</p>
        <p class="story-excerpt">${esc(a.excerpt)}</p>
        <div class="story-actions"><button class="pill-button" data-action="read" data-id="${esc(a.id)}">展开这条知识 ${icon("arrow")}</button>${button("save", "bookmark", "收藏：" + a.title, ` data-id="${esc(a.id)}"`)}${button("share", "share", "分享：" + a.title, ` data-id="${esc(a.id)}"`)}</div>
        <div class="story-footnote"><span class="tiny-rule"></span><p><b>${esc(a.title)}</b><br>示例编辑文案 · 来源见展开页</p></div>
      </div><div class="plate-wrap"><div class="plate ${type}" data-action="${a.image ? "image" : "read"}" data-id="${esc(a.id)}" role="button" tabindex="0" aria-label="${a.image ? "查看完整图片：" : "展开："}${esc(a.title)}">
        ${image(a, "plate-image", i)}${!a.image ? '<div class="empty-graphic" aria-hidden="true">?</div>' : ""}
        <div class="plate-top"><span class="mono">FIG. ${pad(i + 1)} &nbsp;/&nbsp; ${mediaTypeLabel}</span><span class="plate-corner"></span></div>
        <div class="plate-title" aria-hidden="true">${esc(a.plate)}</div>
        ${a.imageType === "diagram" ? `<div class="plate-mark">${icon("arrow")}<span>THINK AGAIN</span></div>` : ""}
      </div><div class="plate-caption"><span>THE CURIOSITY JOURNAL</span><span>${esc(a.credit)}</span></div></div></div>
    </article>`;
    return `<article class="slide immersive-slide" data-id="${esc(a.id)}" aria-label="${esc(a.title)}">
      <div class="immersive-art ${type}">${image(a, "immersive-img", i)}</div>
      <div class="exhibit-top-note">${mediaTypeLabel}<br>EXHIBIT / ${pad(i + 1)}</div><div class="exhibit-corner"></div>
      <div class="immersive-copy"><div class="exhibit-label">${esc(a.tag)}<span>—</span>${pad(i + 1)}</div>
        <h1 class="immersive-title${longTitle}">${titleHTML}</h1><p class="immersive-english">${esc(a.english)}</p>
        <p class="immersive-excerpt">${esc(a.excerpt)}</p>
        <div class="immersive-actions"><button class="pill-button" data-action="read" data-id="${esc(a.id)}">进入这条知识 ${icon("arrow")}</button><button class="mini-source" data-action="read" data-id="${esc(a.id)}">${icon("book")} 查看来源</button></div>
      </div>
      <button class="image-fact" data-action="read" data-id="${esc(a.id)}" aria-label="查看${esc(a.title)}的示例正文与来源"><strong>${esc(a.fact)}</strong><span>${esc(a.factLabel)}</span></button>
      <div class="exhibit-caption">${esc(a.credit)} · 示例编辑内容</div>
    </article>`;
  }
  function thumb(a, number, film = false) {
    const im = a.image ? `<img class="${a.imageType === "diagram" ? "diagram" : ""}" src="${esc(a.image)}" alt="" loading="lazy">` : `<span class="thumb-fallback">?</span>`;
    return `<button class="filmstrip-item ${a.imageType}" data-action="jump" data-id="${esc(a.id)}" aria-label="跳转到${esc(a.title)}" title="${esc(a.title)}" aria-current="false">${im}<span class="thumb-number">${number}</span></button>`;
  }
  function render() {
    observer?.disconnect();
    list = category === "全部" ? all : all.filter(a => a.category === category);
    active = 0;
    feed.innerHTML = list.map(slide).join("");
    feed.scrollTo({ top: 0, behavior: "instant" });
    $("#dots").innerHTML = list.map(a => `<button data-action="jump" data-id="${esc(a.id)}" aria-label="跳转到${esc(a.title)}" aria-current="false"></button>`).join("");
    if (!editorial) $("#filmstrip").innerHTML = list.map((a, i) => thumb(a, String(i + 1).padStart(2, "0"))).join("") + `<button class="shuffle-end" data-action="shuffle" aria-label="随机一条">${icon("shuffle")}</button>`;
    $$('[data-action="filter"]').forEach(b => b.setAttribute("aria-pressed", b.dataset.category === category));
    observer = new IntersectionObserver(entries => {
      const candidate = entries.filter(e => e.isIntersecting && e.intersectionRatio > .58).sort((a,b) => b.intersectionRatio-a.intersectionRatio)[0];
      if (!candidate) return;
      const idx = list.findIndex(a => a.id === candidate.target.dataset.id);
      if (idx >= 0 && idx !== active) { active = idx; updateUI(); }
    }, { root: feed, threshold: [.58, .8] });
    $$(".slide", feed).forEach(el => observer.observe(el));
    attachImageErrors(feed);
    updateUI();
  }
  function updateUI() {
    const a = list[active]; if (!a) return;
    $$(".now").forEach(el => el.textContent = pad(active + 1));
    $$(".total").forEach(el => el.textContent = pad(list.length));
    $$('#dots button, .filmstrip-item').forEach(el => el.setAttribute("aria-current", String(el.dataset.id === a.id)));
    $$('[data-action="prev"]').forEach(el => el.disabled = active === 0);
    $$('[data-action="next"]').forEach(el => { el.title = active === list.length - 1 ? "已到最后一条，点击重新漫游" : "下一条（↓ / J）"; });
    $$(".slide", feed).forEach((el, i) => { el.inert = i !== active; el.setAttribute("aria-hidden", String(i !== active)); });
    $("#live-position").textContent = `${active + 1} / ${list.length}，${a.title}`;
    updateSaved();
    [list[active + 1], list[active + 2]].filter(Boolean).forEach(x => { if (x.image) { const im = new Image(); im.src = x.image; } });
  }
  function updateSaved() {
    $$(".saved-count").forEach(el => el.textContent = String(all.filter(a => saved.has(a.id)).length).padStart(2, "0"));
    $$('[data-action="save"]').forEach(el => {
      const id = el.dataset.id || list[active]?.id;
      const isSaved = saved.has(id);
      el.classList.toggle("is-saved", isSaved);
      el.setAttribute("aria-pressed", String(isSaved));
      el.setAttribute("aria-label", (isSaved ? "取消收藏：" : "收藏：") + (byId(id)?.title || ""));
    });
  }
  function toast(text) {
    const box = $("#toast"); clearTimeout(toastTimer);
    box.textContent = text; box.classList.add("show");
    toastTimer = setTimeout(() => box.classList.remove("show"), 2400);
  }
  function toggleSave(id) {
    if (!byId(id)) return;
    const wasSaved = saved.has(id);
    if (wasSaved) saved.delete(id); else saved.add(id);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...saved])); }
    catch (_) { storageOK = false; }
    updateSaved();
    toast((wasSaved ? "已从收藏移除" : "已收入收藏") + (storageOK ? "" : " · 当前浏览器仅临时保存"));
  }
  function jumpTo(index, instant = false) {
    if (!list.length) return;
    const next = Math.max(0, Math.min(index, list.length - 1));
    feed.scrollTo({ top: next * feed.clientHeight, behavior: instant || reduced.matches ? "instant" : "smooth" });
    if (instant || reduced.matches) { active = next; updateUI(); }
  }
  function goToId(id) {
    if (!byId(id)) return;
    if (!list.some(a => a.id === id)) { category = "全部"; render(); }
    jumpTo(list.findIndex(a => a.id === id), true);
  }
  function openDialog(id, html, focusSelector) {
    closeDialogs();
    restoreFocus = document.activeElement;
    const d = $("#" + id);
    d.innerHTML = html; d.showModal();
    if (focusSelector) $(focusSelector, d)?.focus({ preventScroll: true });
    attachImageErrors(d);
  }
  function closeDialogs() { $$("dialog[open]").forEach(d => d.close()); }
  function dialogHead(title, titleId, subtitle = "") {
    return `<div class="dialog-top"><h2 id="${titleId}">${title}${subtitle}</h2>${button("close", "close", "关闭")}</div>`;
  }
  function openReader(id) {
    const a = byId(id); if (!a) return;
    const related = all.filter(x => x.id !== id && x.category === a.category).concat(all.filter(x => x.id !== id && x.category !== a.category)).slice(0, 2);
    openDialog("reader", `${dialogHead("停一会，读一读。", "reader-dialog-label")}<div class="read-body">
      ${a.image ? `<img class="read-cover ${a.imageType}" src="${esc(a.image)}" alt="${esc(a.imageAlt)}">` : ""}
      <div class="mono">${esc(a.tag)}</div><h2 class="read-title" id="reader-title">${esc(a.title)}</h2><div class="read-english">${esc(a.english)}</div>
      ${a.body.map(p => `<p>${esc(p)}</p>`).join("")}
      <div class="source-block"><div class="note">正文为 Demo 编写的示例摘要，不是实时抓取的维基全文。</div><a href="${esc(a.source)}" target="_blank" rel="noopener noreferrer">参考来源：${esc(a.sourceName)} ↗</a><div class="credit">图像：${esc(a.credit)}</div>${a.id === "hubble" ? '<div class="credit">完整署名：NASA, ESA, G. Illingworth, D. Magee, and P. Oesch (University of California, Santa Cruz), R. Bouwens (Leiden University), and the HUDF09 Team。</div>' : ""}</div>
      <div class="read-actions"><a class="pill-button" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">打开维基百科 ${icon("arrow")}</a>${button("save", "bookmark", "收藏：" + a.title, ` data-id="${esc(a.id)}"`)}</div>
      <div class="related"><div class="related-title">换个方向，继续逛逛 <span class="mono">/ DEMO LINKS</span></div><div class="related-row">${related.map(x => `<button data-action="related" data-id="${esc(x.id)}">${esc(x.title)} ↗</button>`).join("")}</div></div>
    </div>`, '[data-action="close"]');
    updateSaved();
  }
  function openLibrary(mode) {
    libraryMode = mode;
    const title = mode === "saved" ? "收藏，不着急读完。" : mode === "search" ? "找一点好奇心。" : "这次漫游的六个入口。";
    openDialog("library", `${dialogHead(title, "library-title")}<div class="library-intro"><div class="library-tabs"><button data-action="library-all" aria-pressed="${mode !== 'saved'}">全部词条</button><button data-action="library-saved" aria-pressed="${mode === 'saved'}">我的收藏</button></div><p>${mode === "saved" ? "收藏保存在当前浏览器，不需要账号。" : "只搜索本 Demo 的 6 条示例内容，尚未接入在线检索。"}</p><label class="search-box">${icon("search")}<input id="query" type="search" placeholder="搜索词条、主题或片段" aria-label="搜索示例词条" autocomplete="off"></label></div><div class="result-list" id="results"></div>`, "#query");
    $("#query").addEventListener("input", renderResults);
    renderResults();
  }
  function renderResults() {
    const query = ($("#query")?.value || "").trim().toLowerCase();
    const items = all.filter(a => (libraryMode !== "saved" || saved.has(a.id)) && [a.title, a.english, a.category, a.excerpt].join(" ").toLowerCase().includes(query));
    $("#results").innerHTML = items.length ? items.map(a => `<button class="result-item" data-action="result" data-id="${esc(a.id)}">${a.image ? `<img class="result-thumb ${a.imageType}" src="${esc(a.image)}" alt="">` : '<span class="result-thumb">?</span>'}<span class="result-meta"><strong>${esc(a.title)}</strong><p>${esc(a.excerpt)}</p></span>${icon("arrow")}</button>`).join("") : `<div class="empty-state">${icon(libraryMode === "saved" ? "bookmark" : "search")}<h3>${query ? "还没有找到这一条。" : "给好奇心留个书签。"}</h3><p>${query ? "试试“宇宙”“纸带”或“咖啡”。" : "点击卡片上的书签，喜欢的知识就会留在这里。"}</p></div>`;
    attachImageErrors($("#results"));
  }
  function openAbout() {
    openDialog("about", `${dialogHead("关于这次漫游", "about-title")}<div class="about-body"><div class="mono">WIKITOK DESIGN LAB / ${editorial ? "A" : "B"}</div><h3>${editorial ? "页外 · MARGIN" : "游离 · DRIFT"}</h3><p>${editorial ? "把一条知识当作一页杂志。文字和图像各自呼吸，刷卡片时只留下一个值得停顿的想法。" : "把百科放进一个没有围墙的影像展。用画面邀请你停留，用阅读抽屉容纳更完整的内容。"}</p><p>这是一个离线前端原型，包含 6 条示例内容。分类、搜索、收藏和相关词条均为本地演示；未接入 Wikipedia 数据请求，也不代表已上线产品。</p><p>滚轮或触摸滑动切换词条。<span class="kbd">↓</span> / <span class="kbd">J</span> 下一条，<span class="kbd">↑</span> / <span class="kbd">K</span> 上一条，<span class="kbd">B</span> 收藏，<span class="kbd">/</span> 搜索，<span class="kbd">Esc</span> 关闭弹层${editorial ? "。" : '，<span class="kbd">F</span> 专注看图。'}</p><p>图片在页面中内嵌，不依赖远程图片服务；外部原文与参考来源链接需要联网。文字使用系统字体。</p><button class="pill-button" data-action="saved">看看我的收藏 ${icon("bookmark")}</button></div>`, '[data-action="close"]');
  }
  function openImage(id) {
    const a = byId(id);
    if (!a?.image) return openReader(id);
    openDialog("lightbox", `<div class="lightbox-inner"><button class="icon-btn close-lightbox" data-action="close" aria-label="关闭完整图片">${icon("close")}</button><img src="${esc(a.image)}" class="${a.imageType}" alt="${esc(a.imageAlt)}"><p>${esc(a.title)} · ${esc(a.credit)}</p></div>`, '[data-action="close"]');
  }
  async function share(id) {
    const a = byId(id); if (!a) return;
    // External article URL, never a file:// demo path.
    try {
      if (navigator.share && window.isSecureContext) { await navigator.share({ title: a.title, text: a.excerpt, url: a.url }); return; }
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(a.url); toast("维基百科原文链接已复制"); return; }
    } catch (err) { if (err?.name === "AbortError") return; }
    openDialog("sharebox", `${dialogHead("分享这条知识", "share-title")}<div class="about-body"><p>当前浏览器未提供可用的复制权限，请复制下面的原文链接。</p><input id="share-url" class="copy-input" value="${esc(a.url)}" readonly aria-label="维基百科原文链接"><button class="pill-button" data-action="select-link">选中链接 ${icon("check")}</button></div>`, "#share-url");
    $("#share-url").select();
  }
  function attachImageErrors(container) {
    $$("img", container).forEach(img => {
      img.addEventListener("error", () => {
        img.classList.add("media-error");
        const frame = img.closest(".plate, .immersive-art");
        if (frame) {
          frame.classList.remove("photo", "diagram"); frame.classList.add("no-image");
          if (frame.classList.contains("plate") && !$(".empty-graphic", frame)) frame.insertAdjacentHTML("afterbegin", '<div class="empty-graphic" aria-hidden="true">?</div>');
        }
      }, { once: true });
    });
  }
  function focusToggle() {
    if (editorial) return;
    const shell = $(".immersive-shell");
    const isFocus = shell.classList.toggle("focus-mode");
    // Hidden chrome cannot remain keyboard-focusable.
    $$(".immersive-header,.immersive-filter,.immersive-rail,.immersive-footer,.immersive-copy,.image-fact").forEach(el => el.inert = isFocus);
    if (isFocus) $(".focus-exit").focus({ preventScroll: true });
    else $('[data-role="focus"]').focus({ preventScroll: true });
  }
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-action]"); if (!el) return;
    const action = el.dataset.action;
    const id = el.dataset.id || list[active]?.id;
    switch (action) {
      case "home": category = "全部"; render(); break;
      case "filter": category = el.dataset.category; render(); break;
      case "save": toggleSave(id); break;
      case "next": if (active === list.length - 1) { jumpTo(0); toast("回到第一条，继续漫游"); } else jumpTo(active + 1); break;
      case "prev": jumpTo(active - 1); break;
      case "jump": goToId(id); break;
      case "shuffle": if (list.length > 1) { const n = (active + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length; jumpTo(n); } else toast("这个分类只有一条示例，试试其他分类"); break;
      case "read": openReader(id); break;
      case "image": openImage(id); break;
      case "saved": openLibrary("saved"); break;
      case "library": openLibrary("all"); break;
      case "search": openLibrary("search"); break;
      case "library-all": case "library-saved":
        libraryMode = action === "library-all" ? "all" : "saved";
        $$(".library-tabs button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.action === action)));
        renderResults(); break;
      case "about": openAbout(); break;
      case "share": share(id); break;
      case "close": closeDialogs(); break;
      case "result": case "related": closeDialogs(); goToId(id); break;
      case "select-link": $("#share-url")?.select(); break;
      case "focus": focusToggle(); break;
    }
  });
  document.addEventListener("keydown", e => {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) || e.target.isContentEditable;
    if (e.key === "Escape" && $(".focus-mode")) { focusToggle(); return; }
    if ($("dialog[open]") || typing || e.ctrlKey || e.altKey || e.metaKey) return;
    if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"]')) { e.preventDefault(); e.target.click(); return; }
    if (["ArrowDown", "j", "J"].includes(e.key)) { e.preventDefault(); jumpTo(active + 1); }
    else if (["ArrowUp", "k", "K"].includes(e.key)) { e.preventDefault(); jumpTo(active - 1); }
    else if (e.key === "/") { e.preventDefault(); openLibrary("search"); }
    else if (e.key.toLowerCase() === "b") { e.preventDefault(); toggleSave(list[active]?.id); }
    else if (e.key.toLowerCase() === "f" && !editorial) { e.preventDefault(); focusToggle(); }
  });
  $$("dialog").forEach(d => {
    d.addEventListener("click", e => {
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
    });
    d.addEventListener("close", () => {
      if (restoreFocus?.isConnected && !restoreFocus.closest("[inert]")) restoreFocus.focus({ preventScroll: true });
    });
  });
  // Keep the same card after a viewport resize without intercepting wheel/touch input.
  let oldHeight = 0;
  new ResizeObserver(() => {
    if (feed.clientHeight !== oldHeight) { oldHeight = feed.clientHeight; jumpTo(active, true); }
  }).observe(feed);
  render();
  let hashId = "";
  try { hashId = decodeURIComponent(location.hash.slice(1)); } catch (_) { /* Ignore malformed URL fragments. */ }
  if (hashId && byId(hashId)) goToId(hashId);
  // An explicit test surface for the included Playwright smoke test.
  window.__DEMO__ = { getState: () => ({ theme, category, active, current: list[active]?.id, count: list.length, saved: [...saved] }) };
})();
