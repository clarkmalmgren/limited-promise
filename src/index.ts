
/* Configuration for a lazy bucket */
export type LimitedPromiseConfig = {
  /* Number of tokens in the bucket, if tokens are available, will resolve immediately */
  tokens?: number

  /* How many tokens into the future you can borrow without exceeding the rate. These tasks will get scheduled. After the credit has been exceeded, new tasks will be rejected. */
  tokenCredit?: number

  /* The rate at which new tokens are added to the pool. Measured in tokens/second */
  rate?: number
}

/* Internal type where all fields are defined */
type FullLimitedPromiseConfig = {
  tokens: number
  tokenCredit: number
  rate: number
}

/* The default configuration if nothing is passed */
const DefaultConfig: FullLimitedPromiseConfig = {
  tokens: 10,
  tokenCredit: 10,
  rate: 1 / 60
}

type ResolveFunction = () => void
type RejectFunction = (reason?: any) => void
type PendingTaskContext = {
  resolve: ResolveFunction
  reject: RejectFunction
  cancelled: boolean
  handle?: CancellationHandle 
  id?: number
}

export type CancellationHandle = string | number

export default class LimitedPromise {

  private config: FullLimitedPromiseConfig
  private _balance: number
  private lastTime: number
  private pending: PendingTaskContext[]
  private cancellable: Record<number | string, Record<number, PendingTaskContext>>
  private pendingTimeout?: any // Node and browser can't agree on the type here
  private nextId: number

  /**
   * Constructs a new LimitedPromise with the given config. If no initial balance is provided,
   * it will default to a "full" bucket. There are no restrictions on the initialBalance and
   * thus can be used to start with effectively an overflowing or depleated bucket.
   * 
   * @param config 
   * @param initialBalance 
   */
  constructor(config: LimitedPromiseConfig = {}, initialBalance?: number) {
    this.config = Object.assign(Object.assign({}, DefaultConfig), config)
    this._balance = typeof initialBalance === 'undefined' ? this.config.tokens : initialBalance
    this.lastTime = new Date().getTime()
    this.pending = []
    this.cancellable = {}
    this.nextId = 0

    /* If someone really wants to start with a depleted bucket, add dummy pending tasks */
    if (this._balance < 0) {
      for (let i = 0; i > this._balance; i--) {
        this.pending.push({ resolve: () => 0, reject: () => 0, cancelled: false })
      }
      this.pendingTimeout = setInterval(() => this.resolveNext(), 1000.0 / this.config.rate)
    }
  }

  next(cancellationHandle?: CancellationHandle): Promise<void> {
    // First update times
    const now = new Date().getTime()
    const dt = now - this.lastTime
    this.lastTime = now

    // Calculate the new balance only if below the threshold
    if (this._balance < this.config.tokens) {
      const addedTokens = dt / 1000.0 * this.config.rate
      this._balance = Math.min(this._balance + addedTokens, this.config.tokens)

      //this prevents large negative balances if your device time changes
      this._balance = Math.max(this._balance, -this.config.tokenCredit)
    }

    // If the token count is exceeded, throw an error
    if (this._balance < -this.config.tokenCredit + 1) {
      return Promise.reject(new Error(`Exceeded token credit allowance. Current Balance: ${this._balance}`))
    }

    // All good, enough tokens to proceed. Deprecate and then execute based on whether or not it is async
    this._balance--
    return (this._balance >= 0) ?
      Promise.resolve() :
      new Promise((resolve, reject) => {
        // Add context to pending
        const context: PendingTaskContext = { resolve, reject, cancelled: false }
        this.pending.push(context)

        // Associate context with CancellationHandle if one was provided
        if (typeof cancellationHandle !== 'undefined') {
          const id = this.nextId++
          context.id = id
          context.handle = cancellationHandle
          if (this.cancellable[cancellationHandle]) {
            this.cancellable[cancellationHandle][id] = context
          } else {
            this.cancellable[cancellationHandle] = { [id]: context }
          }
        }

        // Finally make sure that the timer is running
        if (typeof this.pendingTimeout === 'undefined') {
          this.pendingTimeout = setInterval(() => this.resolveNext(), 1000.0 / this.config.rate)
        }
      })
  }

  private resolveNext(): void {
    try {
      // Find the next non-cancelled event
      let next = this.pending.shift()
      while (next && next.cancelled) {
        next = this.pending.shift()
      }

      // Assuming there is an actual event to run, run it and delete it's cancellation lookup
      if (next) {
        next.resolve()

        if (typeof next.handle !== 'undefined' && typeof next.id !== 'undefined') {
          delete this.cancellable[next.handle][next.id]
          if (Object.keys(this.cancellable[next.handle]).length === 0) {
            delete this.cancellable[next.handle]
          }
        }
      }
    } finally {
      // If the pending array is non-empty, schedule again
      if (this.pending.length === 0) {
        clearInterval(this.pendingTimeout)
        this.pendingTimeout = undefined
      }
    }
  }

  get balance(): number {
    return this._balance
  }

  cancel(handle?: CancellationHandle): void {
    if (typeof handle === 'undefined') {
      this.pending.forEach(context => { context.reject(new Error("Bucket Cancelled")) })
      this.pending = []
      this.cancellable = {}
    } else if (this.cancellable[handle])  {
      Object.values(this.cancellable[handle])
        .forEach(context => {
          context.reject(new Error(`Cancelled based on handle[${handle}]`))
          context.cancelled = true
        })

      delete this.cancellable[handle]
    }
  }
}
