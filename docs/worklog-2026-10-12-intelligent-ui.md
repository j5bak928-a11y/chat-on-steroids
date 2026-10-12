# Intelligent UI in the desktop transcript — 2026-10-12

ChatGPT sometimes renders a chart or image beside the canonical Markdown node.
The Fiber recorder now attaches that visual's enclosing wrapper only when
the assistant message and conversation IDs prove ownership. Canonical text
remains the source of truth, and unrelated messages and tools are excluded.

The desktop renders figures, HTTPS images and inert SVG chart geometry through
the shared sanitizer. Styles, event handlers, embedded content and unsafe URLs
are stripped. Stale visual captures do not replace canonical text. Forms stay
read-only, and actual ChatGPT widget actions still happen in the browser.
The Electron CSP permits HTTPS images but continues to deny remote scripts and
connections.

Focused tests cover visual siblings, foreign owners, malicious SVG, stale
captures and normal Markdown. Live browser fidelity has not yet been proven.
