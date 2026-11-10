import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.FREEBOOK_CONFIG || {};
const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.supabaseUrl || "") &&
  !!config.supabaseAnonKey && !String(config.supabaseAnonKey).includes("YOUR_");
const supabase = configured ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;

const $ = (selector) => document.querySelector(selector);
const state = { session: null, profile: null, books: [], bookmarks: new Set(), category: "all", query: "", authMode: "login", activeBook: null };
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
    .select("id,slug,title,author,description,category,cover_url,content_url,license_name,license_url,source_url,attribution")
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
async function openBook(bookId) {
  const book = state.books.find((item) => item.id === bookId);
  if (!book) return;
  state.activeBook = book;
  $("#readerTitle").textContent = book.title;
  $("#readerMeta").textContent = book.author + " · " + book.license_name;
  const contentUrl = safeHttpsUrl(book.content_url);
  const sourceUrl = safeHttpsUrl(book.source_url);
  $("#readerFrameWrap").innerHTML = contentUrl
    ? '<iframe title="متن کتاب: ' + escapeHtml(book.title) + '" src="' + escapeHtml(contentUrl) + '" loading="lazy" referrerpolicy="no-referrer"></iframe>'
    : '<p class="muted">فایل امن و قابل نمایش برای این کتاب ثبت نشده است.</p>';
  $("#sourceLink").href = sourceUrl || "#";
  $("#sourceLink").hidden = !sourceUrl;
  showMessage($("#readerMessage"), "");
  $("#readerDialog").showModal();
  if (state.session) {
    const { error } = await supabase.from("reading_progress").upsert({
      user_id: state.session.user.id, book_id: book.id, progress_percent: 0
    }, { onConflict: "user_id,book_id", ignoreDuplicates: true });
    if (error) console.warn("Could not initialize reading progress:", error);
  }
}
async function markComplete() {
  if (!state.session || !state.activeBook) {
    toast("برای ذخیره پیشرفت مطالعه وارد حسابت شو.");
    return;
  }
  const { error } = await supabase.from("reading_progress").upsert({
    user_id: state.session.user.id, book_id: state.activeBook.id, progress_percent: 100
  }, { onConflict: "user_id,book_id" });
  if (error) return showMessage($("#readerMessage"), "ذخیره پیشرفت انجام نشد.", true);
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
    '<div class="saved-row"><span>' + escapeHtml(row.books?.title || "کتاب") + '</span><span class="muted">' + Number(row.progress_percent) + "٪</span></div>"
  ).join("") : '<p class="muted">هنوز مطالعه‌ای ثبت نشده است.</p>';
  $("#accountDialog").showModal();
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
    if (state.session) openMyLibrary(); else { setAuthMode("login"); $("#authDialog").showModal(); }
  });
  $("#myLibraryButton").addEventListener("click", openMyLibrary);
  $("#authForm").addEventListener("submit", submitAuth);
  document.querySelectorAll(".auth-tab").forEach((tab) => tab.addEventListener("click", () => setAuthMode(tab.dataset.mode)));
  $("#signOutButton").addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();
    if (error) return toast("خروج از حساب انجام نشد.");
    $("#accountDialog").close();
    toast("با موفقیت خارج شدی.");
  });
  $("#markComplete").addEventListener("click", markComplete);
}
async function init() {
  initTheme();
  bindEvents();
  renderFilters();
  if (!configured) {
    await loadBooks();
    $("#accountButton").addEventListener("click", () => toast("برای فعال‌شدن حساب‌ها، تنظیمات Supabase را در config.js وارد کن."));
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
