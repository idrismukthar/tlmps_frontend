import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";

const config = window.TLMPS_SUPABASE;
if (!config?.url || !config?.publishableKey) {
  throw new Error("Supabase configuration is missing. Run the Netlify build or generate-config script.");
}

const supabase = createClient(config.url, config.publishableKey);
const postsContainer = document.querySelector(".posts");
const featured = document.querySelector(".featured");

function formatDate(date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(date));
}

function postCard(post) {
  const article = document.createElement("article");
  article.className = "post";
  const image = document.createElement("img");
  image.src = post.image_url || "img/hero.jpg";
  image.alt = post.title;
  const copy = document.createElement("div");
  copy.className = "post-copy";
  const tag = document.createElement("div");
  tag.className = "tag";
  tag.textContent = post.category;
  const title = document.createElement("h3");
  title.textContent = post.title;
  const excerpt = document.createElement("p");
  excerpt.textContent = post.excerpt;
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = post.published_at ? formatDate(post.published_at) : "";
  copy.append(tag, title, excerpt, meta);
  article.append(image, copy);
  return article;
}

function renderFeatured(post) {
  if (!post || !featured) return;
  featured.querySelector("img").src = post.image_url || "img/hero.jpg";
  featured.querySelector("img").alt = post.title;
  featured.querySelector(".tag").textContent = `${post.category} · Featured`;
  featured.querySelector("h3").textContent = post.title;
  featured.querySelector("p").textContent = post.excerpt;
  featured.querySelector(".meta").textContent = post.published_at ? formatDate(post.published_at) : "";
}

async function loadPublishedPosts() {
  const { data, error } = await supabase
    .from("posts")
    .select("id, title, excerpt, image_url, category, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error || !data?.length) return;
  renderFeatured(data[0]);
  postsContainer.replaceChildren(...data.slice(1).map(postCard));
}

function toggleMenu() {
  const menu = document.getElementById("nav-links");
  const button = document.querySelector(".menu-button");
  const isOpen = menu.classList.toggle("show");
  button.querySelector("span").textContent = isOpen ? "×" : "☰";
  button.setAttribute("aria-expanded", isOpen);
  button.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
}

function subscribe(event) {
  event.preventDefault();
  const button = event.target.querySelector("button");
  button.textContent = "You are subscribed!";
  button.disabled = true;
  return false;
}

window.toggleMenu = toggleMenu;
window.subscribe = subscribe;
document.getElementById("current-year").textContent = new Date().getFullYear();
loadPublishedPosts();
