

export type LazyBucketConfig = {
  /* Number of tokens in the bucket, if tokens are available, will resolve immediately */
  tokens?: number

  /* How many tokens into the future you can borrow without exceeding the rate. These tasks will get scheduled. After the credit has been exceeded, new tasks will be rejected. */
  tokenCredit?: number

  /* The rate at which new tokens are added to the pool. Measured in tokens/second */
  rate?: number
}

type FullLazyBucketConfig = {
  tokens: number
  tokenCredit: number
  rate: number
}

const DefaultConfig: FullLazyBucketConfig = {
  tokens: 10,
  tokenCredit: 10,
  rate: 1 / 60
}

export class LazyBucket {

  private config: FullLazyBucketConfig
  private balance: number
  private lastTime: number

  constructor(config: LazyBucketConfig= {}) {
    this.config = Object.assign(Object.assign({}, DefaultConfig), config)
    this.balance = this.config.tokens
    this.lastTime = new Date().getTime()
  }

  private nextDelay(): number {
    // First update times
    const now = new Date().getTime()
    const dt = now - this.lastTime
    this.lastTime = now

    // Calculate the new balance
    const addedTokens = dt / 1000.0 * this.config.rate
    this.balance = Math.min(this.balance + addedTokens, this.config.tokens)

    // Time to calculate duration
    if (this.balance >= 1) {
      this.balance--
      return 0
    } else if (this.balance < -this.config.tokenCredit) {
      throw new Error(`Exceeded token credit allowance. Current Balance: ${this.balance}`)
    } else {
      const delayInTokens = 1 - this.balance
      this.balance--
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
}