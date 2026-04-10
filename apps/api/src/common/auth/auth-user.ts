import { Request } from 'express';
import { SafeUser } from '../prisma/safe-user-response';

export type AuthenticatedUser = Pick<SafeUser, 'id' | 'role' | 'memberships'>;

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
