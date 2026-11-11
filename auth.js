import { getSupabase, STORAGE_BUCKET } from "./supabase-client.js";

const formPanel = document.getElementById("auth-form-panel");
const signedInPanel = document.getElementById("signed-in-panel");
const emailForm = document.getElementById("email-auth-form");
const emailInput = document.getElementById("auth-email");
const passwordInput = document.getElementById("auth-password");
const submitButton = document.getElementById("email-submit");
const status = document.getElementById("auth-status");
const runtimeNote = document.getElementById("auth-runtime-note");
const signInMode = document.getElementById("sign-in-mode");
const signUpMode = document.getElementById("sign-up-mode");
const googleButton = document.getElementById("google-sign-in");
const googleSetupStatus = document.getElementById("google-setup-status");
const signOutButton = document.getElementById("sign-out");
const accountStatus = document.getElementById("account-status");
const accountEmail = document.getElementById("auth-user-email");
const accountAvatar = document.getElementById("auth-user-avatar");
const accountAvatarPlaceholder = document.getElementById("auth-user-avatar-placeholder");
const avatarPicker = document.getElementById("auth-avatar-picker");
const avatarFileInput = document.getElementById("auth-avatar-file");
const profileForm = document.getElementById("profile-form");
const displayNameInput = document.getElementById("auth-display-name");
const saveProfileButton = document.getElementById("save-profile");
const continueLink = document.getElementById("continue-link");

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const validDestinations = new Set(["database.html"]);
const requestedDestination = new URLSearchParams(window.location.search).get("next");
const destination = validDestinations.has(requestedDestination) ? requestedDestination : "database.html";
const isLocalFile = window.location.protocol === "file:";
let authMode = "signin";

continueLink.href = `./${destination}`;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error-message", isError);
}

function safeRedirectUrl(next = "auth.html") {
  const redirect = new URL(`./${next}`, window.location.href);
  redirect.searchParams.set("next", destination);
  return redirect.href;
}

function showSignedIn(user) {
  formPanel.hidden = true;
  signedInPanel.hidden = false;
  accountEmail.textContent = user.email || "Signed-in account";
  displayNameInput.value = user.user_metadata?.full_name || (user.email || "User").split("@")[0];
  document.getElementById("auth-user-name").textContent = displayNameInput.value;
  accountAvatar.hidden = true;
  accountAvatar.removeAttribute("src");
  accountAvatarPlaceholder.hidden = false;
  accountAvatarPlaceholder.textContent = displayNameInput.value.slice(0, 1).toUpperCase();
  accountStatus.textContent = "";
}

async function loadUserProfile(supabase, user) {
  const profilePath = `users/${user.id}/profile.json`;
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(profilePath);
  if (error) {
    if (error.statusCode === "404" || error.status === 404) {
      return;
    }
    throw error;
  }

  const profile = JSON.parse(await data.text());
  if (typeof profile.name === "string" && profile.name.trim()) {
    displayNameInput.value = profile.name;
    document.getElementById("auth-user-name").textContent = profile.name;
    accountAvatarPlaceholder.textContent = profile.name.slice(0, 1).toUpperCase();
  }
  if (typeof profile.avatar_path === "string" && profile.avatar_path.startsWith(`users/${user.id}/`)) {
    const { data: avatar, error: avatarError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(profile.avatar_path, 3600);
    if (avatarError) {
      throw avatarError;
    }
    accountAvatar.src = avatar.signedUrl;
    accountAvatar.hidden = false;
    accountAvatarPlaceholder.hidden = true;
  }
}

function reportProfileLoadError(error) {
  console.error("Could not load user profile:", error);
  accountStatus.textContent = `Could not load profile: ${error.message || "Please refresh the page."}`;
  accountStatus.classList.add("error-message");
}

async function saveUserProfile(supabase, user, avatarFile = null) {
  const profilePath = `users/${user.id}/profile.json`;
  let avatarPath = null;
  const { data: existingProfile, error: existingProfileError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(profilePath);

  if (!existingProfileError) {
    const profile = JSON.parse(await existingProfile.text());
    if (typeof profile.avatar_path === "string" && profile.avatar_path.startsWith(`users/${user.id}/`)) {
      avatarPath = profile.avatar_path;
    }
  } else if (existingProfileError.statusCode !== "404" && existingProfileError.status !== 404) {
    throw existingProfileError;
  }

  if (avatarFile) {
    avatarPath = `users/${user.id}/avatar`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(avatarPath, avatarFile, {
      contentType: avatarFile.type,
      upsert: true,
    });
    if (error) {
      throw error;
    }
  }

  const profile = {
    name: displayNameInput.value.trim(),
    avatar_path: avatarPath,
  };
  const { error: saveError } = await supabase.storage.from(STORAGE_BUCKET).upload(
    profilePath,
    new Blob([JSON.stringify(profile)], { type: "application/json" }),
    { contentType: "application/json", upsert: true },
  );
  if (saveError) {
    throw saveError;
  }

  document.getElementById("auth-user-name").textContent = profile.name;
  accountAvatarPlaceholder.textContent = profile.name.slice(0, 1).toUpperCase();
  if (avatarPath) {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(avatarPath, 3600);
    if (error) {
      throw error;
    }
    accountAvatar.src = data.signedUrl;
    accountAvatar.hidden = false;
    accountAvatarPlaceholder.hidden = true;
  }
}

avatarPicker.addEventListener("click", () => avatarFileInput.click());

avatarFileInput.addEventListener("change", async () => {
  const file = avatarFileInput.files?.[0];
  avatarFileInput.value = "";
  if (!file) {
    return;
  }
  if (!file.type.startsWith("image/") || file.size > MAX_AVATAR_SIZE) {
    accountStatus.textContent = "Choose an image no larger than 5 MB.";
    accountStatus.classList.add("error-message");
    return;
  }

  avatarPicker.disabled = true;
  accountStatus.classList.remove("error-message");
  accountStatus.textContent = "Uploading profile picture...";
  try {
    const supabase = await getSupabase();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      throw error;
    }
    await saveUserProfile(supabase, user, file);
    accountStatus.textContent = "Profile picture updated.";
  } catch (error) {
    console.error("Could not update profile picture:", error);
    accountStatus.textContent = `Could not update profile picture: ${error.message || "Please try again."}`;
    accountStatus.classList.add("error-message");
  } finally {
    avatarPicker.disabled = false;
  }
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveProfileButton.disabled = true;
  accountStatus.classList.remove("error-message");
  accountStatus.textContent = "Saving profile...";
  try {
    const supabase = await getSupabase();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      throw error;
    }
    await saveUserProfile(supabase, user);
    accountStatus.textContent = "Profile saved.";
  } catch (error) {
    console.error("Could not save profile:", error);
    accountStatus.textContent = `Could not save profile: ${error.message || "Please try again."}`;
    accountStatus.classList.add("error-message");
  } finally {
    saveProfileButton.disabled = false;
  }
});

