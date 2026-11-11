import { getSupabase, STORAGE_BUCKET } from "./supabase-client.js";

const LIKE_DEVICE_KEY = "rosh-portfolio-like-device";
const LIKE_STORAGE_PREFIX = "__likes";
const pageContent = document.getElementById("page-content");
const preloader = document.getElementById("preloader");
const likeButton = document.getElementById("likeBtn");
const countDisplay = document.getElementById("countDisplay");
const likeStatus = document.getElementById("like-status");
const projectSearch = document.getElementById("project-search");
const projectGrid = document.getElementById("project-grid");
const projectCount = document.getElementById("project-count");
const projectsStatus = document.getElementById("projects-status");

function getLikeDeviceId() {
  const userId = localStorage.getItem(LIKE_DEVICE_KEY);
  if (!userId) {
    throw new Error("Sign in before liking the portfolio.");
  }
  return userId;
}

async function fetchLikeState(supabase, deviceId) {
  let offset = 0;
  let total = 0;
  let hasLiked = false;

  while (offset < 5000) {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(LIKE_STORAGE_PREFIX, {
      limit: 1000,
      offset,
    });
    if (error) {
      throw error;
    }

    const likeFiles = (data || []).filter((file) => file.id);
    total += likeFiles.length;
    hasLiked ||= likeFiles.some((file) => file.name === `${deviceId}.txt`);
    if (!data || data.length < 1000) {
      break;
    }
    offset += 1000;
  }

  return { count: total, liked: hasLiked };
}

async function loadLikeCount() {
  try {
    const supabase = await getSupabase();
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      throw error;
    }
    if (!session) {
      return;
    }
    localStorage.setItem(LIKE_DEVICE_KEY, session.user.id);
    const state = await fetchLikeState(supabase, getLikeDeviceId());
    countDisplay.textContent = String(state.count);
    likeButton.setAttribute("aria-pressed", String(state.liked));
    likeButton.disabled = state.liked;
    return state;
  } catch (error) {
    console.error("Could not load portfolio likes:", error);
    likeStatus.textContent = `Likes are temporarily unavailable: ${error.message || "check Supabase Storage policies."}`;
    return null;
  }
}

async function loadProjects() {
  try {
    const response = await fetch("./config.json");
    if (!response.ok) {
      throw new Error(`Project config request failed with status ${response.status}.`);
    }

    const config = await response.json();
    if (!Array.isArray(config.projects) || config.projects.some((project) => (
      typeof project.name !== "string"
      || typeof project.category !== "string"
      || typeof project.description !== "string"
      || typeof project.image !== "string"
      || typeof project.href !== "string"
    ))) {
      throw new Error("Project config must include valid project details.");
    }

    projectCount.textContent = String(config.projects.length).padStart(2, "0");
    projectGrid.replaceChildren(...config.projects.map((project, index) => {
      const card = document.createElement("a");
      card.className = "project-card";
      card.href = project.href;
      card.dataset.search = `${project.name} ${project.category} ${project.description}`.toLowerCase();
      if (/^https?:\/\//i.test(project.href)) {
        card.target = "_blank";
        card.rel = "noopener noreferrer";
      }

      const image = document.createElement("img");
      image.className = "project-image";
      image.src = project.image;
      image.alt = project.imageAlt || `${project.name} project preview`;
      image.loading = "lazy";

      const category = document.createElement("span");
      category.className = "project-index";
      category.textContent = `${String(index + 1).padStart(2, "0")} / ${project.category}`;

      const title = document.createElement("strong");
      title.textContent = project.name;

      const description = document.createElement("span");
      description.className = "project-description";
      description.textContent = project.description;

      const arrow = document.createElement("span");
      arrow.className = "project-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";

      const details = document.createElement("span");
      details.className = "project-details";
      details.append(category, title, description);
      card.append(image, details, arrow);
      return card;
    }));
    projectsStatus.textContent = "";
    projectSearch.dispatchEvent(new Event("input"));
  } catch (error) {
    console.error("Could not load projects:", error);
    projectsStatus.textContent = `Projects could not be loaded: ${error.message}`;
    projectsStatus.classList.add("error-message");
  }
}

likeButton.addEventListener("click", async () => {
  if (likeButton.disabled) {
    return;
  }
  likeButton.disabled = true;
  likeStatus.textContent = "Saving your like...";

  try {
    const supabase = await getSupabase();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }
    if (!session) {
      likeStatus.textContent = "Sign in through Codebase to like this page.";
      likeButton.disabled = false;
      return;
    }
    localStorage.setItem(LIKE_DEVICE_KEY, session.user.id);
    const deviceId = getLikeDeviceId();
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(
      `${LIKE_STORAGE_PREFIX}/${deviceId}.txt`,
      new Blob(["liked"], { type: "text/plain" }),
      {
        cacheControl: "3600",
        contentType: "text/plain",
        upsert: false,
      },
    );
    if (error && !/already exists|duplicate/i.test(error.message)) {
      throw error;
    }

    const state = await fetchLikeState(supabase, deviceId);
    countDisplay.textContent = String(state.count);
    likeButton.setAttribute("aria-pressed", String(state.liked));
    likeButton.disabled = state.liked;
    likeStatus.textContent = state.liked
      ? error
        ? "This browser has already liked the page."
        : "Thanks for liking the page!"
      : "Like was not recorded. Please try again.";
  } catch (error) {
    console.error("Could not register portfolio like:", error);
    likeStatus.textContent = `Like failed: ${error.message || "Please try again later."}`;
    likeButton.disabled = false;
  }
});

projectSearch.addEventListener("input", () => {
  const query = projectSearch.value.trim().toLowerCase();
  document.querySelectorAll(".project-card").forEach((project) => {
    project.hidden = !project.dataset.search.includes(query);
  });
});

document.getElementById("year").textContent = String(new Date().getFullYear());
pageContent.hidden = false;
loadProjects();
loadLikeCount();
window.setTimeout(() => {
  preloader.classList.add("is-leaving");
  window.setTimeout(() => {
    preloader.hidden = true;
  }, 320);
}, 350);
