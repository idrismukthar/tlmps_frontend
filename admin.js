import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";

const config = window.TLMPS_SUPABASE;
if (!config?.url || !config?.publishableKey) {
  throw new Error("Supabase configuration is missing. Run the Netlify build or generate-config script.");
}

const supabase = createClient(config.url, config.publishableKey);
const loginPanel = document.getElementById("login-panel");
const dashboardPanel = document.getElementById("dashboard-panel");
const loginMessage = document.getElementById("login-message");
const dashboardMessage = document.getElementById("dashboard-message");
const postForm = document.getElementById("post-form");
const postsList = document.getElementById("posts-list");

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `message ${type}`;
}

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function showDashboard() {
  loginPanel.hidden = true;
  dashboardPanel.hidden = false;
  loadPosts();
}

function resetForm() {
  postForm.reset();
  document.getElementById("post-id").value = "";
  document.getElementById("cancel-edit").hidden = true;
}

async function verifyAdmin(user) {
  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data?.is_admin === true;
}

async function loadPosts() {
  const { data, error } = await supabase
    .from("posts")
    .select("id, title, category, status, published_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) {
    setMessage(dashboardMessage, error.message, "error");
    return;
  }
  postsList.replaceChildren();
  if (!data.length) {
    postsList.textContent = "No posts yet. Create your first story above.";
    return;
  }
  data.forEach((post) => {
    const row = document.createElement("article");
    row.className = "post-row";
    const details = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = post.title;
    const meta = document.createElement("p");
    meta.textContent = `${post.category} · ${post.status}`;
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
  document.getElementById("post-content").value = data.content;
  document.getElementById("post-image").value = data.image_url || "";
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
  const { data: { user } } = await supabase.auth.getUser();
  const payload = {
    title: document.getElementById("post-title").value.trim(),
    slug: slugify(document.getElementById("post-title").value),
    category: document.getElementById("post-category").value,
    excerpt: document.getElementById("post-excerpt").value.trim(),
    content: document.getElementById("post-content").value.trim(),
    image_url: document.getElementById("post-image").value.trim() || null,
    status,
    author_id: user.id
  };
  const id = document.getElementById("post-id").value;
  const request = id
    ? supabase.from("posts").update(payload).eq("id", id)
    : supabase.from("posts").insert(payload);
  const { error } = await request;
  if (error) {
    setMessage(dashboardMessage, error.message, "error");
    return;
  }
  setMessage(dashboardMessage, status === "published" ? "Post published." : "Draft saved.", "success");
  resetForm();
  loadPosts();
});

document.getElementById("cancel-edit").addEventListener("click", resetForm);
document.getElementById("logout-button").addEventListener("click", async () => {
  await supabase.auth.signOut();
  dashboardPanel.hidden = true;
  loginPanel.hidden = false;
});

const { data: { session } } = await supabase.auth.getSession();
if (session && await verifyAdmin(session.user)) showDashboard();
