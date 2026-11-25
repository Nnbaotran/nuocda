import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchPath } from '../src/lib/router.js';

test('matchPath: đường dẫn cố định và có tham số', () => {
  assert.deepEqual(matchPath('/', '/'), {});
  assert.deepEqual(matchPath('/khach-hang', '/khach-hang'), {});
  assert.deepEqual(matchPath('/khach-hang/:id', '/khach-hang/abc-123'), { id: 'abc-123' });
  assert.equal(matchPath('/khach-hang/:id', '/khach-hang'), null);
  assert.equal(matchPath('/khach-hang', '/san-pham'), null);
  assert.equal(matchPath('/', '/khach-hang'), null);
});
