import { App, TFile, MarkdownView } from 'obsidian';
import { Debug } from './debug';

/**
 * Editor buffer utilities for reading/writing content from the active Obsidian editor.
 * Reads what the user sees in the editor, not the raw file on disk. Useful when
 * plugins transform content in-memory (e.g. decryption, live preview, transclusion).
 */

/** Get the MarkdownView for a file if it's currently open in any editor leaf */
function getMarkdownViewForFile(app: App, filePath: string): MarkdownView | null {
  // Iterate ALL leaves (not just 'markdown' type) to support plugins that
  // register custom view types for specific file extensions
  let found: MarkdownView | null = null;
  app.workspace.iterateAllLeaves((leaf) => {
    if (!found && leaf.view instanceof MarkdownView) {
      const view = leaf.view as MarkdownView;
      if (view.file?.path === filePath) {
        found = view;
      }
    }
  });
  return found;
}

/** Get the MarkdownView for the currently active/focused editor */
function getActiveMarkdownView(app: App): MarkdownView | null {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  return view;
}

/** Read content from the editor buffer — if path is given, find that tab; otherwise use active */
export function readActiveEditorContent(app: App, targetPath?: string): { content: string; path: string } | null {
  let view: MarkdownView | null;
  if (targetPath) {
    view = getMarkdownViewForFile(app, targetPath);
  } else {
    view = getActiveMarkdownView(app);
  }
  if (!view || !view.file) {
    return null;
  }
  const content = view.editor.getValue();
  Debug.log(`editor-buffer: read editor for ${view.file.path} (${content.length} chars)`);
  return { content, path: view.file.path };
}

/** Write content to the editor buffer — if path is given, find that tab; otherwise use active */
export function writeActiveEditorContent(app: App, content: string, targetPath?: string): { success: boolean; path: string } | null {
  let view: MarkdownView | null;
  if (targetPath) {
    view = getMarkdownViewForFile(app, targetPath);
  } else {
    view = getActiveMarkdownView(app);
  }
  if (!view || !view.file) {
    return null;
  }
  view.editor.setValue(content);
  Debug.log(`editor-buffer: wrote to editor for ${view.file.path} (${content.length} chars)`);
  return { success: true, path: view.file.path };
}

/** Append content to the editor buffer — if path is given, find that tab; otherwise use active */
export function appendActiveEditorContent(app: App, content: string, targetPath?: string): { success: boolean; path: string } | null {
  let view: MarkdownView | null;
  if (targetPath) {
    view = getMarkdownViewForFile(app, targetPath);
  } else {
    view = getActiveMarkdownView(app);
  }
  if (!view || !view.file) {
    return null;
  }
  const existing = view.editor.getValue();
  view.editor.setValue(existing + content);
  Debug.log(`editor-buffer: appended to editor for ${view.file.path}`);
  return { success: true, path: view.file.path };
}

/** Find and replace within the editor buffer — if path is given, find that tab; otherwise use active */
export function patchActiveEditorContent(
  app: App,
  oldText: string,
  newText: string,
  targetPath?: string
): { success: boolean; path: string; replacements: number } | null {
  let view: MarkdownView | null;
  if (targetPath) {
    view = getMarkdownViewForFile(app, targetPath);
  } else {
    view = getActiveMarkdownView(app);
  }
  if (!view || !view.file) {
    return null;
  }
  const existing = view.editor.getValue();
  const count = existing.split(oldText).length - 1;
  if (count === 0) {
    return { success: false, path: view.file.path, replacements: 0 };
  }
  const updated = existing.split(oldText).join(newText);
  view.editor.setValue(updated);
  Debug.log(`editor-buffer: patched active editor for ${view.file.path} (${count} replacements)`);
  return { success: true, path: view.file.path, replacements: count };
}

/** Get info about the active editor including encryption detection */
export function getActiveEditorInfo(app: App): {
  path: string | null;
  isOpen: boolean;
  lineCount: number;
  charCount: number;
  extension: string | null;
  isEncrypted: boolean;
  hasEditorContent: boolean;
} {
  const view = getActiveMarkdownView(app);
  if (!view || !view.file) {
    return {
      path: null,
      isOpen: false,
      lineCount: 0,
      charCount: 0,
      extension: null,
      isEncrypted: false,
      hasEditorContent: false
    };
  }

  const content = view.editor.getValue();
  const extension = view.file.extension;
  
  // Check if the file on disk differs from what the editor shows.
  // A non-standard extension (not .md) or JSON-encoded content with
  // encryption markers suggests the editor content is transformed.
  const isNonStandardExtension = extension !== 'md' && extension !== 'markdown';
  const hasEncryptionMarkers = content.includes('"encodedData"') && content.includes('"version"');
  const isEncrypted = isNonStandardExtension || hasEncryptionMarkers;

  return {
    path: view.file.path,
    isOpen: true,
    lineCount: view.editor.lineCount(),
    charCount: content.length,
    extension,
    isEncrypted,
    hasEditorContent: content.trim().length > 0
  };
}

/**
 * Open a file in a new tab. If background is true (default), the current tab
 * keeps focus and cursor position. If false, switches to the new tab.
 */
export async function openFileInBackground(app: App, filePath: string, background = true): Promise<{ success: boolean; path: string } | null> {
  const file = app.vault.getAbstractFileByPath(filePath);
  if (!file || !(file instanceof TFile)) {
    return null;
  }

  if (background) {
    const currentLeaf = app.workspace.activeLeaf;
    const newLeaf = app.workspace.getLeaf('tab');
    await newLeaf.openFile(file, { active: false });

    if (currentLeaf && currentLeaf !== newLeaf) {
      app.workspace.setActiveLeaf(currentLeaf, { focus: false });
      setTimeout(() => {
        if (currentLeaf) {
          app.workspace.setActiveLeaf(currentLeaf, { focus: true });
        }
      }, 50);
    }
  } else {
    const newLeaf = app.workspace.getLeaf('tab');
    await newLeaf.openFile(file, { active: true });
  }

  Debug.log(`editor-buffer: opened ${filePath} (background: ${background})`);
  return { success: true, path: filePath };
}
