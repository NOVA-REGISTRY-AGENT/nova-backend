import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { NovaRegistryError } from './sdk/index.js';
import { Response } from 'express';

@Catch(NovaRegistryError)
export class NovaRegistryExceptionFilter implements ExceptionFilter {
  catch(exception: NovaRegistryError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const httpStatus =
      exception.status >= 100
        ? exception.status
        : HttpStatus.BAD_GATEWAY;

    response.status(httpStatus).json({
      error: exception.name,
      message: exception.message,
      details: exception.details ?? null,
    });
  }
}
