import { getSupabase, STORAGE_BUCKET } from "./supabase-client.js";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const uploadForm = document.getElementById("database-upload-form");
const projectInput = document.getElementById("database-project-input");
const fileInput = document.getElementById("database-file-input");
const fileDrop = document.querySelector(".file-drop");
const filePrompt = document.querySelector(".file-prompt");
const uploadStatus = document.getElementById("database-upload-status");
const listStatus = document.getElementById("database-list-status");
const filesContainer = document.getElementById("database-files");
const refreshButton = document.getElementById("refresh-files");
const databaseContent = document.getElementById("database-content");
const codeEditorForm = document.getElementById("code-editor-form");
const codeFileNameInput = document.getElementById("code-file-name");
const codeEditorInput = document.getElementById("code-editor-input");
const codeEditorStatus = document.getElementById("code-editor-status");
const codeFilesStatus = document.getElementById("code-files-status");
const codeFilesList = document.getElementById("code-files-list");
const refreshCodeFilesButton = document.getElementById("refresh-code-files");
const newCodeFileButton = document.getElementById("new-code-file");
const CODEBASE_PREFIX = "codebase";
const CODE_FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.-]*\.[A-Za-z0-9]+$/;
const LANGUAGE_BY_EXTENSION = {
  c: "C",
  cpp: "C++",
  cs: "C#",
  css: "CSS",
  go: "Go",
  h: "C",
  hpp: "C++",
  htm: "HTML",
  html: "HTML",
  java: "Java",
  js: "JavaScript",
  json: "JSON",
  jsx: "React / JSX",
  md: "Markdown",
  mjs: "JavaScript",
  php: "PHP",
  py: "Python",
  rb: "Ruby",
  rs: "Rust",
  scss: "SCSS",
  sh: "Shell",
  sql: "SQL",
  svg: "SVG",
  ts: "TypeScript",
  tsx: "React / TSX",
  txt: "Plain text",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
};

function cleanPathPart(value) {
  return value
    .trim()
    .replace(/[\/\\\u0000-\u001f]/g, "-")
    .slice(0, 100) || "file";
}

function getUploadFileName(label, file) {
  const extension = file.name.match(/\.[^.]+$/)?.[0] || "";
  const safeExtension = extension ? cleanPathPart(extension) : "";
  const safeLabel = cleanPathPart(label);
  if (!safeExtension || safeLabel.toLowerCase().endsWith(safeExtension.toLowerCase())) {
    return safeLabel;
  }
  return `${safeLabel.slice(0, 100 - safeExtension.length)}${safeExtension}`;
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error-message", isError);
}

function getCodeLanguage(fileName) {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  return LANGUAGE_BY_EXTENSION[extension] || `${extension.toUpperCase()} files`;
}

function getCodeFileDate(file) {
  const date = file.updated_at || file.created_at || file.last_accessed_at;
  return date ? new Date(date) : null;
}

function validateCodeFileName(fileName) {
  return fileName.length <= 120
    && CODE_FILE_NAME_PATTERN.test(fileName)
    && !fileName.includes("..");
}

function createCodeFileButton(file) {
  const button = document.createElement("button");
  button.className = "code-file-button";
  button.type = "button";
  button.dataset.fileName = file.name;

  const name = document.createElement("strong");
  name.textContent = file.name;

  const modified = document.createElement("small");
  const date = getCodeFileDate(file);
  modified.textContent = date && !Number.isNaN(date.getTime())
    ? `Updated ${date.toLocaleString()}`
    : "Date unavailable";

  button.append(name, modified);
  button.addEventListener("click", () => loadCodeFile(file.name));
  return button;
}

