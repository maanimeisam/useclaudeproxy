import { Global, Module } from '@nestjs/common';
import { OpencodeService } from './opencode/opencode.service.js';
import { HermesService } from './hermes/hermes.service.js';
import { CustomService } from './custom/custom.service.js';
import { ClineService } from './cline/cline.service.js';
import { ClineOAUTH } from './cline/cline-oauth.service.js';
import { HermesOAUTH } from './hermes/hermes-oauth.service.js';
import { ProviderService } from './provider.service.js';

@Global()
@Module({
  providers: [
    ProviderService,
    ClineService,
    ClineOAUTH,
    OpencodeService,
    HermesService,
    HermesOAUTH,
    CustomService,
  ],
  exports: [
    ProviderService,
    ClineService,
    ClineOAUTH,
    OpencodeService,
    HermesService,
    HermesOAUTH,
    CustomService,
  ],
})
export class ProvidersModule {}
