#!/usr/bin/env node

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppService } from './app.service.js';
import { ConsoleLogger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new ConsoleLogger({
      prefix: '~',
    }),
  });

  const appService = app.get(AppService);
  await appService.run();

  await app.close();
}

await bootstrap();