async function loadCodeFiles() {
  refreshCodeFilesButton.disabled = true;
  setStatus(codeFilesStatus, "Loading saved code files...");
  codeFilesList.replaceChildren();

  try {
    const supabase = await getSupabase();
    const storage = supabase.storage.from(STORAGE_BUCKET);
    const codeFiles = [];
    let offset = 0;
    while (offset < 5000) {
      const { data: entries, error } = await storage.list(CODEBASE_PREFIX, {
        limit: 1000,
        offset,
        sortBy: { column: "updated_at", order: "desc" },
      });
      if (error) {
        throw error;
      }

      codeFiles.push(...(entries || []).filter((entry) => (
        entry.id && validateCodeFileName(entry.name)
      )));
      if (!entries || entries.length < 1000) {
        break;
      }
      offset += 1000;
    }

    codeFiles.sort((left, right) => (
      (getCodeFileDate(right)?.getTime() || 0) - (getCodeFileDate(left)?.getTime() || 0)
    ));
    const groups = new Map();
    for (const file of codeFiles) {
      const language = getCodeLanguage(file.name);
      if (!groups.has(language)) {
        groups.set(language, []);
      }
      groups.get(language).push(file);
    }

    for (const language of [...groups.keys()].sort((left, right) => left.localeCompare(right))) {
      const group = document.createElement("section");
      group.className = "code-file-group";

      const heading = document.createElement("h3");
      heading.textContent = language;
      group.append(heading);
      groups.get(language).forEach((file) => group.append(createCodeFileButton(file)));
      codeFilesList.append(group);
    }

    setStatus(
      codeFilesStatus,
      codeFiles.length
        ? `${codeFiles.length} code file${codeFiles.length === 1 ? "" : "s"} in ${groups.size} language${groups.size === 1 ? "" : "s"}.`
        : "No code files saved yet.",
    );
    if (!codeFiles.length) {
      const empty = document.createElement("p");
      empty.className = "database-empty";
      empty.textContent = "Save a file from the editor and it will appear here, grouped by language and ordered by latest update.";
      codeFilesList.append(empty);
    }
  } catch (error) {
    console.error("Could not load code files:", error);
    setStatus(codeFilesStatus, `Could not load code files: ${error.message || "Check Supabase Storage policies."}`, true);
  } finally {
    refreshCodeFilesButton.disabled = false;
  }
}

async function loadCodeFile(fileName) {
  setStatus(codeEditorStatus, `Opening ${fileName}...`);
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(`${CODEBASE_PREFIX}/${fileName}`);
    if (error) {
      throw error;
    }

    codeFileNameInput.value = fileName;
    codeEditorInput.value = await data.text();
    setStatus(codeEditorStatus, `${fileName} opened. Save to update this file.`);
    codeEditorInput.focus();
  } catch (error) {
    console.error(`Could not open code file ${fileName}:`, error);
    setStatus(codeEditorStatus, `Could not open ${fileName}: ${error.message || "Please try again."}`, true);
  }
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) {
    return "Size unavailable";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createFileCard(file, viewUrl, downloadUrl) {
  const card = document.createElement("article");
  card.className = "database-file";
  const canOpen = viewUrl !== "#";
  const openLink = document.createElement("a");
  openLink.className = "database-file-open";
  if (canOpen) {
    openLink.href = viewUrl;
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.setAttribute("aria-label", `Open ${file.name} in a new tab`);
    openLink.title = "Open file in a new tab";
  } else {
    card.classList.add("database-file-unavailable");
  }

  const icon = document.createElement("span");
  icon.className = "database-file-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "▤";

  const details = document.createElement("span");
  details.className = "database-file-details";

  const name = document.createElement("strong");
  name.textContent = file.name;

  const metadata = document.createElement("small");
  const size = file.metadata?.size;
  const createdAt = file.created_at ? new Date(file.created_at).toLocaleString() : "Date unavailable";
  metadata.textContent = `${formatSize(Number(size))} · ${createdAt}`;
  details.append(name, metadata);

  const openIndicator = document.createElement("span");
  openIndicator.className = "database-open-indicator";
  openIndicator.setAttribute("aria-hidden", "true");
  openIndicator.textContent = canOpen ? "↗" : "!";

  const downloadButton = document.createElement("button");
  downloadButton.className = "database-file-action database-download-action";
  downloadButton.type = "button";
  downloadButton.disabled = !canOpen;
  downloadButton.setAttribute("aria-label", `Download ${file.name}`);
  downloadButton.title = `Download ${file.name}`;
  const downloadIcon = document.createElement("span");
  downloadIcon.setAttribute("aria-hidden", "true");
  downloadIcon.textContent = "↓";
  const downloadLabel = document.createElement("span");
  downloadLabel.textContent = "Download";
  downloadButton.append(downloadIcon, downloadLabel);
  downloadButton.addEventListener("click", () => {
    window.location.assign(downloadUrl);
  });

  openLink.append(icon, details, openIndicator);
  card.append(openLink, downloadButton);
  return card;
}

async function collectBucketFiles(storage, prefix = "", depth = 0, files = []) {
  if (depth > 8 || files.length >= 1000) {
    return files;
  }

  let offset = 0;
  while (offset < 5000 && files.length < 1000) {
    const { data: entries, error } = await storage.list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error) {
      throw error;
    }

    for (const entry of entries || []) {
      if (depth === 0 && ["__likes", "users"].includes(entry.name)) {
        continue;
      }
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) {
        files.push({ ...entry, name: path });
      } else {
        await collectBucketFiles(storage, path, depth + 1, files);
      }
      if (files.length >= 1000) {
        break;
      }
    }

    if (!entries || entries.length < 1000) {
      break;
    }
    offset += 1000;
  }
  return files;
}

