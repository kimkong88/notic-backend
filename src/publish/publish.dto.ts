import { IsString, MaxLength } from 'class-validator';

const ID_MAX = 128;

export class PublishNoteDto {
  @IsString()
  @MaxLength(ID_MAX)
  clientId: string;
}

export class UnpublishNoteDto {
  @IsString()
  @MaxLength(ID_MAX)
  clientId: string;
}
