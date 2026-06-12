export type UserRole = 'user' | 'volunteer' | 'admin';

export type UserProfile = {
  uid: string;
  email: string;
  role: UserRole;
};
