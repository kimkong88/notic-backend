import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];
    if (!authHeader) throw new UnauthorizedException('no_token_provided');

    const [, token] = authHeader.split(' ');
    if (!token) throw new UnauthorizedException('invalid_token_format');

    const authContext = await this.authService.validateToken(token);
    request['user'] = authContext.user;

    return true;
  }
}
