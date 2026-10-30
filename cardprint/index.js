/**
 * Card print. Click the title block, then print the A4 design.
 * Fonts load from the local cardprint font folder (CONFIG.CARDPRINT.FONT).
 */
(function () {
  const C = () => CONFIG.CARDPRINT;
  const B = () => CONFIG.BULK;

  // Defaults only. Override any key in CONFIG.CARDPRINT.FONT / CONFIG.CARDPRINT.PAGE.
  const DEFAULTS = {
    FONT: {
      DIR: "font",
      FAMILY: "Inter",
      FORMAT: "woff2",
      FILES: [
        { weight: 400, file: "Inter-Regular.woff2" },
        { weight: 500, file: "Inter-Medium.woff2" },
        { weight: 600, file: "Inter-SemiBold.woff2" },
        { weight: 700, file: "Inter-Bold.woff2" },
        { weight: 800, file: "Inter-ExtraBold.woff2" },
      ],
    },
    PAGE: { w: 794, h: 1123 },
  };
  const F = () => ({ ...DEFAULTS.FONT, ...(C().FONT || {}) });
  const P = () => ({ ...DEFAULTS.PAGE, ...(C().PAGE || {}) });

  // Folder of this script (cardprint/), captured while the script runs.
  const BASE = document.currentScript
    ? new URL(".", document.currentScript.src).href
    : location.href;

  const esc = (s) => {
    const amp = String.fromCharCode(38);
    return String(s ?? "")
      .replace(/&/g, amp + "amp;")
      .replace(/</g, amp + "lt;")
      .replace(/>/g, amp + "gt;")
      .replace(/"/g, amp + "quot;");
  };
  const state = { index: 0, kind: "", row: null, bg: "", title: "" };

  /* ---------- fonts: always resolved from the font folder ---------- */
  const fontUrl = (file) => new URL(`${F().DIR}/${file}`, BASE).href;
  const fontCss = () =>
    F()
      .FILES.map(
        ({ weight, file }) =>
          `@font-face{font-family:"${F().FAMILY}";font-weight:${weight};font-style:normal;font-display:block;src:url("${fontUrl(file)}") format("${F().FORMAT}")}`,
      )
      .join("");
  const fontSpecs = () => F().FILES.map(({ weight }) => `${weight} 1em "${F().FAMILY}"`);
  const loadFonts = (d = document) =>
    Promise.all(fontSpecs().map((spec) => d.fonts.load(spec))).catch(() => {});

  const title = () => state.title.trim() || C().TITLE;
  const dateParts = (dateStr) => {
    const d = window.ACT && ACT.parseDate(dateStr);
    if (!d) return {};
    const m = d.getMonth() + 1;
    const pad = (n) => String(n).padStart(2, "0");
    return {
      YYYY: String(d.getFullYear()),
      YY: pad(d.getFullYear() % 100),
      MMMM: CONFIG.MONTH_LABELS[m],
      MMM: CONFIG.MONTH_SHORT[m],
      MM: pad(m),
      DD: pad(d.getDate()),
      D: String(d.getDate()),
    };
  };
  const field = (row, key) => {
    const fmt = window.ACT && ACT.format;
    if (key === "etd" || key === "eta" || key === "cfs") {
      const src = key === "cfs" ? row.cfsCutOff : row[key];
      return fmt ? fmt(src) : src;
    }
    if (key === "title") return title();
    if (key === "address") return (C().ADDRESS || []).join(" ");
    if (key === "site") return C().SITE;
    return row[key] || "";
  };
  const plateUrl = (design) =>
    state.bg || new URL(C().BG, new URL(design.css, location.href)).href;

  const fill = (root, row, design) => {
    root.querySelectorAll("[data-field]").forEach((node) => {
      node.textContent = field(row, node.dataset.field);
    });
    root.querySelectorAll("[data-date]").forEach((node) => {
      const key = node.dataset.date;
      const src = key === "cfs" ? row.cfsCutOff : row[key];
      const part = node.dataset.part;
      const map = dateParts(src);
      node.textContent = (part && map[part]) || field(row, key);
    });
    root.querySelectorAll("img[src]").forEach((img) => {
      img.src = new URL(img.getAttribute("src"), location.href).href;
    });
    const plate = root.querySelector("[data-plate]");
    if (plate) plate.style.setProperty("--cp-bg", `url("${plateUrl(design)}")`);
  };

  const loadDesign = async () => {
    const design = C().DESIGNS[state.index];
    const [html, css] = await Promise.all([
      fetch(design.html).then((r) => r.text()),
      fetch(design.css).then((r) => r.text()),
    ]);
    return { html, css, design };
  };

  const loadDeps = async () => {
    const deps = [];
    if (!window.html2canvas) deps.push(B().RASTER);
    if (!window.jspdf) deps.push(B().PDF);
    for (const src of deps) {
      await new Promise((res, rej) =>
        document.head.append(Object.assign(document.createElement("script"), {
          src, onload: res, onerror: rej,
        })),
      );
    }
  };

  /* ---------- fixed A4 document shared by print, JPEG, PNG, PDF ---------- */
  const imagesReady = (d) =>
    Promise.all([...d.images].map((i) =>
      i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r))));

  const settle = async (d) => {
    await loadFonts(d);
    if (d.fonts?.ready) await d.fonts.ready;
    await imagesReady(d);
  };

  const readyScript = () =>
    `<script>Promise.all([${JSON.stringify(fontSpecs())}.map(s=>document.fonts.load(s)),[...document.images].map(i=>i.complete||new Promise(r=>i.onload=i.onerror=r))].flat()).catch(()=>{}).then(()=>document.fonts.ready).then(()=>setTimeout(print,100))<\/script>`;

  const doc = (name, html, css, run = "") =>
    `<!doctype html><meta charset="utf-8"><title>${esc(name)}</title>
<style>${fontCss()}@page{size:A4;margin:0}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;width:210mm;height:297mm;overflow:hidden}
${css}</style><body>${html}${run}`;

  const loadImage = (url) => new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });

  const bakeEffects = async (doc) => {
    const view = doc.defaultView;
    const nodes = [...doc.querySelectorAll("*")].filter((el) => {
      const cs = view.getComputedStyle(el);
      const f = cs.backdropFilter || cs.webkitBackdropFilter;
      return f && f !== "none";
    });
    for (const el of nodes) {
      const cs = view.getComputedStyle(el);
      const blur = parseFloat((cs.backdropFilter || cs.webkitBackdropFilter).match(/blur\(([\d.]+)px\)/)?.[1] || "8");
      const plate = el.closest("[data-plate]") || el;
      const raw = plate.style.getPropertyValue("--cp-bg") || view.getComputedStyle(plate).backgroundImage;
      const url = (String(raw).match(/url\(["']?([^"')]+)/) || [])[1];
      el.style.webkitBackdropFilter = "none";
      el.style.backdropFilter = "none";
      if (!url) continue;
      const img = await loadImage(url).catch(() => null);
      if (!img) continue;
      const pr = plate.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(r.width));
      canvas.height = Math.max(1, Math.round(r.height));
      const ctx = canvas.getContext("2d");
      const s = Math.max(pr.width / img.width, pr.height / img.height);
      const dw = img.width * s;
      const dh = img.height * s;
      const ox = pr.left + (pr.width - dw) / 2;
      const oy = pr.top + (pr.height - dh) / 2;
      ctx.filter = `blur(${blur}px)`;
      ctx.drawImage(
        img,
        (r.left - ox) / s,
        (r.top - oy) / s,
        r.width / s,
        r.height / s,
        -blur * 2,
        -blur * 2,
        r.width + blur * 4,
        r.height + blur * 4,
      );
      el.style.backgroundImage = `url("${canvas.toDataURL("image/jpeg", 0.92)}")`;
      el.style.backgroundSize = "100% 100%";
      el.style.backgroundRepeat = "no-repeat";
    }
  };
  const coverCrop = (url, w, h) => new Promise((res) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const s = Math.max(w / img.width, h / img.height);
      const sw = w / s, sh = h / s;
      const c = Object.assign(document.createElement("canvas"), { width: w * 2, height: h * 2 });
      c.getContext("2d").drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.95));
    };
    img.onerror = () => res(url);
    img.src = url;
  });

  const plateHtml = (node) => {
    const clone = node.cloneNode(true);
    clone.style.transform = "none";
    clone.style.transformOrigin = "";
    const page = P();
    clone.style.width = `${page.w}px`;
    clone.style.height = `${page.h}px`;
    return clone.outerHTML;
  };

  const save = async (node, css) => {
    const kind = state.kind || B().AS_DEFAULT;
    const name = `${state.row.vessel || "card"}-${state.row.voyage || "schedule"}`;
    const html = plateHtml(node);
    const page = P();

    if (kind === "print") {
      const frame = Object.assign(document.createElement("iframe"), {
        style: `position:fixed;left:-9999px;top:0;width:${page.w}px;height:${page.h}px;border:0`,
      });
      document.body.append(frame);
      frame.srcdoc = doc(name, html, css);
      await new Promise((r) => (frame.onload = r));
      await settle(frame.contentDocument);
      await bakeEffects(frame.contentDocument);
      const baked = frame.contentDocument.querySelector("[data-print]").outerHTML;
      frame.remove();
      const w = window.open("", B().WINDOW);
      if (!w) return alert(B().POPUP);
      w.document.write(doc(name, baked, css, readyScript()));
      return w.document.close();
    }

    await loadDeps();
    const frame = Object.assign(document.createElement("iframe"), {
      style: `position:fixed;left:-9999px;top:0;width:${page.w}px;height:${page.h}px;border:0`,
    });
    document.body.append(frame);
    frame.srcdoc = doc(name, html, css);
    await new Promise((r) => (frame.onload = r));
    const d = frame.contentDocument;
    await settle(d);
    await bakeEffects(d);

    const el = d.querySelector("[data-print]");
    const plate = d.querySelector("[data-plate]");
    if (plate) {
      const r = plate.getBoundingClientRect();
      const url = plate.style.getPropertyValue("--cp-bg").slice(5, -2);
      plate.style.setProperty("--cp-bg", `url("${await coverCrop(url, Math.round(r.width), Math.round(r.height))}")`);
      plate.style.backgroundSize = "100% 100%";
      await settle(d);
    }

    const canvas = await html2canvas(el, {
      scale: 2, useCORS: true, backgroundColor: "#ffffff",
      width: page.w, height: page.h, windowWidth: page.w, windowHeight: page.h,
    });
    frame.remove();

    if (kind === "pdf") {
      const pdf = new window.jspdf.jsPDF("p", "mm", "a4");
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, 297);
      return pdf.save(`${name}.pdf`);
    }
    const png = kind === "png";
    Object.assign(document.createElement("a"), {
      href: canvas.toDataURL(png ? "image/png" : "image/jpeg", 0.92),
      download: `${name}.${png ? "png" : "jpeg"}`,
    }).click();
  };

  const open = async (row) => {
    state.row = row;
    state.kind = B().AS_DEFAULT;
    state.title = C().TITLE;
    const cfg = C();
    const bulk = B();
    const dialog = Object.assign(document.createElement("dialog"), { className: "cardprint" });
    dialog.innerHTML = `
      <form method="dialog">
        <header>
          <button type="button" data-act="prev" aria-label="${esc(cfg.PREV)}">‹</button>
          <strong data-label></strong>
          <button type="button" data-act="next" aria-label="${esc(cfg.NEXT)}">›</button>
          <button type="button" data-act="dice" aria-label="${esc(cfg.DICE)}">🎲</button>
          <button value="cancel" aria-label="${esc(cfg.CLOSE)}">×</button>
        </header>
        <div class="stage" data-stage></div>
        <footer>
          <input data-title value="${esc(cfg.TITLE)}" aria-label="${esc(bulk.TITLE_PROMPT)}">
          <label>${esc(cfg.BG_LABEL)} <input type="file" accept="image/*" data-bg></label>
          <button type="button" data-act="reset">${esc(cfg.RESET_BG)}</button>
          <div class="as">${bulk.AS.map(([id, label]) => `<label><input type="radio" name="kind" value="${id}"${id === bulk.AS_DEFAULT ? " checked" : ""}> ${esc(label)}</label>`).join("")}</div>
          <button type="button" data-act="print">${esc(bulk.EXECUTE)}</button>
        </footer>
      </form>`;
    document.body.append(dialog);
    const stage = dialog.querySelector("[data-stage]");
    let css = "";
    const fit = () => {
      const plate = stage.querySelector("[data-print]");
      if (!plate) return;
      plate.style.transform = "none";
      const head = dialog.querySelector("form > header");
      const foot = dialog.querySelector("form > footer");
      const pad = C().FIT_PAD || 16;
      const availW = dialog.clientWidth - pad * 2;
      const availH = dialog.clientHeight - head.offsetHeight - foot.offsetHeight - pad * 3;
      const scale = Math.min(1, availW / plate.offsetWidth, availH / plate.offsetHeight);
      plate.style.transformOrigin = "top center";
      plate.style.transform = `scale(${scale})`;
      stage.style.height = `${plate.offsetHeight * scale}px`;
    };
    const paint = async () => {
      dialog.querySelector("[data-label]").textContent = cfg.DESIGNS[state.index].label;
      const loaded = await loadDesign();
      css = loaded.css;
      stage.innerHTML = `<style>${loaded.css}</style>${loaded.html}`;
      fill(stage, state.row, loaded.design);
      fit();
      loadFonts();
    };
    const onResize = () => fit();
    addEventListener("resize", onResize);
    dialog.addEventListener("click", async (event) => {
      const act = event.target.closest("[data-act]")?.dataset.act;
      if (act === "prev" || act === "next") {
        const step = act === "next" ? 1 : -1;
        state.index = (state.index + step + cfg.DESIGNS.length) % cfg.DESIGNS.length;
        paint();
      }
      if (act === "dice") {
        const pool = cfg.DESIGNS.map((_, i) => i).filter((i) => i !== state.index);
        state.index = (pool.length ? pool : [state.index])[Math.floor(Math.random() * (pool.length || 1))];
        paint();
      }
      if (act === "reset") {
        if (state.bg) URL.revokeObjectURL(state.bg);
        state.bg = "";
        paint();
      }
      if (act === "print") save(stage.querySelector("[data-print]"), css);
    });
    dialog.querySelector("[data-title]").addEventListener("input", (event) => {
      state.title = event.target.value;
      const node = stage.querySelector('[data-field="title"]');
      if (node) node.textContent = title();
    });
    dialog.querySelector("[data-bg]").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      if (state.bg) URL.revokeObjectURL(state.bg);
      state.bg = URL.createObjectURL(file);
      paint();
    });
    dialog.querySelectorAll("[name=kind]").forEach((input) => {
      input.addEventListener("change", () => { state.kind = input.value; });
    });
    dialog.addEventListener("close", () => {
      removeEventListener("resize", onResize);
      if (state.bg) URL.revokeObjectURL(state.bg);
      state.bg = "";
      dialog.remove();
    });
    dialog.showModal();
    paint();
  };

  const bind = () => {
    const cards = document.getElementById("cards");
    if (!cards) return;
    cards.addEventListener("click", (event) => {
      const hit = event.target.closest(".route-top > div:first-child");
      const card = hit && hit.closest(".card");
      if (!card) return;
      const row = (window.ACT && ACT.visible || [])[Number(card.dataset.i)];
      if (row) open(row);
    });
  };

  // Font faces are registered once for the page, so the preview always uses the folder fonts.
  const style = document.createElement("style");
  style.textContent = `${fontCss()}.cardprint{border:0;border-radius:16px;padding:12px;width:min(100vw - 16px,720px);max-height:calc(100vh - 16px);overflow:hidden}.cardprint::backdrop{background:rgba(15,23,42,.45)}.cardprint form{display:grid;grid-template-rows:auto 1fr auto;gap:10px;max-height:calc(100vh - 40px)}.cardprint form>header,.cardprint form>footer{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.cardprint form>header{justify-content:space-between}.cardprint .stage{display:grid;justify-content:center;overflow:hidden}.cardprint [data-title]{flex:1 1 180px;min-height:40px;border:1px solid #d7e0da;border-radius:12px;padding:0 12px}.cardprint .as{display:flex;gap:10px;flex-wrap:wrap}.cardprint button,.cardprint label{font:inherit}@media (min-width:720px){.cardprint form>footer{justify-content:space-between}}`;
  document.head.append(style);
  document.readyState === "loading" ? addEventListener("DOMContentLoaded", bind) : bind();
})();
