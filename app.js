import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.FREEBOOK_CONFIG || {};
const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.supabaseUrl || "") &&
  !!config.supabaseAnonKey && !String(config.supabaseAnonKey).includes("YOUR_");
const supabase = configured ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;

const $ = (selector) => document.querySelector(selector);
const STORAGE_BUCKET = "freebook-books";
const MAX_BOOK_FILE_SIZE = 50 * 1024 * 1024;
const state = { session: null, profile: null, books: [], bookmarks: new Set(), category: "all", query: "", authMode: "login", activeBook: null, adminBooks: [], editingBookId: null, pdfDocument: null, pdfPage: 1, readerProgress: null, progressSaveTimer: null, readerLoadToken: 0 };
const categories = ["همه", "ادبیات", "داستان", "دانش", "شعر", "تاریخ", "علمی"];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}
function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}
function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  window.setTimeout(() => node.classList.remove("show"), 2800);
}
function showMessage(node, message, isError = false) {
  node.textContent = message;
  node.style.color = isError ? "#b64c3c" : "";
}
function renderFilters() {
  $("#categoryFilters").innerHTML = categories.map((cat) => {
    const value = cat === "همه" ? "all" : cat;
    return '<button class="filter-chip ' + (state.category === value ? "is-active" : "") +
      '" type="button" data-category="' + escapeHtml(value) + '" aria-pressed="' +
      (state.category === value) + '">' + escapeHtml(cat) + "</button>";
  }).join("");
}
function renderBooks() {
  const filtered = state.books.filter((book) => {
    const matchesCategory = state.category === "all" || book.category === state.category;
    const haystack = [book.title, book.author, book.description, book.category].join(" ").toLocaleLowerCase("fa");
    return matchesCategory && haystack.includes(state.query.toLocaleLowerCase("fa"));
  });
  $("#bookCount").textContent = filtered.length + " کتاب";
  $("#bookGrid").innerHTML = filtered.length ? filtered.map((book) => {
    const marked = state.bookmarks.has(book.id);
    return '<article class="book-card">' +
      '<div class="book-cover"><span aria-hidden="true">❧</span><strong>' + escapeHtml(book.title) + "</strong></div>" +
      '<p class="book-meta">' + escapeHtml(book.category) + " · " + escapeHtml(book.author) + "</p>" +
      "<h3>" + escapeHtml(book.title) + "</h3>" +
      '<p class="book-description">' + escapeHtml(book.description || "برای آشنایی با این کتاب، جزئیات آن را ببین.") + "</p>" +
      '<div class="card-actions"><button class="button button-primary" type="button" data-read="' + book.id + '">مشاهده کتاب</button>' +
      '<button class="button bookmark-button" type="button" data-bookmark="' + book.id + '" aria-label="' +
      (marked ? "حذف از نشان‌شده‌ها" : "افزودن به نشان‌شده‌ها") + '">' + (marked ? "♥" : "♡") + "</button></div></article>";
  }).join("") : '<div class="state-card">هنوز کتابی در این دسته نیست. بعداً دوباره سر بزن 🌱</div>';
}
async function loadBooks() {
  if (!supabase) {
    $("#bookGrid").innerHTML = '<div class="state-card">برای فعال‌شدن کتابخانه، ابتدا آدرس و کلید عمومی پروژه Supabase را در فایل config.js تنظیم کن. راهنما در README مخزن قرار دارد.</div>';
    $("#bookCount").textContent = "راه‌اندازی پایگاه داده لازم است";
    return;
  }
  const { data, error } = await supabase.from("books")
    .select("id,slug,title,author,description,category,cover_url,content_url,content_path,content_mime_type,content_size_bytes,license_name,license_url,source_url,attribution")
    .eq("publication_status", "published")
    .order("published_at", { ascending: false });
  if (error) {
    $("#bookGrid").innerHTML = '<div class="state-card">دریافت کتاب‌ها ناموفق بود. تنظیمات پایگاه داده و سیاست‌های دسترسی را بررسی کن.</div>';
    console.error("FreeBook books:", error);
    return;
  }
  state.books = data || [];
  renderBooks();
}
async function loadProfile() {
  if (!state.session) {
    state.profile = null;
    state.bookmarks.clear();
    $("#accountButton").textContent = "ورود / ثبت‌نام";
    $("#myLibraryButton").hidden = true;
    $("#adminButton").hidden = true;
    renderBooks();
    return;
  }
  const [{ data: profile }, { data: marks }] = await Promise.all([
    supabase.from("profiles").select("display_name,role").eq("id", state.session.user.id).maybeSingle(),
    supabase.from("bookmarks").select("book_id").eq("user_id", state.session.user.id)
  ]);
  state.profile = profile;
  state.bookmarks = new Set((marks || []).map((row) => row.book_id));
  $("#accountButton").textContent = profile?.display_name || "حساب من";
  $("#myLibraryButton").hidden = false;
  $("#adminButton").hidden = profile?.role !== "admin";
  renderBooks();
}
function setAuthMode(mode) {
  state.authMode = mode;
  const signup = mode === "signup";
  $("#nameField").hidden = !signup;
  $("#displayName").required = signup;
  $("#password").autocomplete = signup ? "new-password" : "current-password";
  $("#authSubmit").textContent = signup ? "ساخت حساب" : "ورود";
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  showMessage($("#authMessage"), "");
}
async function submitAuth(event) {
  event.preventDefault();
  if (!supabase) return showMessage($("#authMessage"), "ابتدا تنظیمات Supabase را تکمیل کن.", true);
  const email = $("#email").value.trim();
  const password = $("#password").value;
  const displayName = $("#displayName").value.trim();
  const button = $("#authSubmit");
  button.disabled = true;
  showMessage($("#authMessage"), "لطفاً کمی صبر کن…");
  try {
    if (state.authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { display_name: displayName || "کتاب‌خوان" } }
      });
      if (error) throw error;
      if (data.session) {
        $("#authDialog").close();
        toast("حساب ساخته شد؛ خوش آمدی!");
      } else {
        showMessage($("#authMessage"), "حساب ساخته شد. ایمیلت را برای تأیید حساب بررسی کن.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      $("#authDialog").close();
      toast("با موفقیت وارد شدی.");
    }
  } catch (error) {
    showMessage($("#authMessage"), error.message || "ورود یا ثبت‌نام انجام نشد.", true);
  } finally {
    button.disabled = false;
  }
}
async function toggleBookmark(bookId) {
  if (!state.session) {
    $("#authDialog").showModal();
    toast("برای ساخت کتابخانه شخصی ابتدا وارد حسابت شو.");
    return;
  }
  const isSaved = state.bookmarks.has(bookId);
  const request = isSaved
    ? supabase.from("bookmarks").delete().eq("book_id", bookId).eq("user_id", state.session.user.id)
    : supabase.from("bookmarks").insert({ book_id: bookId, user_id: state.session.user.id });
  const { error } = await request;
  if (error) return toast("ذخیره تغییرات انجام نشد؛ دوباره تلاش کن.");
  if (isSaved) state.bookmarks.delete(bookId); else state.bookmarks.add(bookId);
  renderBooks();
  toast(isSaved ? "از کتابخانه شخصی حذف شد." : "به کتابخانه شخصی اضافه شد.");
}
function parseSavedPosition(value) {
  if (!value) return {};
  try { return JSON.parse(value); } catch { return {}; }
}
async function saveReaderProgress(position, percent) {
  if (!state.session || !state.activeBook) return;
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  const { error } = await supabase.from("reading_progress").upsert({
    user_id: state.session.user.id,
    book_id: state.activeBook.id,
    progress_percent: Number(safePercent.toFixed(2)),
    last_position: JSON.stringify(position),
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id,book_id" });
  if (error) {
    console.warn("Could not save reading progress:", error);
    showMessage($("#readerMessage"), "ذخیره خودکار پیشرفت انجام نشد؛ اتصال را بررسی کن.", true);
  } else {
    state.readerProgress = { position, percent: safePercent };
    showMessage($("#readerMessage"), "پیشرفت مطالعه ذخیره شد.");
  }
}
function scheduleTextProgressSave(node) {
  if (!node || !state.session || !state.activeBook) return;
  window.clearTimeout(state.progressSaveTimer);
  state.progressSaveTimer = window.setTimeout(() => {
    const maxScroll = Math.max(1, node.scrollHeight - node.clientHeight);
    const percent = Math.min(100, Math.max(0, node.scrollTop / maxScroll * 100));
    saveReaderProgress({ kind: "text", scrollTop: Math.round(node.scrollTop) }, percent);
  }, 700);
}
async function loadPdfReader(url, savedPosition = {}) {
  const wrap = $("#readerFrameWrap");
  wrap.innerHTML = '<div class="pdf-reader"><div class="reader-toolbar"><button class="button button-quiet" id="pdfPrev" type="button">صفحه قبل</button><span id="pdfPageLabel" class="muted">در حال بارگذاری…</span><button class="button button-quiet" id="pdfNext" type="button">صفحه بعد</button></div><div class="pdf-page-stage"><canvas id="pdfCanvas" aria-label="صفحه کتاب"></canvas></div></div>';
  try {
    const pdfjs = await import("https://esm.sh/pdfjs-dist@4.10.38");
    pdfjs.GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
    state.pdfDocument = await pdfjs.getDocument({ url }).promise;
    state.pdfPage = Math.max(1, Math.min(state.pdfDocument.numPages, Number(savedPosition.page) || 1));
    await renderPdfPage();
  } catch (error) {
    console.error("FreeBook PDF reader:", error);
    wrap.innerHTML = '<p class="state-card">نمایش PDF ممکن نشد. می‌توانی فایل را از پیوند منبع دریافت و با برنامه مناسب باز کنی.</p>';
    showMessage($("#readerMessage"), "بارگذاری PDF با خطا روبه‌رو شد.", true);
  }
}
async function renderPdfPage() {
  if (!state.pdfDocument) return;
  const page = await state.pdfDocument.getPage(state.pdfPage);
  const viewport = page.getViewport({ scale: 1.25 });
  const canvas = $("#pdfCanvas");
  if (!canvas) return;
  const context = canvas.getContext("2d");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  $("#pdfPageLabel").textContent = "صفحه " + state.pdfPage + " از " + state.pdfDocument.numPages;
  $("#pdfPrev").disabled = state.pdfPage <= 1;
  $("#pdfNext").disabled = state.pdfPage >= state.pdfDocument.numPages;
  if (state.session && state.activeBook) {
    const percent = state.pdfPage / state.pdfDocument.numPages * 100;
    await saveReaderProgress({ kind: "pdf", page: state.pdfPage }, percent);
  }
}
async function loadTextReader(url, savedPosition = {}) {
  const wrap = $("#readerFrameWrap");
  wrap.innerHTML = '<div class="text-reader" id="textReader" tabindex="0" aria-label="متن کتاب"></div>';
  const response = await fetch(url);
  if (!response.ok) throw new Error("دریافت متن کتاب ناموفق بود.");
  const text = await response.text();
  const node = $("#textReader");
  node.textContent = text;
  node.scrollTop = Math.max(0, Number(savedPosition.scrollTop) || 0);
  node.addEventListener("scroll", () => scheduleTextProgressSave(node), { passive: true });
  if (!text.length) showMessage($("#readerMessage"), "این فایل متنی خالی است.", true);
}
async function openBook(bookId) {
  const book = state.books.find((item) => item.id === bookId);
  if (!book) return;
  state.activeBook = book;
  state.pdfDocument = null;
  state.pdfPage = 1;
  state.readerProgress = null;
  const loadToken = ++state.readerLoadToken;
  $("#readerTitle").textContent = book.title;
  $("#readerMeta").textContent = book.author + " · " + book.license_name;
  $("#readerFrameWrap").innerHTML = '<p class="muted">در حال آماده‌سازی کتاب…</p>';
  const sourceUrl = safeHttpsUrl(book.source_url);
  $("#sourceLink").href = sourceUrl || "#";
  $("#sourceLink").hidden = !sourceUrl;
  showMessage($("#readerMessage"), "");
  $("#readerDialog").showModal();

  let savedPosition = {};
  if (state.session) {
    const { data, error } = await supabase.from("reading_progress")
      .select("progress_percent,last_position")
      .eq("user_id", state.session.user.id)
      .eq("book_id", book.id)
      .maybeSingle();
    if (error) console.warn("Could not load reading progress:", error);
    if (data) {
      savedPosition = parseSavedPosition(data.last_position);
      state.readerProgress = { percent: Number(data.progress_percent) || 0, position: savedPosition };
    }
  }
  if (loadToken !== state.readerLoadToken) return;

  try {
    let contentUrl = "";
    if (book.content_path) {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(book.content_path, 3600);
      if (error) throw error;
      contentUrl = data?.signedUrl || "";
    } else {
      contentUrl = safeHttpsUrl(book.content_url);
    }
    if (!contentUrl) {
      $("#readerFrameWrap").innerHTML = '<p class="muted">برای این کتاب هنوز فایل مطالعه ثبت نشده است.</p>';
      return;
    }
    const pathOrUrl = book.content_path || contentUrl;
    const isPdf = book.content_mime_type === "application/pdf" || /\.pdf(?:$|[?#])/i.test(pathOrUrl);
    const isText = book.content_mime_type === "text/plain" || /\.txt(?:$|[?#])/i.test(pathOrUrl);
    if (isPdf) await loadPdfReader(contentUrl, savedPosition);
    else if (isText) await loadTextReader(contentUrl, savedPosition);
    else {
      $("#readerFrameWrap").innerHTML = '<iframe title="متن کتاب: ' + escapeHtml(book.title) + '" src="' + escapeHtml(contentUrl) + '" loading="lazy" referrerpolicy="no-referrer"></iframe>';
      showMessage($("#readerMessage"), "این قالب در نمایشگر داخلی پیشرفت صفحه‌ای ندارد.");
    }
  } catch (error) {
    console.error("FreeBook reader load:", error);
    $("#readerFrameWrap").innerHTML = '<p class="state-card">بارگذاری فایل کتاب ممکن نشد. دسترسی فایل و وضعیت انتشار آن را بررسی کن.</p>';
    showMessage($("#readerMessage"), "دریافت فایل کتاب ناموفق بود.", true);
  }
}
async function markComplete() {
  if (!state.session || !state.activeBook) {
    toast("برای ذخیره پیشرفت مطالعه وارد حسابت شو.");
    return;
  }
  const { error } = await supabase.from("reading_progress").upsert({
    user_id: state.session.user.id,
    book_id: state.activeBook.id,
    progress_percent: 100,
    last_position: JSON.stringify({ kind: "complete" }),
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id,book_id" });
  if (error) return showMessage($("#readerMessage"), "ذخیره پیشرفت انجام نشد.", true);
  state.readerProgress = { percent: 100, position: { kind: "complete" } };
  showMessage($("#readerMessage"), "این کتاب به‌عنوان خوانده‌شده ثبت شد.");
}
async function openMyLibrary() {
  if (!state.session) return $("#authDialog").showModal();
  $("#profileEmail").textContent = state.session.user.email || "";
  const [{ data: marks }, { data: progress }] = await Promise.all([
    supabase.from("bookmarks").select("book_id,books(title)").eq("user_id", state.session.user.id),
    supabase.from("reading_progress").select("book_id,progress_percent,updated_at,books(title)").eq("user_id", state.session.user.id).order("updated_at", { ascending: false }).limit(10)
  ]);
  $("#savedBooks").innerHTML = marks?.length ? marks.map((row) =>
    '<div class="saved-row"><span>' + escapeHtml(row.books?.title || "کتاب") + '</span><span class="muted">نشان‌شده</span></div>'
  ).join("") : '<p class="muted">هنوز کتابی نشان نکرده‌ای.</p>';
  $("#progressBooks").innerHTML = progress?.length ? progress.map((row) =>
    '<div class="saved-row"><span>' + escapeHtml(row.books?.title || "کتاب") + '</span><button class="button button-quiet" type="button" data-resume="' + escapeHtml(row.book_id) + '">ادامه · ' + Number(row.progress_percent) + "٪</button></div>"
  ).join("") : '<p class="muted">هنوز مطالعه‌ای ثبت نشده است.</p>';
  $("#accountDialog").showModal();
}

function adminStatusLabel(status) {
  return status === "published" ? "منتشرشده" : status === "archived" ? "بایگانی‌شده" : "پیش‌نویس";
}
function renderAdminBooks() {
  const target = $("#adminBookList");
  if (!state.adminBooks.length) {
    target.innerHTML = '<p class="muted">هنوز کتابی ثبت نشده است. اولین کتاب را از فرم کناری اضافه کن.</p>';
    return;
  }
  target.innerHTML = state.adminBooks.map((book) =>
    '<article class="admin-book-row">' +
      '<div class="admin-book-copy"><strong>' + escapeHtml(book.title) + '</strong>' +
      '<span class="muted">' + escapeHtml(book.author) + ' · ' + adminStatusLabel(book.publication_status) + '</span></div>' +
      '<button class="button button-quiet" type="button" data-edit-book="' + escapeHtml(book.id) + '">ویرایش</button>' +
    '</article>'
  ).join("");
}
async function loadAdminBooks() {
  if (!state.session || state.profile?.role !== "admin") return;
  const target = $("#adminBookList");
  target.innerHTML = '<p class="muted">در حال دریافت فهرست کتاب‌ها…</p>';
  const { data, error } = await supabase.from("books")
    .select("id,slug,title,author,description,category,cover_url,content_url,content_path,content_mime_type,content_size_bytes,license_name,license_url,source_url,attribution,publication_status,published_at,updated_at")
    .order("updated_at", { ascending: false });
  if (error) {
    target.innerHTML = '<p class="form-message">دریافت کتاب‌ها انجام نشد. سطح دسترسی مدیر را بررسی کن.</p>';
    console.error("FreeBook admin books:", error);
    return;
  }
  state.adminBooks = data || [];
  renderAdminBooks();
}
function resetAdminForm() {
  state.editingBookId = null;
  $("#bookAdminForm").reset();
  $("#adminBookId").value = "";
  $("#bookFileStatus").textContent = "فقط PDF یا TXT، حداکثر ۵۰ مگابایت";
  $("#adminFormTitle").textContent = "افزودن کتاب تازه";
  $("#adminSaveButton").textContent = "ذخیره کتاب";
  showMessage($("#adminMessage"), "فایل را مستقیم و امن در فضای ذخیره‌سازی FreeBook بارگذاری کن.");
}
function fillAdminForm(book) {
  state.editingBookId = book.id;
  $("#adminBookId").value = book.id;
  $("#bookSlug").value = book.slug || "";
  $("#bookTitle").value = book.title || "";
  $("#bookAuthor").value = book.author || "";
  $("#bookCategory").value = book.category || "ادبیات";
  $("#bookDescription").value = book.description || "";
  $("#bookCoverUrl").value = book.cover_url || "";
  $("#bookContentUrl").value = book.content_url || "";
  $("#bookLicense").value = book.license_name || "";
  $("#bookLicenseUrl").value = book.license_url || "";
  $("#bookSourceUrl").value = book.source_url || "";
  $("#bookAttribution").value = book.attribution || "";
  $("#bookFileStatus").textContent = book.content_path ? "فایل فعلی: " + book.content_path : "هنوز فایلی بارگذاری نشده است."; 
  $("#bookStatus").value = book.publication_status || "draft";
  $("#adminFormTitle").textContent = "ویرایش کتاب";
  $("#adminSaveButton").textContent = "ذخیره تغییرات";
  showMessage($("#adminMessage"), "وضعیت فعلی: " + adminStatusLabel(book.publication_status));
  $("#bookTitle").focus();
}
async function openAdminPanel() {
  if (!state.session || state.profile?.role !== "admin") {
    toast("دسترسی این بخش فقط برای مدیران فعال است.");
    return;
  }
  resetAdminForm();
  $("#adminDialog").showModal();
  await loadAdminBooks();
}
async function saveAdminBook(event) {
  event.preventDefault();
  if (!state.session || state.profile?.role !== "admin") {
    return showMessage($("#adminMessage"), "اجازه انجام این عملیات را نداری.", true);
  }
  const value = (id) => $("#" + id).value.trim();
  const file = $("#bookFile").files?.[0] || null;
  const title = value("bookTitle");
  const author = value("bookAuthor");
  const sourceUrl = safeHttpsUrl(value("bookSourceUrl"));
  const licenseUrlValue = value("bookLicenseUrl");
  const coverUrlValue = value("bookCoverUrl");
  const contentUrlValue = value("bookContentUrl");
  const licenseUrl = licenseUrlValue ? safeHttpsUrl(licenseUrlValue) : null;
  const coverUrl = coverUrlValue ? safeHttpsUrl(coverUrlValue) : null;
  const contentUrl = contentUrlValue ? safeHttpsUrl(contentUrlValue) : null;
  const desiredStatus = value("bookStatus");
  const existing = state.adminBooks.find((book) => book.id === state.editingBookId);
  if (!title || !author) return showMessage($("#adminMessage"), "عنوان و نام نویسنده را کامل وارد کن.", true);
  if (!sourceUrl) return showMessage($("#adminMessage"), "نشانی منبع باید یک لینک معتبر HTTPS باشد.", true);
  if (licenseUrlValue && !licenseUrl) return showMessage($("#adminMessage"), "لینک مجوز باید HTTPS باشد.", true);
  if (coverUrlValue && !coverUrl) return showMessage($("#adminMessage"), "لینک جلد باید HTTPS باشد.", true);
  if (contentUrlValue && !contentUrl) return showMessage($("#adminMessage"), "لینک فایل کتاب باید HTTPS باشد.", true);
  if (file) {
    const allowed = file.type === "application/pdf" || file.type === "text/plain" || /\.(pdf|txt)$/i.test(file.name);
    if (!allowed) return showMessage($("#adminMessage"), "فقط فایل PDF یا TXT مجاز است.", true);
    if (file.size > MAX_BOOK_FILE_SIZE) return showMessage($("#adminMessage"), "حجم فایل نباید بیشتر از ۵۰ مگابایت باشد.", true);
  }
  if (desiredStatus === "published" && !file && !existing?.content_path && !contentUrl) {
    return showMessage($("#adminMessage"), "برای انتشار، فایل PDF/TXT یا لینک HTTPS کتاب را وارد کن.", true);
  }
  if (!value("bookLicense") || !value("bookAttribution")) {
    return showMessage($("#adminMessage"), "نام مجوز و اطلاعات انتساب اثر الزامی است.", true);
  }
  const payload = {
    slug: value("bookSlug") || (existing?.slug || ("book-" + crypto.randomUUID())),
    title,
    author,
    category: value("bookCategory"),
    description: value("bookDescription"),
    cover_url: coverUrl,
    content_url: file ? null : contentUrl,
    content_path: existing?.content_path || null,
    content_mime_type: existing?.content_mime_type || null,
    content_size_bytes: existing?.content_size_bytes || null,
    license_name: value("bookLicense"),
    license_url: licenseUrl,
    source_url: sourceUrl,
    attribution: value("bookAttribution"),
    publication_status: desiredStatus,
    published_at: desiredStatus === "published" ? (existing?.published_at || new Date().toISOString()) : null
  };
  const button = $("#adminSaveButton");
  button.disabled = true;
  let bookId = state.editingBookId;
  let uploadedPath = null;
  try {
    showMessage($("#adminMessage"), "در حال ذخیره اطلاعات کتاب…");
    if (!bookId) {
      const insertPayload = { ...payload, publication_status: file ? "draft" : desiredStatus, published_at: file ? null : payload.published_at };
      const { data, error } = await supabase.from("books").insert(insertPayload).select("id").single();
      if (error) throw error;
      bookId = data.id;
    }
    if (file) {
      const extension = file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? "pdf" : "txt";
      uploadedPath = bookId + "/" + crypto.randomUUID() + "." + extension;
      showMessage($("#adminMessage"), "در حال بارگذاری فایل در فضای امن…");
      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(uploadedPath, file, {
        cacheControl: "3600",
        contentType: extension === "pdf" ? "application/pdf" : "text/plain",
        upsert: false
      });
      if (uploadError) throw uploadError;
      payload.content_path = uploadedPath;
      payload.content_mime_type = extension === "pdf" ? "application/pdf" : "text/plain";
      payload.content_size_bytes = file.size;
    }
    if (state.editingBookId || file) {
      const { error } = await supabase.from("books").update(payload).eq("id", bookId);
      if (error) throw error;
    }
    if (existing?.content_path && uploadedPath && existing.content_path !== uploadedPath) {
      const { error: removeError } = await supabase.storage.from(STORAGE_BUCKET).remove([existing.content_path]);
      if (removeError) console.warn("Old book file cleanup failed:", removeError);
    }
    toast(desiredStatus === "published" ? "کتاب منتشر شد." : desiredStatus === "archived" ? "کتاب بایگانی شد." : "کتاب ذخیره شد.");
    resetAdminForm();
    await Promise.all([loadAdminBooks(), loadBooks()]);
  } catch (error) {
    if (uploadedPath) {
      const { error: cleanupError } = await supabase.storage.from(STORAGE_BUCKET).remove([uploadedPath]);
      if (cleanupError) console.warn("Uploaded file cleanup failed:", cleanupError);
    }
    console.error("FreeBook save book:", error);
    showMessage($("#adminMessage"), error.message || "ذخیره کتاب انجام نشد. دسترسی مدیر و فضای ذخیره‌سازی را بررسی کن.", true);
  } finally {
    button.disabled = false;
  }
}

function initTheme() {
  const saved = localStorage.getItem("freebook-theme");
  if (saved === "dark") document.body.classList.add("dark");
  $("#themeToggle").textContent = document.body.classList.contains("dark") ? "☀" : "☾";
  $("#themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const theme = document.body.classList.contains("dark") ? "dark" : "light";
    localStorage.setItem("freebook-theme", theme);
    $("#themeToggle").textContent = theme === "dark" ? "☀" : "☾";
  });
}
function bindEvents() {
  $("#searchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.query = $("#searchInput").value.trim();
    renderBooks();
  });
  $("#searchInput").addEventListener("input", () => {
    state.query = $("#searchInput").value.trim();
    renderBooks();
  });
  $("#categoryFilters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    renderFilters();
    renderBooks();
  });
  $("#bookGrid").addEventListener("click", (event) => {
    const read = event.target.closest("[data-read]");
    const mark = event.target.closest("[data-bookmark]");
    if (read) openBook(read.dataset.read);
    if (mark) toggleBookmark(mark.dataset.bookmark);
  });
  $("#accountButton").addEventListener("click", () => {
    if (!configured) return toast("برای فعال‌شدن حساب‌ها، ابتدا Supabase را در config.js تنظیم کن.");
    if (state.session) openMyLibrary(); else { setAuthMode("login"); $("#authDialog").showModal(); }
  });
  $("#myLibraryButton").addEventListener("click", openMyLibrary);
  $("#adminButton").addEventListener("click", openAdminPanel);
  $("#bookAdminForm").addEventListener("submit", saveAdminBook);
  $("#resetBookForm").addEventListener("click", resetAdminForm);
  $("#adminBookList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-book]");
    if (!button) return;
    const book = state.adminBooks.find((item) => item.id === button.dataset.editBook);
    if (book) fillAdminForm(book);
  });
  $("#authForm").addEventListener("submit", submitAuth);
  document.querySelectorAll(".auth-tab").forEach((tab) => tab.addEventListener("click", () => setAuthMode(tab.dataset.mode)));
  $("#signOutButton").addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();
    if (error) return toast("خروج از حساب انجام نشد.");
    $("#accountDialog").close();
    toast("با موفقیت خارج شدی.");
  });
  $("#markComplete").addEventListener("click", markComplete);
  $("#readerFrameWrap").addEventListener("click", async (event) => {
    if (!state.pdfDocument) return;
    if (event.target.closest("#pdfPrev") && state.pdfPage > 1) {
      state.pdfPage -= 1;
      await renderPdfPage();
    }
    if (event.target.closest("#pdfNext") && state.pdfPage < state.pdfDocument.numPages) {
      state.pdfPage += 1;
      await renderPdfPage();
    }
  });
  $("#progressBooks").addEventListener("click", (event) => {
    const button = event.target.closest("[data-resume]");
    if (button) openBook(button.dataset.resume);
  });
  $("#bookFile").addEventListener("change", () => {
    const file = $("#bookFile").files?.[0];
    $("#bookFileStatus").textContent = file ? file.name + " · " + Math.ceil(file.size / 1024) + " کیلوبایت" : "فقط PDF یا TXT، حداکثر ۵۰ مگابایت";
  });
}
async function init() {
  initTheme();
  bindEvents();
  renderFilters();
  if (!configured) {
    await loadBooks();
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  state.session = session;
  await Promise.all([loadBooks(), loadProfile()]);
  supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    window.setTimeout(() => loadProfile(), 0);
  });
}
init().catch((error) => {
  console.error("FreeBook initialization failed:", error);
  $("#bookGrid").innerHTML = '<div class="state-card">راه‌اندازی با خطا روبه‌رو شد. تنظیمات پروژه را بررسی کن.</div>';
});
