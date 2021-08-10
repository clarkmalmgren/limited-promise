import LimitedPromise, { CancellationHandle } from './index'

function now(): number { return new Date().getTime() }

function delay(timeout: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), timeout)
  })
}

function generate(bucket: LimitedPromise, count: number): Promise<number>[] {
  const start: number = now()

  return Array
    .from(Array(count).keys())
    .map(i => bucket.next().then(_ => now() - start))
}

it('should dispatch available tokens immediately leaving a balance of zero', () => {
  const bucket = new LimitedPromise()
  const promises = generate(bucket, 10)

  expect(bucket.balance).toBeGreaterThanOrEqual(0)

  return Promise
    .all(promises)
    .then(delays => {
      delays.forEach(d => expect(d).toBeLessThan(1000))
    })
})

it('should allow for borrowing at an appropriate delay', () => {
  const bucket = new LimitedPromise({ rate: 10, tokens: 10 })
  const promises = generate(bucket, 11)

  expect(bucket.balance).toBeGreaterThanOrEqual(-1)
  expect(bucket.balance).toBeLessThan(0)

  return Promise
    .all(promises)
    .then(delays => {
      delays.slice(0, 9).forEach(d => expect(d).toBeLessThan(1000))
      expect(delays[10]).toBeGreaterThanOrEqual(99)
    })
})

it('should replenish the token bucket after time passes', () => {
  const bucket = new LimitedPromise({ rate: 10, tokens: 2 })
  const promises = generate(bucket, 3)

  return Promise
    .all(promises)
    .then(delays => {
      expect(delays[2]).toBeGreaterThanOrEqual(99)
      return delay(200)
    })
    .then(() => generate(bucket, 1)[0])
    .then(d => {
      expect(d).toBeLessThan(100)
    })
})

it('should reject requests immediately if the credit has been over-extended', () => {
  const bucket = new LimitedPromise({ rate: 10, tokens: 2, tokenCredit: 2 })
  const promises = generate(bucket, 5)

  expect(promises[4]).rejects.toThrow(/Exceeded token credit allowance.*/)
})

it('should replenish even after the credit has been over-extended', () => {
  const bucket = new LimitedPromise({ rate: 10, tokens: 2, tokenCredit: 1 })
  const promises = generate(bucket, 4)

  expect(promises[3]).rejects.toThrow(/Exceeded token credit allowance.*/)

  return delay(200)
    .then(() => generate(bucket, 1)[0])
    .then(d => {
      expect(d).toBeLessThanOrEqual(20)
    })
})

it('should support a overflowing bucket if constructed that way', () => {
  const bucket = new LimitedPromise({ tokens: 10 }, 20)
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
  const bucket = new LimitedPromise({ tokens: 10, rate: 10 }, -1)
  expect(bucket.balance).toEqual(-1)

  const promise = generate(bucket, 1)[0]
  expect(bucket.balance).toBeCloseTo(-2, 1)

  return promise
    .then((d) => {
      expect(d).toBeGreaterThanOrEqual(199)
      expect(d).toBeLessThanOrEqual(210)
    })
})

it('should reject promises when cancelled', () => {
  const bucket = new LimitedPromise({ rate: 10 }, -5)
  const promises = generate(bucket, 5)

  bucket.cancel()

  const assertions =
    promises.map(p => {
      return expect(p).rejects.toThrow("Bucket Cancelled")
    })

  return Promise.all(assertions)
})


it('should do nothing when cancelling if all tasks have fired', () => {
  const bucket = new LimitedPromise({ rate: 10 }, 0)
  const promises = generate(bucket, 2)

  return Promise
    .all(promises)
    .then(() => bucket.cancel())
})

type PromiseMonitor = { resolved: boolean, rejected: boolean, promise: Promise<void> }
function monitor(bucket: LimitedPromise, handle?: CancellationHandle): PromiseMonitor {
  const status: PromiseMonitor = {
    resolved: false,
    rejected: false,
    promise: bucket
      .next(handle)
      .then(() => { status.resolved = true })
      .catch(() => { status.rejected = true })
  }
  
  return status
}

it('should work for a simple controlled timer example', async () => {
  jest.useFakeTimers()
  const bucket = new LimitedPromise({ rate: 1, tokens: 100 }, 0)
  expect(bucket.balance).toEqual(0)

  const p1 = monitor(bucket)
  const p2 = monitor(bucket)
  const p3 = monitor(bucket)
  expect(bucket.balance).toBeCloseTo(-3, 1)

  expect(p1.resolved).toEqual(false)
  expect(p2.resolved).toEqual(false)
  expect(p3.resolved).toEqual(false)

  jest.advanceTimersByTime(1000)
  await p1.promise
  expect(p1.resolved).toEqual(true)
  expect(p2.resolved).toEqual(false)
  expect(p3.resolved).toEqual(false)
})

function stringify(monitors: PromiseMonitor[]): string {
  return monitors.map(m => (m.resolved && m.rejected) ? '!' : m.resolved ? '✓' : m.rejected ? 'x' : ' ').join('')
}

it('should work when cancelling specific tasks', async () => {
  jest.useFakeTimers()
  const bucket = new LimitedPromise({ rate: 1000, tokens: 20, tokenCredit: 20 }, 0)
  expect(bucket.balance).toEqual(0)

  const monitors = [
    monitor(bucket, 'noop'),
    monitor(bucket, 'noop'),
    monitor(bucket, 'kill -9'),
    monitor(bucket, 'kill -9'),
    monitor(bucket),
    monitor(bucket),
    monitor(bucket),
    monitor(bucket, 'kill -9'),
    monitor(bucket, 'kill -9'),
    monitor(bucket)
  ]
  expect(bucket.balance).toBeCloseTo(-10, 1)

  await Promise.resolve()
  expect(stringify(monitors)).toEqual('          ')
  jest.advanceTimersByTime(3)
  await Promise.resolve()
  expect(stringify(monitors)).toEqual('✓✓✓       ')
  bucket.cancel('noop')
  await Promise.all([monitors[0].promise, monitors[1].promise])
  expect(stringify(monitors)).toEqual('✓✓✓       ')
  bucket.cancel('kill -9')
  await Promise.all([monitors[3].promise, monitors[7].promise, monitors[8].promise])
  expect(stringify(monitors)).toEqual('✓✓✓x   xx ')
  jest.advanceTimersByTime(1)
  await Promise.resolve()
  expect(stringify(monitors)).toEqual('✓✓✓x✓  xx ')
  jest.advanceTimersByTime(3)
  await Promise.resolve()
  expect(stringify(monitors)).toEqual('✓✓✓x✓✓✓xx✓')
})

afterEach(() => {
  jest.useRealTimers()
})
