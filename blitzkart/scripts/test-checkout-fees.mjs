import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(directory, "..", "lib", "checkout-fees.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const loaded = { exports: {} };
new Function("module", "exports", compiled)(loaded, loaded.exports);
const { calculateCheckoutFees, calculateCheckoutTotal } = loaded.exports;

const disabled = {
  packaging_enabled: false, packaging_amount: 5,
  platform_enabled: false, platform_amount: 0,
  handling_enabled: false, handling_amount: 0,
};
const none = calculateCheckoutFees(disabled);
assert.deepEqual(none, { packaging_fee: 0, platform_fee: 0, handling_fee: 0 });
assert.equal(calculateCheckoutTotal({ subtotal: 500, discount: 0, fees: none, delivery: 50, productDelivery: 0 }), 550);

assert.deepEqual(calculateCheckoutFees({ ...disabled, packaging_enabled: true }), { packaging_fee: 5, platform_fee: 0, handling_fee: 0 });
assert.deepEqual(calculateCheckoutFees({ ...disabled, platform_enabled: true, platform_amount: 3.25 }), { packaging_fee: 0, platform_fee: 3.25, handling_fee: 0 });
assert.deepEqual(calculateCheckoutFees({ ...disabled, handling_enabled: true, handling_amount: 4 }), { packaging_fee: 0, platform_fee: 0, handling_fee: 4 });

const allEnabled = calculateCheckoutFees({
  packaging_enabled: true, packaging_amount: 5,
  platform_enabled: true, platform_amount: 2,
  handling_enabled: true, handling_amount: 3,
});
assert.deepEqual(allEnabled, { packaging_fee: 5, platform_fee: 2, handling_fee: 3 });
assert.equal(calculateCheckoutTotal({ subtotal: 500, discount: 0, fees: allEnabled, delivery: 50, productDelivery: 0 }), 560);
assert.equal(calculateCheckoutTotal({ subtotal: 500, discount: 0, fees: { ...allEnabled, platform_fee: 0, handling_fee: 0 }, delivery: 65, productDelivery: 0 }), 570);
assert.equal(calculateCheckoutTotal({ subtotal: 500, discount: 600, fees: none, delivery: 50, productDelivery: 0 }), 50);
assert.equal(calculateCheckoutTotal({ subtotal: 500, discount: 20, fees: allEnabled, delivery: 50, productDelivery: 7.5 }), 547.5);
assert.throws(() => calculateCheckoutFees({ ...disabled, packaging_amount: -1 }));

console.log("Checkout fee checks passed (disabled/default and individual fees, combined totals, both delivery modes, discount cap, product delivery, invalid settings).");
