import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { CvParserService } from './cv-parser.service';

@Module({
  controllers: [ProfileController],
  providers: [ProfileService, CvParserService],
  exports: [ProfileService, CvParserService],
})
export class ProfileModule {}
