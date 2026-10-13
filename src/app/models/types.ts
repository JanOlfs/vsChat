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

export type ImposterGameStatus = 'lobby' | 'playing' | 'voting' | 'revealed';
export type ImposterResult = 'win' | 'loss';

export interface ImposterGame {
  id: string;
  name: string;
  game_key: string;
  max_players: number;
  paranoia_percent: number;
  status: ImposterGameStatus;
  current_round: number;
  created_by: string;
  created_at: string;
}

export interface ImposterPlayer {
  game_id: string;
  profile_id: string;
  voted_round: number;
  joined_at: string;
  profile: Profile;
}

export interface ImposterRound {
  game_id: string;
  round: number;
  result: ImposterResult | null;
  started_at: string;
  riot_match_id: string | null;
  /** Vom Chatbot-Worker eingetragen, sobald das League-Spiel lädt (alle 10 Spieler). */
  riot_participants: RiotParticipant[] | null;
}

export interface RiotParticipant {
  puuid: string;
  riot_id: string; // "Name#TAG"
  team_id: number; // 100 = blau, 200 = rot
  champion_name: string;
  champion_image: string | null;
  profile_id: string | null;
  twitch_name: string | null;
}

export type GameAccountStatus = 'pending' | 'ok' | 'not_found';

export interface GameAccount {
  id: string;
  profile_id: string;
  game_key: string;
  name: string;
  external_id: string | null;
  status: GameAccountStatus;
  created_at: string;
}

/** Fremde Rollen kommen per RLS erst nach der Auflösung der Runde mit. */
export interface ImposterRole {
  game_id: string;
  round: number;
  profile_id: string;
  role: string;
  voted: boolean;
  vote_for: string | null;
}

export interface ImposterChatVote {
  game_id: string;
  round: number;
  twitch_user_id: string;
  target_id: string;
}

export interface ImposterState {
  game: ImposterGame;
  players: ImposterPlayer[];
  rounds: ImposterRound[];
  roles: ImposterRole[];
  chatVotes: ImposterChatVote[];
}
