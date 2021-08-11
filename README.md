# limited-promise
Rate Limited Promises powered by a credit-allowing Lazy Token Bucket.

## Installation

Using yarn...
```
$ yarn add limited-promise
```

Using npm...
```
$ npm install limited-promise --save
```

## Usage

```typescript
import LimitedPromise, { LimitedPromiseConfig } from 'limited-promise'

const config: LimitedPromiseConfig = {
  tokens: 10,      // maximum burst "immediate" usages
  tokenCredit: 10, // maximum tasks that can be scheduled
  rate: 10         // refill rate (requests per second)
}

const bucket = new LimitedPromise(config)

for (let i = 0; i <= 30; i++) {
  bucket
    .next()
    .then(() => doSomeTask())
}
```

In the above scenario, the first 10 tasks will fire immediately. The next
10 will fire once every 100ms. The last 10 tasks will get rejected immediately.

If new tasks arrive before the scheduled token debt has been paid off (time passes),
then new tokens will be scheduled for the future.

### Initial Balance

If you want to set a higher initial balance of tokens (to allow for a burst of tasks on
app startup for example), you can pass a custom initial limit.

```typescript
const config: LimitedPromiseConfig = {
  tokens: 10,      // maximum burst "immediate" usages
  tokenCredit: 10, // maximum tasks that can be scheduled
  rate: 10         // refill rate (requests per second)
}

const initialBalance: number = 100;

const bucket = new LimitedPromise(config, initialBalance);
```

### Cancellation Handles

In certain scenarios, you may want to cancel one or more requests before they actually trigger.
For example, if you have a page that makes many requests and the user navigates away before all
of the requests have fired, you can cancel them using a handle. The handle must be passed in at
the time that a token is requested from the bucket. This can be either a `string` or a `number`.

```typescript
const bucket = new LimitedPromise()

const promise1 bucket.next('a').then(() => 'apples')
const promise2 bucket.next('a').then(() => 'and')
const promise3 bucket.next('b').then(() => 'bananas')

bucket.cancel('a')

// promise1 is rejected
// promise2 is rejected
// promise3 is the NEXT promise to resolve
```

## Notes on Implementation

This uses `setInterval` and `Date` for scheduling and thus is restricted to that level
of granularity.
