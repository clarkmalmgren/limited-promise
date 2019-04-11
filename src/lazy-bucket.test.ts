import { LazyBucket } from './lazy-bucket'

function now(): number { return new Date().getTime() }

it('works', () => {
  const bucket = new LazyBucket({ rate: 1, tokenCredit: 2 })
  const start = now()
  function delay(): number { return now() - start }
  const promises: Promise<void>[] = []
  
  for (let i = 1; i < 23; i++) {
    promises.push(
      bucket
        .next()
        .then(() => { console.log(`${i}: Executed after ${delay()}ms`) })
        .catch(() => { console.error(`${i}: Rejected`) })
    )
  }

  return Promise.all(promises)
}, 60000)
