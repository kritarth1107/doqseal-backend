import { describe, it, expect } from 'vitest';
import { buildConnectOptions } from '../../config/database.config';

describe('buildConnectOptions', () => {
  it('turns index builds off in production by default', () => {
    const o = buildConnectOptions({}, 'production');
    expect(o.autoIndex).toBe(false);
    expect(o.autoCreate).toBe(false);
  });

  it('keeps index builds on outside production', () => {
    expect(buildConnectOptions({}, 'development').autoIndex).toBe(true);
    expect(buildConnectOptions({}, 'test').autoCreate).toBe(true);
  });

  it('lets MONGO_AUTO_INDEX override either way', () => {
    expect(buildConnectOptions({ MONGO_AUTO_INDEX: 'true' }, 'production').autoIndex).toBe(true);
    expect(buildConnectOptions({ MONGO_AUTO_INDEX: 'false' }, 'development').autoIndex).toBe(false);
  });

  it('keeps a warm pool with env overrides', () => {
    const d = buildConnectOptions({}, 'production');
    expect(d.minPoolSize).toBe(5);
    expect(d.maxPoolSize).toBe(50);
    const o = buildConnectOptions({ MONGO_MIN_POOL_SIZE: '2', MONGO_MAX_POOL_SIZE: 'x' }, 'production');
    expect(o.minPoolSize).toBe(2);
    expect(o.maxPoolSize).toBe(50);
  });
});
