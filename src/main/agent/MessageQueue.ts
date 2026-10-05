/** A push-based AsyncIterable: the SDK's streaming-input prompt, fed as the user types. */
export class MessageQueue<T> implements AsyncIterable<T> {
  private items: T[] = []
  private waiting: ((r: IteratorResult<T>) => void) | null = null
  private closed = false

  push(item: T) {
    if (this.closed) throw new Error('queue closed')
    if (this.waiting) {
      this.waiting({ value: item, done: false })
      this.waiting = null
    } else {
      this.items.push(item)
    }
  }

  close() {
    this.closed = true
    this.waiting?.({ value: undefined, done: true })
    this.waiting = null
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const item = this.items.shift()
        if (item !== undefined) return Promise.resolve({ value: item, done: false })
        if (this.closed) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve) => (this.waiting = resolve))
      },
      return: () => {
        this.close()
        return Promise.resolve({ value: undefined, done: true })
      },
    }
  }
}
