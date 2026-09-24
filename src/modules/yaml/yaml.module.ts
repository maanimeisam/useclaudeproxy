import { Global, Module } from '@nestjs/common';
import { YamlService } from './yaml.service.js';

@Global()
@Module({
  controllers: [],
  providers: [YamlService],
  exports: [YamlService],
})
export class YamlModule {}
