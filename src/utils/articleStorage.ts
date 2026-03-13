import { supabase } from './supabase';
import { v4 as uuidv4 } from 'uuid';

export interface Article {
  id: string;
  title: string;
  content: string;
  excerpt?: string;
  author_id?: string;
  club_id?: string;
  state_association_id?: string;
  national_association_id?: string;
  event_website_id?: string;
  published_at?: string;
  cover_image?: string;
  created_at?: string;
  updated_at?: string;
  status: 'draft' | 'published';
  tags?: string[];
  is_scraped?: boolean;
  scraped_url?: string;
  scraped_author?: string;
  author_name?: string; // Derived field
  source_type?: 'club' | 'state' | 'national'; // Derived field
  source_name?: string; // Derived field
  event_name?: string; // Derived field for event articles
  event_level?: 'club' | 'regional' | 'state' | 'national'; // Derived field for event level
}

// Get all articles for the current club or association
export const getArticles = async (
  clubId?: string,
  associationId?: string,
  associationType?: 'state' | 'national'
): Promise<Article[]> => {
  try {
    let articles: any[] = [];

    if (clubId) {
      // When viewing from a club, fetch:
      // 1. Club's own articles
      // 2. State association articles (if club belongs to one)
      // 3. National association articles (through state association)

      // Get club info and state association info (which contains national_association_id)
      const { data: clubData, error: clubError } = await supabase
        .from('clubs')
        .select(`
          state_association_id,
          state_associations (
            national_association_id
          )
        `)
        .eq('id', clubId)
        .maybeSingle();

      if (clubError) throw clubError;

      // Extract national association ID from nested state association
      const stateAssociationId = clubData?.state_association_id;
      const nationalAssociationId = (clubData?.state_associations as any)?.national_association_id;

      // Fetch club articles
      const { data: clubArticles, error: clubArticlesError } = await supabase
        .from('articles')
        .select(`
          *,
          article_tags(tag),
          clubs(name),
          state_associations(name, abbreviation),
          national_associations(name, abbreviation)
        `)
        .eq('club_id', clubId)
        .eq('status', 'published');

      if (clubArticlesError) throw clubArticlesError;

      // Fetch state association articles if applicable
      let stateArticles: any[] = [];
      if (stateAssociationId) {
        const { data, error: stateError } = await supabase
          .from('articles')
          .select(`
            *,
            article_tags(tag),
            clubs(name),
            state_associations(name, abbreviation),
            national_associations(name, abbreviation)
          `)
          .eq('state_association_id', stateAssociationId)
          .eq('status', 'published');

        if (stateError) throw stateError;
        stateArticles = data || [];
      }

      // Fetch national association articles if applicable
      let nationalArticles: any[] = [];
      if (nationalAssociationId) {
        const { data, error: nationalError } = await supabase
          .from('articles')
          .select(`
            *,
            article_tags(tag),
            clubs(name),
            state_associations(name, abbreviation),
            national_associations(name, abbreviation)
          `)
          .eq('national_association_id', nationalAssociationId)
          .eq('status', 'published');

        if (nationalError) throw nationalError;
        nationalArticles = data || [];
      }

      // Combine all articles and remove duplicates based on article ID
      const allArticles = [...(clubArticles || []), ...stateArticles, ...nationalArticles];
      const uniqueArticleIds = new Set<string>();
      articles = allArticles.filter(article => {
        if (uniqueArticleIds.has(article.id)) {
          return false;
        }
        uniqueArticleIds.add(article.id);
        return true;
      });

    } else if (associationId && associationType) {
      // When viewing from association, only fetch that association's articles
      const idColumn = associationType === 'state' ? 'state_association_id' : 'national_association_id';

      const { data, error } = await supabase
        .from('articles')
        .select(`
          *,
          article_tags(tag),
          clubs(name),
          state_associations(name, abbreviation),
          national_associations(name, abbreviation)
        `)
        .eq(idColumn, associationId)
        .order('published_at', { ascending: false });

      if (error) throw error;
      articles = data || [];
    } else {
      throw new Error('Either clubId or associationId with associationType must be provided');
    }

    // Sort all articles by date
    articles.sort((a, b) => {
      const dateA = a.published_at ? new Date(a.published_at).getTime() : 0;
      const dateB = b.published_at ? new Date(b.published_at).getTime() : 0;
      return dateB - dateA;
    });

    // Fetch author names
    const authorIds = articles
      .map(article => article.author_id)
      .filter(id => id !== null);
    
    const { data: users } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', authorIds);
    
    // Fetch event names and levels for articles with event_website_id
    const eventWebsiteIds = articles
      .map(article => article.event_website_id)
      .filter(id => id !== null);

    let eventData: Record<string, { name: string; level?: string }> = {};
    if (eventWebsiteIds.length > 0) {
      const { data: events } = await supabase
        .from('event_websites')
        .select('id, event_id, meta_title, quick_races(event_name, event_level)')
        .in('id', eventWebsiteIds);

      if (events) {
        events.forEach(event => {
          const quickRace = event.quick_races as any;
          // Use quick_races event_name if available, otherwise use meta_title
          const eventName = quickRace?.event_name || event.meta_title || null;
          const eventLevel = quickRace?.event_level || null;

          eventData[event.id] = {
            name: eventName,
            level: eventLevel
          };
        });
      }
    }

    // Fetch yacht classes for articles
    const articleIds = articles.map(article => article.id);
    let yachtClassData: Record<string, string[]> = {};

    if (articleIds.length > 0) {
      const { data: articleClasses } = await supabase
        .from('article_yacht_classes')
        .select('article_id, boat_class_id, is_generic, boat_classes(id, name)')
        .in('article_id', articleIds);

      if (articleClasses) {
        articleClasses.forEach(ac => {
          if (!yachtClassData[ac.article_id]) {
            yachtClassData[ac.article_id] = [];
          }
          if (ac.is_generic) {
            yachtClassData[ac.article_id].push('generic');
          } else if (ac.boat_class_id) {
            yachtClassData[ac.article_id].push(ac.boat_class_id);
          }
        });
      }
    }

    // Map author names, transform tags, and add source info
    const articlesWithAuthors = articles.map(article => {
      // Find author — scraped articles use scraped_author field
      let authorName: string;
      if (article.is_scraped && article.scraped_author) {
        authorName = article.scraped_author;
      } else {
        const author = users?.find(user => user.id === article.author_id);
        authorName = author
          ? `${author.first_name || ''} ${author.last_name || ''}`.trim() || 'Unknown Author'
          : 'Unknown Author';
      }

      // Extract tags
      const tags = article.article_tags?.map(tag => tag.tag) || [];

      // Get event name and level if applicable
      const eventInfo = article.event_website_id ? eventData[article.event_website_id] : null;
      const eventName = eventInfo?.name || null;
      const eventLevel = eventInfo?.level || null;

      // Determine source type and name
      let sourceType: 'club' | 'state' | 'national' = 'club';
      let sourceName = '';

      if (article.national_association_id && article.national_associations) {
        sourceType = 'national';
        sourceName = article.national_associations.abbreviation || article.national_associations.name;
      } else if (article.state_association_id && article.state_associations) {
        sourceType = 'state';
        sourceName = article.state_associations.abbreviation || article.state_associations.name;
      } else if (article.club_id && article.clubs) {
        sourceType = 'club';
        sourceName = article.clubs.name;
      }

      // Get yacht classes for this article
      const yachtClasses = yachtClassData[article.id] || ['generic'];

      // Remove join data from the result
      const { article_tags, clubs, state_associations, national_associations, ...articleData } = article;

      return {
        ...articleData,
        tags,
        author_name: authorName,
        source_type: sourceType,
        source_name: sourceName,
        event_name: eventName,
        event_level: eventLevel,
        yacht_classes: yachtClasses
      };
    });
    
    return articlesWithAuthors;
  } catch (error) {
    console.error('Error fetching articles:', error);
    throw error;
  }
};

