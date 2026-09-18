// Spiegeln die Spaltennamen der DB 1:1 (snake_case), keine Mapping-Schicht dafür.

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_open: boolean;
  banner_url: string | null;
}

export interface CategoryWithCount extends Category {
  applicant_count: number;
}

export interface Profile {
  id: string;
  twitch_user_id: string;
  twitch_login: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: boolean;
}

export interface Application {
  id: string;
  profile_id: string;
  category_id: string;
  note: string | null;
  created_at: string;
}

export interface ApplicationWithProfile extends Application {
  profile: Profile;
}

export interface ApplicationWithCategory extends Application {
  category: Category;
}

export type MatchWinner = 'streamer' | 'challenger';

export interface Match {
  id: string;
  category_id: string;
  profile_id: string;
  vote_counts: Record<string, number>;
  winner: MatchWinner | null;
  created_at: string;
}

export interface MatchWithDetails extends Match {
  category: Category;
  profile: Profile;
}

export type RoundPhase = 'idle' | 'checkin' | 'voting';

export interface CheckedInViewer {
  twitch_login: string;
  display_name: string;
  profile_id: string;
}

export interface LiveRound {
  id: number;
  phase: RoundPhase;
  category_id: string | null;
  checked_in: CheckedInViewer[];
  vote_counts: Record<string, number>;
  updated_at: string;
  category: Category | null;
}

export type BingoBoardStatus = 'setup' | 'active' | 'finished';

export interface BingoBoard {
  id: string;
  name: string;
  opponent_twitch_login: string;
  status: BingoBoardStatus;
  created_by: string;
  created_at: string;
  created_by_profile: Profile | null;
}

export interface BingoCategory {
  id: string;
  board_id: string;
  label: string;
  created_at: string;
}

export interface BingoCell {
  id: string;
  board_id: string;
  position: number;
  category_id: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
}

export interface BingoCellWithDetails extends BingoCell {
  category: BingoCategory | null;
  claimed_by_profile: Profile | null;
}