async function loadFiles() {
  refreshButton.disabled = true;
  setStatus(listStatus, "Loading files...");
  filesContainer.replaceChildren();

  try {
    const supabase = await getSupabase();
    const storedFiles = await collectBucketFiles(supabase.storage.from(STORAGE_BUCKET));
    if (storedFiles.length === 0) {
      setStatus(listStatus, "No files found in this bucket.");
      const empty = document.createElement("p");
      empty.className = "database-empty";
      empty.textContent = "No files are visible yet. Run supabase-setup.sql to enable bucket listing, then refresh. If the PDFs still do not appear, they may be in a database table or a different bucket.";
      filesContainer.append(empty);
      return;
    }

    const { data: signedFiles, error: signedUrlError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrls(storedFiles.map((file) => file.name), 3600);
    if (signedUrlError) {
      throw signedUrlError;
    }

    storedFiles.forEach((file, index) => {
      const signedFile = signedFiles?.[index];
      if (signedFile?.error || !signedFile?.signedUrl) {
        console.error(`Could not create view URL for ${file.name}:`, signedFile?.error);
        filesContainer.append(createFileCard(file, "#", "#"));
        return;
      }
      const downloadUrl = new URL(signedFile.signedUrl);
      downloadUrl.searchParams.set("download", file.name.split("/").pop() || file.name);
      filesContainer.append(createFileCard(file, signedFile.signedUrl, downloadUrl.href));
    });
    setStatus(listStatus, `${storedFiles.length} file${storedFiles.length === 1 ? "" : "s"} shown.`);
  } catch (error) {
    console.error("Could not load Supabase files:", error);
    const message = error.message || "Check your Supabase setup.";
    const isInvalidKey = message.includes("Invalid Compact JWS");
    setStatus(
      listStatus,
      isInvalidKey
        ? "Supabase rejected the credentials. Verify the project URL, publishable key, and legacy anon JWT belong to the same project."
        : `Could not load files: ${message}`,
      true,
    );
    const help = document.createElement("p");
    help.className = "database-empty";
    help.textContent = isInvalidKey
      ? "Check that supabase-client.js contains the matching project URL and legacy anon key."
      : "Sign in with Supabase and confirm the authenticated Storage policies are enabled in supabase-setup.sql.";
    filesContainer.append(help);
  } finally {
    refreshButton.disabled = false;
  }
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) {
    filePrompt.textContent = "Choose a file or drop it here";
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    setStatus(uploadStatus, "That file is over the 25 MB limit.", true);
    fileInput.value = "";
    filePrompt.textContent = "Choose a file or drop it here";
    return;
  }
  setStatus(uploadStatus, "");
  filePrompt.textContent = file.name;
});

fileDrop.addEventListener("dragover", (event) => {
  event.preventDefault();
  fileDrop.classList.add("is-dragging");
});

fileDrop.addEventListener("dragleave", () => {
  fileDrop.classList.remove("is-dragging");
});

fileDrop.addEventListener("drop", (event) => {
  event.preventDefault();
  fileDrop.classList.remove("is-dragging");
  if (event.dataTransfer.files.length) {
    fileInput.files = event.dataTransfer.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  }
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = fileInput.files[0];
  if (!file || file.size > MAX_FILE_SIZE) {
    setStatus(uploadStatus, "Choose a file smaller than 25 MB first.", true);
    return;
  }

  const projectName = projectInput.value.trim();
  if (!projectName) {
    setStatus(uploadStatus, "Enter a project name before uploading.", true);
    projectInput.focus();
    return;
  }

  const fileName = getUploadFileName(projectName, file);
  const submitButton = uploadForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setStatus(uploadStatus, "Uploading to Supabase...");

  try {
    const supabase = await getSupabase();
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (error) {
      throw error;
    }

    setStatus(uploadStatus, `${fileName} uploaded successfully.`);
    uploadForm.reset();
    filePrompt.textContent = "Choose a file or drop it here";
    await loadFiles();
  } catch (error) {
    console.error("Supabase upload failed:", error);
    const message = error.message || "Check the bucket and Storage policies.";
    setStatus(
      uploadStatus,
      message.toLowerCase().includes("row-level security")
        ? "Upload blocked by Supabase Storage policy. Run supabase-setup.sql in the Supabase SQL Editor."
        : /already exists|duplicate/i.test(message)
          ? `A file named "${fileName}" already exists. Choose a different name.`
          : `Upload failed: ${message}`,
      true,
    );
  } finally {
    submitButton.disabled = false;
  }
});

