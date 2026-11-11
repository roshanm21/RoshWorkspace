import { getSupabase, STORAGE_BUCKET } from "./supabase-client.js";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const uploadForm = document.getElementById("database-upload-form");
const projectInput = document.getElementById("database-project-input");
const folderInput = document.getElementById("database-folder-input");
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
const editCodeFileButton = document.getElementById("edit-code-file");
const saveCodeFileButton = document.getElementById("save-code-file");
const newCodeFileButton = document.getElementById("new-code-file");
const codeFilesStatus = document.getElementById("code-files-status");
const codeFilesList = document.getElementById("code-files-list");
const refreshCodeFilesButton = document.getElementById("refresh-code-files");
const CODEBASE_PREFIX = "codebase";
const CODE_FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.-]*\.[A-Za-z0-9]+$/;
const EDITABLE_TEXT_EXTENSIONS = new Set([
  "c", "cpp", "cs", "css", "go", "h", "hpp", "htm", "html", "java", "js", "json",
  "jsx", "md", "mjs", "php", "py", "rb", "rs", "scss", "sh", "sql", "svg", "ts",
  "tsx", "txt", "xml", "yaml", "yml",
]);
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
const DATABASE_FOLDERS = [
  { name: "books", label: "Books" },
  { name: "assignment", label: "Assignment" },
  { name: "notes", label: "Notes" },
];
let activeCodeFilePath = null;
let originalCodeFileName = "";
let originalCodeContent = "";
let codeEditorMode = "empty";

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

function setCodeEditorMode(mode) {
  codeEditorMode = mode;
  const canEdit = mode === "new" || mode === "editing";
  codeEditorInput.readOnly = !canEdit;
  codeFileNameInput.readOnly = mode !== "new";
  editCodeFileButton.hidden = mode !== "reading" && mode !== "editing";
  editCodeFileButton.textContent = mode === "editing" ? "Cancel editing" : "Edit file";
  editCodeFileButton.setAttribute("aria-label", mode === "editing" ? "Cancel code edits" : "Edit code file");
  saveCodeFileButton.hidden = !canEdit;
}

function isCodeEditorDirty() {
  if (codeEditorMode === "new") {
    return Boolean(codeFileNameInput.value.trim() || codeEditorInput.value);
  }
  return codeEditorMode === "editing"
    && (codeFileNameInput.value !== originalCodeFileName || codeEditorInput.value !== originalCodeContent);
}

function startNewCodeTab(message = "New tab ready.") {
  activeCodeFilePath = null;
  originalCodeFileName = "";
  originalCodeContent = "";
  codeEditorForm.reset();
  setCodeEditorMode("new");
  setStatus(codeEditorStatus, message);
  codeFileNameInput.focus();
}

async function prepareToSwitchFile() {
  if (!isCodeEditorDirty()) {
    return true;
  }

  const shouldSave = window.confirm("Save your current session before opening another file? Press Cancel to discard the current edits.");
  if (!shouldSave) {
    return true;
  }
  return saveCurrentCodeFile({ confirmOverwrite: false });
}

function isEditableTextFile(fileName) {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  return EDITABLE_TEXT_EXTENSIONS.has(extension);
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
  if (!await prepareToSwitchFile()) {
    return;
  }

  setStatus(codeEditorStatus, `Opening ${fileName}...`);
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(`${CODEBASE_PREFIX}/${fileName}`);
    if (error) {
      throw error;
    }

    activeCodeFilePath = `${CODEBASE_PREFIX}/${fileName}`;
    codeFileNameInput.value = fileName;
    codeEditorInput.value = await data.text();
    originalCodeFileName = fileName;
    originalCodeContent = codeEditorInput.value;
    setCodeEditorMode("reading");
    setStatus(codeEditorStatus, `${fileName} opened. Save to update this file.`);
  } catch (error) {
    console.error(`Could not open code file ${fileName}:`, error);
    setStatus(codeEditorStatus, `Could not open ${fileName}: ${error.message || "Please try again."}`, true);
  }
}

