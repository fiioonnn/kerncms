/** The editor's window title (before the site template): "Startseite · Editor"; "● " marks unsaved changes. */
export function editorTitle(pageTitle: string | undefined, dirty = false) {
  return `${dirty ? "● " : ""}${pageTitle?.trim() || "Editor"}${pageTitle?.trim() ? " · Editor" : ""}`;
}
