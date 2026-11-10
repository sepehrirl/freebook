import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const BUCKET = "freebook-books";
const MAX_BYTES = 50 * 1024 * 1024;
const LICENSES: Record<string, { name: string; url: string }> = {
  "CC0-1.0": { name: "CC0 1.0 Universal", url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  "CC-BY-4.0": { name: "Creative Commons Attribution 4.0 International", url: "https://creativecommons.org/licenses/by/4.0/" },
  "CC-BY-SA-4.0": { name: "Creative Commons Attribution-ShareAlike 4.0 International", url: "https://creativecommons.org/licenses/by-sa/4.0/" }
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });

function httpsUrl(value: unknown): URL | null {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" ? url : null;
  } catch { return null; }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

function safeSlug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || crypto.randomUUID();
}

function getServiceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try { return JSON.parse(secretKeys).default || ""; } catch { /* invalid env */ }
  }
  return "";
}

async function authorized(req: Request, admin: ReturnType<typeof createClient>): Promise<boolean> {
  const supplied = req.headers.get("x-freebook-ingestion-token") || "";
  if (!supplied) return false;
  const hash = await sha256(new TextEncoder().encode(supplied));
  const { data, error } = await admin.from("book_ingestion_guard")
    .select("token_hash").eq("singleton", true).maybeSingle();
  return !error && !!data?.token_hash && hash === data.token_hash;
}

