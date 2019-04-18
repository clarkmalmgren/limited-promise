import { LazyBucket } from './lazy-bucket'

function now(): number { return new Date().getTime() }

function delay(timeout: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), timeout)
  })
}

function generate(bucket: LazyBucket, count: number): Promise<number>[] {
  const start: number = now()

  return Array
    .from(Array(count).keys())
    .map(i => bucket.next().then(_ => now() - start))
}

it('should dispatch available tokens immediately leaving a balance of zero', () => {
  const bucket = new LazyBucket()
  const promises = generate(bucket, 10)

  expect(bucket.balance).toBeGreaterThanOrEqual(0)

  return Promise
    .all(promises)
    .then(delays => {
      delays.forEach(d => expect(d).toBeLessThan(1000))
    })
})

it('should allow for borrowing at an appropriate delay', () => {
  const bucket = new LazyBucket({ rate: 10, tokens: 10 })
  const promises = generate(bucket, 11)

  expect(bucket.balance).toBeGreaterThanOrEqual(-1)
  expect(bucket.balance).toBeLessThan(0)

  return Promise
    .all(promises)
    .then(delays => {
      delays.slice(0, 9).forEach(d => expect(d).toBeLessThan(1000))
      expect(delays[10]).toBeGreaterThanOrEqual(100)
    })
})

it('should replenish the token bucket after time passes', () => {
  const bucket = new LazyBucket({ rate: 10, tokens: 2 })
  const promises = generate(bucket, 3)

  return Promise
    .all(promises)
    .then(delays => {
      expect(delays[2]).toBeGreaterThanOrEqual(100)
      return delay(200)
    })
    .then(() => generate(bucket, 1)[0])
    .then(d => {
      expect(d).toBeLessThan(100)
    })
})

it('should reject requests immediately if the credit has been over-extended', () => {
  const bucket = new LazyBucket({ rate: 10, tokens: 2, tokenCredit: 2 })
  const promises = generate(bucket, 5)

  expect(promises[4]).rejects.toThrow(/Exceeded token credit allowance.*/)
})

it('should replenish even after the credit has been over-extended', () => {
  const bucket = new LazyBucket({ rate: 10, tokens: 2, tokenCredit: 1 })
  const promises = generate(bucket, 4)

  expect(promises[3]).rejects.toThrow(/Exceeded token credit allowance.*/)

  return delay(200)
    .then(() => generate(bucket, 1)[0])
    .then(d => {
      expect(d).toBeLessThanOrEqual(20)
    })
})

it('should support a overflowing bucket if constructed that way', () => {
  const bucket = new LazyBucket({ tokens: 10 }, 20)
  expect(bucket.balance).toEqual(20)

  const promises = generate(bucket, 20)
  expect(bucket.balance).toBeLessThan(1)
  expect(bucket.balance).toBeGreaterThanOrEqual(0)

  return Promise
    .all(promises)
    .then((delays) => {
      delays.forEach(d => expect(d).toBeLessThan(100))
    })
})

it('should support a depleated bucket if constructed that way', () => {
  const bucket = new LazyBucket({ tokens: 10, rate: 10 }, -1)
  expect(bucket.balance).toEqual(-1)

  const promise = generate(bucket, 1)[0]
  expect(bucket.balance).toBeCloseTo(-2, 1)

  return promise
    .then((d) => {
      expect(d).toBeGreaterThanOrEqual(200)
      expect(d).toBeLessThanOrEqual(210)
    })
})
