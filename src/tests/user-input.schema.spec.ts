/**
 * Tests for UserInputSchema
 * Framework: Vitest (detected)
 */
import { describe, it, expect } from 'vitest';
import { UserInputSchema } from '../schemas/user-input.schema.spec';

const repeat = (ch: string, n: number) => Array(n + 1).join(ch);

describe('UserInputSchema', () => {
  it('validates minimal valid input and applies defaults', () => {
    const result = UserInputSchema.parse({ question: 'a' });
    expect(result.context).toBe('(No context provided)');
    expect(result.chatHistory).toEqual([]);
  });

  it('accepts question at maximum length (2000)', () => {
    const q = repeat('a', 2000);
    const res = UserInputSchema.safeParse({ question: q });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.question.length).toBe(2000);
    }
  });

  it('rejects question exceeding maximum length (2001)', () => {
    const q = repeat('a', 2001);
    const res = UserInputSchema.safeParse({ question: q });
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find(i => (i as any).path && (i as any).path[0] === 'question');
      expect(issue).toBeTruthy();
      expect(issue?.code).toBe('too_big');
    }
  });

  it('rejects empty question with custom message', () => {
    const res = UserInputSchema.safeParse({ question: '' });
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find(i => (i as any).path && (i as any).path[0] === 'question');
      expect(issue?.message).toBe('Question cannot be empty');
      expect(issue?.code).toBe('too_small');
    }
  });

  it('rejects missing required question field', () => {
    const res = UserInputSchema.safeParse({} as any);
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find(i => (i as any).path && (i as any).path[0] === 'question');
      expect(issue?.code).toBe('invalid_type');
    }
  });

  it('rejects non-string question values', () => {
    const res = UserInputSchema.safeParse({ question: 123 as any });
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find(i => (i as any).path && (i as any).path[0] === 'question');
      expect(issue?.code).toBe('invalid_type');
    }
  });

  it('applies default context when omitted or undefined', () => {
    const a = UserInputSchema.parse({ question: 'ok' });
    expect(a.context).toBe('(No context provided)');

    const b = UserInputSchema.parse({ question: 'ok', context: undefined as any });
    expect(b.context).toBe('(No context provided)');
  });

  it('preserves provided context including empty string', () => {
    const withValue = UserInputSchema.parse({ question: 'ok', context: 'ctx' });
    expect(withValue.context).toBe('ctx');

    const empty = UserInputSchema.parse({ question: 'ok', context: '' });
    expect(empty.context).toBe('');
  });

  it('defaults chatHistory to empty array when omitted or undefined', () => {
    const a = UserInputSchema.parse({ question: 'ok' });
    expect(a.chatHistory).toEqual([]);

    const b = UserInputSchema.parse({ question: 'ok', chatHistory: undefined as any });
    expect(b.chatHistory).toEqual([]);
  });

  it('accepts chatHistory as an array of strings', () => {
    const res = UserInputSchema.safeParse({ question: 'ok', chatHistory: ['hi', 'there'] });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.chatHistory).toEqual(['hi', 'there']);
    }
  });

  it('rejects chatHistory containing non-string entries', () => {
    const res = UserInputSchema.safeParse({ question: 'ok', chatHistory: ['hi', 42 as any] });
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find(i => JSON.stringify((i as any).path) === JSON.stringify(['chatHistory', 1]));
      expect(issue?.code).toBe('invalid_type');
    }
  });

  it('strips unknown keys from the output by default', () => {
    const out = UserInputSchema.parse({ question: 'ok', extra: 'ignored' } as any);
    expect((out as any).extra).toBeUndefined();
    expect(Object.keys(out).sort()).toEqual(['chatHistory', 'context', 'question']);
  });

  it('allows whitespace-only question since no trimming is enforced', () => {
    const res = UserInputSchema.safeParse({ question: ' ' });
    expect(res.success).toBe(true);
  });
});