// Get a single article by ID
export const getArticleById = async (id: string): Promise<Article | null> => {
  try {
    // Fetch article
    const { data: article, error } = await supabase
      .from('articles')
      .select(`
        *,
        article_tags(tag)
      `)
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Article not found
      }
      throw error;
    }
    
    if (!article) return null;
    
    // Fetch author name — scraped articles use scraped_author directly
    let authorName = 'Unknown Author';
    if (article.is_scraped && article.scraped_author) {
      authorName = article.scraped_author;
    } else if (article.author_id) {
      const { data: author } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', article.author_id)
        .maybeSingle();

      if (author) {
        authorName = `${author.first_name || ''} ${author.last_name || ''}`.trim() || 'Unknown Author';
      }
    }
    
    // Extract tags
    const tags = article.article_tags?.map(tag => tag.tag) || [];
    
    // Remove article_tags from the result
    const { article_tags, ...articleData } = article;
    
    return {
      ...articleData,
      tags,
      author_name: authorName
    };
  } catch (error) {
    console.error('Error fetching article:', error);
    throw error;
  }
};

// Create a new article
export const createArticle = async (
  article: Omit<Article, 'id' | 'created_at' | 'updated_at'>,
  tags: string[]
): Promise<Article> => {
  try {
    // Generate a new ID
    const id = uuidv4();

    // Insert article
    const { data: newArticle, error } = await supabase
      .from('articles')
      .insert({
        id,
        title: article.title,
        content: article.content,
        excerpt: article.excerpt,
        author_id: article.author_id,
        club_id: article.club_id,
        state_association_id: article.state_association_id,
        national_association_id: article.national_association_id,
        event_website_id: article.event_website_id,
        published_at: article.status === 'published' ? new Date().toISOString() : null,
        cover_image: article.cover_image,
        status: article.status
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Insert tags
    if (tags.length > 0) {
      const tagObjects = tags.map(tag => ({
        article_id: id,
        tag
      }));
      
      const { error: tagError } = await supabase
        .from('article_tags')
        .insert(tagObjects);
      
      if (tagError) throw tagError;
    }
    
    return {
      ...newArticle,
      tags
    };
  } catch (error) {
    console.error('Error creating article:', error);
    throw error;
  }
};

// Update an existing article
export const updateArticle = async (
  id: string,
  article: Partial<Omit<Article, 'id' | 'created_at' | 'updated_at'>>,
  tags?: string[]
): Promise<Article> => {
  try {
    // Update article
    const updateData: any = { ...article };
    
    // If publishing, set published_at
    if (article.status === 'published' && !article.published_at) {
      updateData.published_at = new Date().toISOString();
    }
    
    const { data: updatedArticle, error } = await supabase
      .from('articles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    // Update tags if provided
    if (tags !== undefined) {
      // Delete existing tags
      const { error: deleteError } = await supabase
        .from('article_tags')
        .delete()
        .eq('article_id', id);
      
      if (deleteError) throw deleteError;
      
      // Insert new tags
      if (tags.length > 0) {
        const tagObjects = tags.map(tag => ({
          article_id: id,
          tag
        }));
        
        const { error: tagError } = await supabase
          .from('article_tags')
          .insert(tagObjects);
        
        if (tagError) throw tagError;
      }
    }
    
    return {
      ...updatedArticle,
      tags: tags || []
    };
  } catch (error) {
    console.error('Error updating article:', error);
    throw error;
  }
};

// Delete an article
export const deleteArticle = async (id: string): Promise<boolean> => {
  try {
    // Delete article (tags will be deleted via ON DELETE CASCADE)
    const { error } = await supabase
      .from('articles')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    return true;
  } catch (error) {
    console.error('Error deleting article:', error);
    throw error;
  }
};

// Get all unique tags for a club or association
export const getArticleTags = async (
  clubId?: string,
  associationId?: string,
  associationType?: 'state' | 'national'
): Promise<string[]> => {
  try {
    let query = supabase
      .from('article_tags')
      .select(`
        tag,
        articles!inner(club_id, state_association_id, national_association_id)
      `);

    if (clubId) {
      query = query.eq('articles.club_id', clubId);
    } else if (associationId && associationType) {
      const idColumn = associationType === 'state' ? 'state_association_id' : 'national_association_id';
      query = query.eq(`articles.${idColumn}`, associationId);
    } else {
      throw new Error('Either clubId or associationId with associationType must be provided');
    }

    const { data, error } = await query;
    
    if (error) throw error;
    
    // Extract unique tags
    const uniqueTags = new Set<string>();
    data.forEach(item => uniqueTags.add(item.tag));
    
    return Array.from(uniqueTags);
  } catch (error) {
    console.error('Error fetching article tags:', error);
    throw error;
  }
};