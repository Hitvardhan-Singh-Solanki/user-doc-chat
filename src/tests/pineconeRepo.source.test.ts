/**
 * Unit tests for src/tests/pineconeRepo.spec.ts
 *
 * Testing library and framework:
 * - This test file is authored for Jest (ts-jest) by default, using jest.mock and jest.resetModules.
 * - If your repository uses Vitest, see the commented Vitest section below and adjust imports accordingly.
 */

 // ============================
 // Jest version
 // ============================

import type { Mock } from 'jest-mock';

// We will mock the @pinecone-database/pinecone module to avoid real SDK instantiation.
jest.mock('@pinecone-database/pinecone', () => {
  const PineconeMock = jest.fn();
  return { Pinecone: PineconeMock };
});

describe('pineconeRepo module', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules(); // critical to re-evaluate the module with fresh env and mocks
    process.env = { ...ORIGINAL_ENV };
    // Clear mock call history in case the module was imported before
    const { Pinecone } = require('@pinecone-database/pinecone');
    (Pinecone as unknown as Mock).mockClear();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  test('constructs Pinecone with apiKey from PINECONE_API_KEY and exports the instance (happy path)', async () => {
    const DUMMY_KEY = 'pc_test_key_123';
    process.env.PINECONE_API_KEY = DUMMY_KEY;

    // Dynamically import after setting env so top-level constructor sees it
    const { pinecone } = await import('../../tests/pineconeRepo.spec');

    const { Pinecone } = require('@pinecone-database/pinecone');
    const PineconeMock = Pinecone as unknown as Mock;

    // Assert constructor called once with expected shape
    expect(PineconeMock).toHaveBeenCalledTimes(1);
    expect(PineconeMock).toHaveBeenCalledWith({ apiKey: DUMMY_KEY });

    // Ensure exported object is exactly the instance returned by the constructor
    const constructedInstance = PineconeMock.mock.results[0]?.value;
    expect(pinecone).toBe(constructedInstance);
  });

  test('when PINECONE_API_KEY is missing, constructor receives undefined (edge case)', async () => {
    delete process.env.PINECONE_API_KEY;

    const { pinecone } = await import('../../tests/pineconeRepo.spec');

    const { Pinecone } = require('@pinecone-database/pinecone');
    const PineconeMock = Pinecone as unknown as Mock;

    expect(PineconeMock).toHaveBeenCalledTimes(1);
    // Because the code uses non-null assertion (!), runtime does not throw;
    // the actual value passed will be undefined in Node if env var is missing.
    expect(PineconeMock).toHaveBeenCalledWith({ apiKey: undefined });

    // Export should still be whatever constructor returned
    const constructedInstance = PineconeMock.mock.results[0]?.value;
    expect(pinecone).toBe(constructedInstance);
  });

  test('module import is idempotent within module cache (same instance on repeated imports without resetModules)', async () => {
    process.env.PINECONE_API_KEY = 'pc_same_instance';

    const first = await import('../../tests/pineconeRepo.spec');
    const second = await import('../../tests/pineconeRepo.spec');

    expect(first.pinecone).toBe(second.pinecone);

    const { Pinecone } = require('@pinecone-database/pinecone');
    expect((Pinecone as unknown as Mock)).toHaveBeenCalledTimes(1);
  });
});


/* ========================================================================
   Vitest version (use if the repo uses Vitest; comment out the Jest block)
   ========================================================================

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@pinecone-database/pinecone', () => {
  return { Pinecone: vi.fn() };
});

describe('pineconeRepo module (Vitest)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    const { Pinecone } = require('@pinecone-database/pinecone');
    (Pinecone as any).mockClear();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  test('constructs Pinecone with apiKey from PINECONE_API_KEY and exports the instance (happy path)', async () => {
    const DUMMY_KEY = 'pc_test_key_123';
    process.env.PINECONE_API_KEY = DUMMY_KEY;

    const { pinecone } = await import('../../tests/pineconeRepo.spec');

    const { Pinecone } = require('@pinecone-database/pinecone');
    expect(Pinecone).toHaveBeenCalledTimes(1);
    expect(Pinecone).toHaveBeenCalledWith({ apiKey: DUMMY_KEY });

    const constructedInstance = (Pinecone as any).mock.results[0]?.value;
    expect(pinecone).toBe(constructedInstance);
  });

  test('when PINECONE_API_KEY is missing, constructor receives undefined (edge case)', async () => {
    delete process.env.PINECONE_API_KEY;

    const { pinecone } = await import('../../tests/pineconeRepo.spec');

    const { Pinecone } = require('@pinecone-database/pinecone');
    expect(Pinecone).toHaveBeenCalledTimes(1);
    expect(Pinecone).toHaveBeenCalledWith({ apiKey: undefined });

    const constructedInstance = (Pinecone as any).mock.results[0]?.value;
    expect(pinecone).toBe(constructedInstance);
  });

  test('module import is idempotent within module cache (same instance on repeated imports without resetModules)', async () => {
    process.env.PINECONE_API_KEY = 'pc_same_instance';

    const first = await import('../../tests/pineconeRepo.spec');
    const second = await import('../../tests/pineconeRepo.spec');

    expect(first.pinecone).toBe(second.pinecone);

    const { Pinecone } = require('@pinecone-database/pinecone');
    expect((Pinecone as any)).toHaveBeenCalledTimes(1);
  });
});
*/