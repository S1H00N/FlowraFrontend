# Project Rules

## Encoding and Korean Text

- All source files must be saved as UTF-8.
- Do not convert files to ANSI, EUC-KR, CP949, UTF-16, or UTF-8 with BOM.
- Keep Korean UI text exactly as written unless the task explicitly asks to rewrite it.
- Do not replace Korean text with garbled characters, Unicode escape sequences, romanization, or placeholder text.
- Prefer normal Korean literals such as "일정 추가", not escaped forms like "\uC77C\uC815 \uCD94\uAC00".
- When editing TSX, JSX, HTML, CSS, JSON, Markdown, or SQL files, preserve UTF-8 encoding.
- If a file appears to contain broken Korean text, stop and report it instead of guessing the original text.
- After editing, check that Korean text does not contain broken characters such as �, Ã, ê, ë, ì, í.