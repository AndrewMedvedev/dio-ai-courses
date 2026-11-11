export interface User {
  id: string;
  email?: string;
  username?: string;
  full_name?: string;
  [key: string]: unknown;
}

export interface UserProfile {
  id: string;
  fullName: string;
  avatarUrl: string;
  email: string;
  username: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
