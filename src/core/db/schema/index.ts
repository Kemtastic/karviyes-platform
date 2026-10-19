import { companies } from './companies';
import { auditLog } from './audit';
import { memberships } from './memberships';
import { rateLimits } from './rate-limits';
import { staff } from './staff';
import { invites } from './invites';
import { parties } from './parties';
import { files } from './files';
import { companySettings } from './company-settings';
import { account, rateLimit, session, twoFactor, user, verification } from './auth';

export { companySettings, companies, auditLog, memberships, user, session, account, verification, twoFactor, rateLimit, rateLimits, staff, invites, parties, files };

export const schema = { companySettings, companies, auditLog, memberships, user, session, account, verification, twoFactor, rateLimit, rateLimits, staff, invites, parties, files };
export type Schema = typeof schema;
