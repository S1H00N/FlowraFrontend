import { useEffect, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import type { Notice } from "@/types/notice";

const markdownComponents: Components = {
  h1: ({ node: _node, ...props }) => <h3 {...props} />,
  h2: ({ node: _node, ...props }) => <h3 {...props} />,
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
  img: ({ node: _node, ...props }) => (
    <img {...props} loading="lazy" decoding="async" />
  ),
};

function HtmlNoticeBody({ notice }: { notice: Notice }) {
  const [isDark, setIsDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    const root = document.documentElement;
    const updateTheme = () => setIsDark(root.classList.contains("dark"));
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const source = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    html { color-scheme: ${isDark ? "dark" : "light"}; }
    body { margin: 0; background: transparent; color: ${isDark ? "#d6d6d6" : "#334155"}; font: 14px/1.85 "Segoe UI", "Noto Sans KR", sans-serif; overflow-wrap: anywhere; }
    h1, h2, h3, h4, h5, h6 { color: ${isDark ? "#f1f1f1" : "#0f172a"}; line-height: 1.5; }
    h1, h2 { font-size: 20px; }
    p { margin: 0 0 1em; }
    a { color: ${isDark ? "#c4b5fd" : "#6d28d9"}; }
    img, video { max-width: 100%; height: auto; }
    pre { overflow-x: auto; padding: 12px; border-radius: 8px; background: ${isDark ? "#2a2a2a" : "#f1f5f9"}; }
    code { font-family: ui-monospace, monospace; }
    table { max-width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 12px; border: 1px solid ${isDark ? "#303030" : "#e2e8f0"}; }
  </style>
</head>
<body>${notice.body}</body>
</html>`;

  return (
    <iframe
      title={notice.title}
      sandbox=""
      referrerPolicy="no-referrer"
      className="notices-html-body h-96 w-full border-0"
      srcDoc={source}
    />
  );
}

export default function NoticeBody({ notice }: { notice: Notice }) {
  if (notice.body_format === "html") {
    return <HtmlNoticeBody notice={notice} />;
  }

  if (notice.body_format === "markdown") {
    return (
      <div className="notices-body">
        <ReactMarkdown skipHtml components={markdownComponents}>
          {notice.body}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="notices-body notices-body--plain whitespace-pre-wrap break-words">
      {notice.body}
    </div>
  );
}
