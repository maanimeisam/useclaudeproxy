import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration.js';
import { CliproxyapiModule } from './modules/cliproxyapi/cliproxyapi.module.js';
import { CommonModule } from './modules/common/common.module.js';
import { HttpModule } from './modules/http/http.module.js';
import { ProvidersModule } from './modules/providers/providers.module.js';
import { YamlModule } from './modules/yaml/yaml.module.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
    }),
    CliproxyapiModule,
    CommonModule,
    HttpModule,
    ProvidersModule,
    YamlModule,
  ],
  providers: [AppService],
})
export class AppModule {}