async function loadDatabaseTextFile(filePath) {
  if (!await prepareToSwitchFile()) {
    return;
  }

  const fileName = filePath.split("/").pop() || filePath;
  setStatus(codeEditorStatus, `Opening ${fileName}...`);
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(filePath);
    if (error) {
      throw error;
    }

    activeCodeFilePath = filePath;
    codeFileNameInput.value = fileName;
    codeEditorInput.value = await data.text();
    originalCodeFileName = fileName;
    originalCodeContent = codeEditorInput.value;
    setCodeEditorMode("reading");
    setStatus(codeEditorStatus, `${fileName} opened from ${filePath}. Saving will replace its current contents.`);
    document.getElementById("codebase-tab").click();
  } catch (error) {
    console.error(`Could not open database text file ${filePath}:`, error);
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
  const displayName = file.displayName || file.name;
  const openLink = document.createElement("a");
  openLink.className = "database-file-open";
  if (canOpen) {
    openLink.href = viewUrl;
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.setAttribute("aria-label", `Open ${displayName} in a new tab`);
    openLink.title = "Open file in a new tab";
    if (isEditableTextFile(file.name)) {
      openLink.removeAttribute("target");
      openLink.removeAttribute("rel");
      openLink.title = "Open this text file in Codebase to edit";
      openLink.addEventListener("click", (event) => {
        event.preventDefault();
        void loadDatabaseTextFile(file.name);
      });
    }
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
  name.textContent = displayName;

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
  downloadButton.setAttribute("aria-label", `Download ${displayName}`);
  downloadButton.title = `Download ${displayName}`;
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
        if (![".keep", "keep.txt"].includes(entry.name)) {
          files.push({ ...entry, name: path });
        }
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

function getDatabaseFolder(filePath) {
  const pathParts = filePath.split("/");
  return pathParts.length > 1 ? pathParts[0] : "unfiled";
}

function getDatabaseFolderLabel(folderName) {
  return DATABASE_FOLDERS.find((folder) => folder.name === folderName)?.label
    || (folderName === "unfiled"
      ? "Unfiled"
      : folderName.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()));
}

async function ensureDatabaseFolders(storage) {
  const createdFolders = [];
  for (const folder of DATABASE_FOLDERS) {
    const { data: entries, error: listError } = await storage.list(folder.name, { limit: 1 });
    if (listError) {
      throw listError;
    }
    if (entries?.some((entry) => entry.name === "keep.txt")) {
      continue;
    }

    const { error: uploadError } = await storage.upload(
      `${folder.name}/keep.txt`,
      new Blob([]),
      { contentType: "text/plain", upsert: false },
    );
    if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) {
      throw uploadError;
    }
    if (!uploadError) {
      createdFolders.push(folder.label);
    }
  }
  return createdFolders;
}

function renderDatabaseFolders(storedFiles, signedFiles) {
  const groupedFiles = new Map(DATABASE_FOLDERS.map((folder) => [folder.name, []]));
  for (const [index, file] of storedFiles.entries()) {
    const folder = getDatabaseFolder(file.name);
    if (!groupedFiles.has(folder)) {
      groupedFiles.set(folder, []);
    }
    groupedFiles.get(folder).push({ file, signedFile: signedFiles?.[index] });
  }

  const folders = [
    ...DATABASE_FOLDERS.map((folder) => folder.name),
    ...[...groupedFiles.keys()]
      .filter((folder) => !DATABASE_FOLDERS.some((knownFolder) => knownFolder.name === folder))
      .sort((left, right) => left.localeCompare(right)),
  ];

  for (const folderName of folders) {
    const folderSection = document.createElement("section");
    folderSection.className = "database-folder";

    const heading = document.createElement("h3");
    heading.className = "database-folder-heading";
    const folderIcon = document.createElement("span");
    folderIcon.className = "database-folder-icon";
    folderIcon.setAttribute("aria-hidden", "true");
    folderIcon.textContent = "▱";
    const title = document.createElement("span");
    title.textContent = getDatabaseFolderLabel(folderName);
    const count = document.createElement("small");
    count.textContent = String(groupedFiles.get(folderName)?.length || 0);
    heading.append(folderIcon, title, count);

    const folderFiles = document.createElement("div");
    folderFiles.className = "database-folder-files";
    const entries = groupedFiles.get(folderName) || [];
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "database-folder-empty";
      empty.textContent = "No files in this folder yet.";
      folderFiles.append(empty);
    }

    entries.forEach(({ file, signedFile }) => {
      const relativePath = folderName === "unfiled"
        ? file.name
        : file.name.slice(folderName.length + 1);
      if (signedFile?.error || !signedFile?.signedUrl) {
        console.error(`Could not create view URL for ${file.name}:`, signedFile?.error);
        folderFiles.append(createFileCard({ ...file, displayName: relativePath }, "#", "#"));
        return;
      }
      const downloadUrl = new URL(signedFile.signedUrl);
      downloadUrl.searchParams.set("download", file.name.split("/").pop() || file.name);
      folderFiles.append(
        createFileCard({ ...file, displayName: relativePath }, signedFile.signedUrl, downloadUrl.href),
      );
    });

    folderSection.append(heading, folderFiles);
    filesContainer.append(folderSection);
  }
}

