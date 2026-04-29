import type { DefaultSession, DefaultUser } from 'next-auth';
import type { JWT as DefaultJWT } from 'next-auth/jwt';

type AppRole =
  | 'ADMIN'
  | 'RETAILER'
  | 'WHOLESALER'
  | 'WAREHOUSE_STAFF'
  | 'ANALYST';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      role: AppRole;
      retailerId: string | null;
      wholesalerId: string | null;
    };
  }

  interface User extends DefaultUser {
    id: string;
    role: AppRole;
    retailerId: string | null;
    wholesalerId: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id?: string;
    role?: AppRole;
    retailerId?: string | null;
    wholesalerId?: string | null;
  }
}
