import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class NonEmptyStringPipe implements PipeTransform<string, string> {
  transform(value: string) {
    if (typeof value !== 'string') {
      throw new BadRequestException('Expected a string value');
    }

    const normalizedValue = value.trim();

    if (!normalizedValue) {
      throw new BadRequestException('Value is required');
    }

    return normalizedValue;
  }
}
