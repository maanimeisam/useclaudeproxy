import { Global, Module } from '@nestjs/common';
import { CliproxyapiService } from './cliproxyapi.service.js';

@Global()
@Module({
  providers: [CliproxyapiService],
  exports: [CliproxyapiService],
})
export class CliproxyapiModule {}
