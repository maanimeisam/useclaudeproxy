import { Global, Module } from '@nestjs/common';
import { HttpService } from './http.service.js';

@Global()
@Module({
  providers: [HttpService],
  exports: [HttpService],
})
export class HttpModule {}
