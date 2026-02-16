export interface AuthSessionUser {
  id: string;
  email: string;
  displayName: string;
  handle: string;
  createdAt: string;
}

export interface ContactRequest {
  id: string;
  requesterUserId: string;
  targetUserId: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
  updatedAt: string;
}
