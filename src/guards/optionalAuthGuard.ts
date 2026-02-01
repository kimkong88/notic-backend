import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];
    if (!authHeader) {
      return true;
    }

    const [, token] = authHeader.split(' ');
    if (!token) {
      return true;
    }

    try {
      const authContext = await this.authService.validateToken(token);
      request['user'] = authContext.user;
      return true;
    } catch {
      return true;
    }
  }
}
