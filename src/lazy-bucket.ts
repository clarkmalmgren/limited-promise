
/* Configuration for a lazy bucket */
export type LazyBucketConfig = {
  /* Number of tokens in the bucket, if tokens are available, will resolve immediately */
  tokens?: number

  /* How many tokens into the future you can borrow without exceeding the rate. These tasks will get scheduled. After the credit has been exceeded, new tasks will be rejected. */
  tokenCredit?: number

  /* The rate at which new tokens are added to the pool. Measured in tokens/second */
  rate?: number
}

/* Internal type where all fields are defined */
type FullLazyBucketConfig = {
  tokens: number
  tokenCredit: number
  rate: number
}

/* The default configuration if nothing is passed */
const DefaultConfig: FullLazyBucketConfig = {
  tokens: 10,
  tokenCredit: 10,
  rate: 1 / 60
}

export class LazyBucket {

  private config: FullLazyBucketConfig
  private _balance: number
  private lastTime: number

  /**
   * Constructs a new lazy bucket with the given config. If no intiial balance is provided,
   * it will default to a "full" bucket. There are no restrictions on the initialBalance and
   * thus can be used to start with effectively an overflowing or depleated bucket.
   * 
   * @param config 
   * @param initialBalance 
   */
  constructor(config: LazyBucketConfig = {}, initialBalance?: number) {
    this.config = Object.assign(Object.assign({}, DefaultConfig), config)
    this._balance = initialBalance || this.config.tokens
    this.lastTime = new Date().getTime()
  }

  private nextDelay(): number {
    // First update times
    const now = new Date().getTime()
    const dt = now - this.lastTime
    this.lastTime = now

    // Calculate the new balance only if below the threshold
    if (this._balance < this.config.tokens) {
      const addedTokens = dt / 1000.0 * this.config.rate
      this._balance = Math.min(this._balance + addedTokens, this.config.tokens)
    }

    // Time to calculate duration
    if (this._balance >= 1) {
      this._balance--
      return 0
    } else if (this._balance < -this.config.tokenCredit + 1) {
      throw new Error(`Exceeded token credit allowance. Current Balance: ${this._balance}`)
    } else {
      const delayInTokens = 1 - this._balance
      this._balance--
      return 1000.0 * delayInTokens / this.config.rate
    }
  }

  next(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const delay = this.nextDelay()
        if (delay <= 0) {
          resolve()
        } else {
          setTimeout(() => resolve(), delay)
        }
      } catch(e) {
        reject(e)
      }
    })
  }

  get balance(): number {
    return this._balance
  }
}