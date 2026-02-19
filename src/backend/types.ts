export interface AuthSessionUser {
  id: string;
  email: string;
  displayName: string;
  handle: string;
  createdAt: string;
  avatarDataUrl?: string;
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
