// Mock factory functions for external dependencies
// These return the mock implementations directly to avoid hoisting issues

export const createHuggingFaceMock = () => ({
  featureExtraction: async (..._args: unknown[]) => [],
  chatCompletionStream: (..._args: unknown[]) => {
    return {
      [Symbol.asyncIterator]() {
        return {
          next: async () => ({ done: true, value: undefined }),
        };
      },
    };
  },
  chatCompletion: async (..._args: unknown[]) => ({
    choices: [{ message: { content: 'Hello world.' } }],
  }),
});

export const createPLimitMock = () => (_concurrency: number) => {
  return (fn: () => Promise<unknown>) => fn();
};

export const createNetMock = () => ({
  isIP: (ip: string) => {
    // IPv4 validation: exactly 4 octets, each 0-255, separated by dots
    const ipv4Regex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (ipv4Regex.test(ip)) {
      return 4;
    }

    // IPv6 validation: supports hex groups and :: compression
    const ipv6Regex =
      /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$|^(?:[0-9a-fA-F]{1,4}:)*::(?:[0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:)*::[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$/;
    if (ipv6Regex.test(ip)) {
      return 6;
    }

    return 0;
  },
});

export const createDnsPromisesMock = () => ({
  lookup: async (hostname: string) => {
    if (hostname.includes('private')) {
      return { address: '192.168.1.1' };
    }
    return { address: '8.8.8.8' };
  },
});

export const createJSDOMMock = () => (html: string, _options: unknown) => ({
  window: {
    document: {
      title: 'Mock Document Title',
      body: {
        innerHTML: html,
        textContent: 'This is some mock article content.',
      },
    },
  },
});

export const createReadabilityMock = () => (_dom: unknown) => ({
  parse: () => {
    return {
      title: 'Mock Title',
      content: '<p>Mock Content</p>',
      textContent: 'This is some mock article content.',
      length: 34,
    };
  },
});

export const createFileTypeMock = () => () => ({
  ext: 'pdf',
  mime: 'application/pdf',
});

export const createUuidMock = () => () => 'mock-uuid-1234';
