export type Role = 'seller' | 'admin' | 'customer';

export const ROLE_SELLER: Role = 'seller';
export const ROLE_ADMIN: Role = 'admin';
export const ROLE_CUSTOMER: Role = 'customer';

export class Principal {
  constructor(
    readonly sub: string,
    readonly roles: readonly string[],
  ) {}

  hasRole(role: Role): boolean {
    return this.roles.includes(role);
  }

  isAdmin(): boolean {
    return this.hasRole(ROLE_ADMIN);
  }
}
