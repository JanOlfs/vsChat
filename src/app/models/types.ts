// Spiegeln die Spaltennamen der DB 1:1 (snake_case), keine Mapping-Schicht dafür.

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_open: boolean;
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
