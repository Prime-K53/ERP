const portalService = require('../services/portalService.cjs');

describe('portalService.getCatalog', () => {
  it('returns inventory rows for portal catalog requests', async () => {
    const rows = await portalService.getCatalog();

    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        price: expect.anything(),
        quantity: expect.anything(),
      })
    );
  });
});
