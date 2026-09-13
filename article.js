import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";

const config = window.TLMPS_SUPABASE;
if (!config?.url || !config?.publishableKey) {
  throw new Error("Supabase configuration is missing. Run the Netlify build or generate-config script.");
}

const supabase = createClient(config.url, config.publishableKey);
const articleContent = document.getElementById("article-content");
const params = new URLSearchParams(window.location.search);
const slug = params.get("slug");
const isPreview = params.get("preview") === "1";
const defaultPostImage = "tlmps_llogo.png";

function formatDate(date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(date));
}

function readingTime(content) {
  return Math.max(1, Math.ceil(content.trim().split(/\s+/).length / 250));
}

function showMessage(message) {
  articleContent.replaceChildren();
  const status = document.createElement("p");
  status.className = "article-status";
  status.textContent = message;
  articleContent.append(status);
}

function renderRichText(value) {
  const escaped = value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
  return escaped
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/^(?:- .+(?:\n|$))+?/gm, (block) => {
      const items = block.trim().split("\n").map((line) => `<li>${line.slice(2)}</li>`).join("");
      return `<ul>${items}</ul>`;
    })
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

function sanitizeArticleHtml(value) {
  const documentFragment = new DOMParser().parseFromString(value, "text/html");
  const allowedTags = new Set(["P", "DIV", "BR", "H2", "H3", "STRONG", "EM", "U", "UL", "OL", "LI", "A", "FONT"]);
  documentFragment.body.querySelectorAll("*").forEach((element) => {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      return;
    }
    [...element.attributes].forEach((attribute) => {
      const allowedAttribute = ["face", "size"].includes(attribute.name)
        || (element.tagName === "A" && attribute.name === "href");
      if (!allowedAttribute) element.removeAttribute(attribute.name);
    });
    if (element.tagName === "A") {
      const href = element.getAttribute("href") || "";
      if (!/^https?:\/\//i.test(href)) element.removeAttribute("href");
      else {
        element.target = "_blank";
        element.rel = "noopener";
      }
    }
  });
  return documentFragment.body.innerHTML;
}

function renderArticle(post) {
  document.title = `${post.title} | The Leaders Memorial Private School`;
  updateSocialMetadata(post);
  articleContent.replaceChildren();

  const header = document.createElement("header");
  header.className = "article-header";
  const tag = document.createElement("div");
  tag.className = "tag";
  tag.textContent = post.category;
  const title = document.createElement("h1");
  title.textContent = post.title;
  const timestamp = document.createElement("time");
  timestamp.className = "article-timestamp";
  timestamp.dateTime = post.published_at || "";
  timestamp.textContent = post.published_at ? formatDateTime(post.published_at) : "Recently published";
  header.append(tag, title, timestamp);

  const media = document.createElement("figure");
  media.className = "article-media";
  const image = document.createElement("img");
  image.className = "article-hero";
  image.src = post.image_url || defaultPostImage;
  image.alt = post.image_url ? post.title : "The Leaders Memorial Private School logo";
  const caption = document.createElement("figcaption");
  caption.className = "media-caption";
  const captionText = document.createElement("span");
  captionText.textContent = image.alt;
  caption.append(captionText);
  media.append(image, caption);

  const copy = document.createElement("div");
  copy.className = "article-copy";
  const byline = document.createElement("div");
  byline.className = "article-byline";
  const reading = readingTime(post.content);
  const authorText = post.author_name ? `By ${post.author_name}` : "By TLMPS Editorial Team";
  byline.textContent = `${authorText} · ${reading} min read`;
  const excerpt = document.createElement("p");
  excerpt.className = "article-excerpt";
  excerpt.textContent = post.excerpt;
  const body = document.createElement("div");
  body.className = "article-body";
  const hasEditorHtml = /<\s*(p|div|h2|strong|em|ul|ol|a|font)\b/i.test(post.content);
  body.innerHTML = hasEditorHtml
    ? sanitizeArticleHtml(post.content)
    : `<p>${renderRichText(post.content)}</p>`;
  const shareBar = createShareBar(post);
  copy.append(byline, shareBar, excerpt, body);
  renderGallery(copy, post.gallery_urls);
  renderVideo(copy, post.video_url);
  loadRelatedPosts(copy, post);
  articleContent.append(header, media, copy);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeStyle: "short"
  }).format(new Date(date));
}

