/**
 * detectLanguage.js
 * Figure out which language a participant dropped into participant.js.
 *
 * participant.js is loaded as raw text, not as a JavaScript module, so the
 * file may legitimately contain Python, C++, C#, Java, Go or Rust. Detection
 * is heuristic (marker counting) and never throws — an unrecognised or empty
 * file falls back to JavaScript.
 */

/**
 * @typedef {Object} LanguageInfo
 * @property {string}  id        stable id: javascript | python | typescript | cpp | csharp | java | go | rust
 * @property {string}  label     display name
 * @property {boolean} runnable  true when an offline runtime ships with the app
 * @property {string}  [note]    why a language is not runnable, when it is not
 */

const RULES = [
  {
    id: 'csharp',
    label: 'C#',
    runnable: false,
    note: 'C# needs the .NET runtime and Roslyn compiler; there is no offline in-browser runtime for it.',
    patterns: [
      /^\s*using\s+System[\w.]*\s*;/m,
      /^\s*namespace\s+[\w.]+\s*[{;]/m,
      /\bpublic\s+(?:static\s+)?(?:sealed\s+)?(?:class|record|struct)\b/,
      /\bConsole\.(?:Write|WriteLine|ReadLine)\b/,
      /\bstatic\s+(?:int|double|bool)\s+Assign\w*\s*\(/,
    ],
  },
  {
    id: 'cpp',
    label: 'C++',
    runnable: false,
    note: 'C++ needs a compiler and none ships in the browser; offline C++ would require a local g++/clang toolchain.',
    patterns: [
      /#include\s*[<"]/,
      /\bstd::/,
      /^\s*#define\s+\w+/m,
      /\bint\s+main\s*\(/,
      /\bvector\s*</,
    ],
  },
  {
    id: 'java',
    label: 'Java',
    runnable: false,
    note: 'Java needs a JVM; there is no offline in-browser JVM shipped here.',
    patterns: [
      /^\s*package\s+[\w.]+\s*;/m,
      /\bpublic\s+(?:final\s+)?class\s+\w+/,
      /System\.out\.print/,
      /\bpublic\s+static\s+(?:int|double|boolean)\s+\w+\s*\(/,
    ],
  },
  {
    id: 'go',
    label: 'Go',
    runnable: false,
    note: 'Go needs the Go toolchain; offline execution would require a local compiler.',
    patterns: [
      /^\s*package\s+\w+\s*$/m,
      /^\s*func\s+\w+\s*\(/m,
      /\bfmt\.Print/,
      /:=/,
    ],
  },
  {
    id: 'rust',
    label: 'Rust',
    runnable: false,
    note: 'Rust needs rustc; offline execution would require a local toolchain (or a WASM build step).',
    patterns: [
      /^\s*fn\s+\w+\s*\(/m,
      /\blet\s+mut\b/,
      /\bimpl\s+\w+/,
      /\bpub\s+fn\b/,
    ],
  },
  {
    id: 'python',
    label: 'Python',
    runnable: true,
    patterns: [
      /^\s*def\s+\w+\s*\([^)]*\)\s*(?:->\s*[\w\[\], ]+)?:/m,
      /^\s*(?:from|import)\s+[\w.]+/m,
      /^\s*(?:if|elif|for|while|with|try)\b[^\n]*:\s*$/m,
      /\bNone\b/,
    ],
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    runnable: false,
    // TypeScript is a JavaScript superset, so its markers must outweigh
    // ordinary JS keywords (function / export / return).
    weight: 2,
    note: 'TypeScript must be compiled to JavaScript first; the offline runtime only executes JavaScript.',
    patterns: [
      /:\s*(?:number|string|boolean|void|unknown|never)\b/,
      /\binterface\s+\w+\s*\{/,
      /\btype\s+\w+\s*=/,
    ],
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    runnable: true,
    patterns: [
      /\bfunction\b/,
      /=>/,
      /\b(?:const|let|var)\s+\w+/,
      /^\s*export\b/m,
      /\breturn\b/,
    ],
  },
];

/**
 * Detect the language of a participant algorithm source file.
 *
 * @param {string} source
 * @returns {LanguageInfo}
 */
export function detectLanguage(source) {
  const text = typeof source === 'string' ? source : '';
  if (!text.trim()) {
    return { id: 'javascript', label: 'JavaScript', runnable: true };
  }

  let best = null;

  for (const rule of RULES) {
    let score = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) score++;
    }
    score *= rule.weight ?? 1;
    if (score === 0) continue;
    // Stronger marker sets win; ties fall to the earlier (more distinctive) rule.
    if (!best || score > best.score) {
      best = { rule, score };
    }
  }

  // For languages that share syntax with JavaScript, require a decisive signal.
  if (best && best.rule.id === 'javascript' && best.score < 1) {
    best = null;
  }

  const rule = best?.rule ?? RULES[RULES.length - 1];
  const info = { id: rule.id, label: rule.label, runnable: rule.runnable };
  if (rule.note) info.note = rule.note;
  return info;
}
