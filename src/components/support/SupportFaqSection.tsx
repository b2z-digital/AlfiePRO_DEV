import React, { useState } from 'react';
import { Search, ChevronDown, ChevronRight, FolderOpen, ArrowLeft, Circle as HelpCircle } from 'lucide-react';
import type { SupportFaq, SupportFaqCategory } from '../../types/helpSupport';

interface Props {
  categories: SupportFaqCategory[];
  faqs: SupportFaq[];
  onBack: () => void;
}

export default function SupportFaqSection({ categories, faqs, onBack }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (id: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filteredFaqs = faqs.filter(faq => {
    if (!searchQuery) return true;
    return faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const topLevelCategories = categories.filter(c => !c.parent_id);
  const getChildren = (parentId: string) =>
    categories.filter(c => c.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order);

  const getAllDescendantIds = (catId: string): string[] => {
    const childIds = getChildren(catId).flatMap(c => getAllDescendantIds(c.id));
    return [catId, ...childIds];
  };

  const faqsByCategory = topLevelCategories.map(cat => {
    const allIds = getAllDescendantIds(cat.id);
    return {
      category: cat,
      items: filteredFaqs.filter(faq => faq.category_id && allIds.includes(faq.category_id)),
      children: getChildren(cat.id),
    };
  }).filter(group => group.items.length > 0);

  const allCategoryIds = categories.map(c => c.id);
  const uncategorizedFaqs = filteredFaqs.filter(faq => !faq.category_id || !allCategoryIds.includes(faq.category_id));

  const formatAnswer = (answer: string) => {
    const lines = answer.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
        elements.push(<p key={i} className="font-semibold mt-3 mb-1">{trimmed.slice(2, -2)}</p>);
        i++;
        continue;
      }

      if (trimmed.match(/^\d+\.\s/)) {
        const olItems: React.ReactNode[] = [];
        while (i < lines.length && lines[i].trim().match(/^\d+\.\s/)) {
          const text = lines[i].trim().replace(/^\d+\.\s+/, '');
          const boldFormatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          olItems.push(<li key={i} dangerouslySetInnerHTML={{ __html: boldFormatted }} />);
          i++;
        }
        elements.push(<ol key={`ol-${i}`} className="list-decimal ml-6 space-y-1 my-2">{olItems}</ol>);
        continue;
      }

      if (trimmed.startsWith('- ')) {
        const ulItems: React.ReactNode[] = [];
        while (i < lines.length && lines[i].trim().startsWith('- ')) {
          const text = lines[i].trim().slice(2);
          const boldFormatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          ulItems.push(<li key={i} dangerouslySetInnerHTML={{ __html: boldFormatted }} />);
          i++;
        }
        elements.push(<ul key={`ul-${i}`} className="list-disc ml-6 space-y-1 my-2">{ulItems}</ul>);
        continue;
      }

      if (!trimmed) {
        elements.push(<br key={i} />);
      } else {
        const boldFormatted = trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        elements.push(<p key={i} dangerouslySetInnerHTML={{ __html: boldFormatted }} />);
      }
      i++;
    }
    return elements;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-white">FAQs & Guides</h2>
          <p className="text-sm text-slate-400">
            {faqs.length} articles across {categories.length} categories
          </p>
        </div>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search FAQs & Guides..."
          className="w-full pl-12 pr-4 py-3 rounded-xl border bg-slate-800/80 border-slate-700/50 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 text-sm"
        />
      </div>

      {faqsByCategory.length === 0 && uncategorizedFaqs.length === 0 ? (
        <div className="text-center py-16 rounded-xl border bg-slate-800/50 border-slate-700/50">
          <HelpCircle size={48} className="mx-auto mb-4 text-slate-600" />
          <h3 className="text-lg font-medium mb-2 text-slate-300">
            {searchQuery ? 'No FAQs found matching your search' : 'No FAQs available yet'}
          </h3>
          <p className="text-sm text-slate-500">
            {searchQuery ? 'Try a different search term.' : 'Check back soon for helpful guides and FAQs.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {faqsByCategory.map(({ category, items, children }) => {
            const isExpanded = expandedCategories.has(category.id);
            const hasSubCategories = children.length > 0;
            return (
              <div
                key={category.id}
                className="rounded-xl border overflow-hidden bg-slate-800/50 border-slate-700/50"
              >
                <button
                  onClick={() => toggleCategory(category.id)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors hover:bg-slate-700/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-cyan-500/10">
                      <FolderOpen size={20} className="text-cyan-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{category.name}</h3>
                      <p className="text-xs text-slate-400">
                        {items.length} {items.length === 1 ? 'article' : 'articles'}
                        {hasSubCategories ? ` in ${children.length} sections` : ''}
                        {category.description ? ` -- ${category.description}` : ''}
                      </p>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronDown size={18} className="text-slate-400" />
                  ) : (
                    <ChevronRight size={18} className="text-slate-400" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-700/50">
                    {hasSubCategories ? (
                      children.map(subCat => {
                        const subFaqs = filteredFaqs
                          .filter(faq => faq.category_id === subCat.id)
                          .sort((a, b) => a.sort_order - b.sort_order);
                        if (subFaqs.length === 0) return null;
                        const isSubExpanded = expandedCategories.has(subCat.id);
                        return (
                          <div key={subCat.id} className="border-b last:border-b-0 border-slate-700/30">
                            <button
                              onClick={() => toggleCategory(subCat.id)}
                              className="w-full flex items-center justify-between px-5 py-3 text-left transition-colors hover:bg-slate-700/30"
                            >
                              <div className="flex items-center gap-2.5">
                                <FolderOpen size={16} className="text-cyan-400/70" />
                                <span className="text-sm font-medium text-slate-200">{subCat.name}</span>
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-700/80 text-slate-400">
                                  {subFaqs.length}
                                </span>
                              </div>
                              {isSubExpanded ? (
                                <ChevronDown size={14} className="flex-shrink-0 ml-2 text-slate-500" />
                              ) : (
                                <ChevronRight size={14} className="flex-shrink-0 ml-2 text-slate-500" />
                              )}
                            </button>
                            {isSubExpanded && subFaqs.map(faq => (
                              <div key={faq.id} className="border-t border-slate-700/20">
                                <button
                                  onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                                  className="w-full flex items-center justify-between pl-12 pr-5 py-3 text-left transition-colors hover:bg-slate-700/20"
                                >
                                  <span className="text-sm text-slate-300">{faq.question}</span>
                                  {expandedFaq === faq.id ? (
                                    <ChevronDown size={14} className="flex-shrink-0 ml-2 text-slate-500" />
                                  ) : (
                                    <ChevronRight size={14} className="flex-shrink-0 ml-2 text-slate-500" />
                                  )}
                                </button>
                                {expandedFaq === faq.id && (
                                  <div className="pl-12 pr-5 pb-4 text-sm leading-relaxed text-slate-300 bg-slate-900/40">
                                    <div className="pt-3 pb-1 border-t border-slate-700/30">
                                      {formatAnswer(faq.answer)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })
                    ) : (
                      items.map(faq => (
                        <div key={faq.id} className="border-b last:border-b-0 border-slate-700/30">
                          <button
                            onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                            className="w-full flex items-center justify-between px-5 py-3 text-left transition-colors hover:bg-slate-700/30"
                          >
                            <span className="text-sm text-slate-200">{faq.question}</span>
                            {expandedFaq === faq.id ? (
                              <ChevronDown size={14} className="flex-shrink-0 ml-2 text-slate-500" />
                            ) : (
                              <ChevronRight size={14} className="flex-shrink-0 ml-2 text-slate-500" />
                            )}
                          </button>
                          {expandedFaq === faq.id && (
                            <div className="px-5 pb-4 text-sm leading-relaxed text-slate-300 bg-slate-900/40">
                              <div className="pt-3 pb-1 border-t border-slate-700/30">
                                {formatAnswer(faq.answer)}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {uncategorizedFaqs.length > 0 && (
            <div className="rounded-xl border overflow-hidden bg-slate-800/50 border-slate-700/50">
              <button
                onClick={() => toggleCategory('uncategorized')}
                className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors hover:bg-slate-700/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-slate-600/50">
                    <HelpCircle size={20} className="text-slate-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">General</h3>
                    <p className="text-xs text-slate-400">
                      {uncategorizedFaqs.length} {uncategorizedFaqs.length === 1 ? 'article' : 'articles'}
                    </p>
                  </div>
                </div>
                {expandedCategories.has('uncategorized') ? (
                  <ChevronDown size={18} className="text-slate-400" />
                ) : (
                  <ChevronRight size={18} className="text-slate-400" />
                )}
              </button>

              {expandedCategories.has('uncategorized') && (
                <div className="border-t border-slate-700/50">
                  {uncategorizedFaqs.map(faq => (
                    <div key={faq.id} className="border-b last:border-b-0 border-slate-700/30">
                      <button
                        onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                        className="w-full flex items-center justify-between px-5 py-3 text-left transition-colors hover:bg-slate-700/30"
                      >
                        <span className="text-sm text-slate-200">{faq.question}</span>
                        {expandedFaq === faq.id ? (
                          <ChevronDown size={14} className="flex-shrink-0 ml-2 text-slate-500" />
                        ) : (
                          <ChevronRight size={14} className="flex-shrink-0 ml-2 text-slate-500" />
                        )}
                      </button>
                      {expandedFaq === faq.id && (
                        <div className="px-5 pb-4 text-sm leading-relaxed text-slate-300">
                          <div className="pt-2 border-t border-slate-700/30">
                            {formatAnswer(faq.answer)}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
