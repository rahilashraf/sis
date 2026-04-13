import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    const mappedException = this.mapException(exception);
    const payload = mappedException.getResponse();

    response.status(mappedException.getStatus()).json(
      typeof payload === 'string'
        ? {
            statusCode: mappedException.getStatus(),
            message: payload,
          }
        : payload,
    );
  }

  private mapException(exception: Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002':
        return new ConflictException(
          'A record with the same unique value already exists',
        );
      case 'P2003':
        return new ConflictException(
          'The requested relation is invalid or still in use',
        );
      case 'P2000':
        return new BadRequestException('A provided value is too long or invalid');
      case 'P2025':
        return new NotFoundException('The requested record was not found');
      case 'P2021':
      case 'P2022':
        return new ServiceUnavailableException(
          'Database schema is out of date. Run migrations and retry.',
        );
      default:
        return {
          getStatus: () => HttpStatus.INTERNAL_SERVER_ERROR,
          getResponse: () => ({
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Internal server error',
          }),
        };
    }
  }
}
