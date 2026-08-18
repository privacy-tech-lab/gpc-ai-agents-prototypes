'use strict';

const { PUBLISHERS, getPublisher, listPublisherIds } = require('../services/tool_registry');

describe('tool_registry', () => {
  test('catalog has exactly 8 publishers', () => {
    expect(PUBLISHERS.length).toBe(8);
  });

  test('every entry declares the required fields', () => {
    for (const p of PUBLISHERS) {
      expect(p).toEqual(expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        category: expect.any(String),
        supports_gpc: expect.any(Boolean),
        enforcement: expect.stringMatching(/^(strict|advisory|none)$/),
      }));
    }
  });

  test('getPublisher returns the matching record', () => {
    const v = getPublisher('the-verge');
    expect(v).not.toBeNull();
    expect(v.enforcement).toBe('strict');
  });

  test('getPublisher returns null for an unknown id', () => {
    expect(getPublisher('not-real')).toBeNull();
  });

  test('listPublisherIds returns all ids in catalog order', () => {
    const ids = listPublisherIds();
    expect(ids).toHaveLength(PUBLISHERS.length);
    expect(ids[0]).toBe(PUBLISHERS[0].id);
  });
});
