import { addressText, deliveryText } from '../../shared/commerce.mjs'
import { money } from './data/products'

export function downloadReceipt(order) {
  const text = [order.paymentStatus === 'paid' && !order.preview ? 'SABI WATER — PAYMENT RECEIPT' : 'SABI WATER — TEST / UNPAID ORDER', order.paymentStatus === 'paid' ? `Payment confirmed. Delivery status: ${order.status}.` : 'No confirmed payment or delivery.', order.status === 'Cancelled' ? `Cancelled: ${order.cancellationReason}. Refund: ${order.refundStatus || 'not required'}.` : '', order.reference, addressText(order.address), order.address.landmark, order.address.instructions, deliveryText(order), ...order.lines.map(p => `${p.qty} × ${p.name}: ${money(p.price * p.qty)}`), `Total: ${money(order.total)}`, order.paymentStatus ? `${order.paymentSource === 'wallet' ? 'Wallet' : 'Paystack'} ${order.paymentMode} — ${order.paymentStatus}` : 'Payment on delivery — unpaid'].join('\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${order.reference}-receipt.txt`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
