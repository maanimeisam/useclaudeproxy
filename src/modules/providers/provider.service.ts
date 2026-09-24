import { Injectable } from '@nestjs/common';
import { BaseProvider } from './base-provider.abstract.js';
import { HermesService } from './hermes/hermes.service.js';
import { OpencodeService } from './opencode/opencode.service.js';
import { ClineService } from './cline/cline.service.js';
import { CustomService } from './custom/custom.service.js';

@Injectable()
export class ProviderService {
  private readonly registry: Map<string, BaseProvider>;

  constructor(
    private hermesService: HermesService,
    private opencodeService: OpencodeService,
    private clineService: ClineService,
    private customService: CustomService,
  ) {
    this.registry = new Map<string, BaseProvider>([
      ['hermes', this.hermesService],
      ['opencode', this.opencodeService],
      ['cline', this.clineService],
      ['custom', this.customService],
    ]);
  }

  public getProvider(name: string): BaseProvider {
    const provider = this.registry.get(name.toLowerCase());
    if (!provider) {
      throw new Error(
        `Unknown provider "${name}". Use one of: ${[...this.getProviderNames()].join(', ')}`,
      );
    }
    return provider;
  }

  public getProviderNames() {
    return [...this.registry.keys()];
  }
}
