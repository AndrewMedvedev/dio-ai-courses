export interface User {
  id: string;
  email?: string;
  username?: string;
  full_name?: string;
  [key: string]: unknown;
}
