import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { BillingService } from '../billing/billing.service';

/**
 * Guard that requires an active Pro subscription.
 * Use after AuthGuard (expects request.user). Throws 402 Payment Required if plan is not pro.
 */
@Injectable()
export class ProSubscriptionGuard implements CanActivate {
  constructor(private readonly billingService: BillingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request['user'] as { id: string } | undefined;
    if (!user?.id) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    const status = await this.billingService.getStatus(user.id);
    if (status.plan !== 'pro') {
      throw new HttpException('Payment Required', HttpStatus.PAYMENT_REQUIRED);
    }
    return true;
  }
}
