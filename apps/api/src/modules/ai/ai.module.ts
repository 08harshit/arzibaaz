import { Module } from '@nestjs/common';
import { GrokService } from './grok.service';
import { AiService } from './ai.service';

@Module({
  providers: [GrokService, AiService],
  exports: [AiService],
})
export class AiModule {}
