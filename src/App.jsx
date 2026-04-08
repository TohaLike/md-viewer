import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

const markdownFiles = ["example.md", "notes.md", "license-options-matrix.md", "license-server-initial-design.md"];

export default function App() {
  const [selectedFile, setSelectedFile] = useState(markdownFiles[0]);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let isCancelled = false;

    async function loadMarkdown() {
      setStatus("loading");
      try {
        const response = await fetch(`/md/${selectedFile}`);
        if (!response.ok) {
          throw new Error(`Cannot load file: ${selectedFile}`);
        }
        const text = await response.text();
        if (!isCancelled) {
          setContent(text);
          setStatus("ready");
        }
      } catch (error) {
        if (!isCancelled) {
          setContent(`## Error\n\n${error.message}`);
          setStatus("error");
        }
      }
    }

    loadMarkdown();
    return () => {
      isCancelled = true;
    };
  }, [selectedFile]);

  const title = useMemo(() => selectedFile.replace(".md", ""), [selectedFile]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>Markdown files</h1>
        {markdownFiles.map((file) => (
          <button
            key={file}
            type="button"
            className={file === selectedFile ? "active" : ""}
            onClick={() => setSelectedFile(file)}
          >
            {file}
          </button>
        ))}
      </aside>
      <main className="content">
        <div className="header">
          <strong>{title}</strong>
          <span>{status === "loading" ? "Loading..." : "Ready"}</span>
        </div>
        <article className="markdown">
          <ReactMarkdown>{content}</ReactMarkdown>
        </article>
      </main>
    </div>
  );
}
