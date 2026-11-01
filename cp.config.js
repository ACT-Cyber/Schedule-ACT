/**
 * Card print — canvas, ratio and export settings.
 * Load after CONFIG.js and before cardprint/index.js.
 * Designs, fonts and card text live in CONFIG.CARDPRINT.
 *
 * @format
 */

const CP_CONFIG = {
  // Remember the last ratio / orientation / format between sessions (never the background).
  REMEMBER: true,
  STORAGE_KEY: "schedule-act-cardprint",

  // Used when nothing is remembered. Each id must exist in its list below.
  DEFAULTS: { ratio: "9:16", orientation: "landscape", format: "png" },

  // Logical px of the canvas short side. Export px = this x the format scale (360 x 3 = 1080).
  BASE: 360,

  // Ratios are written portrait (w < h). Landscape swaps them. 1:1 has no orientation.
  RATIOS: [
    { id: "1:1", label: "1:1", w: 1, h: 1 },
    { id: "3:4", label: "3:4", w: 3, h: 4 },
    { id: "9:16", label: "9:16", w: 9, h: 16 },
  ],
  ORIENTATIONS: [
    { id: "portrait", label: "Portrait" },
    { id: "landscape", label: "Landscape" },
  ],

  // kind: image | pdf | print.  scale: export multiplier.  quality: jpeg only.
  FORMATS: [
    {
      id: "png",
      label: "HD PNG",
      kind: "image",
      mime: "image/png",
      ext: "png",
      scale: 3,
    },
    {
      id: "jpeg",
      label: "JPEG",
      kind: "image",
      mime: "image/jpeg",
      ext: "jpeg",
      scale: 2,
      quality: 0.92,
    },
    {
      id: "pdf",
      label: "PDF",
      kind: "pdf",
      ext: "pdf",
      scale: 2,
      quality: 0.95,
    },
    { id: "print", label: "Print", kind: "print" },
  ],
  // Formats kept in the code but not offered in the dropdown. Empty the list to show them.
  HIDDEN: ["print", "pdf"],
  PDF_DPI: 96,
  EXPORT_BG: "#ffffff",

  // Shrink-to-fit: passes and safety margin when content overflows the canvas.
  FIT: { MAX_PASSES: 4, SAFETY: 0.98 },

  // Uploaded backgrounds are downscaled before use.
  UPLOAD: { MAX_SIDE: 1920, QUALITY: 0.9 },

  // Blur radius (px) used when baking a backdrop filter that does not state one.
  BAKE_BLUR: 8,

  LABELS: { RATIO: "Ratio", ORIENTATION: "Orientation", FORMAT: "Export" },
};