function updateSocialMetadata(post) {
  const imageUrl = new URL(post.image_url || defaultPostImage, window.location.href).href;
  const values = {
    "og:url": window.location.href,
    "og:title": post.title,
    "og:description": post.excerpt,
    "og:image": imageUrl,
    "twitter:image": imageUrl
  };
  Object.entries(values).forEach(([property, content]) => {
    const selector = property.startsWith("twitter:") ? `meta[name="${property}"]` : `meta[property="${property}"]`;
    const element = document.querySelector(selector);
    if (element) element.setAttribute("content", content);
  });
}

function createShareBar(post) {
  const bar = document.createElement("div");
  bar.className = "share-bar";
  const label = document.createElement("span");
  label.className = "share-label";
  label.textContent = "Share";
  bar.append(label);
  const encodedUrl = encodeURIComponent(window.location.href);
  const encodedTitle = encodeURIComponent(post.title);
  const links = [
    ["share-telegram", "fa-telegram", `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`],
    ["share-x", "fa-x-twitter", `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`],
    ["share-facebook", "fa-facebook-f", `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`],
    ["share-whatsapp", "fa-whatsapp", `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`],
    ["share-linkedin", "fa-linkedin-in", `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`],
    ["share-reddit", "fa-reddit-alien", `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`]
  ];
  links.forEach(([colorClass, iconClass, url]) => {
    const link = document.createElement("a");
    link.className = `share-icon ${colorClass}`;
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.setAttribute("aria-label", `Share on ${colorClass.replace("share-", "")}`);
    if (iconClass === "fa-x-twitter") {
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.classList.add("x-share-mark");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("aria-hidden", "true");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817-5.964 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z");
      path.setAttribute("fill", "currentColor");
      icon.append(path);
      link.append(icon);
    } else {
      const icon = document.createElement("i");
      icon.className = `fab ${iconClass}`;
      link.append(icon);
    }
    bar.append(link);
  });
  return bar;
}

function renderGallery(container, urls = []) {
  if (!urls.length) return;
  const gallery = document.createElement("div");
  gallery.className = "article-gallery";
  urls.forEach((url) => {
    const image = document.createElement("img");
    image.src = url;
    image.alt = "Additional photo from this TLMPS story";
    gallery.append(image);
  });
  container.append(gallery);
}

function renderVideo(container, url) {
  if (!url) return;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^?&/]+)/);
  if (!match) return;
  const iframe = document.createElement("iframe");
  iframe.className = "article-video";
  iframe.src = `https://www.youtube.com/embed/${match[1]}`;
  iframe.title = "TLMPS story video";
  iframe.loading = "lazy";
  iframe.allowFullscreen = true;
  container.append(iframe);
}

async function loadRelatedPosts(container, currentPost) {
  const { data } = await supabase
    .from("posts")
    .select("title, slug, category")
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .eq("category", currentPost.category)
    .neq("slug", currentPost.slug)
    .order("published_at", { ascending: false })
    .limit(3);
  if (!data?.length) return;
  const related = document.createElement("section");
  related.className = "related-stories";
  const heading = document.createElement("h2");
  heading.textContent = "Related stories";
  related.append(heading);
  data.forEach((post) => {
    const link = document.createElement("a");
    link.href = `article.html?slug=${encodeURIComponent(post.slug)}`;
    link.textContent = post.title;
    related.append(link);
  });
  container.append(related);
}

async function loadArticle() {
  if (isPreview) {
    const savedPreview = sessionStorage.getItem("tlmps-article-preview");
    if (!savedPreview) {
      showMessage("This preview is no longer available. Return to the editor and try again.");
      return;
    }
    try {
      renderArticle(JSON.parse(savedPreview));
    } catch {
      showMessage("The article preview could not be opened.");
    }
    return;
  }
  if (!slug) {
    showMessage("This story link is missing its article address.");
    return;
  }

  const { data, error } = await supabase
    .from("posts")
    .select("title, slug, excerpt, content, image_url, gallery_urls, video_url, author_name, category, published_at")
    .eq("slug", slug)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    showMessage("We could not load this story right now. Please try again.");
    return;
  }
  if (!data) {
    showMessage("This story is unavailable or has not been published.");
    return;
  }
  renderArticle(data);
}

function toggleMenu() {
  const menu = document.getElementById("nav-links");
  const button = document.querySelector(".menu-button");
  const isOpen = menu.classList.toggle("show");
  button.querySelector("span").textContent = isOpen ? "×" : "☰";
  button.setAttribute("aria-expanded", isOpen);
  button.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
}

window.toggleMenu = toggleMenu;
document.getElementById("current-year").textContent = new Date().getFullYear();
loadArticle();
