"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "grapesjs";
import { registerLandingBlocks } from "./block-registry";

type EditorSavePayload = {
  html: string;
  css: string;
  editorData: Record<string, unknown>;
};

type PageEditorProps = {
  initialHTML?: string | null;
  initialCSS?: string | null;
  editorData?: Record<string, unknown> | null;
  onSave: (data: EditorSavePayload) => void;
};

export function PageEditor({ initialHTML, initialCSS, editorData, onSave }: PageEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!containerRef.current || editorRef.current) {
        return;
      }

      const grapesjs = (await import("grapesjs")).default;
      const presetWebpage = (await import("grapesjs-preset-webpage")).default;
      const basicBlocks = (await import("grapesjs-blocks-basic")).default;
      const formsPlugin = (await import("grapesjs-plugin-forms")).default;

      const editor = grapesjs.init({
        container: containerRef.current,
        height: "72vh",
        fromElement: false,
        storageManager: false,
        plugins: [presetWebpage, basicBlocks, formsPlugin],
      });

      if (editorData && Object.keys(editorData).length > 0) {
        editor.loadProjectData(editorData);
      } else {
        if (initialHTML) {
          editor.setComponents(initialHTML);
        }

        if (initialCSS) {
          editor.setStyle(initialCSS);
        }
      }

      registerLandingBlocks(editor);

      editorRef.current = editor;

      if (mounted) {
        setReady(true);
      }
    }

    void init();

    return () => {
      mounted = false;
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, [editorData, initialCSS, initialHTML]);

  function handleSave() {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    onSave({
      html: editor.getHtml(),
      css: editor.getCss() ?? "",
      editorData: editor.getProjectData() as Record<string, unknown>,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-border bg-[hsl(var(--muted)/0.2)] p-3">
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{ready ? "Visual editor ready" : "Loading visual editor..."}</p>
        <button type="button" onClick={handleSave} className="crm-button-primary h-9 px-4" disabled={!ready}>
          Save
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        <div ref={containerRef} />
      </div>
    </div>
  );
}
