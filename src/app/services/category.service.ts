import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { Category, CategoryWithCount } from '../models/types';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  constructor(private readonly supabase: SupabaseService) {}

  async getCategories(): Promise<CategoryWithCount[]> {
    const { data, error } = await this.supabase.client
      .from('categories')
      .select('*, applications(count)')
      .order('sort_order', { ascending: true });
    if (error) {
      throw error;
    }
    return (data ?? []).map((row) => {
      const { applications, ...category } = row as Category & {
        applications: { count: number }[];
      };
      return { ...category, applicant_count: applications[0]?.count ?? 0 };
    });
  }

  async getCategoryBySlug(slug: string): Promise<Category | null> {
    const { data, error } = await this.supabase.client
      .from('categories')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error) {
      throw error;
    }
    return data;
  }
}
