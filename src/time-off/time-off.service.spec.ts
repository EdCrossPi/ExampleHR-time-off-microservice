import { Test, TestingModule } from '@nestjs/testing';
import { TimeOffService } from './time-off.service';

describe('TimeOffService', () => {
  let service: TimeOffService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TimeOffService],
    }).compile();

    service = module.get<TimeOffService>(TimeOffService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
