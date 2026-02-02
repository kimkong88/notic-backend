import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { BillingLinkService } from '../auth/billing-link.service';

@Injectable()
export class JwtOrBillingTokenGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly billingLinkService: BillingLinkService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const billingToken =
      (request.query?.token as string) ??
      (request.body?.token as string) ??
      (request.headers['x-billing-token'] as string);

    if (billingToken) {
      const userId = await this.billingLinkService.resolveBillingToken(
        billingToken,
      );
      if (!userId) {
        throw new UnauthorizedException('invalid_or_expired_billing_token');
      }
      const user = await this.authService.getUserById(userId);
      if (!user) {
        throw new UnauthorizedException('user_not_found');
      }
      request['user'] = user;
      return true;
    }

    const authHeader = request.headers['authorization'];
    if (!authHeader) {
      throw new UnauthorizedException('no_token_provided');
    }
    const [, token] = authHeader.split(' ');
    if (!token) {
      throw new UnauthorizedException('invalid_token_format');
    }
    const authContext = await this.authService.validateToken(token);
    request['user'] = authContext.user;
    return true;
  }
}
