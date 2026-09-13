import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";

const config = window.TLMPS_SUPABASE;
if (!config?.url || !config?.publishableKey) {
  throw new Error("Supabase configuration is missing. Run the Netlify build or generate-config script.");
}

const supabase = createClient(config.url, config.publishableKey);
const postsContainer = document.querySelector(".posts");
const featured = document.querySelector(".featured");
const defaultPostImage = "tlmps_llogo.png";

function formatDate(date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(date));
}

function articleUrl(post) {
  return `article.html?slug=${encodeURIComponent(post.slug)}`;
}

function postCard(post) {
  const article = document.createElement("article");
  article.className = "post";
  const image = document.createElement("img");
  image.src = post.image_url || defaultPostImage;
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
  const link = document.createElement("a");
  link.className = "read-more";
  link.href = articleUrl(post);
  link.textContent = "Read the story ";
  const icon = document.createElement("i");
  icon.className = "fas fa-arrow-right";
  link.append(icon);
  copy.append(tag, title, excerpt, meta, link);
  article.append(image, copy);
  return article;
}

function renderFeatured(post) {
  if (!post || !featured) return;
  featured.querySelector("img").src = post.image_url || defaultPostImage;
  featured.querySelector("img").alt = post.title;
  featured.querySelector(".tag").textContent = `${post.category} · Featured`;
  featured.querySelector("h3").textContent = post.title;
  featured.querySelector("p").textContent = post.excerpt;
  featured.querySelector(".meta").textContent = post.published_at ? formatDate(post.published_at) : "";
  const readMore = featured.querySelector(".read-more");
  readMore.href = articleUrl(post);
}

async function loadPublishedPosts() {
  const { data, error } = await supabase
    .from("posts")
    .select("id, title, slug, excerpt, image_url, category, published_at")
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
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

function setupNotificationPrompt() {
  const prompt = document.getElementById("notification-prompt");
  const enableButton = document.getElementById("enable-notifications");
  const laterButton = document.getElementById("later-notifications");
  const dismissButton = document.getElementById("dismiss-notification-prompt");
  const status = document.getElementById("notification-status");
  const preferenceKey = "tlmps-notification-preference";
  if (!prompt || localStorage.getItem(preferenceKey) === "enabled") return;

  const laterUntil = Number(localStorage.getItem("tlmps-notification-later-until") || 0);
  if (laterUntil > Date.now()) return;
  prompt.hidden = false;

  function closePrompt() {
    prompt.hidden = true;
    status.textContent = "";
  }

  prompt.addEventListener("click", (event) => {
    const target = event.target.closest("#dismiss-notification-prompt, #later-notifications");
    if (target) closePrompt();
  });

  function postpone() {
    localStorage.setItem("tlmps-notification-later-until", String(Date.now() + 14 * 24 * 60 * 60 * 1000));
    closePrompt();
  }

  laterButton.addEventListener("click", postpone);
  dismissButton.addEventListener("click", postpone);
  enableButton.addEventListener("click", async () => {
    closePrompt();
    if (!("Notification" in window)) {
      return;
    }
    enableButton.disabled = true;
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      localStorage.setItem(preferenceKey, "enabled");
      localStorage.removeItem("tlmps-notification-later-until");
    } else if (permission === "denied") {
      enableButton.disabled = false;
    } else {
      enableButton.disabled = false;
    }
  });
}

window.toggleMenu = toggleMenu;
window.subscribe = subscribe;
document.getElementById("current-year").textContent = new Date().getFullYear();
setupNotificationPrompt();
loadPublishedPosts();
