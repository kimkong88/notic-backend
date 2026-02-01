import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { BillingLinkService } from './billing-link.service';
import { TokensModule } from '../tokens/tokens.module';
import { AuthGuard } from '../guards/authGuard';
import { OptionalAuthGuard } from '../guards/optionalAuthGuard';

@Module({
  imports: [TokensModule],
  controllers: [AuthController],
  providers: [AuthService, BillingLinkService, AuthGuard, OptionalAuthGuard],
  exports: [AuthService, BillingLinkService, AuthGuard, OptionalAuthGuard],
})
export class AuthModule {}
