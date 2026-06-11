export interface PublicUserSummary {
  public_uid: string;
  name: string;
  profile_image_url?: string | null;
}

export type FriendshipStatus = "pending" | "accepted" | "rejected" | "blocked";
export type FriendshipDirection = "incoming" | "outgoing";

export interface Friend {
  friendship_id: number;
  status: FriendshipStatus | string;
  direction: FriendshipDirection | string;
  friend: PublicUserSummary;
  requested_at: string;
  responded_at?: string | null;
}

export type CreateFriendRequestPayload =
  | { public_uid: string; email?: never }
  | { email: string; public_uid?: never };

export interface CreateFriendRequestResponseData {
  accepted: boolean;
  request: Friend | null;
}

export interface FriendPresetMember {
  friend_preset_member_id?: number;
  friend_preset_id?: number;
  friendship_id?: number;
  friend?: PublicUserSummary;
  public_uid?: string;
  name?: string;
  profile_image_url?: string | null;
  created_at?: string;
}

export interface FriendPreset {
  friend_preset_id: number;
  name: string;
  description?: string | null;
  version: number;
  members: FriendPresetMember[];
  created_at: string;
  updated_at: string;
}

export interface CreateFriendPresetRequest {
  name: string;
  description?: string | null;
  friend_public_uids: string[];
}

export interface UpdateFriendPresetRequest {
  name?: string;
  description?: string | null;
}

export interface ReplaceFriendPresetMembersRequest {
  friend_public_uids: string[];
}
