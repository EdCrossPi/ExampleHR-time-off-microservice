import { Module } from '@nestjs/common';
import { TimeOffService } from './time-off.service';
import { TimeOffController } from './time-off.controller';

@Module({
  providers: [TimeOffService],
  controllers: [TimeOffController]
})
export class TimeOffModule {}
