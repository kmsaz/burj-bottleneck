/**
 * pythonRunner.js
 * Turn participant Python source into a scheduler, fully offline.
 *
 * Pyodide (CPython compiled to WebAssembly) is vendored next to the app and
 * loaded on demand — the first time a Python algorithm is detected — so the
 * JavaScript path never pays for it. No network request leaves the origin.
 */

let pyodidePromise = null;

/**
 * Load (once) and return the shared Pyodide instance.
 *
 * @param {string} baseUrl  Vite BASE_URL, e.g. "/" or "/burj-bottleneck/"
 * @returns {Promise<any>}
 */
export function loadPyodideRuntime(baseUrl = '/') {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const indexURL = `${baseUrl.replace(/\/?$/, '/')}pyodide/`;
      // Loaded as a URL so the runtime is not bundled or rewritten by Vite.
      const module = await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`);
      return module.loadPyodide({ indexURL });
    })().catch((err) => {
      pyodidePromise = null; // allow a retry after a failed load
      throw err;
    });
  }
  return pyodidePromise;
}

/**
 * Build a scheduler from Python source.
 *
 * The file may define any one of:
 *   def assignElevator(request, elevators, current_time): ...
 *   def assign_elevator(request, elevators, current_time): ...
 *   def assign(request, elevators, current_time): ...
 *
 * @param {string} source
 * @param {string} baseUrl
 * @returns {Promise<{ assign: Function, dispose: Function }>}
 */
export async function createPythonScheduler(source, baseUrl = '/') {
  const text = String(source ?? '');
  if (!text.trim()) {
    throw new Error('participant.js is empty — add an assign_elevator function.');
  }

  let py;
  try {
    py = await loadPyodideRuntime(baseUrl);
  } catch (err) {
    throw new Error(`Python runtime failed to load: ${err.message}`);
  }

  try {
    py.runPython(text);
  } catch (err) {
    throw new Error(`Python error: ${firstLine(err.message)}`);
  }

  const fn =
    py.globals.get('assignElevator') ||
    py.globals.get('assign_elevator') ||
    py.globals.get('assign');

  if (!fn || typeof fn !== 'function') {
    throw new Error(
      'No assignElevator(request, elevators, current_time) function was found in participant.js.',
    );
  }

  return {
    language: 'python',
    assign(request, elevators, currentTime) {
      const reqPy = py.toPy(request);
      const elsPy = py.toPy(elevators);
      try {
        const result = fn(reqPy, elsPy, currentTime);
        return result === 1 ? 1 : 0;
      } catch (err) {
        throw new Error(`Python error in assignElevator: ${firstLine(err.message)}`);
      } finally {
        reqPy.destroy?.();
        elsPy.destroy?.();
      }
    },
    dispose() {
      fn.destroy?.();
    },
  };
}

/** Keep multi-line tracebacks from flooding the UI. */
function firstLine(message) {
  return String(message ?? 'unknown error').split('\n').filter(Boolean).pop();
}
