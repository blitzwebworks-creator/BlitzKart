import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(directory, "..", "lib", "delivery.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const loaded = { exports: {} };
new Function("module", "exports", compiled)(loaded, loaded.exports);
const { availableDeliveryMethods, selectedDeliveryMethod } = loaded.exports;

const configured = {
  is_active: true,
  blitz_enabled: true,
  standard_enabled: true,
  blitz_price: 65,
  standard_price: 50,
  blitz_eta: "Same Day",
  standard_eta: "2–4 Days",
};

assert.deepEqual(availableDeliveryMethods(configured).map(({ id }) => id), ["blitz", "standard"]);
assert.equal(selectedDeliveryMethod(configured, "blitz").price, 65);
assert.equal(selectedDeliveryMethod(configured, "standard").eta, "2–4 Days");
assert.deepEqual(availableDeliveryMethods({ ...configured, standard_enabled: false }).map(({ id }) => id), ["blitz"]);
assert.deepEqual(availableDeliveryMethods({ ...configured, blitz_enabled: false }).map(({ id }) => id), ["standard"]);
assert.deepEqual(availableDeliveryMethods({ ...configured, blitz_enabled: false, standard_enabled: false }), []);
assert.deepEqual(availableDeliveryMethods({ ...configured, is_active: false }), []);
assert.equal(selectedDeliveryMethod({ ...configured, blitz_enabled: false }, "blitz"), null);
assert.deepEqual(availableDeliveryMethods({ ...configured, blitz_price: -1 }), [{ id: "standard", name: "Standard Delivery", description: "Reliable and economical delivery.", price: 50, eta: "2–4 Days" }]);
assert.deepEqual(availableDeliveryMethods({ ...configured, standard_eta: " " }).map(({ id }) => id), ["blitz"]);
assert.equal(selectedDeliveryMethod({ ...configured, blitz_price: 79 }, "blitz").price, 79);

console.log("Delivery mode checks passed (enabled combinations, inactive zone, stale choice, invalid settings, current price).");
