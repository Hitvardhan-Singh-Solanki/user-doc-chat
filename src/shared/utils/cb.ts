import CircuitBreaker from 'opossum';

export function createCircuitBreaker<Args extends unknown[], ReturnType>(
  fn: (...args: Args) => Promise<ReturnType>,
  options: CircuitBreaker.Options,
): CircuitBreaker<Args, ReturnType> {
  return new CircuitBreaker(fn, options);
}
