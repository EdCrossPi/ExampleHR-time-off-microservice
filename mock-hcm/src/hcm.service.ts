import { Injectable } from '@nestjs/common';

export type MockMode =
  | 'normal'
  | 'stale'
  | 'error'
  | 'silent_failure'
  | 'timeout'
  | 'anniversary';

export interface Balance {
  employeeId: string;
  locationId: string;
  leaveType: string;
  availableDays: number;
}

interface MockConfig {
  mode: MockMode;
  staleAmount?: number;
  anniversaryAmount?: number;
  anniversaryTriggered?: boolean;
}

@Injectable()
export class HcmService {
  private balances: Balance[] = [];
  private config: MockConfig = { mode: 'normal' };

  configure(config: MockConfig) {
    this.config = { ...config, anniversaryTriggered: false };
  }

  getConfig(): MockConfig {
    return this.config;
  }

  seedBalance(balance: Balance) {
    const index = this.balances.findIndex(
      (b) =>
        b.employeeId === balance.employeeId &&
        b.locationId === balance.locationId &&
        b.leaveType === balance.leaveType,
    );
    if (index >= 0) {
      this.balances[index] = balance;
    } else {
      this.balances.push(balance);
    }
  }

  getBalance(
    employeeId: string,
    locationId: string,
    leaveType: string,
  ): Balance | null {
    if (
      this.config.mode === 'anniversary' &&
      !this.config.anniversaryTriggered
    ) {
      this.config.anniversaryTriggered = true;
      const balance = this.balances.find(
        (b) =>
          b.employeeId === employeeId &&
          b.locationId === locationId &&
          b.leaveType === leaveType,
      );
      if (balance) {
        balance.availableDays += this.config.anniversaryAmount || 5;
      }
    }

    const balance = this.balances.find(
      (b) =>
        b.employeeId === employeeId &&
        b.locationId === locationId &&
        b.leaveType === leaveType,
    );

    if (!balance) return null;

    if (this.config.mode === 'stale') {
      return {
        ...balance,
        availableDays: balance.availableDays - (this.config.staleAmount || 2),
      };
    }

    return balance;
  }

  getAllBalances(): Balance[] {
    return this.balances;
  }

  debit(
    employeeId: string,
    locationId: string,
    leaveType: string,
    days: number,
  ): boolean {
    if (this.config.mode === 'error') return false;
    if (this.config.mode === 'silent_failure') return true;

    const balance = this.balances.find(
      (b) =>
        b.employeeId === employeeId &&
        b.locationId === locationId &&
        b.leaveType === leaveType,
    );

    if (!balance || balance.availableDays < days) return false;

    balance.availableDays -= days;
    return true;
  }

  credit(
    employeeId: string,
    locationId: string,
    leaveType: string,
    days: number,
  ): boolean {
    if (this.config.mode === 'error') return false;

    const balance = this.balances.find(
      (b) =>
        b.employeeId === employeeId &&
        b.locationId === locationId &&
        b.leaveType === leaveType,
    );

    if (!balance) return false;

    balance.availableDays += days;
    return true;
  }

  reset() {
    this.balances = [];
    this.config = { mode: 'normal' };
  }
}
