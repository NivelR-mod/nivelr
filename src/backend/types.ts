export interface AuthSessionUser {
  id: string;
  email: string;
  displayName: string;
  handle: string;
  createdAt: string;
  avatarDataUrl?: string;
  marketingOptIn?: boolean;
  marketingOptInAt?: string;
}

export type SubscriptionPlan = 'FREE_S1' | 'PREMIUM' | 'FOUNDER';

export interface UserSubscriptionInfo {
  plan: SubscriptionPlan;
  status: 'ACTIVE' | 'INACTIVE';
  renewalDate?: string;
}

export interface ContactRequest {
  id: string;
  requesterUserId: string;
  targetUserId: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
  updatedAt: string;
}

export interface TeamInvite {
  id: string;
  seasonId: string;
  teamId: string;
  teamName: string;
  inviteCode: string;
  inviterUserId: string;
  invitedUserId: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
  updatedAt: string;
}

export interface UserContactPreferences {
  marketingOptIn: boolean;
  marketingOptInAt?: string;
}

export interface MarketingContactEntry {
  id: string;
  displayName: string;
  handle: string;
  email: string;
  marketingOptIn: boolean;
  marketingOptInAt?: string;
}

export interface RemoteUserProgressEntry {
  userId: string;
  email: string;
  displayName: string;
  handle: string;
  level: number;
  xpTotal: number;
  updatedAt: string;
}
