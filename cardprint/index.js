/**
 * Card print. Hold a schedule card to open a design and export JPEG or PNG.
 */
(function () {
  const C = () => CONFIG.CARDPRINT;
  const esc = (s) => {
    const amp = String.fromCharCode(38);
    return String(s ?? "")
      .replace(/&/g, amp + "amp;")
      .replace(/</g, amp + "lt;")
      .replace(/>/g, amp + "gt;")
      .replace(/"/g, amp + "quot;");
  };
  const state = { index: 0, kind: "", row: null, bg: "" };

  const field = (row, key) => {
    const fmt = window.ACT && ACT.format;
    if (key === "etd" || key === "eta" || key === "cfs") {
      const src = key === "cfs" ? row.cfsCutOff : row[key];
      return fmt ? fmt(src) : src;
    }
    if (key === "title") return C().TITLE;
    if (key === "address") return (C().ADDRESS || []).join(" ");
    if (key === "site") return C().SITE;
    return row[key] || "";
  };

  const fill = (root, row) => {
    root.querySelectorAll("[data-field]").forEach((node) => {
      node.textContent = field(row, node.dataset.field);
    });
    const plate = root.querySelector("[data-plate]");
    if (plate) plate.style.setProperty("--cp-bg", state.bg ? `url("${state.bg}")` : "none");
  };

  const loadDesign = async () => {
    const design = C().DESIGNS[state.index];
    const [html, css] = await Promise.all([
      fetch(design.html).then((r) => r.text()),
      fetch(design.css).then((r) => r.text()),
    ]);
    return { html, css, design };
  };

  const render = async (host) => {
    const loaded = await loadDesign();
    host.innerHTML = `<style>${loaded.css}</style>${loaded.html}`;
    fill(host, state.row);
    return host.querySelector("[data-print]") || host.firstElementChild;
  };

  const download = async (node) => {
    if (!window.html2canvas) {
      await new Promise((res, rej) =>
        document.head.append(Object.assign(document.createElement("script"), {
          src: C().RASTER,
          onload: res,
          onerror: rej,
        })),
      );
    }
    const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: null });
    const kind = state.kind || C().DEFAULT_KIND;
    Object.assign(document.createElement("a"), {
      href: canvas.toDataURL(kind === "png" ? "image/png" : "image/jpeg", 0.92),
      download: `${state.row.vessel || "card"}-${state.row.voyage || "schedule"}.${kind}`,
    }).click();
  };

  const open = async (row) => {
    state.row = row;
    state.kind = C().DEFAULT_KIND;
    const cfg = C();
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
          <label>${esc(cfg.BG)} <input type="file" accept="image/*" data-bg></label>
          <button type="button" data-act="reset">${esc(cfg.RESET_BG)}</button>
          <span>
            ${cfg.KINDS.map(([id, label]) => `<label><input type="radio" name="kind" value="${id}"${id === cfg.DEFAULT_KIND ? " checked" : ""}> ${esc(label)}</label>`).join("")}
            <button type="button" data-act="print">${esc(cfg.PRINT)}</button>
          </span>
        </footer>
      </form>`;
    document.body.append(dialog);
    const stage = dialog.querySelector("[data-stage]");
    const paint = async () => {
      dialog.querySelector("[data-label]").textContent = cfg.DESIGNS[state.index].label;
      await render(stage);
    };
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
      if (act === "print") download(stage.querySelector("[data-print]"));
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
    let timer = 0;
    let start = null;
    const clear = () => { window.clearTimeout(timer); timer = 0; start = null; };
    cards.addEventListener("pointerdown", (event) => {
      const card = event.target.closest(".card");
      if (!card || event.button) return;
      start = { x: event.clientX, y: event.clientY, card };
      timer = window.setTimeout(() => {
        const row = (window.ACT && ACT.visible || [])[Number(card.dataset.i)];
        if (row) open(row);
        clear();
      }, C().HOLD_MS);
    });
    cards.addEventListener("pointermove", (event) => {
      if (!start) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > C().MOVE_PX) clear();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((name) => cards.addEventListener(name, clear));
  };

  const css = document.createElement("style");
  css.textContent = `.cardprint{border:0;border-radius:16px;padding:12px;width:min(420px,94vw)}.cardprint::backdrop{background:rgba(15,23,42,.45)}.cardprint form{display:grid;gap:10px}.cardprint header,.cardprint footer{display:flex;gap:8px;align-items:center;justify-content:space-between}.cardprint .stage{display:grid;justify-content:center;min-height:520px}.cardprint button, .cardprint label{font:inherit}`;
  document.head.append(css);
  document.readyState === "loading" ? addEventListener("DOMContentLoaded", bind) : bind();
})();
