import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';

function getJwtSecret(configService: ConfigService) {
  const jwtSecret = configService.get<string>('JWT_SECRET');

  if (jwtSecret) {
    return jwtSecret;
  }

  if (configService.get<string>('NODE_ENV') === 'test') {
    return 'test-jwt-secret';
  }

  throw new Error('JWT_SECRET is required');
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(configService),
    });
  }

  async validate(payload: { sub: string; username: string; role: string }) {
    return this.authService.validateUser(payload.sub);
  }
}