async function loadFiles() {
  refreshButton.disabled = true;
  setStatus(listStatus, "Loading files...");
  filesContainer.replaceChildren();

  try {
    const supabase = await getSupabase();
    const storedFiles = await collectBucketFiles(supabase.storage.from(STORAGE_BUCKET));
    let signedFiles = [];
    if (storedFiles.length) {
      const { data, error: signedUrlError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrls(storedFiles.map((file) => file.name), 3600);
      if (signedUrlError) {
        throw signedUrlError;
      }
      signedFiles = data || [];
    }

    renderDatabaseFolders(storedFiles, signedFiles);
    setStatus(
      listStatus,
      `${storedFiles.length} file${storedFiles.length === 1 ? "" : "s"} shown in ${filesContainer.children.length} folder${filesContainer.children.length === 1 ? "" : "s"}.`,
    );
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
  const filePath = `${folderInput.value}/${fileName}`;
  const submitButton = uploadForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setStatus(uploadStatus, "Uploading to Supabase...");

  try {
    const supabase = await getSupabase();
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (error) {
      throw error;
    }

    setStatus(uploadStatus, `${fileName} uploaded to ${getDatabaseFolderLabel(folderInput.value)}.`);
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
          ? `A file named "${fileName}" already exists in ${getDatabaseFolderLabel(folderInput.value)}. Choose a different name.`
          : `Upload failed: ${message}`,
      true,
    );
  } finally {
    submitButton.disabled = false;
  }
});

refreshButton.addEventListener("click", loadFiles);

async function saveCurrentCodeFile({ confirmOverwrite = true } = {}) {
  if (codeEditorMode !== "new" && codeEditorMode !== "editing") {
    return false;
  }
  const fileName = codeFileNameInput.value.trim();
  if (!validateCodeFileName(fileName)) {
    setStatus(codeEditorStatus, "Enter a simple file name with a supported extension, such as app.js. Do not include folders.", true);
    codeFileNameInput.focus();
    return false;
  }

  const filePath = activeCodeFilePath || `${CODEBASE_PREFIX}/${fileName}`;
  if (
    confirmOverwrite
    && !filePath.startsWith(`${CODEBASE_PREFIX}/`)
    && !window.confirm(
    `This will truncate and replace the current contents of "${filePath}" with the editor contents. Continue?`,
    )
  ) {
    return false;
  }

  saveCodeFileButton.disabled = true;
  setStatus(codeEditorStatus, `Saving ${filePath}...`);
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(
      filePath,
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

    activeCodeFilePath = filePath;
    originalCodeFileName = fileName;
    originalCodeContent = codeEditorInput.value;
    if (filePath.startsWith(`${CODEBASE_PREFIX}/`)) {
      await loadCodeFiles();
    } else {
      await loadFiles();
    }
    startNewCodeTab(`${filePath} saved. A new tab is ready.`);
    return true;
  } catch (error) {
    console.error(`Could not save file ${filePath}:`, error);
    const message = error.message || "Check Supabase Storage policies.";
    setStatus(
      codeEditorStatus,
      message.toLowerCase().includes("row-level security")
        ? "Saving was blocked by Storage policies. Run the updated supabase-setup.sql in the Supabase SQL Editor."
        : `Could not save ${fileName}: ${message}`,
      true,
    );
    return false;
  } finally {
    saveCodeFileButton.disabled = false;
  }
}

codeEditorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveCurrentCodeFile();
});

editCodeFileButton.addEventListener("click", () => {
  if (codeEditorMode === "editing") {
    if (isCodeEditorDirty() && !window.confirm("Discard your edits and restore the saved file?")) {
      return;
    }
    codeFileNameInput.value = originalCodeFileName;
    codeEditorInput.value = originalCodeContent;
    setCodeEditorMode("reading");
    setStatus(codeEditorStatus, "Edits discarded.");
    return;
  }

  if (codeEditorMode !== "reading") {
    return;
  }
  setCodeEditorMode("editing");
  codeEditorInput.focus();
  setStatus(codeEditorStatus, "Editing file. Save when you are ready.");
});

newCodeFileButton.addEventListener("click", async () => {
  if (!window.confirm("Clear the current editor and start a new file tab? Press Cancel to keep the current content.")) {
    return;
  }
  startNewCodeTab("New tab ready. Enter a file name and write your code.");
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
    const storage = supabase.storage.from(STORAGE_BUCKET);
    try {
      const createdFolders = await ensureDatabaseFolders(storage);
      if (createdFolders.length) {
        setStatus(listStatus, `Created bucket folders: ${createdFolders.join(", ")}.`);
      }
    } catch (folderError) {
      console.error("Could not create database folders in Supabase Storage:", folderError);
      setStatus(
        listStatus,
        `Could not create Books, Assignment, and Notes in the bucket: ${folderError.message || "Check Storage permissions."}`,
        true,
      );
    }
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
