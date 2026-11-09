import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { CvParserService } from './cv-parser.service';
import { FieldGapsController } from './field-gaps.controller';
import { FieldGapsService } from './field-gaps.service';

@Module({
  controllers: [ProfileController, FieldGapsController],
  providers: [ProfileService, CvParserService, FieldGapsService],
  exports: [ProfileService, CvParserService],
})
export class ProfileModule {}
