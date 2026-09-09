import test from 'node:test'
import assert from 'node:assert/strict'
import { topupAmountKobo } from '../src/walletAmounts.js'

test('wallet amounts preserve decimal kobo and enforce limits', () => {
  assert.equal(topupAmountKobo('100'), 10000)
  assert.equal(topupAmountKobo('100.01'), 10001)
  assert.equal(topupAmountKobo(' 5000.5 '), 500050)
  assert.equal(topupAmountKobo('1000000'), 100000000)
  for (const input of ['', null, '99.99', '-100', '1e4', '100.001', '1000000.01', 'NaN', '1,000', '100.', '0x100']) assert.equal(topupAmountKobo(input), null)
})
