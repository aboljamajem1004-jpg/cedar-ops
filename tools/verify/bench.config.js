import base from './playwright.config.js'

/**
 * The benchmark loads the page eight times and samples each for several
 * seconds, so it is kept out of `npm run verify`. Playwright's default matcher
 * only picks up *.spec.js, which is why the benchmark is named *.bench.js.
 *
 * Run it with `npm run bench`.
 */
export default {
  ...base,
  testMatch: '**/*.bench.js',
  timeout: 300_000,
}
