import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";

const config = window.TLMPS_SUPABASE;
if (!config?.url || !config?.publishableKey) {
  throw new Error("Supabase configuration is missing. Run the Netlify build or generate-config script.");
}

let supabase = createClient(config.url, config.publishableKey);
let defaultAuthorName = "";
let currentUser = null;
let allPosts = [];
let activePostFilter = "all";
const loginPanel = document.getElementById("login-panel");
const dashboardPanel = document.getElementById("dashboard-panel");
const loginMessage = document.getElementById("login-message");
const dashboardMessage = document.getElementById("dashboard-message");
const postForm = document.getElementById("post-form");
const postsList = document.getElementById("posts-list");
const preview = document.getElementById("post-preview");
const contentEditor = document.getElementById("preview-content");
let savedEditorRange = null;

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `message ${type}`;
}

function editorText() {
  return contentEditor.innerText.trim();
}

function updatePreview() {
  document.getElementById("preview-title").textContent =
    document.getElementById("post-title").value.trim() || "Your article title";
  document.getElementById("preview-category").textContent =
    document.getElementById("post-category").value;
  document.getElementById("preview-excerpt").textContent =
    document.getElementById("post-excerpt").value.trim() || "Your short summary will appear here.";
  document.getElementById("preview-author").textContent =
    document.getElementById("post-author").value.trim() || "TLMPS Editorial Team";
  const previewImage = preview.querySelector("img");
  previewImage.src = document.getElementById("post-image").value.trim() || "tlmps_llogo.png";
}

function formatAdminDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value)).replace(",", " ·");
}

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function createUniqueSlug(title, postId = "") {
  const baseSlug = slugify(title);
  if (!baseSlug) throw new Error("Please enter a title before saving the post.");

  const { data, error } = await supabase
    .from("posts")
    .select("id, slug")
    .ilike("slug", `${baseSlug}%`);
  if (error) throw error;

  const usedSlugs = new Set(
    data.filter((post) => post.id !== postId).map((post) => post.slug)
  );
  let slug = baseSlug;
  let suffix = 2;
  while (usedSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

function showDashboard() {
  loginPanel.hidden = true;
  dashboardPanel.hidden = false;
}

function resetForm() {
  postForm.reset();
  contentEditor.replaceChildren();
  document.getElementById("post-id").value = "";
  document.getElementById("post-author").value = defaultAuthorName;
  document.getElementById("post-scheduled-at").value = "";
  document.getElementById("cancel-edit").hidden = true;
  updatePreview();
}

function configureAuthPersistence(rememberMe) {
  supabase = createClient(config.url, config.publishableKey, {
    auth: { persistSession: rememberMe }
  });
}

async function getAdminProfile(user) {
  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin, display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function verifyAdmin(user) {
  currentUser = user;
  const profile = await getAdminProfile(user);
  if (profile?.is_admin === true) {
    defaultAuthorName = profile.display_name?.trim() || user.email || "TLMPS Editorial Team";
    document.getElementById("post-author").value = defaultAuthorName;
    document.getElementById("profile-name").textContent = defaultAuthorName;
    document.getElementById("profile-email").textContent = user.email || "";
    document.querySelector(".profile-avatar").textContent = defaultAuthorName.charAt(0).toUpperCase();
    document.querySelector(".profile-avatar-large").textContent = defaultAuthorName.charAt(0).toUpperCase();
  }
  return profile?.is_admin === true;
}

async function loadPosts() {
  const { data, error } = await supabase
    .from("posts")
    .select("id, title, category, status, scheduled_at, published_at, updated_at")
    .eq("author_id", currentUser.id)
    .order("updated_at", { ascending: false });
  if (error) {
    setMessage(dashboardMessage, error.message, "error");
    return;
  }
  allPosts = data || [];
  renderPosts(activePostFilter);
}

function renderPosts(status) {
  activePostFilter = status;
  postsList.replaceChildren();
  const counts = {
    all: allPosts.length,
    draft: allPosts.filter((post) => post.status === "draft").length,
    published: allPosts.filter((post) => post.status === "published").length,
    scheduled: allPosts.filter((post) => post.status === "scheduled").length
  };
  Object.entries(counts).forEach(([key, value]) => {
    document.getElementById(`count-${key}`).textContent = value;
  });
  const posts = status === "all" ? allPosts : allPosts.filter((post) => post.status === status);
  if (!posts.length) {
    postsList.textContent = status === "all"
      ? "You have not created any posts yet."
      : `You have no ${status} posts.`;
    return;
  }
  posts.forEach((post) => {
    const row = document.createElement("article");
    row.className = "post-row";
    const details = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = post.title;
    const meta = document.createElement("p");
    const schedule = post.status === "scheduled" && post.scheduled_at
      ? ` · ${formatAdminDate(post.scheduled_at)}`
      : "";
    meta.textContent = `${post.category} · ${post.status}${schedule}`;
    details.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "row-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => editPost(post.id));
    const remove = document.createElement("button");
    remove.className = "danger";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => deletePost(post.id));
    actions.append(edit, remove);
    row.append(details, actions);
    postsList.append(row);
  });
}

async function editPost(id) {
  const { data, error } = await supabase.from("posts").select("*").eq("id", id).single();
  if (error) {
    setMessage(dashboardMessage, error.message, "error");
    return;
  }
  document.getElementById("post-id").value = data.id;
  document.getElementById("post-title").value = data.title;
  document.getElementById("post-category").value = data.category;
  document.getElementById("post-excerpt").value = data.excerpt;
  if (/<\s*(p|div|h2|strong|em|ul|ol|a|font)\b/i.test(data.content)) {
    contentEditor.innerHTML = data.content;
  } else {
    contentEditor.textContent = data.content;
  }
  document.getElementById("post-image").value = data.image_url || "";
  document.getElementById("post-gallery").value = (data.gallery_urls || []).join("\n");
  document.getElementById("post-video").value = data.video_url || "";
  document.getElementById("post-author").value = data.author_name || "";
  if (!data.author_name) document.getElementById("post-author").value = defaultAuthorName;
  document.getElementById("post-scheduled-at").value = data.scheduled_at
    ? toLocalDateTimeValue(data.scheduled_at)
    : "";
  updatePreview();
  document.getElementById("cancel-edit").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deletePost(id) {
  if (!window.confirm("Delete this post permanently?")) return;
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) {
    setMessage(dashboardMessage, error.message, "error");
    return;
  }
  setMessage(dashboardMessage, "Post deleted.", "success");
  loadPosts();
}

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginMessage, "Signing in...");
  configureAuthPersistence(document.getElementById("remember-me").checked);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: document.getElementById("login-email").value,
    password: document.getElementById("login-password").value
  });
  if (error) {
    setMessage(loginMessage, error.message, "error");
    return;
  }
  try {
    if (!(await verifyAdmin(data.user))) {
      await supabase.auth.signOut();
      throw new Error("This account is not approved as a TLMPS administrator.");
    }
    showDashboard();
  } catch (error) {
    setMessage(loginMessage, error.message, "error");
  }
});

postForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = event.submitter.value;
  const scheduledValue = document.getElementById("post-scheduled-at").value;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    setMessage(dashboardMessage, "Your session has expired. Please sign in again.", "error");
    return;
  }
  if (!editorText()) {
    setMessage(dashboardMessage, "Please write some article content before saving.", "error");
    contentEditor.focus();
    return;
  }
  if (status === "scheduled") {
    if (!scheduledValue) {
      setMessage(dashboardMessage, "Choose a date and time before scheduling.", "error");
      return;
    }
    if (new Date(scheduledValue).getTime() <= Date.now()) {
      setMessage(dashboardMessage, "Scheduled publication must be in the future.", "error");
      return;
    }
  }
  const id = document.getElementById("post-id").value;
  let slug;
  try {
    slug = await createUniqueSlug(document.getElementById("post-title").value, id);
  } catch (error) {
    setMessage(dashboardMessage, error.message, "error");
    return;
  }
  const payload = {
    title: document.getElementById("post-title").value.trim(),
    slug,
    category: document.getElementById("post-category").value,
    excerpt: document.getElementById("post-excerpt").value.trim(),
    content: contentEditor.innerHTML.trim(),
    image_url: document.getElementById("post-image").value.trim() || null,
    gallery_urls: document.getElementById("post-gallery").value
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean),
    video_url: document.getElementById("post-video").value.trim() || null,
    author_name: document.getElementById("post-author").value.trim() || null,
    scheduled_at: status === "scheduled" ? new Date(scheduledValue).toISOString() : null,
    status,
    author_id: user.id
  };
  const request = id
    ? supabase.from("posts").update(payload).eq("id", id)
    : supabase.from("posts").insert(payload);
  const { error } = await request;
  if (error) {
    setMessage(dashboardMessage, error.message, "error");
    return;
  }
  const successMessage = status === "published"
    ? "Post published."
    : status === "scheduled"
      ? "Post scheduled."
      : "Draft saved.";
  setMessage(dashboardMessage, successMessage, "success");
  resetForm();
  loadPosts();
});

