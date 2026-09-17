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

  async createCategory(input: {
    slug: string;
    name: string;
    description?: string;
    sort_order?: number;
  }): Promise<Category> {
    const { data, error } = await this.supabase.client
      .from('categories')
      .insert({
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        sort_order: input.sort_order ?? 0,
      })
      .select('*')
      .single();
    if (error) {
      throw error;
    }
    return data;
  }

  async setCategoryOpen(id: string, isOpen: boolean): Promise<void> {
    const { error } = await this.supabase.client.from('categories').update({ is_open: isOpen }).eq('id', id);
    if (error) {
      throw error;
    }
  }
}
