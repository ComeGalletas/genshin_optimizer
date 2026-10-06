/**
 * zod/mini carries no English messages (ADR-0022 keeps the locale out of
 * the bundle): plain ones for a schema's issues, each with its dotted path,
 * for the files and requests that have no hand-written messages of their
 * own (rotation metas, team comparisons). Pure.
 * @packageDocumentation
 */

import type * as z from 'zod/mini';

export interface IssueText {
  /** Dotted, from `root` (`meta.fight.enemy.hp`). */
  path: string;
  message: string;
}

export function describeIssues(
  issues: readonly z.core.$ZodIssue[],
  root: string,
): IssueText[] {
  return issues.flatMap((issue): IssueText[] => {
    const at = (p: readonly PropertyKey[]) =>
      [root, ...p.map(String)].filter(Boolean).join('.') || root;
    const one = (message: string) => [{ path: at(issue.path), message }];
    switch (issue.code) {
      case 'unrecognized_keys':
        return issue.keys.map((k) => ({
          path: at([...issue.path, k]),
          message: 'unknown field',
        }));
      case 'invalid_type':
        return one(`expected ${issue.expected}`);
      case 'invalid_value':
        return one(
          `must be ${issue.values.map((v) => JSON.stringify(v)).join(' or ')}`,
        );
      case 'invalid_format':
        return one(
          'pattern' in issue && issue.format === 'regex'
            ? `must match ${String(issue.pattern)}`
            : `not a valid ${issue.format}`,
        );
      case 'too_small':
        return one(`at least ${issue.minimum}`);
      case 'too_big':
        return one(`at most ${issue.maximum}`);
      case 'invalid_union':
        return one('not one of the accepted forms');
      default:
        return one(issue.message);
    }
  });
}
