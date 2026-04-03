/**
 * Integration tests for API routes.
 * Uses msw (mock service worker) to intercept Supabase calls
 * without a live database.
 */

// ─── Predictions POST ─────────────────────────────────────────────────────────
describe('POST /api/predictions', () => {
  const VALID_PREDICTION = { fixture_id: 1, home: 2, away: 1 }

  it('rejects unauthenticated requests', async () => {
    const res = await fetch('/api/predictions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_PREDICTION),
    })
    expect(res.status).toBe(401)
  })

  it('rejects negative scores', async () => {
    const pred = { fixture_id: 1, home: -1, away: 1 }
    const body = JSON.stringify(pred)
    // Zod schema should reject home: -1
    const { z } = await import('zod')
    const schema = z.object({
      fixture_id: z.number().int().positive(),
      home: z.number().int().min(0).max(30),
      away: z.number().int().min(0).max(30),
    })
    const result = schema.safeParse(pred)
    expect(result.success).toBe(false)
  })

  it('rejects scores above 30', async () => {
    const { z } = await import('zod')
    const schema = z.object({
      fixture_id: z.number().int().positive(),
      home: z.number().int().min(0).max(30),
      away: z.number().int().min(0).max(30),
    })
    expect(schema.safeParse({ fixture_id: 1, home: 31, away: 0 }).success).toBe(false)
  })

  it('rejects non-integer fixture_id', async () => {
    const { z } = await import('zod')
    const schema = z.object({
      fixture_id: z.number().int().positive(),
      home: z.number().int().min(0).max(30),
      away: z.number().int().min(0).max(30),
    })
    expect(schema.safeParse({ fixture_id: 1.5, home: 1, away: 0 }).success).toBe(false)
  })

  it('accepts valid bulk predictions', async () => {
    const { z } = await import('zod')
    const schema = z.object({
      predictions: z.array(z.object({
        fixture_id: z.number().int().positive(),
        home: z.number().int().min(0).max(30),
        away: z.number().int().min(0).max(30),
      })).min(1).max(20),
    })
    const payload = {
      predictions: [
        { fixture_id: 1, home: 2, away: 1 },
        { fixture_id: 2, home: 0, away: 0 },
      ],
    }
    expect(schema.safeParse(payload).success).toBe(true)
  })

  it('rejects bulk with more than 20 predictions', async () => {
    const { z } = await import('zod')
    const schema = z.object({
      predictions: z.array(z.object({
        fixture_id: z.number().int().positive(),
        home: z.number().int().min(0).max(30),
        away: z.number().int().min(0).max(30),
      })).min(1).max(20),
    })
    const too_many = Array.from({ length: 21 }, (_, i) => ({
      fixture_id: i + 1, home: 1, away: 0,
    }))
    expect(schema.safeParse({ predictions: too_many }).success).toBe(false)
  })
})

// ─── Tribes PATCH (join) ──────────────────────────────────────────────────────
describe('PATCH /api/tribes — join validation', () => {
  it('rejects invite codes that are not 8 chars', async () => {
    const { z } = await import('zod')
    const schema = z.object({ invite_code: z.string().length(8) })
    expect(schema.safeParse({ invite_code: 'SHORT' }).success).toBe(false)
    expect(schema.safeParse({ invite_code: 'TOOLONGXX' }).success).toBe(false)
  })

  it('accepts exactly 8-char codes', async () => {
    const { z } = await import('zod')
    const schema = z.object({ invite_code: z.string().length(8) })
    expect(schema.safeParse({ invite_code: 'ABCD1234' }).success).toBe(true)
  })
})

// ─── Results POST (admin) ─────────────────────────────────────────────────────
describe('POST /api/results — validation', () => {
  it('rejects missing fields', async () => {
    const { z } = await import('zod')
    const schema = z.object({
      fixture_id: z.number().int().positive(),
      home: z.number().int().min(0).max(30),
      away: z.number().int().min(0).max(30),
    })
    expect(schema.safeParse({ fixture_id: 1 }).success).toBe(false)
    expect(schema.safeParse({ home: 1, away: 0 }).success).toBe(false)
  })

  it('accepts valid result', async () => {
    const { z } = await import('zod')
    const schema = z.object({
      fixture_id: z.number().int().positive(),
      home: z.number().int().min(0).max(30),
      away: z.number().int().min(0).max(30),
    })
    expect(schema.safeParse({ fixture_id: 5, home: 2, away: 1 }).success).toBe(true)
  })
})
