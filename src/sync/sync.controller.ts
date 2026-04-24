import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { SyncService } from './sync.service';
import { HcmBalance } from '../hcm-client/hcm-client.service';

@Controller('api/v1/sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('batch')
  @HttpCode(204)
  async batchSync(@Body() body: { balances: HcmBalance[] }) {
    await this.syncService.runBatchSync(body.balances);
  }

  @Post('batch/hcm')
  @HttpCode(204)
  async batchSyncFromHcm() {
    await this.syncService.runBatchSyncFromHcm();
  }
}