async function importItem(admin: ReturnType<typeof createClient>, source: any, item: any) {
  const externalId = String(item.external_id || "").trim().slice(0, 180);
  const title = String(item.title || "").trim().slice(0, 180);
  const author = String(item.author || "").trim().slice(0, 160);
  const license = LICENSES[String(item.license_code || "")];
  const contentUrl = httpsUrl(item.content_url);
  const sourceUrl = httpsUrl(item.source_url);
  const evidenceUrl = httpsUrl(item.rights_evidence_url);
  if (!externalId || !title || !author || !license || item.rights_verified !== true ||
      !contentUrl || !sourceUrl || !evidenceUrl || !String(item.attribution || "").trim()) {
    return { status: "skipped", reason: "missing_or_unverified_rights_metadata" };
  }

  const allowedHosts = new Set((source.allowed_content_hosts || []).map((host: string) => String(host).toLowerCase()));
  const manifestHost = new URL(source.manifest_url).hostname.toLowerCase();
  if (![contentUrl.hostname.toLowerCase(), sourceUrl.hostname.toLowerCase(), evidenceUrl.hostname.toLowerCase()]
      .every((host) => allowedHosts.has(host) || host === manifestHost)) {
    return { status: "skipped", reason: "host_not_allowlisted" };
  }

  const { data: existing } = await admin.from("books").select("id")
    .eq("ingestion_source_key", source.source_key).eq("ingestion_external_id", externalId).maybeSingle();
  if (existing) return { status: "skipped", reason: "already_imported" };

  const response = await fetch(contentUrl, { redirect: "error", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("content_download_http_" + response.status);
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_BYTES) return { status: "skipped", reason: "file_too_large" };
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.byteLength > MAX_BYTES) return { status: "skipped", reason: "invalid_file_size" };

  const headerType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const isPdf = headerType === "application/pdf" && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  const isText = headerType === "text/plain";
  if (!isPdf && !isText) return { status: "skipped", reason: "unsupported_or_unverified_mime" };
  if (isText) {
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { return { status: "skipped", reason: "text_not_utf8" }; }
  }

  const digest = await sha256(bytes);
  const { data: duplicate } = await admin.from("books").select("id").eq("content_sha256", digest).maybeSingle();
  if (duplicate) return { status: "skipped", reason: "duplicate_file" };

  const slug = safeSlug("fb-" + source.source_key + "-" + externalId);
  const category = String(item.category || "عمومی").slice(0, 80);
  const language = String(item.language || "fa").slice(0, 12);
  const bookPayload = {
    slug, title, author,
    description: String(item.description || "").slice(0, 1200),
    category, language,
    cover_url: httpsUrl(item.cover_url)?.href || null,
    content_url: null,
    license_name: license.name,
    license_url: license.url,
    source_url: sourceUrl.href,
    attribution: String(item.attribution).slice(0, 1200),
    publication_status: "draft",
    ingestion_source_key: source.source_key,
    ingestion_external_id: externalId,
    content_sha256: digest
  };
  const { data: book, error: insertError } = await admin.from("books").insert(bookPayload).select("id").single();
  if (insertError) {
    if (insertError.code === "23505") return { status: "skipped", reason: "duplicate_identity_or_slug" };
    throw insertError;
  }

  const extension = isPdf ? "pdf" : "txt";
  const path = book.id + "/" + digest + "." + extension;
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: isPdf ? "application/pdf" : "text/plain",
    cacheControl: "3600",
    upsert: false
  });
  if (uploadError) {
    await admin.from("books").delete().eq("id", book.id);
    throw uploadError;
  }

  const { error: publishError } = await admin.from("books").update({
    content_path: path,
    content_mime_type: isPdf ? "application/pdf" : "text/plain",
    content_size_bytes: bytes.byteLength,
    publication_status: "published",
    published_at: new Date().toISOString()
  }).eq("id", book.id);
  if (publishError) {
    await admin.storage.from(BUCKET).remove([path]);
    await admin.from("books").delete().eq("id", book.id);
    throw publishError;
  }
  return { status: "imported", book_id: book.id, title };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = getServiceKey();
  if (!supabaseUrl || !serviceKey) return json({ error: "server_configuration_missing" }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!(await authorized(req, admin))) return json({ error: "unauthorized" }, 401);

  const { data: sources, error: sourcesError } = await admin.from("book_ingestion_sources")
    .select("source_key,manifest_url,allowed_content_hosts,max_items_per_run")
    .eq("enabled", true).order("source_key");
  if (sourcesError) return json({ error: "source_lookup_failed" }, 500);
  const summary = { sources: sources?.length || 0, discovered: 0, imported: 0, skipped: 0, errors: 0, results: [] as unknown[] };

  for (const source of sources || []) {
    const run = await admin.from("book_ingestion_runs").insert({ source_key: source.source_key, status: "running" }).select("id").single();
    const runId = run.data?.id;
    let discovered = 0, imported = 0, skipped = 0, errors = 0;
    const details: unknown[] = [];
    try {
      const manifestUrl = httpsUrl(source.manifest_url);
      if (!manifestUrl) throw new Error("manifest_url_must_be_https");
      const manifestResponse = await fetch(manifestUrl, { redirect: "error", signal: AbortSignal.timeout(15000) });
      if (!manifestResponse.ok) throw new Error("manifest_http_" + manifestResponse.status);
      const manifestBytes = new Uint8Array(await manifestResponse.arrayBuffer());
      if (manifestBytes.byteLength > 2 * 1024 * 1024) throw new Error("manifest_too_large");
      const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
      const items = Array.isArray(manifest.items) ? manifest.items.slice(0, source.max_items_per_run) : [];
      discovered = items.length;
      for (const item of items) {
        try {
          const result = await importItem(admin, source, item);
          if (result.status === "imported") imported++;
          else skipped++;
          details.push(result);
        } catch (error) {
          errors++;
          details.push({ status: "error", external_id: item?.external_id || null, message: String(error).slice(0, 300) });
        }
      }
      const status = errors ? (imported || skipped ? "partial" : "failed") : "completed";
      if (runId) await admin.from("book_ingestion_runs").update({
        status, discovered_count: discovered, imported_count: imported, skipped_count: skipped,
        error_count: errors, details, finished_at: new Date().toISOString()
      }).eq("id", runId);
    } catch (error) {
      errors++;
      details.push({ status: "error", message: String(error).slice(0, 300) });
      if (runId) await admin.from("book_ingestion_runs").update({
        status: "failed", discovered_count: discovered, imported_count: imported, skipped_count: skipped,
        error_count: errors, details, finished_at: new Date().toISOString()
      }).eq("id", runId);
    }
    summary.discovered += discovered;
    summary.imported += imported;
    summary.skipped += skipped;
    summary.errors += errors;
    summary.results.push({ source_key: source.source_key, discovered, imported, skipped, errors });
  }
  return json({ ok: true, ...summary });
});
