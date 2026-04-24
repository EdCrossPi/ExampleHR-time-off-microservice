import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface HcmBalance {
  employeeId: string;
  locationId: string;
  leaveType: string;
  availableDays: number;
}

export interface HcmDebitPayload {
  employeeId: string;
  locationId: string;
  leaveType: string;
  days: number;
}

@Injectable()
export class HcmClientService {
  private readonly logger = new Logger(HcmClientService.name);

  constructor(private readonly httpService: HttpService) {}

  async getBalance(employeeId: string, locationId: string, leaveType: string): Promise<HcmBalance | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<HcmBalance>(`/balances/${employeeId}/${locationId}/${leaveType}`),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch balance from HCM: ${error.message}`);
      return null;
    }
  }

  async debitBalance(payload: HcmDebitPayload): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.post('/balances/debit', payload),
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to debit balance in HCM: ${error.message}`);
      return false;
    }
  }

  async creditBalance(payload: HcmDebitPayload): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.post('/balances/credit', payload),
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to credit balance in HCM: ${error.message}`);
      return false;
    }
  }

  async batchGetBalances(): Promise<HcmBalance[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<HcmBalance[]>('/balances/batch'),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch batch balances from HCM: ${error.message}`);
      return [];
    }
  }
}