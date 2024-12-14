import QuickLRU from 'quick-lru';

const cache = new QuickLRU({
  maxSize: 1000
});

module.exports = cache; 