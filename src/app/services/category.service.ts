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
    banner_url?: string;
  }): Promise<Category> {
    const { data, error } = await this.supabase.client
      .from('categories')
      .insert({
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        sort_order: input.sort_order ?? 0,
        banner_url: input.banner_url ?? null,
      })
      .select('*')
      .single();
    if (error) {
      throw error;
    }
    return data;
  }

  async updateCategory(
    id: string,
    input: { slug: string; name: string; description: string | null },
  ): Promise<void> {
    const { error } = await this.supabase.client
      .from('categories')
      .update({ slug: input.slug, name: input.name, description: input.description })
      .eq('id', id);
    if (error) {
      throw error;
    }
  }

  async setCategoryOpen(id: string, isOpen: boolean): Promise<void> {
    const { error } = await this.supabase.client.from('categories').update({ is_open: isOpen }).eq('id', id);
    if (error) {
      throw error;
    }
  }

  async setCategoryBanner(id: string, bannerUrl: string | null): Promise<void> {
    const { error } = await this.supabase.client.from('categories').update({ banner_url: bannerUrl }).eq('id', id);
    if (error) {
      throw error;
    }
  }

  /** Lädt das Bild in den `category-banners`-Bucket hoch und gibt die öffentliche URL zurück. */
  async uploadBanner(categorySlug: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${categorySlug}-${Date.now()}.${ext}`;
    const { error } = await this.supabase.client.storage.from('category-banners').upload(path, file);
    if (error) {
      throw error;
    }
    return this.supabase.client.storage.from('category-banners').getPublicUrl(path).data.publicUrl;
  }
}