function showAuthForm() {
  signedInPanel.hidden = true;
  formPanel.hidden = false;
}

function setAuthMode(mode) {
  authMode = mode;
  const signingUp = mode === "signup";
  document.getElementById("auth-title").textContent = signingUp ? "Create account." : "Welcome back.";
  submitButton.firstChild.textContent = signingUp ? "Create account " : "Sign in ";
  passwordInput.autocomplete = signingUp ? "new-password" : "current-password";
  passwordInput.minLength = signingUp ? 8 : 1;
  signInMode.classList.toggle("is-active", !signingUp);
  signUpMode.classList.toggle("is-active", signingUp);
  signInMode.setAttribute("aria-pressed", String(!signingUp));
  signUpMode.setAttribute("aria-pressed", String(signingUp));
  setStatus("");
}

signInMode.addEventListener("click", () => setAuthMode("signin"));
signUpMode.addEventListener("click", () => setAuthMode("signup"));

googleButton.addEventListener("click", async () => {
  googleButton.disabled = true;
  setStatus("Starting Google sign-in...");

  try {
    if (isLocalFile) {
      throw new Error("Google sign-in needs this page served from localhost or your hosted site, not file://.");
    }
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: safeRedirectUrl() },
    });
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("Google sign-in failed:", error);
    setStatus(error.message || "Google sign-in could not start.", true);
    googleButton.disabled = false;
  }
});

emailForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  setStatus(authMode === "signup" ? "Creating your account..." : "Signing in...");

  try {
    const supabase = await getSupabase();
    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: emailInput.value.trim(),
        password: passwordInput.value,
        options: {
          emailRedirectTo: safeRedirectUrl(),
        },
      });
      if (error) {
        throw error;
      }
      if (data.session) {
        showSignedIn(data.session.user);
      } else {
        setStatus("Account created. Check your email to confirm it, then sign in here.");
        emailForm.reset();
        setAuthMode("signin");
        setStatus("Account created. Check your email to confirm it, then sign in here.");
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailInput.value.trim(),
        password: passwordInput.value,
      });
      if (error) {
        throw error;
      }
      showSignedIn(data.user);
    }
  } catch (error) {
    console.error("Supabase email authentication failed:", error);
    setStatus(error.message || "Authentication failed. Please try again.", true);
  } finally {
    submitButton.disabled = false;
  }
});

signOutButton.addEventListener("click", async () => {
  signOutButton.disabled = true;
  accountStatus.textContent = "Signing out...";
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
    showAuthForm();
    accountStatus.textContent = "";
  } catch (error) {
    console.error("Supabase sign-out failed:", error);
    accountStatus.textContent = `Sign out failed: ${error.message || "Please try again."}`;
    accountStatus.classList.add("error-message");
  } finally {
    signOutButton.disabled = false;
  }
});

async function initializeAuthPage() {
  try {
    if (isLocalFile) {
      runtimeNote.hidden = false;
      runtimeNote.textContent = "For email confirmation, open this site from a local web server or hosted URL.";
    }
    if (new URLSearchParams(window.location.search).get("error") === "session") {
      setStatus("Could not verify your session. Sign in again, or check that the Supabase URL and anon key match.", true);
    }
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      throw error;
    }
    const providerResponse = await fetch(`${supabase.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabase.supabaseKey },
    });
    if (!providerResponse.ok) {
      throw new Error(`Could not check enabled sign-in providers (HTTP ${providerResponse.status}).`);
    }
    const providerSettings = await providerResponse.json();
    if (providerSettings.external?.google) {
      googleButton.disabled = false;
      googleButton.lastChild.textContent = "Continue with Google";
      googleSetupStatus.textContent = "Continue using your Google account.";
    } else {
      googleButton.lastChild.textContent = "Google sign-in not configured";
      googleSetupStatus.textContent = "Google is currently disabled in this Supabase project.";
    }
    if (data.session) {
      showSignedIn(data.session.user);
      await loadUserProfile(supabase, data.session.user).catch(reportProfileLoadError);
    }

    supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        showSignedIn(session.user);
        void loadUserProfile(supabase, session.user).catch(reportProfileLoadError);
      } else if (event === "SIGNED_OUT") {
        showAuthForm();
      }
    });
  } catch (error) {
    console.error("Could not initialize Supabase authentication:", error);
    setStatus(`Could not connect to Supabase: ${error.message || "Check the project configuration."}`, true);
    googleSetupStatus.textContent = "Could not check Google sign-in availability.";
  }
}

initializeAuthPage();
