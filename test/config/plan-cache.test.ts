import { describe, it, expect, beforeEach } from 'vitest';
import Plan from '../../model/plan.model';
import planService, { clearPlanCache } from '../../service/plan.service';

describe('plan catalogue cache', () => {
  beforeEach(() => clearPlanCache());

  it('serves repeat reads from memory and refreshes after a re-seed', async () => {
    await planService.seedDefaultPlans();
    const first = await planService.listActivePlans();
    expect(first.length).toBeGreaterThan(0);

    await Plan.updateMany({}, { $set: { name: 'Changed' } });
    const cached = await planService.listActivePlans();
    expect(cached[0].name).toBe(first[0].name);

    clearPlanCache();
    const fresh = await planService.listActivePlans();
    expect(fresh[0].name).toBe('Changed');
  });

  it('resolves plan limits from the cached catalogue', async () => {
    await planService.seedDefaultPlans();
    const growth = await planService.getPlanById('growth');
    expect(growth.id).toBe('growth');
    const unknown = await planService.getPlanById('does-not-exist');
    expect(unknown.id).toBeDefined();
  });
});
