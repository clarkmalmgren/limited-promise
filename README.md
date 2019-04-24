# limited-promise
Rate Limited Promises powered by a credit-allowing Lazy Token Bucket.

## Installation

Using yarn...
```
$ yarn add limited-promise
```

Using npm...
```
$ npm install limited-promise
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

## Notes on Implementation

This uses `setTimeout` and `Date` for scheduling and thus is restricted to that level
of granularity. Each bucket has an at-rest footprint of 


