/**
 * jsRunner.js
 * Turn participant JavaScript source text into a scheduler function.
 *
 * The source is evaluated once inside a Function constructor, so it can be a
 * module-style export, a plain function declaration, or a const arrow — the
 * only thing that matters is that it exposes assignElevator (or assign).
 */

/**
 * Build a scheduler from JavaScript source.
 *
 * @param {string} source
 * @returns {{ assign: (request: Object, elevators: Object[], currentTime: number) => number }}
 */
export function createJsScheduler(source) {
  const text = String(source ?? '');
  if (!text.trim()) {
    throw new Error('participant.js is empty — add an assignElevator function.');
  }

  // Allow module-style source: strip `export` / `export default` keywords.
  const cleaned = text
    .replace(/^[ \t]*export\s+default\s+/gm, '')
    .replace(/^[ \t]*export\s+/gm, '');

  let factory;
  try {
    factory = new Function(
      `"use strict";\n${cleaned}\n` +
        'return (typeof assignElevator === "function" && assignElevator) || ' +
        '(typeof assign === "function" && assign) || ' +
        '(typeof schedule === "function" && schedule) || null;',
    );
  } catch (err) {
    throw new Error(`JavaScript syntax error: ${err.message}`);
  }

  let fn;
  try {
    fn = factory();
  } catch (err) {
    throw new Error(`JavaScript error while loading: ${err.message}`);
  }

  if (typeof fn !== 'function') {
    throw new Error(
      'No assignElevator(request, elevators, currentTime) function was found in participant.js.',
    );
  }

  return {
    language: 'javascript',
    assign(request, elevators, currentTime) {
      const result = fn(request, elevators, currentTime);
      return result === 1 ? 1 : 0;
    },
    dispose() {},
  };
}
