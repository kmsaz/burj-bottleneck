import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../src/algorithms/detectLanguage.js';
import { createJsScheduler } from '../src/algorithms/jsRunner.js';

describe('Participant language detection', () => {
  it('treats the blank template as JavaScript', () => {
    const source = `
      export function assignElevator(request, elevators, currentTime) {
        // TODO
        return 0;
      }
    `;
    const info = detectLanguage(source);
    expect(info.id).toBe('javascript');
    expect(info.runnable).toBe(true);
  });

  it('detects Python and marks it runnable offline', () => {
    const source = `
def assign_elevator(request, elevators, current_time):
    return 0
    `;
    const info = detectLanguage(source);
    expect(info.id).toBe('python');
    expect(info.runnable).toBe(true);
  });

  it('detects C++ and explains that it has no offline runtime', () => {
    const source = `
#include <vector>
int main() { std::vector<int> lifts; return 0; }
    `;
    const info = detectLanguage(source);
    expect(info.id).toBe('cpp');
    expect(info.runnable).toBe(false);
    expect(info.note).toMatch(/compiler/i);
  });

  it('detects C#', () => {
    const source = `
using System;
public static class Scheduler {
    static int Assign(int origin) { Console.WriteLine(origin); return 0; }
}
    `;
    expect(detectLanguage(source).id).toBe('csharp');
  });

  it('detects Java', () => {
    const source = `
public class Scheduler {
    public static void main(String[] args) { System.out.println(1); }
}
    `;
    expect(detectLanguage(source).id).toBe('java');
  });

  it('detects Go', () => {
    const source = `
package main
func assign(origin int) int { x := origin; return x }
    `;
    expect(detectLanguage(source).id).toBe('go');
  });

  it('detects Rust', () => {
    const source = `
fn assign(origin: i32) -> i32 { let mut x = origin; x }
    `;
    expect(detectLanguage(source).id).toBe('rust');
  });

  it('detects TypeScript over plain JavaScript', () => {
    const source = `
interface Elevator { floor: number }
export function assignElevator(elevators: Elevator[]): number { return 0 }
    `;
    expect(detectLanguage(source).id).toBe('typescript');
  });

  it('falls back to JavaScript for empty source', () => {
    expect(detectLanguage('').id).toBe('javascript');
  });
});

describe('JavaScript participant runtime', () => {
  const elevators = [
    { id: 0, floor: 0, state: 'IDLE', occupancy: 0, capacity: 10, destinations: [], assignmentCount: 0 },
    { id: 1, floor: 8, state: 'IDLE', occupancy: 0, capacity: 10, destinations: [], assignmentCount: 0 },
  ];

  it('runs module-style source and returns a valid elevator id', () => {
    const scheduler = createJsScheduler(`
      export function assignElevator(request, cars) {
        return request.origin > 5 ? 1 : 0;
      }
    `);
    expect(scheduler.assign({ origin: 2, dest: 5, count: 1 }, elevators, 25200)).toBe(0);
    expect(scheduler.assign({ origin: 9, dest: 1, count: 1 }, elevators, 25200)).toBe(1);
  });

  it('accepts an arrow-function scheduler named assign', () => {
    const scheduler = createJsScheduler('const assign = (req) => (req.origin === 0 ? 1 : 0);');
    expect(scheduler.assign({ origin: 0, dest: 3, count: 1 }, elevators, 25200)).toBe(1);
  });

  it('coerces invalid return values to elevator A', () => {
    const scheduler = createJsScheduler('function assignElevator() { return "B"; }');
    expect(scheduler.assign({ origin: 1, dest: 2, count: 1 }, elevators, 25200)).toBe(0);
  });

  it('reports a clear error when no scheduler function exists', () => {
    expect(() => createJsScheduler('const notAnAlgorithm = 42;')).toThrow(/assignElevator/);
  });

  it('reports a syntax error instead of crashing silently', () => {
    expect(() => createJsScheduler('function assignElevator( {')).toThrow(/syntax error/i);
  });
});
