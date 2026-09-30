(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ColorEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const round = value => Math.round(clamp(Number(value) || 0, 0, 255));

  function rgbToHex(rgb) {
    return "#" + [rgb.r, rgb.g, rgb.b]
      .map(round)
      .map(value => value.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }

  function hexToRgb(hex) {
    const clean = String(hex).replace("#", "").trim();
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) throw new Error("A six-digit hex colour is required.");
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  }

  function cmykToRgb(cmyk) {
    const c = clamp(cmyk.c, 0, 100) / 100;
    const m = clamp(cmyk.m, 0, 100) / 100;
    const y = clamp(cmyk.y, 0, 100) / 100;
    const k = clamp(cmyk.k, 0, 100) / 100;
    return {
      r: Math.round(255 * (1 - c) * (1 - k)),
      g: Math.round(255 * (1 - m) * (1 - k)),
      b: Math.round(255 * (1 - y) * (1 - k))
    };
  }

  function rgbToCmyk(rgb) {
    const r = clamp(rgb.r, 0, 255) / 255;
    const g = clamp(rgb.g, 0, 255) / 255;
    const b = clamp(rgb.b, 0, 255) / 255;
    const k = 1 - Math.max(r, g, b);
    if (k >= 0.999999) return { c: 0, m: 0, y: 0, k: 100 };
    return {
      c: Math.round(((1 - r - k) / (1 - k)) * 100),
      m: Math.round(((1 - g - k) / (1 - k)) * 100),
      y: Math.round(((1 - b - k) / (1 - k)) * 100),
      k: Math.round(k * 100)
    };
  }

  function rgbToLab(rgb) {
    const linear = value => {
      const n = clamp(value, 0, 255) / 255;
      return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
    };
    const r = linear(rgb.r), g = linear(rgb.g), b = linear(rgb.b);
    const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
    const y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750);
    const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;
    const f = value => value > 0.008856 ? Math.cbrt(value) : (7.787 * value) + (16 / 116);
    return { l: (116 * f(y)) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z)) };
  }

  function deltaE2000(rgb1, rgb2) {
    const lab1 = rgbToLab(rgb1), lab2 = rgbToLab(rgb2);
    const L1 = lab1.l, a1 = lab1.a, b1 = lab1.b;
    const L2 = lab2.l, a2 = lab2.a, b2 = lab2.b;
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
    const Cbar = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));
    const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
    const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
    const hp = (a, b) => {
      if (a === 0 && b === 0) return 0;
      const angle = Math.atan2(b, a) * 180 / Math.PI;
      return angle >= 0 ? angle : angle + 360;
    };
    const hp1 = hp(ap1, b1), hp2 = hp(ap2, b2);
    const dL = L2 - L1;
    const dC = Cp2 - Cp1;
    let dh;
    if (Cp1 * Cp2 === 0) dh = 0;
    else if (Math.abs(hp2 - hp1) <= 180) dh = hp2 - hp1;
    else if (hp2 <= hp1) dh = hp2 - hp1 + 360;
    else dh = hp2 - hp1 - 360;
    const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh / 2) * Math.PI / 180);
    const Lbar = (L1 + L2) / 2;
    const Cpbar = (Cp1 + Cp2) / 2;
    let hpbar;
    if (Cp1 * Cp2 === 0) hpbar = hp1 + hp2;
    else if (Math.abs(hp1 - hp2) <= 180) hpbar = (hp1 + hp2) / 2;
    else if (hp1 + hp2 < 360) hpbar = (hp1 + hp2 + 360) / 2;
    else hpbar = (hp1 + hp2 - 360) / 2;
    const T = 1
      - 0.17 * Math.cos((hpbar - 30) * Math.PI / 180)
      + 0.24 * Math.cos((2 * hpbar) * Math.PI / 180)
      + 0.32 * Math.cos((3 * hpbar + 6) * Math.PI / 180)
      - 0.20 * Math.cos((4 * hpbar - 63) * Math.PI / 180);
    const dTheta = 30 * Math.exp(-Math.pow((hpbar - 275) / 25, 2));
    const Rc = 2 * Math.sqrt(Math.pow(Cpbar, 7) / (Math.pow(Cpbar, 7) + Math.pow(25, 7)));
    const Sl = 1 + (0.015 * Math.pow(Lbar - 50, 2)) / Math.sqrt(20 + Math.pow(Lbar - 50, 2));
    const Sc = 1 + 0.045 * Cpbar;
    const Sh = 1 + 0.015 * Cpbar * T;
    const Rt = -Math.sin((2 * dTheta) * Math.PI / 180) * Rc;
    const l = dL / Sl, c = dC / Sc, h = dH / Sh;
    return Math.sqrt(l * l + c * c + h * h + Rt * c * h);
  }

  const NAMED_COLOURS = [
    ["Snow", "#FFFAFA"], ["Ivory", "#FFFFF0"], ["Mist", "#DDE7E7"], ["Silver", "#C0C0C0"],
    ["Graphite", "#41424C"], ["Charcoal", "#36454F"], ["Ink", "#17202A"], ["Midnight", "#191970"],
    ["Navy", "#000080"], ["Cobalt", "#0047AB"], ["Royal Blue", "#4169E1"], ["Azure", "#007FFF"],
    ["Sky Blue", "#87CEEB"], ["Powder Blue", "#B0E0E6"], ["Periwinkle", "#CCCCFF"], ["Indigo", "#4B0082"],
    ["Violet", "#8F00FF"], ["Lavender", "#B57EDC"], ["Lilac", "#C8A2C8"], ["Plum", "#8E4585"],
    ["Amethyst", "#9966CC"], ["Magenta", "#FF00FF"], ["Fuchsia", "#FF4DDE"], ["Orchid", "#DA70D6"],
    ["Rose", "#FF007F"], ["Blush", "#DE5D83"], ["Coral", "#FF7F50"], ["Salmon", "#FA8072"],
    ["Vermilion", "#E34234"], ["Scarlet", "#FF2400"], ["Crimson", "#DC143C"], ["Burgundy", "#800020"],
    ["Rosewood", "#65000B"], ["Brick", "#B22222"], ["Terracotta", "#E2725B"], ["Rust", "#B7410E"],
    ["Copper", "#B87333"], ["Amber", "#FFBF00"], ["Gold", "#FFD700"], ["Sunflower", "#FFC512"],
    ["Lemon", "#FFF44F"], ["Mustard", "#D4A017"], ["Apricot", "#FBCEB1"], ["Peach", "#FFCBA4"],
    ["Cream", "#FFFDD0"], ["Sand", "#C2B280"], ["Khaki", "#C3B091"], ["Ochre", "#CC7722"],
    ["Chocolate", "#7B3F00"], ["Espresso", "#4B3621"], ["Taupe", "#8B8589"], ["Olive", "#808000"],
    ["Lime", "#BFFF00"], ["Chartreuse", "#7FFF00"], ["Mint", "#98FF98"], ["Emerald", "#50C878"],
    ["Jade", "#00A86B"], ["Forest", "#228B22"], ["Moss", "#8A9A5B"], ["Sage", "#BCB88A"],
    ["Seafoam", "#9FE2BF"], ["Teal", "#008080"], ["Turquoise", "#40E0D0"], ["Cyan", "#00FFFF"]
  ].map(([name, hex]) => ({ name, hex, rgb: hexToRgb(hex) }));

  function nearestColour(rgb) {
    let best = NAMED_COLOURS[0], distance = Infinity;
    for (const item of NAMED_COLOURS) {
      const next = deltaE2000(rgb, item.rgb);
      if (next < distance) { best = item; distance = next; }
    }
    return { ...best, distance };
  }

  function similarity(rgb1, rgb2) {
    const delta = deltaE2000(rgb1, rgb2);
    return Math.round(clamp(100 - delta * 2.1, 0, 100));
  }

  return {
    clamp, rgbToHex, hexToRgb, cmykToRgb, rgbToCmyk, rgbToLab,
    deltaE2000, nearestColour, similarity, namedColours: NAMED_COLOURS
  };
});
