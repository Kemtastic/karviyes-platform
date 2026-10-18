import { companies } from './companies';
import { auditLog } from './audit';
import { memberships } from './memberships';
import { rateLimits } from './rate-limits';
import { account, rateLimit, session, twoFactor, user, verification } from './auth';

export { companies, auditLog, memberships, user, session, account, verification, twoFactor, rateLimit, rateLimits };

export const schema = { companies, auditLog, memberships, user, session, account, verification, twoFactor, rateLimit, rateLimits };
export type Schema = typeof schema;