document.getElementById("cancel-edit").addEventListener("click", resetForm);
document.getElementById("profile-button").addEventListener("click", async () => {
  document.getElementById("post-form").hidden = true;
  document.getElementById("profile-panel").hidden = false;
  await loadPosts();
});
document.getElementById("close-profile-button").addEventListener("click", () => {
  document.getElementById("profile-panel").hidden = true;
  document.getElementById("post-form").hidden = false;
});
document.querySelectorAll(".profile-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".profile-tab").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    renderPosts(tab.dataset.status);
  });
});
document.getElementById("preview-post-button").addEventListener("click", () => {
  if (!document.getElementById("post-title").value.trim() || !editorText()) {
    setMessage(dashboardMessage, "Add a title and article content before previewing.", "error");
    return;
  }
  const previewPost = {
    title: document.getElementById("post-title").value.trim(),
    slug: "local-preview",
    category: document.getElementById("post-category").value,
    excerpt: document.getElementById("post-excerpt").value.trim(),
    content: contentEditor.innerHTML.trim(),
    image_url: document.getElementById("post-image").value.trim() || null,
    gallery_urls: document.getElementById("post-gallery").value.split("\n").map((url) => url.trim()).filter(Boolean),
    video_url: document.getElementById("post-video").value.trim() || null,
    author_name: document.getElementById("post-author").value.trim() || defaultAuthorName,
    published_at: new Date().toISOString()
  };
  sessionStorage.setItem("tlmps-article-preview", JSON.stringify(previewPost));
  window.open("article.html?preview=1", "_blank", "noopener");
});
function toLocalDateTimeValue(value) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function saveEditorSelection() {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (contentEditor.contains(range.commonAncestorContainer)) {
    savedEditorRange = range.cloneRange();
  }
}

function restoreEditorSelection() {
  if (!savedEditorRange) {
    contentEditor.focus();
    return;
  }
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedEditorRange);
  contentEditor.focus();
}

contentEditor.addEventListener("mouseup", saveEditorSelection);
contentEditor.addEventListener("keyup", saveEditorSelection);
contentEditor.addEventListener("blur", saveEditorSelection);
document.querySelectorAll(".format-button").forEach((button) => {
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    restoreEditorSelection();
    if (button.dataset.command === "createLink") {
      const url = window.prompt("Enter the full link URL:");
      if (url) document.execCommand("createLink", false, url);
    } else {
      document.execCommand(button.dataset.command, false, button.dataset.value || null);
    }
    updatePreview();
  });
});

document.getElementById("format-font").addEventListener("change", (event) => {
  restoreEditorSelection();
  if (event.target.value) document.execCommand("fontName", false, event.target.value);
  updatePreview();
});

document.getElementById("format-size").addEventListener("change", (event) => {
  restoreEditorSelection();
  if (event.target.value) document.execCommand("fontSize", false, event.target.value);
  updatePreview();
});

postForm.querySelectorAll("input, textarea, select").forEach((field) => {
  field.addEventListener("input", updatePreview);
  field.addEventListener("change", updatePreview);
});
contentEditor.addEventListener("input", () => {
  saveEditorSelection();
  updatePreview();
});

document.getElementById("logout-button").addEventListener("click", async () => {
  await supabase.auth.signOut();
  dashboardPanel.hidden = true;
  loginPanel.hidden = false;
});

const { data: { session } } = await supabase.auth.getSession();
if (session && await verifyAdmin(session.user)) showDashboard();
