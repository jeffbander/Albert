/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by failing fast when a service is unavailable.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is down, requests fail immediately
 * - HALF_OPEN: Testing if service recovered, limited requests allowed
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms before attempting recovery (default: 60000) */
  resetTimeout?: number;
  /** Number of successful requests needed to close circuit (default: 3) */
  halfOpenSuccessThreshold?: number;
  /** Called when circuit state changes */
  onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private halfOpenSuccesses = 0;

  constructor(
    private readonly name: string,
    private readonly options: CircuitBreakerOptions = {}
  ) {}

  get failureThreshold(): number {
    return this.options.failureThreshold ?? 5;
  }

  get resetTimeout(): number {
    return this.options.resetTimeout ?? 60000;
  }

  get halfOpenSuccessThreshold(): number {
    return this.options.halfOpenSuccessThreshold ?? 3;
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit statistics
   */
  getStats(): {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime: number;
  } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Check if circuit allows requests
   */
  isAvailable(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      // Check if reset timeout has passed
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.transitionTo('half-open');
        return true;
      }
      return false;
    }

    // half-open: allow limited requests
    return true;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.isAvailable()) {
      throw new CircuitBreakerError(
        `Circuit breaker "${this.name}" is open. Service unavailable.`,
        this.name,
        this.state
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Record a successful operation
   */
  onSuccess(): void {
    this.successes++;

    if (this.state === 'half-open') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.halfOpenSuccessThreshold) {
        this.transitionTo('closed');
        this.failures = 0;
        this.halfOpenSuccesses = 0;
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success
      this.failures = 0;
    }
  }

  /**
   * Record a failed operation
   */
  onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      // Any failure in half-open goes back to open
      this.transitionTo('open');
      this.halfOpenSuccesses = 0;
    } else if (this.state === 'closed') {
      if (this.failures >= this.failureThreshold) {
        this.transitionTo('open');
      }
    }
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.transitionTo('closed');
    this.failures = 0;
    this.successes = 0;
    this.halfOpenSuccesses = 0;
  }

  /**
   * Manually trip the circuit breaker
   */
  trip(): void {
    this.transitionTo('open');
    this.lastFailureTime = Date.now();
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      console.log(`[CircuitBreaker] ${this.name}: ${oldState} -> ${newState}`);
      this.options.onStateChange?.(this.name, oldState, newState);
    }
  }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly circuitName: string,
    public readonly circuitState: CircuitState
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Pre-configured circuit breakers for different services
 */
export const circuitBreakers = {
  browser: new CircuitBreaker('browser', {
    failureThreshold: 3,
    resetTimeout: 30000, // 30 seconds
    halfOpenSuccessThreshold: 2,
  }),

  perplexity: new CircuitBreaker('perplexity', {
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    halfOpenSuccessThreshold: 3,
  }),

  build: new CircuitBreaker('build', {
    failureThreshold: 5,
    resetTimeout: 120000, // 2 minutes
    halfOpenSuccessThreshold: 2,
  }),

  gmail: new CircuitBreaker('gmail', {
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    halfOpenSuccessThreshold: 3,
  }),
};

/**
 * Get a circuit breaker by name, creating one if it doesn't exist
 */
const dynamicBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
  // Check pre-configured breakers first
  if (name in circuitBreakers) {
    return circuitBreakers[name as keyof typeof circuitBreakers];
  }

  // Check dynamic breakers
  if (!dynamicBreakers.has(name)) {
    dynamicBreakers.set(name, new CircuitBreaker(name, options));
  }

  return dynamicBreakers.get(name)!;
}

/**
 * Check if any critical circuit is open
 */
export function hasOpenCircuits(): string[] {
  const openCircuits: string[] = [];

  for (const [name, breaker] of Object.entries(circuitBreakers)) {
    if (breaker.getState() === 'open') {
      openCircuits.push(name);
    }
  }

  return openCircuits;
}
