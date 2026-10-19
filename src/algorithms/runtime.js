/**
 * runtime.js
 * Load participant.js as text, detect its language, and build a scheduler.
 *
 * participant.js is imported with ?raw so its contents never have to be
 * JavaScript: Python is executed with the vendored Pyodide runtime. Languages
 * with no offline runtime resolve to a safe fallback scheduler plus a clear
 * message, so the app keeps working instead of crashing.
 */

import participantSource from './participant.js?raw';
import { detectLanguage } from './detectLanguage.js';
import { createJsScheduler } from './jsRunner.js';
import { createPythonScheduler } from './pythonRunner.js';

export { participantSource };

/** Language detected in the current participant.js, without loading a runtime. */
export function describeParticipant() {
  return detectLanguage(participantSource);
}

/**
 * Prepare the participant scheduler.
 *
 * Never rejects: on failure it returns a fallback scheduler that sends every
 * group to Elevator A, together with the reason, so the UI can explain itself.
 *
 * @param {Object}   [options]
 * @param {string}   [options.baseUrl]  Vite BASE_URL (for the Pyodide assets).
 * @returns {Promise<{ scheduler: Function, info: Object, error: string|null }>}
 */
export async function loadParticipantScheduler({ baseUrl = '/' } = {}) {
  const info = describeParticipant();

  if (!info.runnable) {
    return {
      scheduler: () => 0,
      info,
      error: `${info.label} code detected. ${info.note ?? 'No offline runtime is available for this language.'}`,
    };
  }

  try {
    const runner =
      info.id === 'python'
        ? await createPythonScheduler(participantSource, baseUrl)
        : createJsScheduler(participantSource);

    return { scheduler: runner.assign, info, error: null };
  } catch (err) {
    return {
      scheduler: () => 0,
      info,
      error: err.message,
    };
  }
}
