import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { HcmClientService } from './hcm-client.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      baseURL: process.env.HCM_BASE_URL || 'http://localhost:3001',
    }),
  ],
  providers: [HcmClientService],
  exports: [HcmClientService],
})
export class HcmClientModule {}
