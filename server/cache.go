package main

import (
	"container/list"
	"sync"
	"time"
)

const (
	maxCacheBytes = 150 * 1024 * 1024 // 150 MB
	cacheTTL      = 2 * time.Hour
)

// checkInterval is a var so tests can set it to 0 to force generation checks.
var checkInterval = 30 * time.Second

type cacheEntry struct {
	key        string
	data       []byte
	expires    time.Time
	generation int64
	checkedAt  time.Time
}

// byteCache is a thread-safe byte-aware LRU cache with per-entry TTL.
// Evicts the least-recently-used entry when the total byte budget is exceeded.
type byteCache struct {
	mu       sync.Mutex
	ll       *list.List
	items    map[string]*list.Element
	size     int64
	maxBytes int64
	ttl      time.Duration
}

func newByteCache(maxBytes int64, ttl time.Duration) *byteCache {
	return &byteCache{
		ll:       list.New(),
		items:    make(map[string]*list.Element),
		maxBytes: maxBytes,
		ttl:      ttl,
	}
}

func (c *byteCache) get(key string) ([]byte, bool) {
	data, _, _, ok := c.getWithMeta(key)
	return data, ok
}

// getWithMeta returns cached data plus generation and checkedAt, all read under the lock.
func (c *byteCache) getWithMeta(key string) (data []byte, generation int64, checkedAt time.Time, ok bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	el, elOk := c.items[key]
	if !elOk {
		return
	}
	entry := el.Value.(*cacheEntry)
	if time.Now().After(entry.expires) {
		c.removeElement(el)
		return
	}
	c.ll.MoveToFront(el)
	return entry.data, entry.generation, entry.checkedAt, true
}

func (c *byteCache) set(key string, data []byte, generation int64) {
	// Ignore items larger than the entire cache budget
	if int64(len(data)) > c.maxBytes {
		return
	}
	now := time.Now()
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.items[key]; ok {
		c.ll.MoveToFront(el)
		entry := el.Value.(*cacheEntry)
		c.size -= int64(len(entry.data))
		entry.data = data
		entry.expires = now.Add(c.ttl)
		entry.generation = generation
		entry.checkedAt = now
		c.size += int64(len(data))
		// Re-enforce byte budget after updating existing entry
		for c.size > c.maxBytes && c.ll.Len() > 0 {
			c.removeElement(c.ll.Back())
		}
		return
	}
	entry := &cacheEntry{key: key, data: data, expires: now.Add(c.ttl), generation: generation, checkedAt: now}
	el := c.ll.PushFront(entry)
	c.items[key] = el
	c.size += int64(len(data))
	for c.size > c.maxBytes && c.ll.Len() > 0 {
		c.removeElement(c.ll.Back())
	}
}

// touch updates checkedAt for an existing entry to suppress redundant GCS metadata calls.
func (c *byteCache) touch(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.items[key]; ok {
		el.Value.(*cacheEntry).checkedAt = time.Now()
	}
}

func (c *byteCache) removeElement(el *list.Element) {
	c.ll.Remove(el)
	entry := el.Value.(*cacheEntry)
	delete(c.items, entry.key)
	c.size -= int64(len(entry.data))
}
