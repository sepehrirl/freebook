import fs from "node:fs";
const manifest = JSON.parse(fs.readFileSync("catalog/manifest.json", "utf8"));
const allowed = new Set(["CC0-1.0","CC-BY-1.0","CC-BY-2.5-CA","CC-BY-3.0","CC-BY-4.0","CC-BY-SA-2.5","CC-BY-SA-3.0","CC-BY-SA-4.0","GFDL-1.2","GFDL-1.2-or-later","GFDL-1.3-or-later"]);
if (!Array.isArray(manifest.items) || manifest.items.length !== 20) throw new Error("Expected exactly 20 curated STEM books.");
const ids = new Set();
for (const [i, item] of manifest.items.entries()) {
  for (const key of ["external_id","title","author","source_url","content_url","rights_evidence_url","attribution"]) {
    if (typeof item[key] !== "string" || !item[key].trim()) throw new Error(`Item ${i+1} missing ${key}`);
  }
  if (ids.has(item.external_id)) throw new Error(`Duplicate external_id: ${item.external_id}`);
  ids.add(item.external_id);
  for (const key of ["source_url","content_url","rights_evidence_url"]) if (!item[key].startsWith("https://")) throw new Error(`Item ${i+1} has non-HTTPS ${key}`);
  if (item.rights_verified !== true || !allowed.has(item.license_code) || item.language !== "en") throw new Error(`Item ${i+1} failed rights/language validation`);
}
console.log("Validated 20 unique, HTTPS, rights-verified English STEM book records.");
