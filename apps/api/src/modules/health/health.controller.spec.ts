import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('should return ok status with timestamp and version', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.version).toBe('0.1.0');
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});
