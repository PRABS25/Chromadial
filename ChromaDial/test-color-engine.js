"use strict";
const assert = require("assert");
const E = require("./js/color-engine.js");

assert.deepStrictEqual(E.hexToRgb("#FF7F50"), { r: 255, g: 127, b: 80 });
assert.strictEqual(E.rgbToHex({ r: 255, g: 127, b: 80 }), "#FF7F50");
assert.deepStrictEqual(E.cmykToRgb({ c: 0, m: 100, y: 100, k: 0 }), { r: 255, g: 0, b: 0 });
assert.deepStrictEqual(E.rgbToCmyk({ r: 0, g: 0, b: 0 }), { c: 0, m: 0, y: 0, k: 100 });
assert.ok(E.deltaE2000({ r: 20, g: 40, b: 60 }, { r: 20, g: 40, b: 60 }) < 0.000001);
assert.strictEqual(E.similarity({ r: 80, g: 200, b: 120 }, { r: 80, g: 200, b: 120 }), 100);
assert.strictEqual(E.nearestColour({ r: 0, g: 255, b: 255 }).name, "Cyan");
console.log("All colour-engine tests passed.");
