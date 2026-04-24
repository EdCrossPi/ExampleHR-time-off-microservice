import { Test, TestingModule } from '@nestjs/testing';
import { HcmClientService } from './hcm-client.service';

describe('HcmClientService', () => {
  let service: HcmClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HcmClientService],
    }).compile();

    service = module.get<HcmClientService>(HcmClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
