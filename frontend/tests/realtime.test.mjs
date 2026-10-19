import assert from 'node:assert/strict'
import test from 'node:test'
import { createRealtimeClient, emitRealtime, subscribeRealtime, websocketUrl } from '../src/lib/realtime.js'

function harness() {
  const sockets = [], timers = new Map(), intervals = new Map(), listeners = new Map()
  let timerId = 0
  class FakeSocket {
    constructor(url) { this.url = url; sockets.push(this) }
    message(message) { this.onmessage?.({ data: JSON.stringify(message) }) }
    close(code = 1006) { this.onclose?.({ code }) }
  }
  const browser = {
    WebSocket: FakeSocket, location: { href: 'https://driver.pesan.biz/user/home' }, navigator: { onLine: true },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id },
    clearTimeout(id) { timers.delete(id) },
    setInterval(fn) { const id = ++timerId; intervals.set(id, fn); return id },
    clearInterval(id) { intervals.delete(id) },
    addEventListener(name, fn) { listeners.set(name, fn) },
    removeEventListener(name) { listeners.delete(name) },
  }
  const page = { visibilityState: 'visible', addEventListener: browser.addEventListener, removeEventListener: browser.removeEventListener }
  const events = []
  const expired = []
  const client = createRealtimeClient({ apiBase: '/api', browser, page, emit: (topics) => events.push(topics || 'all'), sessionExpired: () => expired.push(true) })
  const tick = () => { for (const fn of intervals.values()) fn() }
  const retry = () => { const [id, item] = timers.entries().next().value; timers.delete(id); item.fn() }
  return { client, browser, page, sockets, events, expired, timers, intervals, listeners, tick, retry }
}

test('WebSocket URL supports production relative API and local absolute API, without tokens', () => {
  assert.equal(websocketUrl('/api', 'https://driver.pesan.biz/user/home'), 'wss://driver.pesan.biz/api/realtime')
  assert.equal(websocketUrl('http://localhost:8000', 'http://localhost:5173'), 'ws://localhost:8000/realtime')
})

test('ready resynchronizes, events filter unknown topics, and subscribers only refresh matching data', () => {
  const state = harness()
  state.client.start()
  state.sockets[0].message({ type: 'ready' })
  state.sockets[0].message({ type: 'changed', topics: ['bookings', 'unknown'] })
  assert.deepEqual(state.events, ['all', ['bookings']])
  let bookings = 0, tickets = 0
  const removeBooking = subscribeRealtime(['bookings'], () => bookings++)
  const removeTicket = subscribeRealtime(['tickets'], () => tickets++)
  emitRealtime(['bookings'])
  assert.equal(bookings, 1)
  assert.equal(tickets, 0)
  removeBooking(); removeTicket()
  state.client.stop()
})

test('disconnect retries with backoff and reconnect always recovers missed changes', () => {
  const state = harness()
  state.client.start()
  state.sockets[0].message({ type: 'ready' })
  state.sockets[0].close()
  assert.equal(state.timers.size, 1)
  assert.ok([...state.timers.values()][0].delay >= 1000)
  state.retry()
  assert.equal(state.sockets.length, 2)
  state.sockets[1].message({ type: 'ready' })
  assert.deepEqual(state.events, ['all', 'all'])
  state.client.stop()
  assert.equal(state.timers.size, 0)
  assert.equal(state.intervals.size, 0)
  assert.equal(state.listeners.size, 0)
})

test('fallback sync works offline and suspended tabs resync on return', () => {
  const state = harness()
  state.browser.navigator.onLine = false
  state.client.start()
  assert.equal(state.sockets.length, 0)
  state.tick()
  assert.equal(state.events.length, 1)
  state.page.visibilityState = 'hidden'
  state.tick()
  assert.equal(state.events.length, 1)
  state.browser.navigator.onLine = true
  state.page.visibilityState = 'visible'
  state.listeners.get('visibilitychange')()
  assert.equal(state.sockets.length, 1)
  assert.equal(state.events.length, 2)
  state.client.stop()
})

test('expired session refreshes authentication and stopped clients ignore late events', () => {
  const state = harness()
  state.client.start()
  const socket = state.sockets[0]
  socket.message({ type: 'ready' })
  socket.close(4401)
  assert.equal(state.expired.length, 1)
  state.client.stop()
  socket.message({ type: 'changed', topics: ['bookings'] })
  assert.deepEqual(state.events, ['all'])
})
