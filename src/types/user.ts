export type UserRole = 'client' | 'volunteer' | 'moderator' | 'admin';

export type UserProfile = {
  uid: string;
  email: string;
  name?: string;
  role: UserRole;
  isAdmin?: boolean;
  isVolunteer?: boolean;
};