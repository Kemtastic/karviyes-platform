import { companies } from './companies';
import { auditLog } from './audit';

export { companies, auditLog };

export const schema = { companies, auditLog };
export type Schema = typeof schema;
