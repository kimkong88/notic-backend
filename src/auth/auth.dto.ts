import { IsEnum, IsString } from 'class-validator';
import { Platform } from '../../prisma/generated/prisma/enums';

export class AuthenticateDto {
  @IsString()
  token: string;

  @IsEnum(Platform)
  provider: Platform;
}

export class RefreshDto {
  @IsString()
  refreshToken: string;
}
