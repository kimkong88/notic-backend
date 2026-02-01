import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', error);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at', promise, 'reason:', reason);
  });

  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      bodyParser: false,
    });

    app.use(
      express.json({
        verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
          if (req.originalUrl === '/billing/webhook') {
            req.rawBody = buf;
          }
        },
      }),
    );

    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
          },
        },
        crossOriginEmbedderPolicy: false,
      }),
    );

    app.use(compression());
    app.use(cookieParser());

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        disableErrorMessages: process.env.NODE_ENV === 'production',
      }),
    );

    if (process.env.NODE_ENV === 'production') {
      app.set('trust proxy', 1);
    }

    const allowedOrigins: string[] = [];
    if (process.env.CORS_ORIGINS) {
      allowedOrigins.push(...process.env.CORS_ORIGINS.split(',').map((s) => s.trim()));
    }
    if (process.env.CHROME_EXTENSION_ID) {
      allowedOrigins.push(
        `chrome-extension://${process.env.CHROME_EXTENSION_ID}`,
      );
    }
    if (process.env.NODE_ENV === 'development') {
      allowedOrigins.push(
        'http://localhost:3000',
        'http://localhost:3002',
        'http://localhost:5173',
      );
    }
    if (allowedOrigins.length === 0) {
      allowedOrigins.push('http://localhost:3000');
    }

    app.enableCors({
      origin: allowedOrigins,
      credentials: true,
    });

    app.enableShutdownHooks();

    const shutdown = async (signal: string) => {
      try {
        logger.warn(`Received ${signal}. Shutting down...`);
        await app.close();
        await new Promise((r) => setTimeout(r, 100));
        process.exit(0);
      } catch (err) {
        logger.error('Shutdown error', err);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    const port = process.env.PORT ?? 3000;
    await app.listen(port);

    logger.log(`Application listening on http://localhost:${port}`);
    logger.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
  } catch (error) {
    logger.error('Failed to start', error);
    process.exit(1);
  }
}

bootstrap();
