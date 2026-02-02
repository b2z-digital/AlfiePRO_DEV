export type ClubRole = 'admin' | 'editor' | 'member' | 'super_admin' | 'state_admin' | 'national_admin';

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface UserClub {
  id: string;
  userId: string;
  clubId: string;
  role: ClubRole;
  createdAt: string;
  updatedAt: string;
  club?: {
    id: string;
    name: string;
    abbreviation: string;
    logo: string | null;
  };
}

export interface Invitation {
  id: string;
  email: string;
  clubId: string;
  role: ClubRole;
  invitedBy: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  club?: {
    id: string;
    name: string;
    abbreviation: string;
    logo: string | null;
  };
}