refreshButton.addEventListener("click", loadFiles);

codeEditorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fileName = codeFileNameInput.value.trim();
  if (!validateCodeFileName(fileName)) {
    setStatus(codeEditorStatus, "Enter a simple file name with a supported extension, such as app.js. Do not include folders.", true);
    codeFileNameInput.focus();
    return;
  }

  const saveButton = document.getElementById("save-code-file");
  saveButton.disabled = true;
  setStatus(codeEditorStatus, `Saving ${fileName}...`);
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(
      `${CODEBASE_PREFIX}/${fileName}`,
      new Blob([codeEditorInput.value], { type: "text/plain;charset=utf-8" }),
      {
        cacheControl: "3600",
        contentType: "text/plain;charset=utf-8",
        upsert: true,
      },
    );
    if (error) {
      throw error;
    }

    setStatus(codeEditorStatus, `${fileName} saved in the codebase folder.`);
    await loadCodeFiles();
  } catch (error) {
    console.error(`Could not save code file ${fileName}:`, error);
    const message = error.message || "Check Supabase Storage policies.";
    setStatus(
      codeEditorStatus,
      message.toLowerCase().includes("row-level security")
        ? "Saving was blocked by Storage policies. Run the updated supabase-setup.sql in the Supabase SQL Editor."
        : `Could not save ${fileName}: ${message}`,
      true,
    );
  } finally {
    saveButton.disabled = false;
  }
});

newCodeFileButton.addEventListener("click", () => {
  codeEditorForm.reset();
  setStatus(codeEditorStatus, "Ready for a new code file.");
  codeFileNameInput.focus();
});

refreshCodeFilesButton.addEventListener("click", loadCodeFiles);

const workspaceTabs = [...document.querySelectorAll("[data-workspace-tab]")];
let activeWorkspace = document.querySelector('[data-workspace-tab][aria-selected="true"]')?.dataset.workspaceTab;
workspaceTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => {
    const direction = tab.dataset.workspaceTab === "database" ? "from-right" : "from-left";
    workspaceTabs.forEach((workspaceTab) => {
      const isSelected = workspaceTab === tab;
      workspaceTab.setAttribute("aria-selected", String(isSelected));
      workspaceTab.tabIndex = isSelected ? 0 : -1;
      workspaceTab.classList.toggle("is-active", isSelected);
      const panel = document.getElementById(workspaceTab.getAttribute("aria-controls"));
      panel.hidden = !isSelected;
      if (isSelected && activeWorkspace !== workspaceTab.dataset.workspaceTab) {
        panel.classList.remove("slide-from-left", "slide-from-right");
        void panel.offsetWidth;
        panel.classList.add(direction === "from-left" ? "slide-from-left" : "slide-from-right");
      }
    });
    activeWorkspace = tab.dataset.workspaceTab;
    if (tab.dataset.workspaceTab === "codebase") {
      loadCodeFiles();
    } else {
      loadFiles();
    }
  });
  tab.addEventListener("keydown", (event) => {
    let nextIndex;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % workspaceTabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + workspaceTabs.length) % workspaceTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = workspaceTabs.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    workspaceTabs[nextIndex].focus();
    workspaceTabs[nextIndex].click();
  });
});

async function protectDatabasePage() {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      throw error;
    }
    if (!data.session) {
      window.location.replace("./auth.html?next=database.html");
      return;
    }

    databaseContent.hidden = false;
    await loadCodeFiles();
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        window.location.replace("./auth.html?next=database.html");
      }
    });
  } catch (error) {
    console.error("Could not verify Supabase session:", error);
    window.location.replace("./auth.html?next=database.html&error=session");
  }
}

protectDatabasePage();
