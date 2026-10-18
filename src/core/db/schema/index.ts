import { companies } from './companies';
import { auditLog } from './audit';
import { memberships } from './memberships';
import { account, rateLimit, session, twoFactor, user, verification } from './auth';

export { companies, auditLog, memberships, user, session, account, verification, twoFactor, rateLimit };

export const schema = { companies, auditLog, memberships, user, session, account, verification, twoFactor, rateLimit };
export type Schema = typeof schema;
